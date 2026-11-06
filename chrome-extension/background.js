import { CHANNEL } from './lib/content-bridge.js';
import { buildPrinterJob } from './lib/labels.js';
import { selectCompatiblePrinter } from './lib/printer-selection.js';
import { validateLabelJobs } from './lib/validate.js';
import * as defaultNativeApi from './native.js';

const SUPPORTED_ACTIONS = new Set([
  'get_status',
  'authorize_sheet',
  'save_preferences',
  'test_connection',
  'print_test',
  'print_labels',
]);
const PREFERENCE_FIELDS = new Set([
  'textSize',
  'horizontalOffset',
  'verticalOffset',
]);
const PRINT_PAYLOAD_FIELDS = new Set([
  'version',
  'rows',
  'requestedTotal',
  'actualTotal',
]);
const ROW_FIELDS = new Set([
  'sourceRow',
  'PrintQty',
  'actualQty',
  'LotNum',
  'UseFreezeDate',
  'FoodContents',
]);
const DEFAULT_PREFERENCES = Object.freeze({
  textSize: 'large',
  horizontalOffset: 0,
  verticalOffset: 0,
});
const FIXED_PRINT_SETTINGS = Object.freeze({
  profile: 'zpl203',
  gapDots: 24,
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, fields) {
  return isRecord(value) && Object.keys(value).every((key) => fields.has(key));
}

function extractSheetId(urlText) {
  try {
    const url = new URL(urlText);
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') {
      return null;
    }
    return /^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function validatePreferences(rawPreferences = {}) {
  if (!hasOnlyKeys(rawPreferences, PREFERENCE_FIELDS)) {
    throw new Error('Preferences contain an unsupported field');
  }
  const preferences = {
    textSize: rawPreferences.textSize ?? DEFAULT_PREFERENCES.textSize,
    horizontalOffset:
      rawPreferences.horizontalOffset ?? DEFAULT_PREFERENCES.horizontalOffset,
    verticalOffset:
      rawPreferences.verticalOffset ?? DEFAULT_PREFERENCES.verticalOffset,
  };
  buildPrinterJob(FIXED_PRINT_SETTINGS.profile, [], {
    ...FIXED_PRINT_SETTINGS,
    ...preferences,
  });
  return preferences;
}

export async function readPreferences(storage) {
  const stored = await storage.get(['preferences', 'settings']);
  let preferences;
  if (stored.preferences !== undefined) {
    preferences = validatePreferences(stored.preferences);
  } else {
    const legacy = isRecord(stored.settings) ? stored.settings : {};
    preferences = validatePreferences(Object.fromEntries(
      [...PREFERENCE_FIELDS]
        .filter((field) => legacy[field] !== undefined)
        .map((field) => [field, legacy[field]]),
    ));
  }
  await storage.set({ preferences });
  if (stored.settings !== undefined && typeof storage.remove === 'function') {
    await storage.remove('settings');
  }
  return preferences;
}

function validatePrintPayload(payload) {
  if (!hasOnlyKeys(payload, PRINT_PAYLOAD_FIELDS) || !Array.isArray(payload.rows)) {
    throw new Error('print_labels accepts only raw Sheet-style rows');
  }
  if (payload.rows.some((row) => !hasOnlyKeys(row, ROW_FIELDS))) {
    throw new Error('print_labels accepts only raw Sheet-style rows');
  }
  if (payload.version !== undefined && !Number.isInteger(payload.version)) {
    throw new Error('print_labels payload version must be a whole number');
  }
  if (payload.requestedTotal !== undefined && !Number.isInteger(payload.requestedTotal)) {
    throw new Error('print_labels requestedTotal must be a whole number');
  }
  if (payload.actualTotal !== undefined && !Number.isInteger(payload.actualTotal)) {
    throw new Error('print_labels actualTotal must be a whole number');
  }
  return payload.rows;
}

async function getApprovedSheetIds(storage) {
  const { approvedSheetIds } = await storage.get('approvedSheetIds');
  return Array.isArray(approvedSheetIds)
    ? [...new Set(
      approvedSheetIds.filter(
        (id) => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id),
      ),
    )]
    : [];
}

async function resolveNativePrinter(storage, nativeApi, chromeApi) {
  const { cachedPrinterName = '' } = await storage.get('cachedPrinterName');
  const printers = await nativeApi.listNativePrinters({ chromeApi });
  const printerName = selectCompatiblePrinter(printers, cachedPrinterName);
  if (printerName !== cachedPrinterName) {
    await storage.set({ cachedPrinterName: printerName });
  }
  return printerName;
}

function buildTestRaw(preferences) {
  const normalized = validateLabelJobs([{
    sourceRow: 1,
    PrintQty: 2,
    actualQty: 2,
    LotNum: 'TEST',
    UseFreezeDate: '1/1/2099',
    FoodContents: "Pete's Garden Printer Test",
  }], { profile: FIXED_PRINT_SETTINGS.profile });
  return buildPrinterJob(
    FIXED_PRINT_SETTINGS.profile,
    normalized.jobs,
    { ...FIXED_PRINT_SETTINGS, ...preferences },
  );
}

export function createBackgroundRouter({
  chromeApi = chrome,
  nativeApi = defaultNativeApi,
} = {}) {
  const storage = chromeApi.storage.local;

  return async function routeMessage(message, sender = {}) {
    if (sender.id !== chromeApi.runtime.id) {
      throw new Error('Rejected message from an untrusted extension sender');
    }
    if (!isRecord(message) || message.channel !== CHANNEL) {
      throw new Error('Invalid message channel');
    }
    if (!SUPPORTED_ACTIONS.has(message.action)) {
      throw new Error(`Unsupported action: ${String(message.action)}`);
    }

    const currentSheetId = extractSheetId(sender.tab?.url);
    if (!currentSheetId) {
      throw new Error('This action requires a current Google Sheet');
    }
    if (message.sheetId !== currentSheetId) {
      throw new Error('Payload Sheet ID does not match the current Google Sheet');
    }

    const approvedSheetIds = await getApprovedSheetIds(storage);
    const authorized = approvedSheetIds.includes(currentSheetId);

    if (message.action === 'get_status') {
      const preferences = await readPreferences(storage);
      let helperReady = false;
      let printerReady = false;
      let printerName = '';
      let setupError = '';
      try {
        await nativeApi.getNativeStatus({ chromeApi });
        helperReady = true;
        printerName = await resolveNativePrinter(storage, nativeApi, chromeApi);
        printerReady = true;
      } catch (error) {
        setupError = error instanceof Error ? error.message : String(error);
      }
      return {
        authorized,
        helperReady,
        printerReady,
        printerName,
        setupError,
        preferences,
      };
    }

    if (message.action === 'authorize_sheet') {
      const next = [...new Set([...approvedSheetIds, currentSheetId])].sort();
      await storage.set({ approvedSheetIds: next });
      return { authorized: true, sheetId: currentSheetId };
    }

    if (!authorized) {
      throw new Error(`Google Sheet ${currentSheetId} is not authorized`);
    }

    if (message.action === 'save_preferences') {
      if (!hasOnlyKeys(message.payload, new Set(['preferences']))) {
        throw new Error('save_preferences accepts only preferences');
      }
      const preferences = validatePreferences(message.payload.preferences);
      await storage.set({ preferences });
      return { saved: true, preferences };
    }

    if (message.action === 'test_connection') {
      await nativeApi.getNativeStatus({ chromeApi });
      const printerName = await resolveNativePrinter(storage, nativeApi, chromeApi);
      return { status: 'ready', printerName };
    }

    let rows;
    if (message.action === 'print_labels') {
      rows = validatePrintPayload(message.payload);
    } else if (message.action !== 'print_test') {
      throw new Error(`Unsupported action: ${String(message.action)}`);
    }

    const preferences = await readPreferences(storage);
    const printerName = await resolveNativePrinter(storage, nativeApi, chromeApi);

    if (message.action === 'print_test') {
      const result = await nativeApi.printNativeJob(
        printerName,
        buildTestRaw(preferences),
        { chromeApi },
      );
      return { ...result, printerName };
    }

    const normalized = validateLabelJobs(rows, {
      profile: FIXED_PRINT_SETTINGS.profile,
    });
    const raw = buildPrinterJob(
      FIXED_PRINT_SETTINGS.profile,
      normalized.jobs,
      { ...FIXED_PRINT_SETTINGS, ...preferences },
    );
    await nativeApi.printNativeJob(printerName, raw, { chromeApi });
    return {
      requestedTotal: normalized.requestedTotal,
      actualTotal: normalized.actualTotal,
      printerName,
    };
  };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  const routeMessage = createBackgroundRouter();
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    routeMessage(message, sender)
      .then(sendResponse)
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    return true;
  });
}
