import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CHANNEL } from '../chrome-extension/lib/content-bridge.js';
import {
  createBackgroundRouter,
  readPreferences,
  validatePreferences,
} from '../chrome-extension/background.js';

const projectRoot = new URL('../', import.meta.url);
const extensionRoot = new URL('../chrome-extension/', import.meta.url);

function readJson(relativeUrl) {
  return JSON.parse(readFileSync(new URL(relativeUrl, extensionRoot), 'utf8'));
}

function chromeId(publicDer) {
  return [...createHash('sha256').update(publicDer).digest().subarray(0, 16)]
    .flatMap((byte) => [byte >> 4, byte & 15])
    .map((nibble) => String.fromCharCode('a'.charCodeAt(0) + nibble))
    .join('');
}

function backgroundHarness(initialStorage = {}, options = {}) {
  const state = structuredClone(initialStorage);
  const calls = {
    nativeStatus: 0,
    nativeLists: 0,
    nativePrints: [],
  };
  const chromeApi = {
    runtime: { id: 'extension-id' },
    storage: {
      local: {
        async get(keys) {
          if (keys === null || keys === undefined) return structuredClone(state);
          const names = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            names
              .filter((name) => Object.hasOwn(state, name))
              .map((name) => [name, structuredClone(state[name])]),
          );
        },
        async set(values) {
          Object.assign(state, structuredClone(values));
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key];
        },
      },
    },
  };
  const nativeApi = {
    async getNativeStatus() {
      calls.nativeStatus += 1;
      if (options.statusError) throw options.statusError;
      return { status: 'ready' };
    },
    async listNativePrinters() {
      calls.nativeLists += 1;
      if (options.listError) throw options.listError;
      return options.printers ?? ['Brother', 'Petes_Garden_ZD220_USB'];
    },
    async printNativeJob(printerName, raw) {
      calls.nativePrints.push({ printerName, raw });
      if (options.printError) throw options.printError;
      return { printed: true };
    },
  };
  return {
    state,
    calls,
    route: createBackgroundRouter({ chromeApi, nativeApi }),
    storage: chromeApi.storage.local,
  };
}

const sheetSender = (sheetId = 'Sheet_123-abc') => ({
  id: 'extension-id',
  tab: { url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit` },
});
const validPreferences = {
  textSize: 'large',
  horizontalOffset: 2,
  verticalOffset: -1,
};
const validRows = [{
  sourceRow: 7,
  PrintQty: 3,
  actualQty: 4,
  LotNum: 'LOT42',
  UseFreezeDate: '7/21/2026',
  FoodContents: 'Chicken and Rice',
}];

function sheetMessage(action, payload, sheetId = 'Sheet_123-abc') {
  return {
    channel: CHANNEL,
    action,
    sheetId,
    ...(payload === undefined ? {} : { payload }),
  };
}

test('preferences default, validate narrowly, and migrate only legacy display values', async () => {
  assert.deepEqual(validatePreferences({}), {
    textSize: 'large',
    horizontalOffset: 0,
    verticalOffset: 0,
  });
  assert.deepEqual(validatePreferences(validPreferences), validPreferences);
  for (const invalid of [
    { ...validPreferences, transport: 'network' },
    { ...validPreferences, profile: 'epl203' },
    { ...validPreferences, host: '192.168.1.2' },
    { ...validPreferences, printerName: 'Anything' },
    { ...validPreferences, gapDots: 20 },
    { ...validPreferences, textSize: 'huge' },
    { ...validPreferences, horizontalOffset: '2' },
  ]) {
    assert.throws(() => validatePreferences(invalid));
  }

  const harness = backgroundHarness({
    settings: {
      transport: 'network',
      profile: 'zpl300',
      host: '192.168.1.44',
      printerName: 'Ignored',
      gapDots: 99,
      textSize: 'medium',
      horizontalOffset: 3,
      verticalOffset: -4,
    },
  });
  assert.deepEqual(await readPreferences(harness.storage), {
    textSize: 'medium',
    horizontalOffset: 3,
    verticalOffset: -4,
  });
  assert.deepEqual(harness.state.preferences, {
    textSize: 'medium',
    horizontalOffset: 3,
    verticalOffset: -4,
  });
  assert.equal(Object.hasOwn(harness.state, 'settings'), false);
});

test('background authorizes only the current sender Sheet ID and persists it uniquely', async () => {
  const { route, state } = backgroundHarness({ approvedSheetIds: ['Existing'] });
  assert.deepEqual(
    await route(sheetMessage('authorize_sheet'), sheetSender()),
    { authorized: true, sheetId: 'Sheet_123-abc' },
  );
  assert.deepEqual(state.approvedSheetIds, ['Existing', 'Sheet_123-abc']);
  await route(sheetMessage('authorize_sheet'), sheetSender());
  assert.deepEqual(state.approvedSheetIds, ['Existing', 'Sheet_123-abc']);
  await assert.rejects(
    route(sheetMessage('authorize_sheet', undefined, 'Other'), sheetSender()),
    /does not match the current Google Sheet/,
  );
});

test('background rejects unknown channels, actions, forged senders, and output overrides', async () => {
  const { route, calls } = backgroundHarness({ approvedSheetIds: ['Sheet_123-abc'] });
  await assert.rejects(
    route({ channel: 'OTHER', action: 'get_status' }, sheetSender()),
    /Invalid message channel/,
  );
  for (const action of ['print_raw', 'list_printers', 'save_settings']) {
    await assert.rejects(route(sheetMessage(action), sheetSender()), /Unsupported action/);
  }
  await assert.rejects(
    route(sheetMessage('get_status'), { ...sheetSender(), id: 'forged' }),
    /untrusted extension sender/,
  );
  for (const extra of [
    { raw: '^XA^JUS^XZ' },
    { profile: 'epl203' },
    { printerName: 'Another printer' },
  ]) {
    await assert.rejects(
      route(sheetMessage('print_labels', { rows: validRows, ...extra }), sheetSender()),
      /only raw Sheet-style rows/,
    );
  }
  assert.equal(calls.nativeLists, 0);
});

test('background saves only display preferences from an approved Sheet', async () => {
  const { route, state } = backgroundHarness({ approvedSheetIds: ['Sheet_123-abc'] });
  assert.deepEqual(
    await route(
      sheetMessage('save_preferences', { preferences: validPreferences }),
      sheetSender(),
    ),
    { saved: true, preferences: validPreferences },
  );
  assert.deepEqual(state.preferences, validPreferences);

  await assert.rejects(
    route(
      sheetMessage('save_preferences', { preferences: validPreferences }, 'Unapproved'),
      sheetSender('Unapproved'),
    ),
    /not authorized/,
  );
  await assert.rejects(
    route(
      sheetMessage('save_preferences', {
        preferences: { ...validPreferences, transport: 'network' },
      }),
      sheetSender(),
    ),
    /unsupported field/,
  );
});

test('get_status reports authorization, helper readiness, detected printer, and preferences', async () => {
  const ready = backgroundHarness({
    approvedSheetIds: ['Sheet_123-abc'],
    cachedPrinterName: 'Petes_Garden_ZD220_USB',
    preferences: validPreferences,
  });
  assert.deepEqual(
    await ready.route(sheetMessage('get_status'), sheetSender()),
    {
      authorized: true,
      helperReady: true,
      printerReady: true,
      printerName: 'Petes_Garden_ZD220_USB',
      setupError: '',
      preferences: validPreferences,
    },
  );
  assert.equal(ready.calls.nativeStatus, 1);
  assert.equal(ready.calls.nativeLists, 1);

  const missing = backgroundHarness({}, {
    statusError: new Error("Pete's Garden local printer helper is not installed"),
  });
  const status = await missing.route(sheetMessage('get_status'), sheetSender());
  assert.equal(status.authorized, false);
  assert.equal(status.helperReady, false);
  assert.equal(status.printerReady, false);
  assert.equal(status.printerName, '');
  assert.match(status.setupError, /not installed/);
});

test('test_connection discovers a compatible queue and caches it', async () => {
  const harness = backgroundHarness({ approvedSheetIds: ['Sheet_123-abc'] });
  assert.deepEqual(
    await harness.route(sheetMessage('test_connection'), sheetSender()),
    {
      status: 'ready',
      printerName: 'Petes_Garden_ZD220_USB',
    },
  );
  assert.equal(harness.calls.nativeStatus, 1);
  assert.equal(harness.calls.nativeLists, 1);
  assert.equal(harness.state.cachedPrinterName, 'Petes_Garden_ZD220_USB');
});

test('background always prints validated Sheet rows as fixed 203-dpi ZPL to the detected queue', async () => {
  const { route, calls } = backgroundHarness({
    approvedSheetIds: ['Sheet_123-abc'],
    cachedPrinterName: 'Petes_Garden_ZD220_USB',
    preferences: validPreferences,
  });
  const result = await route(
    sheetMessage('print_labels', { rows: validRows }),
    sheetSender(),
  );

  assert.deepEqual(result, {
    requestedTotal: 3,
    actualTotal: 4,
    printerName: 'Petes_Garden_ZD220_USB',
  });
  assert.equal(calls.nativePrints[0].printerName, 'Petes_Garden_ZD220_USB');
  assert.match(calls.nativePrints[0].raw, /\^PW368\r\n\^LL406\r\n/);
  assert.match(calls.nativePrints[0].raw, /\^A0R/);
  assert.equal(calls.nativePrints.length, 1);
});

test('print_test uses fixed ZPL and a missing cached queue is replaced once', async () => {
  const harness = backgroundHarness({
    approvedSheetIds: ['Sheet_123-abc'],
    cachedPrinterName: 'Removed Zebra Queue',
  });
  assert.deepEqual(
    await harness.route(sheetMessage('print_test'), sheetSender()),
    {
      printed: true,
      printerName: 'Petes_Garden_ZD220_USB',
    },
  );
  assert.equal(harness.calls.nativeLists, 1);
  assert.equal(harness.calls.nativePrints.length, 1);
  assert.match(harness.calls.nativePrints[0].raw, /^\^XA\r\n/);
  assert.equal(harness.state.cachedPrinterName, 'Petes_Garden_ZD220_USB');
});

test('native print failures are never retried', async () => {
  const timeout = new Error(
    'Print status is unknown. Do not print again until you check the printer.',
  );
  const harness = backgroundHarness(
    {
      approvedSheetIds: ['Sheet_123-abc'],
      cachedPrinterName: 'Petes_Garden_ZD220_USB',
    },
    { printError: timeout },
  );
  await assert.rejects(
    harness.route(sheetMessage('print_labels', { rows: validRows }), sheetSender()),
    timeout,
  );
  assert.equal(harness.calls.nativePrints.length, 1);
});

test('background blocks unapproved Sheets from setup changes and printing', async () => {
  const { route } = backgroundHarness();
  await assert.rejects(
    route(sheetMessage('print_labels', { rows: validRows }), sheetSender()),
    /not authorized/,
  );
  await assert.rejects(
    route(
      sheetMessage('save_preferences', { preferences: validPreferences }),
      sheetSender(),
    ),
    /not authorized/,
  );
});

test('manifest is narrowly scoped MV3 with a module worker and no broad content access', () => {
  const manifest = readJson('manifest.json');
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '1.0.4');
  assert.deepEqual(manifest.background, { service_worker: 'background.js', type: 'module' });
  assert.deepEqual(manifest.permissions.sort(), ['nativeMessaging', 'storage']);
  assert.equal(Object.hasOwn(manifest, 'optional_host_permissions'), false);
  assert.equal(Object.hasOwn(manifest, 'options_page'), false);
  assert.deepEqual(manifest.content_scripts, [{
    matches: ['https://docs.google.com/spreadsheets/*'],
    js: ['content.js'],
    all_frames: false,
  }]);
  assert.deepEqual(manifest.web_accessible_resources, [{
    resources: ['lib/content-bridge.js'],
    matches: ['https://docs.google.com/*'],
  }]);
  for (const rule of manifest.web_accessible_resources) {
    for (const match of rule.matches) {
      assert.equal(new URL(match.replace('*', 'placeholder')).pathname, '/placeholder');
    }
  }
  assert.equal(JSON.stringify(manifest).includes('<all_urls>'), false);
  assert.match(manifest.key, /^[A-Za-z0-9+/]+={0,2}$/);
});

test('identity generation is stable and never writes a private key into the project', () => {
  const script = new URL('../scripts/generate-extension-identity.mjs', import.meta.url);
  const projectPrivateKey = new URL('../build/extension-private-key.pem', import.meta.url);
  assert.equal(existsSync(projectPrivateKey), false);
  execFileSync(process.execPath, [fileURLToPath(script)], {
    cwd: fileURLToPath(projectRoot),
    stdio: 'pipe',
  });
  const firstManifest = readJson('manifest.json');
  const firstId = readFileSync(new URL('../build/extension-id.txt', import.meta.url), 'utf8').trim();

  execFileSync(process.execPath, [fileURLToPath(script)], {
    cwd: fileURLToPath(projectRoot),
    stdio: 'pipe',
  });
  const secondManifest = readJson('manifest.json');
  const secondId = readFileSync(new URL('../build/extension-id.txt', import.meta.url), 'utf8').trim();

  assert.equal(secondManifest.key, firstManifest.key);
  assert.equal(secondId, firstId);
  const publicDer = Buffer.from(firstManifest.key, 'base64');
  assert.equal(firstId, chromeId(publicDer));
  assert.match(firstId, /^[a-p]{32}$/);
  assert.equal(existsSync(projectPrivateKey), false);
  assert.equal(existsSync(new URL('extension-private-key.pem', extensionRoot)), false);
  assert.equal(existsSync(new URL('build/', extensionRoot)), false);
  const source = readFileSync(script, 'utf8');
  assert.doesNotMatch(source, /generateKeyPairSync|extension-private-key\.pem/);
});

test('icon generator creates deterministic valid PNG assets for every manifest size', () => {
  const script = new URL('../scripts/make-icons.mjs', import.meta.url);
  execFileSync(process.execPath, [fileURLToPath(script)], {
    cwd: fileURLToPath(projectRoot),
    stdio: 'pipe',
  });
  const manifest = readJson('manifest.json');

  for (const [size, path] of Object.entries(manifest.icons)) {
    const bytes = readFileSync(new URL(path, extensionRoot));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), Number(size));
    assert.equal(bytes.readUInt32BE(20), Number(size));
  }
});

test('network and standalone settings surfaces are removed', () => {
  for (const removed of ['network.js', 'settings.html', 'settings.js', 'settings.css']) {
    assert.equal(existsSync(new URL(removed, extensionRoot)), false, removed);
  }
});
