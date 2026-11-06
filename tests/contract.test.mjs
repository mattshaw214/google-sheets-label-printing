import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildPrinterJob } from '../chrome-extension/lib/labels.js';
import { validateLabelJobs } from '../chrome-extension/lib/validate.js';

test('the shared fixture produces the same rounded totals in every printer profile', () => {
  const sheetRows = [
    {
      sourceRow: 2,
      PrintQty: 3,
      actualQty: 4,
      LotNum: 'LOT42',
      UseFreezeDate: '7/21/2026',
      FoodContents: 'Chicken and Rice',
    },
    {
      sourceRow: 3,
      PrintQty: 4,
      actualQty: 4,
      LotNum: 'TWO2',
      UseFreezeDate: '9/2/2026',
      FoodContents: 'Roasted chicken Carrots and brown rice',
    },
  ];

  for (const profile of ['epl203', 'zpl203', 'zpl300']) {
    const normalized = validateLabelJobs(sheetRows, { profile });
    assert.equal(normalized.requestedTotal, 7);
    assert.equal(normalized.actualTotal, 8);
    assert.equal(normalized.jobs[0].printQty, 3);
    assert.equal(normalized.jobs[0].pairRows, 2, '3 requested labels must print two identical media rows (4 labels)');

    const raw = buildPrinterJob(profile, normalized.jobs, {
      horizontalOffset: 0,
      verticalOffset: 0,
      gapDots: 24,
    });
    assert.match(raw, profile === 'epl203' ? /P2\r\n/ : /\^PQ2\r\n/);
  }
});

test('the Google Sheets background workflow has only the fixed ZPL203 route', () => {
  const source = readFileSync(
    new URL('../chrome-extension/background.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /profile:\s*['"]zpl203['"]/);
  assert.match(source, /gapDots:\s*24/);
  assert.doesNotMatch(source, /from ['"]\.\/network\.js['"]/);
  assert.doesNotMatch(source, /transport\s*===/);
  assert.doesNotMatch(source, /profile:\s*message\./);
});
