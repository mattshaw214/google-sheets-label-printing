import assert from 'node:assert/strict';
import test from 'node:test';

import { selectCompatiblePrinter } from '../chrome-extension/lib/printer-selection.js';

test('reuses an exact cached printer that is still installed', () => {
  assert.equal(
    selectCompatiblePrinter(
      ['Brother HL-L3300CDW', 'Petes_Garden_ZD220_USB'],
      'Petes_Garden_ZD220_USB',
    ),
    'Petes_Garden_ZD220_USB',
  );
});

test('prefers one ZD220 or ZD230 queue over unrelated and generic Zebra queues', () => {
  assert.equal(
    selectCompatiblePrinter(['Zebra Generic', 'Brother', 'ZDesigner ZD230-203dpi ZPL']),
    'ZDesigner ZD230-203dpi ZPL',
  );
});

test('accepts one generic Zebra queue when no model-specific queue exists', () => {
  assert.equal(
    selectCompatiblePrinter(['Brother', 'Zebra Label Printer']),
    'Zebra Label Printer',
  );
});

test('rejects no compatible queue', () => {
  assert.throws(
    () => selectCompatiblePrinter(['Brother HL-L3300CDW']),
    /No installed ZD220 or ZD230 printer was found/,
  );
});

test('rejects multiple equally preferred queues without choosing silently', () => {
  assert.throws(
    () => selectCompatiblePrinter(['ZDesigner ZD220', 'Petes_Garden_ZD220_USB']),
    /Multiple ZD220 or ZD230 printers were found.*Petes_Garden_ZD220_USB.*ZDesigner ZD220/s,
  );
});
