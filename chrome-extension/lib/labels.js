import { PROFILES } from './constants.js';

const CRLF = '\r\n';
const DPI_203 = 203;
const DPI_300 = 300;

const TEXT_SCALES = Object.freeze({
  large: 1,
  medium: 0.85,
  compact: 0.70,
});

const EPL_FONTS = Object.freeze({
  large: Object.freeze({ header: 3, food: 4, fallback: 3 }),
  medium: Object.freeze({ header: 2, food: 3, fallback: 2 }),
  compact: Object.freeze({ header: 1, food: 2, fallback: 1 }),
});

function finishLines(lines) {
  return `${lines.join(CRLF)}${CRLF}`;
}

function escapeEpl(text) {
  return text.replaceAll('"', "'");
}

function escapeZpl(text) {
  return text.replace(/[_^~\\]/g, (character) => ({
    _: '_5F',
    '^': '_5E',
    '~': '_7E',
    '\\': '_5C',
  })[character]);
}

function eplText(x, y, font, text) {
  return `A${x},${y},1,${font},1,1,N,"${text}"`;
}

const STOCK_203 = Object.freeze({
  leftHeaderX: 130,
  rightHeaderX: 314,
  headerY: 26,
  singleFoodXLeft: 94,
  singleFoodXRight: 278,
  twoLineFood1XLeft: 92,
  twoLineFood1XRight: 276,
  twoLineFood2XLeft: 57,
  twoLineFood2XRight: 241,
  headerHeight: 33,
  headerWidth: 30,
  longHeaderHeight: 30,
  longHeaderWidth: 24,
  foodHeight: 41,
  foodWidth: 36,
  fallbackFoodHeight: 30,
  fallbackFoodWidth: 22,
});

const scaleFrom203 = (value, dpi) => Math.round(value * dpi / DPI_203);

function buildEpl203(job, settings) {
  const {
    horizontalOffset,
    verticalOffset,
    gapDots,
    textSize,
  } = settings;
  const { width, height } = PROFILES.epl203;
  const fonts = EPL_FONTS[textSize];
  const leftHeaderX = STOCK_203.leftHeaderX + horizontalOffset;
  const rightHeaderX = STOCK_203.rightHeaderX + horizontalOffset;
  const textY = STOCK_203.headerY + verticalOffset;
  const header = escapeEpl(`#${job.lotNum}  Use By  ${job.useByText}`);
  const lines = [
    'N',
    `q${width}`,
    `Q${height},${gapDots}`,
    'S2',
    'D8',
    eplText(leftHeaderX, textY, fonts.header, header),
    eplText(rightHeaderX, textY, fonts.header, header),
  ];

  if (job.foodLine2) {
    const firstLine = escapeEpl(job.foodLine1);
    const secondLine = escapeEpl(job.foodLine2);
    lines.push(
      eplText(STOCK_203.twoLineFood1XLeft + horizontalOffset, textY, fonts.fallback, firstLine),
      eplText(STOCK_203.twoLineFood2XLeft + horizontalOffset, textY, fonts.fallback, secondLine),
      eplText(STOCK_203.twoLineFood1XRight + horizontalOffset, textY, fonts.fallback, firstLine),
      eplText(STOCK_203.twoLineFood2XRight + horizontalOffset, textY, fonts.fallback, secondLine),
    );
  } else {
    const font = job.foodLine1.length <= 26 ? fonts.food : fonts.fallback;
    const foodLine = escapeEpl(job.foodLine1);
    lines.push(
      eplText(STOCK_203.singleFoodXLeft + horizontalOffset, textY, font, foodLine),
      eplText(STOCK_203.singleFoodXRight + horizontalOffset, textY, font, foodLine),
    );
  }

  lines.push(`P${job.pairRows}`);
  return finishLines(lines);
}

function zplText(x, y, fontHeight, fontWidth, text) {
  return `^FO${x},${y}^A0R,${fontHeight},${fontWidth}^FH_^FD${text}^FS`;
}

function scaledFont(value, textSize) {
  return Math.round(value * TEXT_SCALES[textSize]);
}

function buildZpl(job, settings, layout) {
  const horizontalOffset = Math.round((settings.horizontalOffset ?? 0) * layout.offsetScale);
  const verticalOffset = Math.round((settings.verticalOffset ?? 0) * layout.offsetScale);
  const leftHeaderX = layout.leftHeaderX + horizontalOffset;
  const rightHeaderX = layout.rightHeaderX + horizontalOffset;
  const textY = layout.headerY + verticalOffset;
  const header = escapeZpl(`#${job.lotNum}  Use By  ${job.useByText}`);
  const headerBase = header.length <= 26
    ? [layout.headerHeight, layout.headerWidth]
    : [layout.longHeaderHeight, layout.longHeaderWidth];
  const headerHeight = scaledFont(headerBase[0], settings.textSize);
  const headerWidth = scaledFont(headerBase[1], settings.textSize);
  const lines = [
    '^XA',
    '^CI28',
    '^MNY',
    `^PW${layout.width}`,
    `^LL${layout.height}`,
    zplText(leftHeaderX, textY, headerHeight, headerWidth, header),
    zplText(rightHeaderX, textY, headerHeight, headerWidth, header),
  ];

  if (job.foodLine2) {
    const firstLine = escapeZpl(job.foodLine1);
    const secondLine = escapeZpl(job.foodLine2);
    const fontHeight = scaledFont(layout.fallbackFoodHeight, settings.textSize);
    const fontWidth = scaledFont(layout.fallbackFoodWidth, settings.textSize);
    lines.push(
      zplText(layout.twoLineFood1XLeft + horizontalOffset, textY, fontHeight, fontWidth, firstLine),
      zplText(layout.twoLineFood2XLeft + horizontalOffset, textY, fontHeight, fontWidth, secondLine),
      zplText(layout.twoLineFood1XRight + horizontalOffset, textY, fontHeight, fontWidth, firstLine),
      zplText(layout.twoLineFood2XRight + horizontalOffset, textY, fontHeight, fontWidth, secondLine),
    );
  } else {
    const useOrdinaryFont = job.foodLine1.length <= 26;
    const baseHeight = useOrdinaryFont ? layout.foodHeight : layout.fallbackFoodHeight;
    const baseWidth = useOrdinaryFont ? layout.foodWidth : layout.fallbackFoodWidth;
    const fontHeight = scaledFont(baseHeight, settings.textSize);
    const fontWidth = scaledFont(baseWidth, settings.textSize);
    const foodLine = escapeZpl(job.foodLine1);
    lines.push(
      zplText(layout.singleFoodXLeft + horizontalOffset, textY, fontHeight, fontWidth, foodLine),
      zplText(layout.singleFoodXRight + horizontalOffset, textY, fontHeight, fontWidth, foodLine),
    );
  }

  lines.push(`^PQ${job.pairRows}`, '^XZ');
  return finishLines(lines);
}

function makeZplLayout(profile) {
  const dpi = PROFILES[profile].dpi;
  return Object.freeze({
    offsetScale: dpi / DPI_203,
    width: PROFILES[profile].width,
    height: PROFILES[profile].height,
    ...Object.fromEntries(Object.entries(STOCK_203).map(([key, value]) => [key, scaleFrom203(value, dpi)])),
  });
}

const ZPL_203_LAYOUT = makeZplLayout('zpl203');
const ZPL_300_LAYOUT = makeZplLayout('zpl300');

function validateWholeNumber(value, name, minimum, maximum) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a finite whole number from ${minimum} through ${maximum}`);
  }
}

function validateTextSize(value) {
  const textSize = value === undefined ? 'large' : value;
  if (!Object.hasOwn(TEXT_SCALES, textSize)) {
    throw new Error('textSize must be large, medium, or compact');
  }
  return textSize;
}

function validateSettings(settings) {
  const horizontalOffset = settings.horizontalOffset === undefined ? 0 : settings.horizontalOffset;
  const verticalOffset = settings.verticalOffset === undefined ? 0 : settings.verticalOffset;
  const gapDots = settings.gapDots === undefined ? 24 : settings.gapDots;
  const textSize = validateTextSize(settings.textSize);

  validateWholeNumber(horizontalOffset, 'horizontalOffset', -100, 100);
  validateWholeNumber(verticalOffset, 'verticalOffset', -100, 100);
  validateWholeNumber(gapDots, 'gapDots', 0, 100);

  return {
    horizontalOffset,
    verticalOffset,
    gapDots,
    textSize,
  };
}

export function buildPrinterJob(profile, jobs, settings = {}) {
  if (!Object.hasOwn(PROFILES, profile)) {
    throw new Error(`Unknown label profile: ${profile}`);
  }

  const normalizedSettings = validateSettings(settings ?? {});
  return jobs.map((job) => {
    if (profile === 'epl203') {
      return buildEpl203(job, normalizedSettings);
    }
    return buildZpl(
      job,
      normalizedSettings,
      profile === 'zpl203' ? ZPL_203_LAYOUT : ZPL_300_LAYOUT,
    );
  }).join('');
}
