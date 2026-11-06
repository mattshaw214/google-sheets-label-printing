import test from 'node:test';
import assert from 'node:assert/strict';

import * as contentBridgeModule from '../chrome-extension/lib/content-bridge.js';
import {
  BRIDGED_ACTIONS,
  CHANNEL,
  createBridgeHandler,
  extractSheetId,
  installContentBridge,
  isAllowedFrameOrigin,
} from '../chrome-extension/lib/content-bridge.js';

const SHEET_ID = '1AbC_def-234567890';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`;

function makeBridge({ confirmAuthorization = () => true, isFrameSource } = {}) {
  const runtimeMessages = [];
  const replies = [];
  const source = {
    postMessage(message, targetOrigin) {
      replies.push({ message, targetOrigin });
    },
  };
  const handler = createBridgeHandler({
    locationHref: SHEET_URL,
    confirmAuthorization,
    isFrameSource: isFrameSource ?? ((candidate) => candidate === source),
    runtime: {
      async sendMessage(message) {
        runtimeMessages.push(message);
        return { ok: true, echoedAction: message.action };
      },
    },
  });
  return { handler, runtimeMessages, replies, source };
}

test('derives only a Google Sheets ID from the top-level URL', () => {
  assert.equal(extractSheetId(SHEET_URL), SHEET_ID);
  assert.equal(extractSheetId('https://docs.google.com/spreadsheets/u/0/'), null);
  assert.equal(extractSheetId(`https://evil.example/spreadsheets/d/${SHEET_ID}/edit`), null);
  assert.equal(extractSheetId('not a url'), null);
});

test('accepts only HTTPS Google Apps Script and googleusercontent iframe origins', () => {
  for (const origin of [
    'https://script.google.com',
    'https://script.googleusercontent.com',
    'https://n-abc123-script.googleusercontent.com',
  ]) {
    assert.equal(isAllowedFrameOrigin(origin), true, origin);
  }

  for (const origin of [
    'http://script.google.com',
    'https://evilgoogleusercontent.com',
    'https://googleusercontent.com.evil.example',
    'https://drive.googleusercontent.com',
    'https://lh3.googleusercontent.com',
    'https://ordinary.googleusercontent.com',
    'https://docs.google.com',
    'null',
    '',
  ]) {
    assert.equal(isAllowedFrameOrigin(origin), false, origin);
  }
});

test('accepts attached direct and nested frames but rejects detached frames, the top page, and popups', () => {
  assert.equal(typeof contentBridgeModule.isDescendantFrameSource, 'function');
  const { isDescendantFrameSource } = contentBridgeModule;
  const topWindow = {};
  topWindow.top = topWindow;
  const directFrame = { top: topWindow, frames: [] };
  const nestedFrame = { top: topWindow, frames: [] };
  const nestedParent = { top: topWindow, frames: [nestedFrame] };
  const detachedFrame = { top: topWindow, frames: [] };
  topWindow.frames = [directFrame, nestedParent];
  const popup = {};
  popup.top = popup;
  const inaccessible = {};
  Object.defineProperty(inaccessible, 'top', {
    get() { throw new Error('cross-origin access denied'); },
  });

  assert.equal(isDescendantFrameSource(topWindow, directFrame), true);
  assert.equal(isDescendantFrameSource(topWindow, nestedFrame), true);
  assert.equal(isDescendantFrameSource(topWindow, detachedFrame), false);
  assert.equal(isDescendantFrameSource(topWindow, topWindow), false);
  assert.equal(isDescendantFrameSource(topWindow, popup), false);
  assert.equal(isDescendantFrameSource(topWindow, inaccessible), false);
  assert.equal(isDescendantFrameSource(topWindow, null), false);
});

test('bridges only the fixed channel and six allowlisted sidebar actions', async () => {
  assert.deepEqual([...BRIDGED_ACTIONS], [
    'get_status',
    'authorize_sheet',
    'save_preferences',
    'test_connection',
    'print_test',
    'print_labels',
  ]);
  const { handler, runtimeMessages, replies, source } = makeBridge();

  await handler({
    origin: 'https://script.google.com',
    source,
    data: {
      channel: CHANNEL,
      requestId: 'req-1',
      action: 'get_status',
      payload: { sheetId: SHEET_ID },
    },
  });

  assert.deepEqual(runtimeMessages, [{
    channel: CHANNEL,
    action: 'get_status',
    sheetId: SHEET_ID,
  }]);
  assert.deepEqual(replies, [{
    targetOrigin: 'https://script.google.com',
    message: {
      channel: CHANNEL,
      requestId: 'req-1',
      ok: true,
      result: { ok: true, echoedAction: 'get_status' },
    },
  }]);
});

test('ignores arbitrary origins, channels, actions, and mismatched sheet IDs', async () => {
  const invalidData = [
    { channel: 'OTHER', requestId: '1', action: 'get_status', payload: { sheetId: SHEET_ID } },
    { channel: CHANNEL, requestId: '2', action: 'delete_everything', payload: { sheetId: SHEET_ID } },
    { channel: CHANNEL, requestId: '3', action: 'print_raw', payload: { sheetId: SHEET_ID } },
    { channel: CHANNEL, requestId: '4', action: 'get_status', payload: { sheetId: 'another-sheet' } },
    { channel: CHANNEL, requestId: '5', action: 'list_printers', payload: { sheetId: SHEET_ID } },
  ];

  for (const data of invalidData) {
    const { handler, runtimeMessages, replies, source } = makeBridge();
    await handler({ origin: 'https://script.google.com', source, data });
    assert.equal(runtimeMessages.length, 0, JSON.stringify(data));
    assert.equal(replies.length, 0, JSON.stringify(data));
  }

  const { handler, runtimeMessages, replies, source } = makeBridge();
  await handler({
    origin: 'https://attacker.example',
    source,
    data: { channel: CHANNEL, requestId: '5', action: 'get_status', payload: { sheetId: SHEET_ID } },
  });
  assert.equal(runtimeMessages.length, 0);
  assert.equal(replies.length, 0);
});

test('binds the bridge to the first accepted sidebar source and origin', async () => {
  const { handler, runtimeMessages, replies, source } = makeBridge();
  const message = {
    channel: CHANNEL,
    requestId: 'bound-1',
    action: 'get_status',
    payload: { sheetId: SHEET_ID },
  };
  await handler({ origin: 'https://script.google.com', source, data: message });

  const popupSource = {
    opener: {},
    postMessage(reply, targetOrigin) {
      replies.push({ message: reply, targetOrigin, popup: true });
    },
  };
  await handler({
    origin: 'https://script.google.com',
    source: popupSource,
    data: { ...message, requestId: 'popup-2' },
  });
  await handler({
    origin: 'https://script.googleusercontent.com',
    source,
    data: { ...message, requestId: 'origin-3' },
  });

  assert.equal(runtimeMessages.length, 1);
  assert.equal(replies.length, 1);
  assert.equal(replies.some((reply) => reply.popup), false);
});

test('replacement sidebar can bind only after the previously bound frame detaches', async () => {
  const runtimeMessages = [];
  const firstReplies = [];
  const secondReplies = [];
  const firstSource = {
    postMessage(message, origin) {
      firstReplies.push({ message, origin });
    },
  };
  const secondSource = {
    postMessage(message, origin) {
      secondReplies.push({ message, origin });
    },
  };
  const activeSources = new Set([firstSource, secondSource]);
  const handler = createBridgeHandler({
    locationHref: SHEET_URL,
    confirmAuthorization: () => true,
    isFrameSource: (source) => activeSources.has(source),
    runtime: {
      async sendMessage(message) {
        runtimeMessages.push(message);
        return { ok: true };
      },
    },
  });
  const data = {
    channel: CHANNEL,
    requestId: 'first',
    action: 'get_status',
    payload: { sheetId: SHEET_ID },
  };

  await handler({
    origin: 'https://script.google.com',
    source: firstSource,
    data,
  });
  await handler({
    origin: 'https://script.google.com',
    source: secondSource,
    data: { ...data, requestId: 'concurrent' },
  });
  assert.equal(runtimeMessages.length, 1);
  assert.equal(secondReplies.length, 0);

  activeSources.delete(firstSource);
  await handler({
    origin: 'https://script.google.com',
    source: secondSource,
    data: { ...data, requestId: 'replacement' },
  });

  assert.equal(runtimeMessages.length, 2);
  assert.equal(firstReplies.length, 1);
  assert.equal(secondReplies.length, 1);
  assert.equal(secondReplies[0].message.requestId, 'replacement');
});

test('rejects popup and opener sources even when they send the first valid message', async () => {
  const popupReplies = [];
  const sidebarSource = { postMessage() {} };
  const popupSource = { opener: {}, postMessage(message) { popupReplies.push(message); } };
  const runtimeMessages = [];
  const handler = createBridgeHandler({
    locationHref: SHEET_URL,
    confirmAuthorization: () => true,
    isFrameSource: (candidate) => candidate === sidebarSource,
    runtime: {
      async sendMessage(message) {
        runtimeMessages.push(message);
        return { ok: true };
      },
    },
  });
  const data = {
    channel: CHANNEL,
    requestId: 'first',
    action: 'get_status',
    payload: { sheetId: SHEET_ID },
  };

  await handler({ origin: 'https://script.google.com', source: popupSource, data });
  await handler({ origin: 'https://script.google.com', source: sidebarSource, data: { ...data, requestId: 'second' } });

  assert.equal(runtimeMessages.length, 1);
  assert.equal(runtimeMessages[0].action, 'get_status');
  assert.equal(popupReplies.length, 0);
});

test('requires explicit authorization confirmation before forwarding authorize_sheet', async () => {
  const confirmations = [];
  const denied = makeBridge({
    confirmAuthorization(details) {
      confirmations.push(details);
      return false;
    },
  });
  await denied.handler({
    origin: 'https://script.google.com',
    source: denied.source,
    data: {
      channel: CHANNEL,
      requestId: 'authorize-denied',
      action: 'authorize_sheet',
      payload: { sheetId: SHEET_ID },
    },
  });

  assert.deepEqual(confirmations, [{ sheetId: SHEET_ID, origin: 'https://script.google.com' }]);
  assert.equal(denied.runtimeMessages.length, 0);
  assert.deepEqual(denied.replies[0].message, {
    channel: CHANNEL,
    requestId: 'authorize-denied',
    ok: false,
    error: 'Sheet authorization was canceled.',
  });
});

test('installed bridge defaults authorization confirmation to clear window.confirm text', async () => {
  const confirmations = [];
  const runtimeMessages = [];
  let messageHandler;
  const windowObject = {
    location: { href: SHEET_URL },
    confirm(message) {
      confirmations.push(message);
      return false;
    },
    addEventListener(type, handler) {
      if (type === 'message') messageHandler = handler;
    },
  };
  windowObject.top = windowObject;
  const replies = [];
  const sidebarSource = {
    top: windowObject,
    postMessage: (message, origin) => replies.push({ message, origin }),
  };
  windowObject.frames = [sidebarSource];
  installContentBridge({
    windowObject,
    runtime: {
      async sendMessage(message) {
        runtimeMessages.push(message);
      },
    },
  });
  await messageHandler({
    origin: 'https://script.google.com',
    source: sidebarSource,
    data: {
      channel: CHANNEL,
      requestId: 'authorize-default',
      action: 'authorize_sheet',
      payload: { sheetId: SHEET_ID },
    },
  });

  assert.equal(confirmations.length, 1);
  assert.match(confirmations[0], /Authorize this Google Sheet/);
  assert.match(confirmations[0], new RegExp(SHEET_ID));
  assert.equal(runtimeMessages.length, 0);
  assert.equal(replies[0].message.error, 'Sheet authorization was canceled.');
});

test('installed bridge accepts a nested Apps Script descendant frame', async () => {
  const runtimeMessages = [];
  const replies = [];
  let messageHandler;
  const windowObject = {
    location: { href: SHEET_URL },
    confirm: () => true,
    addEventListener(type, handler) {
      if (type === 'message') messageHandler = handler;
    },
  };
  windowObject.top = windowObject;
  const nestedSource = {
    top: windowObject,
    frames: [],
    postMessage(message, origin) {
      replies.push({ message, origin });
    },
  };
  windowObject.frames = [{ top: windowObject, frames: [nestedSource] }];

  installContentBridge({
    windowObject,
    runtime: {
      async sendMessage(message) {
        runtimeMessages.push(message);
        return { ok: true, configured: false, authorized: false };
      },
    },
  });
  await messageHandler({
    origin: 'https://n-safe-script.googleusercontent.com',
    source: nestedSource,
    data: {
      channel: CHANNEL,
      requestId: 'nested-status',
      action: 'get_status',
      payload: { sheetId: SHEET_ID },
    },
  });

  assert.equal(runtimeMessages.length, 1);
  assert.equal(runtimeMessages[0].action, 'get_status');
  assert.equal(replies.length, 1);
  assert.equal(replies[0].message.ok, true);
});

test('bridges only validated display preferences', async () => {
  const { handler, runtimeMessages, source } = makeBridge();
  const preferences = {
    horizontalOffset: 0,
    verticalOffset: 0,
    textSize: 'medium',
  };
  await handler({
    origin: 'https://script.google.com',
    source,
    data: {
      channel: CHANNEL,
      requestId: 'preferences-1',
      action: 'save_preferences',
      payload: { sheetId: SHEET_ID, preferences },
    },
  });
  assert.deepEqual(runtimeMessages[0], {
    channel: CHANNEL,
    action: 'save_preferences',
    sheetId: SHEET_ID,
    payload: { preferences },
  });

  for (const invalid of [
    { ...preferences, transport: 'network' },
    { ...preferences, profile: 'zpl203' },
    { ...preferences, host: '192.168.1.44' },
    { ...preferences, gapDots: 24 },
    { ...preferences, printerName: 'Zebra' },
    { ...preferences, textSize: 'huge' },
  ]) {
    const unsafe = makeBridge();
    await unsafe.handler({
      origin: 'https://script.google.com',
      source: unsafe.source,
      data: {
        channel: CHANNEL,
        requestId: 'preferences-unsafe',
        action: 'save_preferences',
        payload: { sheetId: SHEET_ID, preferences: invalid },
      },
    });
    assert.equal(unsafe.runtimeMessages.length, 0, JSON.stringify(invalid));
  }
});

test('rejects raw printer commands and non-Sheet row fields before runtime messaging', async () => {
  const unsafePayloads = [
    { raw: '^XA^JUS^XZ' },
    { rows: [], rawCommand: 'N\r\nP999' },
    { rows: [{ sourceRow: 2, PrintQty: 1, LotNum: 'L', UseFreezeDate: '7/21/2026', FoodContents: 'Food', command: '^XA' }] },
  ];

  for (const payload of unsafePayloads) {
    const { handler, runtimeMessages, replies, source } = makeBridge();
    await handler({
      origin: 'https://script.googleusercontent.com',
      source,
      data: {
        channel: CHANNEL,
        requestId: 'unsafe',
        action: 'print_labels',
        payload: { sheetId: SHEET_ID, ...payload },
      },
    });
    assert.equal(runtimeMessages.length, 0, JSON.stringify(payload));
    assert.equal(replies.length, 0, JSON.stringify(payload));
  }
});

test('forwards only raw Sheet-style rows and replies only to the event source and origin', async () => {
  const { handler, runtimeMessages, replies, source } = makeBridge();
  const rows = [{
    sourceRow: 7,
    PrintQty: 3,
    actualQty: 4,
    LotNum: 'LOT42',
    UseFreezeDate: '7/21/2026',
    FoodContents: 'Chicken and Rice',
  }];

  await handler({
    origin: 'https://n-safe-script.googleusercontent.com',
    source,
    data: {
      channel: CHANNEL,
      requestId: 'print-7',
      action: 'print_labels',
      payload: {
        version: 1,
        sheetId: SHEET_ID,
        rows,
        requestedTotal: 3,
        actualTotal: 4,
      },
    },
  });

  assert.deepEqual(runtimeMessages, [{
    channel: CHANNEL,
    action: 'print_labels',
    sheetId: SHEET_ID,
    payload: { version: 1, rows, requestedTotal: 3, actualTotal: 4 },
  }]);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].targetOrigin, 'https://n-safe-script.googleusercontent.com');
  assert.equal(replies[0].message.requestId, 'print-7');
});
