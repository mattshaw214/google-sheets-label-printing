export const NATIVE_HOST = 'org.petesgarden.zebra';
const DEFAULT_NATIVE_TIMEOUT_MS = 15_000;
const INDETERMINATE_PRINT_ERROR = 'Print status is unknown. Do not print again until you check the printer.';

function helperError(message) {
  if (/native messaging host.*not found|specified native messaging host not found/i.test(message)) {
    return new Error(`Pete's Garden local printer helper is not installed. Install host ${NATIVE_HOST} and try again.`);
  }
  return new Error(`Pete's Garden local printer helper failed: ${message}`);
}

function sendNativeCommand(message, {
  chromeApi = chrome,
  timeoutMs = DEFAULT_NATIVE_TIMEOUT_MS,
  timeoutMessage = `Local printer helper request timed out after ${timeoutMs} ms`,
} = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (operation, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      operation(value);
    };
    const timer = setTimeout(() => finish(reject, new Error(timeoutMessage)), timeoutMs);
    try {
      chromeApi.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
        const lastError = chromeApi.runtime.lastError;
        if (lastError) {
          finish(reject, helperError(lastError.message || 'Unknown native messaging error'));
          return;
        }
        if (response === null || typeof response !== 'object' || Array.isArray(response) || response.ok !== true) {
          if (response?.ok === false && typeof response.error === 'string' && response.error) {
            finish(reject, new Error(response.error));
            return;
          }
          finish(reject, new Error("Pete's Garden local printer helper returned an invalid response"));
          return;
        }
        finish(resolve, response);
      });
    } catch (error) {
      finish(reject, helperError(error instanceof Error ? error.message : String(error)));
    }
  });
}

export async function getNativeStatus(options) {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_NATIVE_TIMEOUT_MS;
  await sendNativeCommand(
    { command: 'status' },
    { ...options, timeoutMs, timeoutMessage: `Local printer helper status timed out after ${timeoutMs} ms` },
  );
  return { status: 'ready' };
}

export async function listNativePrinters(options) {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_NATIVE_TIMEOUT_MS;
  const response = await sendNativeCommand(
    { command: 'list_printers' },
    { ...options, timeoutMs, timeoutMessage: `Local printer helper printer list timed out after ${timeoutMs} ms` },
  );
  if (!Array.isArray(response.printers) || response.printers.some((name) => typeof name !== 'string' || !name.trim())) {
    throw new Error("Pete's Garden local printer helper returned an invalid printer list");
  }
  return [...new Set(response.printers.map((name) => name.trim()))]
    .sort((left, right) => left.localeCompare(right));
}

export async function printNativeJob(printerName, raw, options) {
  if (typeof printerName !== 'string' || !printerName.trim()) {
    throw new Error('Printer name is required');
  }
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('A nonempty raw print job is required');
  }
  await sendNativeCommand({
    command: 'print_raw',
    printerName: printerName.trim(),
    raw,
  }, { ...options, timeoutMessage: INDETERMINATE_PRINT_ERROR });
  return { printed: true };
}
