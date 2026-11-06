import test from 'node:test';
import assert from 'node:assert/strict';

import { LIMITS, PROFILES } from '../chrome-extension/lib/constants.js';
import {
  isPrivateIPv4,
  isValidDate,
  normalizeWhitespace,
  splitFoodContents,
  validateLabelJobs,
  validateTransport,
} from '../chrome-extension/lib/validate.js';

const validRow = (overrides = {}) => ({
  sourceRow: 7,
  PrintQty: 2,
  LotNum: 'LOT42',
  UseFreezeDate: '7/21/2026',
  FoodContents: 'Chicken and Rice',
  ...overrides,
});

test('defines all supported physical printer profiles', () => {
  assert.deepEqual(Object.keys(PROFILES), ['epl203', 'zpl203', 'zpl300']);
  assert.deepEqual(
    Object.values(PROFILES).map(({ width, height }) => [width, height]),
    [[368, 406], [368, 406], [544, 600]],
  );
  assert.equal(LIMITS.labelWidthInches, 2);
  assert.equal(LIMITS.labelHeightInches, 0.75);
  assert.equal(LIMITS.labelsAcross, 2);
  assert.equal(LIMITS.maxHeaderChars, 30);
});

test('normalizes a valid row and rounds an odd quantity up to an even pair', () => {
  const result = validateLabelJobs([
    {
      sourceRow: 7,
      PrintQty: 3,
      LotNum: '  LOT   42  ',
      UseFreezeDate: '2/29/2024',
      FoodContents: 'Chicken   and\tRice',
    },
  ], { profile: 'epl203' });

  assert.deepEqual(result, {
    requestedTotal: 3,
    actualTotal: 4,
    jobs: [{
      sourceRow: 7,
      lotNum: 'LOT 42',
      useByText: '2/29/2024',
      foodLine1: 'Chicken and Rice',
      foodLine2: '',
      printQty: 3,
      actualQty: 4,
      pairRows: 2,
    }],
  });
});

test('validates real unpadded M/D/YYYY calendar dates', () => {
  assert.equal(isValidDate('2/29/2024'), true);
  assert.equal(isValidDate('2/29/2023'), false);
  assert.equal(isValidDate('2/31/2026'), false);
  assert.equal(isValidDate('02/03/2026'), false);
  assert.equal(isValidDate('2026-02-03'), false);

  const { jobs: [job] } = validateLabelJobs([
    validRow({ UseFreezeDate: '2/3/2026' }),
  ], { profile: 'zpl203' });
  assert.equal(job.useByText, '2/3/2026');
});

test('rejects invalid dates with a source-row-numbered error', () => {
  assert.throws(
    () => validateLabelJobs([validRow({ sourceRow: 19, UseFreezeDate: '2/31/2026' })], { profile: 'epl203' }),
    /Row 19: UseFreezeDate must be a valid M\/D\/YYYY calendar date/,
  );
});

test('accepts only the permitted private or link-local IPv4 ranges', () => {
  for (const address of [
    '10.0.0.1', '10.255.255.255',
    '172.16.0.1', '172.31.255.254',
    '192.168.0.1', '192.168.255.255',
    '169.254.0.1', '169.254.255.254',
  ]) {
    assert.equal(isPrivateIPv4(address), true, address);
  }

  for (const address of [
    '8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.1.1',
    '10.0.0', '10.0.0.1.2', '10..0.1', '10.0.0.-1', '10.0.0.256',
    '010.0.0.1', '10.00.0.1', ' 10.0.0.1 ', 'localhost', '', null,
  ]) {
    assert.equal(isPrivateIPv4(address), false, String(address));
  }
});

test('validates and normalizes network transport settings', () => {
  assert.deepEqual(
    validateTransport({ type: ' network ', host: '192.168.1.44', port: '9100' }),
    { type: 'network', host: '192.168.1.44', port: 9100 },
  );
  assert.throws(
    () => validateTransport({ type: 'network', host: '8.8.8.8', port: 9100 }),
    /private IPv4/,
  );
  assert.throws(
    () => validateTransport({ type: 'network', host: '10.0.0.1', port: 0 }),
    /port/,
  );
  assert.throws(
    () => validateTransport({ type: 'network', host: '10.0.0.1', port: 65536 }),
    /port/,
  );
});

test('validates and normalizes Windows transport settings', () => {
  assert.deepEqual(
    validateTransport({ type: 'windows', printerName: '  Zebra   ZD421  ' }),
    { type: 'windows', printerName: 'Zebra ZD421' },
  );
  assert.throws(
    () => validateTransport({ type: 'windows', printerName: '   ' }),
    /printerName/,
  );
  assert.throws(
    () => validateTransport({ type: 'bluetooth', printerName: 'Zebra' }),
    /transport type/,
  );
});

test('normalizes ordinary whitespace but rejects controls and Unicode', () => {
  assert.equal(normalizeWhitespace('  Chicken\r\n and\tRice  '), 'Chicken and Rice');
  assert.throws(() => normalizeWhitespace('bad\u0000text'), /printable ASCII/);
  assert.throws(() => normalizeWhitespace('jalape\u00f1o'), /printable ASCII/);
  assert.throws(
    () => validateLabelJobs([validRow({ sourceRow: 12, LotNum: 'LOT\u201942' })], { profile: 'zpl300' }),
    /Row 12: LotNum contains a non-printable or non-ASCII character/,
  );
});

test('splits food contents into no more than two 28-character lines', () => {
  const exactly28 = '1234567890123456789012345678';
  assert.deepEqual(splitFoodContents(exactly28), [exactly28, '']);

  const [line1, line2] = splitFoodContents('Roasted chicken with carrots and brown rice');
  assert.equal(line1.length <= 28, true);
  assert.equal(line2.length <= 28, true);
  assert.equal(`${line1} ${line2}`, 'Roasted chicken with carrots and brown rice');

  assert.throws(
    () => splitFoodContents('12345678901234567890123456789 rest'),
    /word that is too long/,
  );
  assert.throws(
    () => splitFoodContents(`${'a'.repeat(28)} ${'b'.repeat(28)} extra`),
    /cannot fit safely on two label lines/,
  );

  assert.throws(
    () => splitFoodContents('  \t '),
    /FoodContents is required/,
  );
  for (const value of [undefined, null]) {
    assert.throws(
      () => splitFoodContents(value),
      /FoodContents is required/,
    );
  }
});

test('requires nonempty rows and a known profile', () => {
  assert.throws(() => validateLabelJobs([], { profile: 'epl203' }), /at least one row/);
  assert.throws(() => validateLabelJobs([validRow()], { profile: 'unknown' }), /Unknown label profile/);
  for (const profile of ['toString', 'constructor', '__proto__']) {
    assert.throws(
      () => validateLabelJobs([validRow()], { profile }),
      /Unknown label profile/,
      profile,
    );
  }
});

test('enforces positive whole PrintQty values through the 10,000 boundary', () => {
  assert.equal(
    validateLabelJobs([validRow({ PrintQty: 10_000 })], { profile: 'zpl300' }).actualTotal,
    10_000,
  );
  for (const value of [0, -1, 1.5, '2.5', 'two', '', 10_001]) {
    assert.throws(
      () => validateLabelJobs([validRow({ sourceRow: 23, PrintQty: value })], { profile: 'zpl300' }),
      /Row 23: PrintQty must be a positive whole number no greater than 10,000/,
      String(value),
    );
  }
});

test('requires supplied actualQty to equal the rounded quantity', () => {
  assert.throws(
    () => validateLabelJobs([validRow({ sourceRow: 31, PrintQty: 3, actualQty: 3 })], { profile: 'epl203' }),
    /Row 31: actualQty must equal rounded PrintQty \(4\)/,
  );
  const { jobs: [job] } = validateLabelJobs([
    validRow({ PrintQty: 3, actualQty: 4 }),
  ], { profile: 'epl203' });
  assert.equal(job.actualQty, 4);
  assert.equal(job.pairRows, 2);
});

test('allows exactly 100,000 actual labels and rejects totals above it', () => {
  const exactlyLimit = Array.from({ length: 10 }, (_, index) => (
    validRow({ sourceRow: index + 2, PrintQty: 9_999 })
  ));
  assert.equal(
    validateLabelJobs(exactlyLimit, { profile: 'zpl203' }).actualTotal,
    100_000,
  );

  assert.throws(
    () => validateLabelJobs([...exactlyLimit, validRow({ sourceRow: 12, PrintQty: 1 })], { profile: 'zpl203' }),
    /Job total cannot exceed 100,000 actual labels/,
  );
});

test('rejects blank required fields and headers that cannot fit', () => {
  assert.throws(
    () => validateLabelJobs([validRow({ sourceRow: 40, LotNum: '  ' })], { profile: 'epl203' }),
    /Row 40: LotNum is required/,
  );
  assert.throws(
    () => validateLabelJobs([validRow({ sourceRow: 41, FoodContents: '\t' })], { profile: 'epl203' }),
    /Row 41: FoodContents is required/,
  );
  assert.throws(
    () => validateLabelJobs([validRow({ sourceRow: 42, LotNum: 'THIS-LOT-IS-TOO-LONG' })], { profile: 'epl203' }),
    /Row 42: LotNum is too long/,
  );
});

test('limits the composed lot and use-by header to 30 characters', () => {
  const atBoundary = validateLabelJobs([
    validRow({ sourceRow: 50, LotNum: '1234567890', UseFreezeDate: '7/21/2026' }),
  ], { profile: 'epl203' });
  assert.equal(atBoundary.jobs[0].lotNum, '1234567890');

  assert.throws(
    () => validateLabelJobs([
      validRow({ sourceRow: 51, LotNum: '12345678901', UseFreezeDate: '7/21/2026' }),
    ], { profile: 'epl203' }),
    /Row 51: LotNum is too long/,
  );
});

test('rejects non-ASCII FoodContents with a source-row-numbered error', () => {
  assert.throws(
    () => validateLabelJobs([
      validRow({ sourceRow: 52, FoodContents: 'jalape\u00f1o chicken' }),
    ], { profile: 'zpl203' }),
    /Row 52: FoodContents contains a non-printable or non-ASCII character/,
  );
});
