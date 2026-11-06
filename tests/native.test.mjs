import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  NATIVE_HOST,
  getNativeStatus,
  listNativePrinters,
  printNativeJob,
} from '../chrome-extension/native.js';

function nativeChrome(responder) {
  const calls = [];
  const runtime = {
    lastError: null,
    sendNativeMessage(host, message, callback) {
      calls.push({ host, message });
      responder({ host, message, callback, runtime });
    },
  };
  return { chromeApi: { runtime }, calls };
}

test('uses the fixed native host and status action', async () => {
  const { chromeApi, calls } = nativeChrome(({ callback }) => {
    callback({ ok: true });
  });
  assert.deepEqual(
    await getNativeStatus({ chromeApi }),
    { status: 'ready' },
  );
  assert.deepEqual(calls, [{ host: NATIVE_HOST, message: { command: 'status' } }]);
  assert.equal(NATIVE_HOST, 'org.petesgarden.zebra');
});

test('returns sorted unique validated printer names', async () => {
  const { chromeApi, calls } = nativeChrome(({ callback }) => {
    callback({ ok: true, printers: [' Zebra ZD421 ', 'Office', 'Zebra ZD421', 'Alpha'] });
  });
  assert.deepEqual(await listNativePrinters({ chromeApi }), ['Alpha', 'Office', 'Zebra ZD421']);
  assert.deepEqual(calls[0].message, { command: 'list_printers' });
});

test('sends print_raw with a validated printer name and raw job', async () => {
  const { chromeApi, calls } = nativeChrome(({ callback }) => callback({ ok: true }));
  assert.deepEqual(
    await printNativeJob('Zebra ZD421', '^XA^XZ\r\n', { chromeApi }),
    { printed: true },
  );
  assert.deepEqual(calls[0], {
    host: NATIVE_HOST,
    message: { command: 'print_raw', printerName: 'Zebra ZD421', raw: '^XA^XZ\r\n' },
  });
  await assert.rejects(printNativeJob('', 'N\r\n', { chromeApi }), /Printer name is required/);
  await assert.rejects(printNativeJob('Zebra', '', { chromeApi }), /raw print job is required/);
});

test('reports a missing helper with installation guidance', async () => {
  const { chromeApi } = nativeChrome(({ callback, runtime }) => {
    runtime.lastError = { message: 'Specified native messaging host not found.' };
    callback(undefined);
    runtime.lastError = null;
  });
  await assert.rejects(
    getNativeStatus({ chromeApi }),
    /Pete's Garden local printer helper is not installed.*org\.petesgarden\.zebra/,
  );
});

test('rejects malformed, failed, and unsafe native responses', async () => {
  for (const response of [null, [], { status: 'ready' }, { ok: false, error: 'Printer offline' }]) {
    const { chromeApi } = nativeChrome(({ callback }) => callback(response));
    await assert.rejects(
      getNativeStatus({ chromeApi }),
      response?.error ? /Printer offline/ : /invalid response/,
    );
  }

  const { chromeApi } = nativeChrome(({ callback }) => callback({ ok: true, printers: ['Good', 7] }));
  await assert.rejects(listNativePrinters({ chromeApi }), /invalid printer list/);

});

test('matches the strict Go helper command and response contract', () => {
  const helperSource = readFileSync(
    new URL('../native-helper/internal/host/handler.go', import.meta.url),
    'utf8',
  );
  assert.match(helperSource, /Command\s+string\s+`json:"command"`/);
  for (const command of ['status', 'list_printers', 'print_raw']) {
    assert.match(helperSource, new RegExp(`case "${command}"`));
  }
  assert.doesNotMatch(helperSource, /json:"action"/);
  assert.doesNotMatch(helperSource, /json:"(?:status|bytesWritten)"/);
});

test('bounds status and list calls with ordinary timeout errors', async () => {
  const unresponsive = nativeChrome(() => {});
  await assert.rejects(
    getNativeStatus({ chromeApi: unresponsive.chromeApi, timeoutMs: 5 }),
    /Local printer helper status timed out after 5 ms/,
  );
  await assert.rejects(
    listNativePrinters({ chromeApi: unresponsive.chromeApi, timeoutMs: 5 }),
    /Local printer helper printer list timed out after 5 ms/,
  );
});

test('reports a native print timeout with the exact indeterminate warning', async () => {
  const unresponsive = nativeChrome(() => {});
  await assert.rejects(
    printNativeJob('Zebra', 'N\r\n', { chromeApi: unresponsive.chromeApi, timeoutMs: 5 }),
    {
      message: 'Print status is unknown. Do not print again until you check the printer.',
    },
  );
});
