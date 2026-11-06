import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PROFILES } from '../chrome-extension/lib/constants.js';
import { buildPrinterJob } from '../chrome-extension/lib/labels.js';

const fixtures = JSON.parse(readFileSync(
  new URL('../fixtures/label-jobs.json', import.meta.url),
  'utf8',
));

const CRLF = '\r\n';

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function assertExactCrlf(text) {
  assert.equal(text.endsWith(CRLF), true);
  assert.equal(/(^|[^\r])\n/.test(text), false);
}

test('targets the narrow two-up stock and rotates text along the feed direction', () => {
  const expected = {
    epl203: { width: 368, height: 406, marker: /A\d+,\d+,1,/ },
    zpl203: { width: 368, height: 406, marker: /\^A0R,/ },
    zpl300: { width: 544, height: 600, marker: /\^A0R,/ },
  };

  for (const [profile, contract] of Object.entries(expected)) {
    const output = buildPrinterJob(profile, [fixtures.oddQuantityNormalized]);
    if (profile === 'epl203') {
      assert.match(output, new RegExp(`^N\\r\\nq${contract.width}\\r\\nQ${contract.height},24\\r\\n`));
    } else {
      assert.match(output, new RegExp(`\\^PW${contract.width}\\r\\n\\^LL${contract.height}\\r\\n`));
    }
    assert.match(output, contract.marker, profile);
  }
});

test('keeps rotated ZPL headers inside both physical label lanes', () => {
  const output = buildPrinterJob('zpl203', [fixtures.oddQuantityNormalized]);
  const matches = [...output.matchAll(/\^FO(\d+),26\^A0R,(\d+),30\^FH_\^FD#LOT42/g)];
  assert.equal(matches.length, 2);

  const laneHighEdges = [166, 350];
  for (const [index, match] of matches.entries()) {
    const originX = Number(match[1]);
    const glyphHeight = Number(match[2]);
    assert.ok(originX + glyphHeight <= laneHighEdges[index] - 3);
  }
});

test('moves both headers ten dots farther from the high label edge', () => {
  const output = buildPrinterJob('zpl203', [fixtures.oddQuantityNormalized]);
  assert.match(output, /\^FO130,26\^A0R,/);
  assert.match(output, /\^FO314,26\^A0R,/);
});

test('moves every text field ten dots inward from the near-printer edge', () => {
  const output = buildPrinterJob('zpl203', [fixtures.oddQuantityNormalized]);
  assert.equal(countOccurrences(output, ',26^A0R,'), 4);
  assert.equal(output.includes(',16^A0R,'), false);
});

test('uses calibrated readable ZPL fonts and safe long-text fallbacks', () => {
  const shortOutput = buildPrinterJob('zpl203', [fixtures.oddQuantityNormalized]);
  assert.match(shortOutput, /\^A0R,33,30\^FH_\^FD#LOT42/);
  assert.match(shortOutput, /\^A0R,41,36\^FH_\^FDChicken and Rice/);

  const longOutput = buildPrinterJob('zpl203', [fixtures.singleLong, fixtures.twoLine]);
  assert.match(longOutput, /\^A0R,30,22\^FH_\^FD123456789012345678901234567/);
  assert.match(longOutput, /\^A0R,30,22\^FH_\^FDRoasted chicken/);
  assert.match(longOutput, /\^A0R,30,22\^FH_\^FDCarrots and brown rice/);
});

test('uses the physically approved Large typography and defaults missing textSize to Large', () => {
  const explicit = buildPrinterJob(
    'zpl203',
    [fixtures.oddQuantityNormalized],
    { textSize: 'large' },
  );
  const implicit = buildPrinterJob('zpl203', [fixtures.oddQuantityNormalized]);

  assert.equal(implicit, explicit);
  assert.match(explicit, /\^FO130,26\^A0R,33,30\^FH_\^FD#LOT42/);
  assert.match(explicit, /\^FO314,26\^A0R,33,30\^FH_\^FD#LOT42/);
  assert.match(explicit, /\^FO94,26\^A0R,41,36\^FH_\^FDChicken and Rice/);
  assert.match(explicit, /\^FO278,26\^A0R,41,36\^FH_\^FDChicken and Rice/);
});

test('automatically fits long headers and food while keeping at most three printed rows', () => {
  const longHeader = {
    ...fixtures.oddQuantityNormalized,
    lotNum: '123456789',
    useByText: '12/31/2099',
  };
  const headerOutput = buildPrinterJob('zpl203', [longHeader], { textSize: 'large' });
  assert.match(headerOutput, /\^A0R,30,24\^FH_\^FD#123456789  Use By  12\/31\/2099/);

  const longFoodOutput = buildPrinterJob('zpl203', [fixtures.singleLong], { textSize: 'large' });
  assert.match(longFoodOutput, /\^A0R,30,22\^FH_\^FD123456789012345678901234567/);

  const twoLineOutput = buildPrinterJob('zpl203', [fixtures.twoLine], { textSize: 'large' });
  assert.match(twoLineOutput, /\^FO92,26\^A0R,30,22\^FH_\^FDRoasted chicken/);
  assert.match(twoLineOutput, /\^FO57,26\^A0R,30,22\^FH_\^FDCarrots and brown rice/);
  assert.match(twoLineOutput, /\^FO276,26\^A0R,30,22\^FH_\^FDRoasted chicken/);
  assert.match(twoLineOutput, /\^FO241,26\^A0R,30,22\^FH_\^FDCarrots and brown rice/);
  assert.equal(countOccurrences(twoLineOutput, '^A0R,'), 6);
});

test('scales ZPL fonts through Medium and Compact presets at both supported DPIs', () => {
  const medium = buildPrinterJob(
    'zpl203',
    [fixtures.oddQuantityNormalized],
    { textSize: 'medium' },
  );
  assert.match(medium, /\^A0R,28,26\^FH_\^FD#LOT42/);
  assert.match(medium, /\^A0R,35,31\^FH_\^FDChicken and Rice/);

  const compact = buildPrinterJob(
    'zpl203',
    [fixtures.oddQuantityNormalized],
    { textSize: 'compact' },
  );
  assert.match(compact, /\^A0R,23,21\^FH_\^FD#LOT42/);
  assert.match(compact, /\^A0R,29,25\^FH_\^FDChicken and Rice/);

  const zpl300 = buildPrinterJob(
    'zpl300',
    [fixtures.oddQuantityNormalized],
    { textSize: 'large' },
  );
  assert.match(zpl300, /\^A0R,49,44\^FH_\^FD#LOT42/);
  assert.match(zpl300, /\^A0R,61,53\^FH_\^FDChicken and Rice/);
});

test('maps EPL text-size presets to progressively smaller resident fonts', () => {
  for (const [textSize, headerFont, foodFont] of [
    ['large', 3, 4],
    ['medium', 2, 3],
    ['compact', 1, 2],
  ]) {
    const output = buildPrinterJob(
      'epl203',
      [fixtures.oddQuantityNormalized],
      { textSize },
    );
    assert.match(output, new RegExp(`A130,26,1,${headerFont},1,1,N`));
    assert.match(output, new RegExp(`A94,26,1,${foodFont},1,1,N`));
  }
});

test('rejects unknown and non-string text-size presets', () => {
  for (const textSize of ['', 'huge', 100, null]) {
    assert.throws(
      () => buildPrinterJob('zpl203', [fixtures.oddQuantityNormalized], { textSize }),
      /textSize must be large, medium, or compact/,
      String(textSize),
    );
  }
});

test('builds exact EPL203 labels when an odd quantity is normalized to pairRows 2', () => {
  const output = buildPrinterJob('epl203', [fixtures.oddQuantityNormalized]);

  assert.equal(output, [
    'N',
    'q368',
    'Q406,24',
    'S2',
    'D8',
    'A130,26,1,3,1,1,N,"#LOT42  Use By  7/21/2026"',
    'A314,26,1,3,1,1,N,"#LOT42  Use By  7/21/2026"',
    'A94,26,1,4,1,1,N,"Chicken and Rice"',
    'A278,26,1,4,1,1,N,"Chicken and Rice"',
    'P2',
    '',
  ].join(CRLF));
  assert.equal(countOccurrences(output, '#LOT42  Use By  7/21/2026'), 2);
  assert.equal(countOccurrences(output, 'Chicken and Rice'), 2);
  assertExactCrlf(output);
});

test('uses EPL single-line and two-line fonts, offsets, custom gap, and pair quantities', () => {
  const output = buildPrinterJob(
    'epl203',
    [fixtures.singleLong, fixtures.twoLine],
    { horizontalOffset: 7, verticalOffset: -4, gapDots: 31 },
  );

  assert.equal(countOccurrences(output, 'N\r\nq368\r\nQ406,31\r\nS2\r\nD8\r\n'), 2);
  assert.match(output, /A101,22,1,3,1,1,N,"123456789012345678901234567"\r\n/);
  assert.match(output, /A285,22,1,3,1,1,N,"123456789012345678901234567"\r\nP1\r\n/);
  assert.match(output, /A99,22,1,3,1,1,N,"Roasted chicken"\r\n/);
  assert.match(output, /A64,22,1,3,1,1,N,"Carrots and brown rice"\r\n/);
  assert.match(output, /A283,22,1,3,1,1,N,"Roasted chicken"\r\n/);
  assert.match(output, /A248,22,1,3,1,1,N,"Carrots and brown rice"\r\nP3\r\n$/);
  assert.equal(countOccurrences(output, '#LONG27  Use By  8/1/2026'), 2);
  assert.equal(countOccurrences(output, '#TWO2  Use By  9/2/2026'), 2);
  assertExactCrlf(output);
});

test('escapes EPL double quotes to apostrophes in headers and food text', () => {
  const output = buildPrinterJob('epl203', [fixtures.escaped]);

  assert.equal(countOccurrences(output, '#LOT\'_^~\\42  Use By  10/3/2026'), 2);
  assert.equal(countOccurrences(output, 'Chef\'s \'_^~\\ plate'), 2);
  assert.equal(output.includes('LOT"'), false);
  assert.equal(output.includes('s "'), false);
});

test('builds exact ZPL300 labels when an odd quantity is normalized to pairRows 2', () => {
  const output = buildPrinterJob('zpl300', [fixtures.oddQuantityNormalized]);

  assert.equal(output, [
    '^XA',
    '^CI28',
    '^MNY',
    '^PW544',
    '^LL600',
    '^FO192,38^A0R,49,44^FH_^FD#LOT42  Use By  7/21/2026^FS',
    '^FO464,38^A0R,49,44^FH_^FD#LOT42  Use By  7/21/2026^FS',
    '^FO139,38^A0R,61,53^FH_^FDChicken and Rice^FS',
    '^FO411,38^A0R,61,53^FH_^FDChicken and Rice^FS',
    '^PQ2',
    '^XZ',
    '',
  ].join(CRLF));
  assert.equal(countOccurrences(output, '#LOT42  Use By  7/21/2026'), 2);
  assert.equal(countOccurrences(output, 'Chicken and Rice'), 2);
  assertExactCrlf(output);
});

test('scales 203-dot offsets for ZPL300 and selects long and two-line fonts', () => {
  const output = buildPrinterJob(
    'zpl300',
    [fixtures.singleLong, fixtures.twoLine],
    { horizontalOffset: 7, verticalOffset: -4, gapDots: 99 },
  );

  assert.equal(countOccurrences(output, '^XA\r\n^CI28\r\n^MNY\r\n^PW544\r\n^LL600\r\n'), 2);
  assert.match(output, /\^FO149,32\^A0R,44,33\^FH_\^FD123456789012345678901234567\^FS\r\n/);
  assert.match(output, /\^FO421,32\^A0R,44,33\^FH_\^FD123456789012345678901234567\^FS\r\n\^PQ1\r\n\^XZ\r\n/);
  assert.match(output, /\^FO146,32\^A0R,44,33\^FH_\^FDRoasted chicken\^FS\r\n/);
  assert.match(output, /\^FO94,32\^A0R,44,33\^FH_\^FDCarrots and brown rice\^FS\r\n/);
  assert.match(output, /\^FO418,32\^A0R,44,33\^FH_\^FDRoasted chicken\^FS\r\n/);
  assert.match(output, /\^FO366,32\^A0R,44,33\^FH_\^FDCarrots and brown rice\^FS\r\n\^PQ3\r\n\^XZ\r\n$/);
  assert.equal(output.includes('99'), false);
});

test('builds rotated ZPL203 from the shared physical layout with unscaled offsets', () => {
  const output = buildPrinterJob(
    'zpl203',
    [fixtures.oddQuantityNormalized, fixtures.singleLong, fixtures.twoLine],
    { horizontalOffset: 7, verticalOffset: -4 },
  );

  assert.equal(countOccurrences(output, '^XA\r\n^CI28\r\n^MNY\r\n^PW368\r\n^LL406\r\n'), 3);
  assert.match(output, /\^FO137,22\^A0R,33,30\^FH_\^FD#LOT42  Use By  7\/21\/2026\^FS\r\n/);
  assert.match(output, /\^FO321,22\^A0R,33,30\^FH_\^FD#LOT42  Use By  7\/21\/2026\^FS\r\n/);
  assert.match(output, /\^FO101,22\^A0R,41,36\^FH_\^FDChicken and Rice\^FS\r\n/);
  assert.match(output, /\^FO285,22\^A0R,41,36\^FH_\^FDChicken and Rice\^FS\r\n\^PQ2\r\n/);
  assert.match(output, /\^FO101,22\^A0R,30,22\^FH_\^FD123456789012345678901234567\^FS\r\n/);
  assert.match(output, /\^FO99,22\^A0R,30,22\^FH_\^FDRoasted chicken\^FS\r\n/);
  assert.match(output, /\^FO64,22\^A0R,30,22\^FH_\^FDCarrots and brown rice\^FS\r\n/);
  assert.match(output, /\^FO283,22\^A0R,30,22\^FH_\^FDRoasted chicken\^FS\r\n/);
  assert.match(output, /\^FO248,22\^A0R,30,22\^FH_\^FDCarrots and brown rice\^FS\r\n\^PQ3\r\n\^XZ\r\n$/);
  assert.equal(countOccurrences(output, '#LOT42  Use By  7/21/2026'), 2);
  assert.equal(countOccurrences(output, '#LONG27  Use By  8/1/2026'), 2);
  assert.equal(countOccurrences(output, '#TWO2  Use By  9/2/2026'), 2);
  assertExactCrlf(output);
});

test('hex-escapes ZPL field-hex indicator and command introducers to block injection', () => {
  for (const profile of ['zpl203', 'zpl300']) {
    const output = buildPrinterJob(profile, [fixtures.escaped]);

    assert.equal(countOccurrences(output, '#LOT"_5F_5E_7E_5C42  Use By  10/3/2026'), 2, profile);
    assert.equal(countOccurrences(output, 'Chef\'s "_5F_5E_7E_5C plate'), 2, profile);
    assert.equal(output.includes('LOT"_^'), false, profile);
    assert.equal(output.includes('"_^~\\ plate'), false, profile);
  }
});

test('concatenates one media format per normalized row and preserves pairRows', () => {
  for (const profile of ['epl203', 'zpl203', 'zpl300']) {
  const output = buildPrinterJob(profile, [fixtures.oddQuantityNormalized, fixtures.twoLine]);
    const mediaStart = profile === 'epl203' ? 'N\r\n' : '^XA\r\n';
    const firstQuantity = profile === 'epl203' ? 'P2\r\n' : '^PQ2\r\n';
    const secondQuantity = profile === 'epl203' ? 'P3\r\n' : '^PQ3\r\n';

    assert.equal(countOccurrences(output, mediaStart), 2, profile);
    assert.equal(countOccurrences(output, firstQuantity), 1, profile);
    assert.equal(countOccurrences(output, secondQuantity), 1, profile);
  }
});

test('rejects unknown and inherited profile property names', () => {
  for (const profile of ['unknown', 'toString', 'constructor', '__proto__']) {
    assert.throws(
      () => buildPrinterJob(profile, [fixtures.oddQuantityNormalized]),
      new RegExp(`Unknown label profile: ${profile}`),
      profile,
    );
  }
});

test('rejects invalid horizontal offsets before constructing any printer profile', () => {
  const invalidValues = ['7', Number.NaN, Infinity, 1.25, -101, 101, '0\r\nP999'];

  for (const profile of Object.keys(PROFILES)) {
    for (const horizontalOffset of invalidValues) {
      assert.throws(
        () => buildPrinterJob(
          profile,
          [fixtures.oddQuantityNormalized],
          { horizontalOffset },
        ),
        /horizontalOffset must be a finite whole number from -100 through 100/,
        `${profile}: ${String(horizontalOffset)}`,
      );
    }
  }
});

test('rejects invalid vertical offsets before constructing any printer profile', () => {
  const invalidValues = ['-4', Number.NaN, -Infinity, 2.5, -101, 101, '0\r\n^PQ999'];

  for (const profile of Object.keys(PROFILES)) {
    for (const verticalOffset of invalidValues) {
      assert.throws(
        () => buildPrinterJob(
          profile,
          [fixtures.oddQuantityNormalized],
          { verticalOffset },
        ),
        /verticalOffset must be a finite whole number from -100 through 100/,
        `${profile}: ${String(verticalOffset)}`,
      );
    }
  }
});

test('rejects invalid or injectable gaps before constructing EPL or ZPL', () => {
  const invalidValues = ['24', Number.NaN, Infinity, 1.5, -1, 101, '24\r\nP999'];

  for (const profile of Object.keys(PROFILES)) {
    for (const gapDots of invalidValues) {
      assert.throws(
        () => buildPrinterJob(
          profile,
          [fixtures.oddQuantityNormalized],
          { gapDots },
        ),
        /gapDots must be a finite whole number from 0 through 100/,
        `${profile}: ${String(gapDots)}`,
      );
    }
  }
});

test('accepts inclusive settings boundaries and derives media dimensions from profiles', () => {
  for (const [profile, dimensions] of Object.entries(PROFILES)) {
    const output = buildPrinterJob(
      profile,
      [fixtures.oddQuantityNormalized],
      { horizontalOffset: -100, verticalOffset: 100, gapDots: 0 },
    );

    if (dimensions.language === 'epl') {
      assert.match(output, new RegExp(`^N\\r\\nq${dimensions.width}\\r\\nQ${dimensions.height},0\\r\\n`));
    } else {
      assert.match(output, new RegExp(`\\^PW${dimensions.width}\\r\\n\\^LL${dimensions.height}\\r\\n`));
    }
  }
});
