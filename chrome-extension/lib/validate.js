import { LIMITS, PROFILES } from './constants.js';

export function normalizeWhitespace(value) {
  const text = String(value);
  if (/[^\x09-\x0d\x20-\x7e]/.test(text)) {
    throw new Error('Value must contain printable ASCII characters only');
  }
  return text.replace(/\s+/g, ' ').trim();
}

export function isPrivateIPv4(address) {
  if (typeof address !== 'string') {
    return false;
  }

  const match = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.exec(address);
  if (!match) {
    return false;
  }

  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) {
    return false;
  }

  const [first, second] = octets;
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 169 && second === 254);
}

function parseDate(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = /^([1-9]|1[0-2])\/([1-9]|[12]\d|3[01])\/(\d{4})$/.exec(value);
  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) {
    return null;
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) {
    return null;
  }

  return { month, day, yearText: match[3] };
}

export function isValidDate(value) {
  return parseDate(value) !== null;
}

export function splitFoodContents(value) {
  if (value === undefined || value === null) {
    throw new Error('FoodContents is required');
  }
  const text = normalizeWhitespace(value);
  if (!text) {
    throw new Error('FoodContents is required');
  }

  const words = text.split(' ');
  if (words.some((word) => word.length > LIMITS.maxFoodLineChars)) {
    throw new Error('FoodContents contains a word that is too long');
  }

  const lines = ['', ''];
  let lineIndex = 0;
  for (const word of words) {
    const candidate = lines[lineIndex] ? `${lines[lineIndex]} ${word}` : word;
    if (candidate.length <= LIMITS.maxFoodLineChars) {
      lines[lineIndex] = candidate;
      continue;
    }

    lineIndex += 1;
    if (lineIndex >= lines.length) {
      throw new Error('FoodContents cannot fit safely on two label lines');
    }
    lines[lineIndex] = word;
  }

  return lines;
}

export function validateTransport(settings = {}) {
  const type = normalizeWhitespace(settings?.type ?? '');
  if (type === 'network') {
    const host = settings.host;
    if (!isPrivateIPv4(host)) {
      throw new Error('Network host must be a private IPv4 address');
    }

    const rawPort = settings.port;
    const port = typeof rawPort === 'number'
      ? rawPort
      : (typeof rawPort === 'string' && /^\d+$/.test(rawPort) ? Number(rawPort) : NaN);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error('Network port must be a whole number from 1 through 65535');
    }
    return { type, host, port };
  }

  if (type === 'windows') {
    const printerName = normalizeWhitespace(settings.printerName ?? '');
    if (!printerName) {
      throw new Error('Windows printerName is required');
    }
    return { type, printerName };
  }

  throw new Error(`Unsupported transport type: ${type || '(blank)'}`);
}

function normalizeRowField(value, fieldName, sourceRow) {
  try {
    return normalizeWhitespace(value ?? '');
  } catch {
    throw new Error(`Row ${sourceRow}: ${fieldName} contains a non-printable or non-ASCII character`);
  }
}

export function validateLabelJobs(rows, { profile } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Label job must contain at least one row');
  }
  if (!Object.hasOwn(PROFILES, profile)) {
    throw new Error(`Unknown label profile: ${profile}`);
  }

  let requestedTotal = 0;
  let actualTotal = 0;
  const jobs = rows.map((rawRow, index) => {
    const row = rawRow ?? {};
    const sourceRow = row.sourceRow ?? index + 2;
    const rawPrintQty = row.PrintQty;
    const printQty = typeof rawPrintQty === 'boolean' ? NaN : Number(rawPrintQty);
    if (
      rawPrintQty === null
      || (typeof rawPrintQty === 'string' && rawPrintQty.trim() === '')
      || !Number.isInteger(printQty)
      || printQty < 1
      || printQty > LIMITS.maxPrintQty
    ) {
      throw new Error(`Row ${sourceRow}: PrintQty must be a positive whole number no greater than 10,000`);
    }

    const actualQty = printQty % 2 === 0 ? printQty : printQty + 1;
    if (row.actualQty !== undefined && Number(row.actualQty) !== actualQty) {
      throw new Error(`Row ${sourceRow}: actualQty must equal rounded PrintQty (${actualQty})`);
    }

    const lotNum = normalizeRowField(row.LotNum, 'LotNum', sourceRow);
    if (!lotNum) {
      throw new Error(`Row ${sourceRow}: LotNum is required`);
    }

    const dateText = normalizeRowField(row.UseFreezeDate, 'UseFreezeDate', sourceRow);
    const parsedDate = parseDate(dateText);
    if (!parsedDate) {
      throw new Error(`Row ${sourceRow}: UseFreezeDate must be a valid M/D/YYYY calendar date`);
    }
    const useByText = `${parsedDate.month}/${parsedDate.day}/${parsedDate.yearText}`;
    const headerText = `#${lotNum}  Use By  ${useByText}`;
    if (headerText.length > LIMITS.maxHeaderChars) {
      throw new Error(`Row ${sourceRow}: LotNum is too long`);
    }

    const foodText = normalizeRowField(row.FoodContents, 'FoodContents', sourceRow);
    if (!foodText) {
      throw new Error(`Row ${sourceRow}: FoodContents is required`);
    }

    let foodLines;
    try {
      foodLines = splitFoodContents(foodText);
    } catch (error) {
      throw new Error(`Row ${sourceRow}: ${error.message}`);
    }

    requestedTotal += printQty;
    actualTotal += actualQty;

    return {
      sourceRow,
      lotNum,
      useByText,
      foodLine1: foodLines[0],
      foodLine2: foodLines[1],
      printQty,
      actualQty,
      pairRows: actualQty / 2,
    };
  });

  if (actualTotal > LIMITS.maxJobTotal) {
    throw new Error('Job total cannot exceed 100,000 actual labels');
  }

  return { requestedTotal, actualTotal, jobs };
}
