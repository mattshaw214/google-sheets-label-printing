export const CHANNEL = 'PETES_GARDEN_LABELS';

export const BRIDGED_ACTIONS = Object.freeze([
  'get_status',
  'authorize_sheet',
  'save_preferences',
  'test_connection',
  'print_test',
  'print_labels',
]);

const ACTION_SET = new Set(BRIDGED_ACTIONS);
const ROW_FIELDS = new Set([
  'sourceRow',
  'PrintQty',
  'actualQty',
  'LotNum',
  'UseFreezeDate',
  'FoodContents',
]);
const REQUIRED_ROW_FIELDS = ['sourceRow', 'PrintQty', 'LotNum', 'UseFreezeDate', 'FoodContents'];
const PREFERENCE_FIELDS = new Set([
  'textSize',
  'horizontalOffset',
  'verticalOffset',
]);
const TEXT_SIZES = new Set(['large', 'medium', 'compact']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return isRecord(value) && Object.keys(value).every((key) => allowed.has(key));
}

export function extractSheetId(locationHref) {
  try {
    const url = new URL(locationHref);
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') {
      return null;
    }
    const match = /^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isAllowedFrameOrigin(origin) {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin) {
      return false;
    }
    return url.hostname === 'script.google.com'
      || url.hostname === 'script.googleusercontent.com'
      || /^[a-z0-9-]+-script\.googleusercontent\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function isDescendantFrameSource(windowObject, source) {
  if (!source || source === windowObject) return false;
  const pending = [windowObject];
  const visited = new Set(pending);
  while (pending.length) {
    const parent = pending.shift();
    let frames;
    let frameCount;
    try {
      frames = parent.frames;
      frameCount = frames.length;
    } catch {
      continue;
    }
    for (let index = 0; index < frameCount; index += 1) {
      let frame;
      try {
        frame = frames[index];
      } catch {
        continue;
      }
      if (frame === source) return true;
      if (frame && !visited.has(frame)) {
        visited.add(frame);
        pending.push(frame);
      }
    }
  }
  return false;
}

function isValidSheetId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
}

function validatePreferencesShape(preferences) {
  return hasOnlyKeys(preferences, PREFERENCE_FIELDS)
    && TEXT_SIZES.has(preferences.textSize)
    && Number.isInteger(preferences.horizontalOffset)
    && Number.isInteger(preferences.verticalOffset);
}

function validateRowShape(row) {
  return hasOnlyKeys(row, ROW_FIELDS)
    && REQUIRED_ROW_FIELDS.every((field) => Object.hasOwn(row, field));
}

function normalizeAction(data, currentSheetId) {
  if (!isRecord(data) || data.channel !== CHANNEL || !ACTION_SET.has(data.action)) {
    return null;
  }
  if (typeof data.requestId !== 'string' || data.requestId.length < 1 || data.requestId.length > 128) {
    return null;
  }

  const payload = data.payload;
  if (!isRecord(payload) || !isValidSheetId(payload.sheetId) || payload.sheetId !== currentSheetId) {
    return null;
  }

  const base = { channel: CHANNEL, action: data.action, sheetId: currentSheetId };
  const sheetOnlyActions = new Set([
    'get_status',
    'authorize_sheet',
    'test_connection',
    'print_test',
  ]);
  if (sheetOnlyActions.has(data.action)) {
    return Object.keys(payload).length === 1 ? base : null;
  }

  if (data.action === 'save_preferences') {
    if (
      !hasOnlyKeys(payload, new Set(['sheetId', 'preferences']))
      || !validatePreferencesShape(payload.preferences)
    ) {
      return null;
    }
    return { ...base, payload: { preferences: payload.preferences } };
  }

  if (!hasOnlyKeys(payload, new Set(['version', 'sheetId', 'rows', 'requestedTotal', 'actualTotal']))) {
    return null;
  }
  if (
    !Number.isInteger(payload.version)
    || !Array.isArray(payload.rows)
    || !payload.rows.every(validateRowShape)
    || !Number.isInteger(payload.requestedTotal)
    || !Number.isInteger(payload.actualTotal)
  ) {
    return null;
  }
  return {
    ...base,
    payload: {
      version: payload.version,
      rows: payload.rows,
      requestedTotal: payload.requestedTotal,
      actualTotal: payload.actualTotal,
    },
  };
}

export function createBridgeHandler({
  locationHref,
  runtime,
  confirmAuthorization = () => false,
  isFrameSource = () => false,
}) {
  const currentSheetId = extractSheetId(locationHref);
  let boundSource = null;
  let boundOrigin = null;

  return async function handleBridgeMessage(event) {
    if (
      !currentSheetId
      || !isAllowedFrameOrigin(event?.origin)
      || !event?.source
      || !isFrameSource(event.source)
      || typeof event.source.postMessage !== 'function'
    ) {
      return;
    }

    const message = normalizeAction(event.data, currentSheetId);
    if (!message) {
      return;
    }

    const sourceChanged =
      event.source !== boundSource || event.origin !== boundOrigin;
    if (
      boundSource === null
      || (sourceChanged && !isFrameSource(boundSource))
    ) {
      boundSource = event.source;
      boundOrigin = event.origin;
    } else if (sourceChanged) {
      return;
    }

    const reply = {
      channel: CHANNEL,
      requestId: event.data.requestId,
    };
    if (message.action === 'authorize_sheet') {
      try {
        const confirmed = await confirmAuthorization({ sheetId: currentSheetId, origin: event.origin });
        if (!confirmed) {
          reply.ok = false;
          reply.error = 'Sheet authorization was canceled.';
          event.source.postMessage(reply, event.origin);
          return;
        }
      } catch (error) {
        reply.ok = false;
        reply.error = error instanceof Error ? error.message : String(error);
        event.source.postMessage(reply, event.origin);
        return;
      }
    }
    try {
      const response = await runtime.sendMessage(message);
      if (response?.ok === false) {
        throw new Error(response.error || 'Extension request failed');
      }
      reply.ok = true;
      reply.result = response?.ok === true && Object.hasOwn(response, 'result')
        ? response.result
        : response;
    } catch (error) {
      reply.ok = false;
      reply.error = error instanceof Error ? error.message : String(error);
    }
    event.source.postMessage(reply, event.origin);
  };
}

export function installContentBridge({
  windowObject = window,
  runtime = chrome.runtime,
  confirmAuthorization,
  isFrameSource,
} = {}) {
  if (windowObject.top !== windowObject) {
    return false;
  }
  const authorize = confirmAuthorization ?? (({ sheetId }) => windowObject.confirm(
    `Authorize this Google Sheet (${sheetId}) to print labels through Pete's Garden Zebra Labels?`,
  ));
  const childFrameSource = isFrameSource
    ?? ((source) => isDescendantFrameSource(windowObject, source));
  const handler = createBridgeHandler({
    locationHref: windowObject.location.href,
    runtime,
    confirmAuthorization: authorize,
    isFrameSource: childFrameSource,
  });
  windowObject.addEventListener('message', handler);
  return true;
}
