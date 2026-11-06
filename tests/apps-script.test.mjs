import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const codePath = new URL("../google-apps-script/Code.gs", import.meta.url);
const sidebarPath = new URL("../google-apps-script/Sidebar.html", import.meta.url);
const manifestPath = new URL("../google-apps-script/appsscript.json", import.meta.url);

function readOrEmpty(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeHarness(values, options = {}) {
  const calls = {
    clears: [],
    dateFormats: [],
    menuItems: [],
    sidebars: [],
  };
  const sheet = {
    getDataRange() {
      return { getValues: () => values };
    },
    getRange(row, column, rowCount, columnCount) {
      return {
        clearContent() {
          calls.clears.push([row, column, rowCount, columnCount]);
          return this;
        },
      };
    },
  };
  const spreadsheet = {
    getActiveSheet: () => sheet,
    getId: () => options.sheetId ?? "sheet-id-123",
    getSpreadsheetTimeZone: () => options.timeZone ?? "America/Chicago",
  };
  const menu = {
    addItem(label, handler) {
      calls.menuItems.push([label, handler]);
      return this;
    },
    addSeparator() {
      return this;
    },
    addToUi() {
      return this;
    },
  };
  const ui = {
    createMenu(label) {
      calls.menuLabel = label;
      return menu;
    },
    showSidebar(output) {
      calls.sidebars.push(output);
    },
  };
  const template = {
    evaluate() {
      return {
        setTitle(title) {
          return {
            title,
            sheetId: template.sheetId,
            quickPrintMode: template.quickPrintMode,
          };
        },
      };
    },
  };
  const context = vm.createContext({
    console,
    Date,
    Error,
    HtmlService: {
      createTemplateFromFile(name) {
        calls.templateName = name;
        return template;
      },
    },
    SpreadsheetApp: {
      getActive: () => spreadsheet,
      getActiveSpreadsheet: () => spreadsheet,
      getUi: () => ui,
    },
    Utilities: {
      formatDate(value, timeZone, pattern) {
        calls.dateFormats.push({ value, timeZone, pattern });
        assert.ok(value instanceof Date, "Utilities.formatDate must receive a Date object");
        return `${value.getMonth() + 1}/${value.getDate()}/${value.getFullYear()}`;
      },
    },
  });
  vm.runInContext(readOrEmpty(codePath), context, { filename: codePath.pathname });
  return { calls, context };
}

function makeSidebarHarness({ quickPrintMode = false } = {}) {
  const html = readOrEmpty(sidebarPath);
  const scriptMatch = /<script>([\s\S]*)<\/script>/.exec(html);
  assert.ok(scriptMatch, "Sidebar script must exist");
  const script = scriptMatch[1]
    .replace("<?!= JSON.stringify(sheetId) ?>", JSON.stringify("test-sheet-id"))
    .replace("<?!= JSON.stringify(quickPrintMode) ?>", JSON.stringify(quickPrintMode));
  const elements = new Map();
  const hostCloses = [];
  const posts = [];
  const intermediateParentPosts = [];
  const timers = [];
  const windowListeners = {};

  function fakeElement(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      const listeners = {};
      elements.set(id, {
        id,
        value: "",
        checked: false,
        disabled: false,
        hidden: false,
        open: false,
        textContent: "",
        customValidity: "",
        validityChecks: 0,
        validityReports: 0,
        listeners,
        classList: {
          toggle(name, force) {
            if (force) classes.add(name);
            else classes.delete(name);
          },
          contains(name) {
            return classes.has(name);
          },
        },
        addEventListener(type, listener) {
          listeners[type] = listener;
        },
        appendChild() {},
        checkValidity() {
          this.validityChecks += 1;
          return !this.customValidity;
        },
        setCustomValidity(message) {
          this.customValidity = message;
        },
        reportValidity() {
          this.validityReports += 1;
          return !this.customValidity;
        },
      });
    }
    return elements.get(id);
  }

  fakeElement("text-size-large").value = "large";
  fakeElement("text-size-large").checked = true;
  fakeElement("text-size-medium").value = "medium";
  fakeElement("text-size-compact").value = "compact";
  fakeElement("horizontal-offset").value = "0";
  fakeElement("vertical-offset").value = "0";
  fakeElement("setup-panel");

  const parent = {
    postMessage(message, targetOrigin) {
      intermediateParentPosts.push({ message, targetOrigin });
    },
  };
  const topWindow = {
    postMessage(message, targetOrigin) {
      posts.push({ message, targetOrigin });
    },
  };
  const window = {
    top: topWindow,
    confirm: () => true,
    setTimeout(callback, delay) {
      const timer = { id: timers.length + 1, callback, delay, cleared: false };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout(id) {
      const timer = timers.find((candidate) => candidate.id === id);
      if (timer) timer.cleared = true;
    },
    addEventListener(type, listener) {
      windowListeners[type] = listener;
    },
  };
  const scriptRun = {
    withSuccessHandler() { return this; },
    withFailureHandler() { return this; },
    buildPrintJob() {},
    clearPrintQuantities() {},
  };
  const context = vm.createContext({
    console,
    document: {
      getElementById: fakeElement,
      createElement: () => fakeElement(`created-${elements.size}`),
      querySelector(selector) {
        if (selector === 'input[name="text-size"]:checked') {
          return [
            fakeElement("text-size-large"),
            fakeElement("text-size-medium"),
            fakeElement("text-size-compact"),
          ].find((candidate) => candidate.checked) || null;
        }
        return null;
      },
      querySelectorAll(selector) {
        if (selector === 'input[name="text-size"]') {
          return [
            fakeElement("text-size-large"),
            fakeElement("text-size-medium"),
            fakeElement("text-size-compact"),
          ];
        }
        return [];
      },
    },
    google: {
      script: {
        host: {
          close() {
            hostCloses.push(true);
          },
        },
        run: scriptRun,
      },
    },
    parent,
    window,
  });
  vm.runInContext(script, context, { filename: sidebarPath.pathname });
  return {
    context,
    elements,
    hostCloses,
    posts,
    intermediateParentPosts,
    parent,
    topWindow,
    timers,
    windowListeners,
  };
}

function expectCombinedError(fn, messages) {
  let error;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, "expected the operation to fail");
  for (const message of messages) {
    assert.match(error.message, message);
  }
}

test("buildPrintJob locates normalized reordered headers and rounds 1, 3, and 4", () => {
  const date = new Date(2026, 6, 21, 12);
  const values = [
    [" food contents ", "PRINT qty", "Use-Freeze Date", "lot num", "Notes"],
    ["skip blank", "", date, "A", ""],
    ["skip zero", 0, date, "B", ""],
    ["hot dogs", 1, date, "101", ""],
    ["Chicken and vegetable casserole", 3, date, "102", ""],
    ["soup", 4, date, "103", ""],
  ];
  const { context } = makeHarness(values);

  assert.deepEqual(plain(context.buildPrintJob()), {
    version: 1,
    sheetId: "sheet-id-123",
    rows: [
      { sourceRow: 4, PrintQty: 1, actualQty: 2, LotNum: "101", UseFreezeDate: "7/21/2026", FoodContents: "hot dogs" },
      { sourceRow: 5, PrintQty: 3, actualQty: 4, LotNum: "102", UseFreezeDate: "7/21/2026", FoodContents: "Chicken and vegetable casserole" },
      { sourceRow: 6, PrintQty: 4, actualQty: 4, LotNum: "103", UseFreezeDate: "7/21/2026", FoodContents: "soup" },
    ],
    requestedTotal: 8,
    actualTotal: 10,
  });
});

test("buildPrintJob formats actual Date cells in the spreadsheet time zone", () => {
  const date = new Date(2026, 0, 5, 12);
  const { calls, context } = makeHarness([
    ["LotNum", "PrintQty", "UseFreezeDate", "FoodContents"],
    ["L1", 2, date, "Food"],
  ], { timeZone: "America/Los_Angeles" });

  const job = context.buildPrintJob();
  assert.equal(job.rows[0].UseFreezeDate, "1/5/2026");
  assert.deepEqual(calls.dateFormats.map(({ value: ignored, ...rest }) => rest), [
    { timeZone: "America/Los_Angeles", pattern: "M/d/yyyy" },
  ]);
});

test("buildPrintJob reports required headers by normalized name", () => {
  const { context } = makeHarness([
    ["LotNum", "PrintQty", "UseFreezeDate", "Description"],
    ["L1", 2, new Date(2026, 0, 5), "Food"],
  ]);
  assert.throws(() => context.buildPrintJob(), /Missing required header: FoodContents/);
});

test("buildPrintJob reports every invalid nonblank PrintQty with its sheet row", () => {
  const date = new Date(2026, 6, 21, 12);
  const { context } = makeHarness([
    ["LotNum", "PrintQty", "UseFreezeDate", "FoodContents"],
    ["A", "many", date, "Food"],
    ["B", 1.5, date, "Food"],
    ["C", -1, date, "Food"],
    ["D", 10001, date, "Food"],
  ]);

  expectCombinedError(() => context.buildPrintJob(), [
    /Row 2: PrintQty must be a whole number from 0 through 10,000/,
    /Row 3: PrintQty must be a whole number from 0 through 10,000/,
    /Row 4: PrintQty must be a whole number from 0 through 10,000/,
    /Row 5: PrintQty must be a whole number from 0 through 10,000/,
  ]);
});

test("buildPrintJob requires actual dates and row-safe ASCII label fields", () => {
  const date = new Date(2026, 6, 21, 12);
  const { context } = makeHarness([
    ["LotNum", "PrintQty", "UseFreezeDate", "FoodContents"],
    ["A", 1, "7/21/2026", "Food"],
    ["", 1, date, "Food"],
    ["C", 1, date, "jalapeño chicken"],
    ["D", 1, date, "x".repeat(29)],
    ["THIS-LOT-NUMBER-IS-TOO-LONG", 1, date, "Food"],
  ]);

  expectCombinedError(() => context.buildPrintJob(), [
    /Row 2: UseFreezeDate must be a date cell/,
    /Row 3: LotNum is required/,
    /Row 4: FoodContents must contain printable ASCII characters only/,
    /Row 5: FoodContents contains a word longer than 28 characters/,
    /Row 6: the composed label header cannot exceed 30 characters/,
  ]);
});

test("buildPrintJob normalizes whitespace and validates two 28-character food lines", () => {
  const date = new Date(2026, 6, 21, 12);
  const { context } = makeHarness([
    ["LotNum", "PrintQty", "UseFreezeDate", "FoodContents"],
    ["  LOT   7 ", 2, date, "  cheesy pasta\n w/ herbs   and mushrooms  "],
  ]);
  const job = context.buildPrintJob();
  assert.equal(job.rows[0].LotNum, "LOT 7");
  assert.equal(job.rows[0].FoodContents, "cheesy pasta w/ herbs and mushrooms");
});

test("buildPrintJob allows 100,000 actual labels and rejects a larger job", () => {
  const date = new Date(2026, 6, 21, 12);
  const header = ["LotNum", "PrintQty", "UseFreezeDate", "FoodContents"];
  const rows = Array.from({ length: 10 }, (_, index) => [`L${index}`, 10000, date, "Food"]);
  assert.equal(makeHarness([header, ...rows]).context.buildPrintJob().actualTotal, 100000);
  expectCombinedError(
    () => makeHarness([header, ...rows, ["extra", 1, date, "Food"]]).context.buildPrintJob(),
    [/Job total cannot exceed 100,000 actual labels/],
  );
});

test("buildPrintJob skips blank and zero quantities and rejects an empty selection", () => {
  const date = new Date(2026, 6, 21, 12);
  const { context } = makeHarness([
    ["LotNum", "PrintQty", "UseFreezeDate", "FoodContents"],
    ["A", "", date, "Food"],
    ["B", 0, date, "Food"],
  ]);
  assert.throws(() => context.buildPrintJob(), /No labels are selected/);
});

test("clearPrintQuantities clears exactly the PrintQty data cells", () => {
  const { calls, context } = makeHarness([
    ["FoodContents", "LotNum", "Notes", "PrintQty", "UseFreezeDate"],
    ["A", 1, "keep", 2, new Date(2026, 6, 21)],
    ["B", 2, "keep", "", new Date(2026, 6, 22)],
    ["C", 3, "keep", 0, new Date(2026, 6, 23)],
  ]);
  assert.deepEqual(plain(context.clearPrintQuantities()), { clearedRows: 3 });
  assert.deepEqual(calls.clears, [[2, 4, 3, 1]]);
});

test("normal and quick sidebar entry points provide the Pete's Garden menu and exact sheet id", () => {
  const { calls, context } = makeHarness([["LotNum"]], { sheetId: "exact-sheet-id" });
  context.onOpen();
  context.showLabelSidebar();
  context.quickPrintLabels();
  assert.equal(calls.menuLabel, "Pete's Garden Labels");
  assert.deepEqual(calls.menuItems, [["Open Label Printer", "showLabelSidebar"]]);
  assert.equal(calls.templateName, "Sidebar");
  assert.deepEqual(calls.sidebars, [
    {
      title: "Pete's Garden Labels",
      sheetId: "exact-sheet-id",
      quickPrintMode: false,
    },
    {
      title: "Printing Pete's Garden Labels",
      sheetId: "exact-sheet-id",
      quickPrintMode: true,
    },
  ]);
});

test("Apps Script manifest uses only minimal current-sheet and container UI scopes", () => {
  const manifest = JSON.parse(readOrEmpty(manifestPath) || "{}");
  assert.deepEqual(manifest.oauthScopes, [
    "https://www.googleapis.com/auth/spreadsheets.currentonly",
    "https://www.googleapis.com/auth/script.container.ui",
  ]);
});

test("Sidebar puts printing first, removes manual clearing, and keeps setup collapsed", () => {
  const html = readOrEmpty(sidebarPath);
  for (const required of [
    "status", "print-labels", "setup-panel",
    "authorization-row", "authorize-sheet", "detected-printer", "text-size",
    "text-size-large", "text-size-medium", "text-size-compact",
    "horizontal-offset", "vertical-offset", "test-connection", "print-test",
  ]) {
    assert.match(html, new RegExp(`id=["']${required}["']`), required);
  }
  assert.ok(html.indexOf('id="print-labels"') < html.indexOf('id="setup-panel"'));
  assert.doesNotMatch(html, /id=["']clear-print-quantities["']/);
  assert.match(html, /<details id="setup-panel">/);
  assert.doesNotMatch(html, /<details id="setup-panel"[^>]*\sopen(?:\s|>|=)/);
  assert.match(
    html,
    /const QUICK_PRINT_MODE\s*=\s*<\?!= JSON\.stringify\(quickPrintMode\) \?>/,
  );
  assert.match(html, /if\s*\(QUICK_PRINT_MODE\)[\s\S]*runQuickPrint\(\)/);
  assert.doesNotMatch(html, /setup-panel"\)\.open\s*=\s*true/);

  for (const forbidden of [
    "connection-network", "connection-windows", "printer-ip", "printer-queue",
    "refresh-printers", "save-settings", 'id="profile"', "gap-dots",
    "window.confirm",
  ]) {
    assert.equal(html.includes(forbidden), false, forbidden);
  }
  for (const action of [
    "get_status", "authorize_sheet", "save_preferences", "test_connection",
    "print_test", "print_labels",
  ]) {
    assert.match(html, new RegExp(`["']${action}["']`), action);
  }
  assert.match(html, /aria-live=["']polite["']/);
  assert.match(html, /google\.script\.run/);
  assert.match(html, /window\.top\.postMessage/);
  assert.doesNotMatch(html, /parent\.postMessage/);
  assert.match(html, /https:\/\/docs\.google\.com/);
  assert.match(html, /channel:\s*CHANNEL/);
  assert.match(html, /sheetId:\s*SHEET_ID/);
  assert.match(html, /event\.origin\s*!==\s*SHEETS_ORIGIN/);
  assert.match(html, /result\.authorized/);
  assert.match(html, /result\.printerReady/);
  assert.match(html, /\.prominent[\s\S]*min-height:\s*48px/);
  assert.doesNotMatch(html, /const summary\s*=/);
  assert.match(html, /serverCall\("clearPrintQuantities"\)/);
  assert.doesNotMatch(html, /name=["'](?:raw|command|zpl|epl)["']/i);
});

test("Sidebar clears PrintQty after confirmed printing and closes only in quick mode", async () => {
  const regular = makeSidebarHarness();
  const regularCalls = [];
  regular.context.serverCall = async (name) => {
    regularCalls.push(name);
    if (name === "buildPrintJob") return { actualTotal: 4, rows: [{}] };
    if (name === "clearPrintQuantities") return { clearedRows: 11 };
    throw new Error(`Unexpected server call: ${name}`);
  };
  regular.context.extensionRequest = async (action) => {
    regularCalls.push(action);
    return { actualTotal: 4 };
  };

  assert.deepEqual(plain(await regular.context.printAndClear(false)), {
    printed: true,
    cleared: true,
  });
  assert.deepEqual(regularCalls, [
    "buildPrintJob",
    "print_labels",
    "clearPrintQuantities",
  ]);
  assert.match(
    regular.elements.get("status").textContent,
    /4 labels were sent and PrintQty was cleared/,
  );
  assert.equal(regular.hostCloses.length, 0);

  const quick = makeSidebarHarness();
  quick.context.serverCall = regular.context.serverCall;
  quick.context.extensionRequest = regular.context.extensionRequest;
  await quick.context.printAndClear(true);
  quick.timers.at(-1).callback();
  assert.equal(quick.hostCloses.length, 1);
});

test("Sidebar never clears after a print failure or indeterminate timeout", async () => {
  const harness = makeSidebarHarness();
  const calls = [];
  harness.context.serverCall = async (name) => {
    calls.push(name);
    return { actualTotal: 2, rows: [{}] };
  };
  harness.context.extensionRequest = async () => {
    throw new Error("Printer unavailable");
  };

  await assert.rejects(
    harness.context.printAndClear(false),
    /Printer unavailable/,
  );
  assert.deepEqual(calls, ["buildPrintJob"]);
  assert.equal(harness.hostCloses.length, 0);
});

test("Sidebar reports when labels print but PrintQty clearing fails", async () => {
  const harness = makeSidebarHarness();
  const calls = [];
  harness.context.serverCall = async (name) => {
    calls.push(name);
    if (name === "buildPrintJob") return { actualTotal: 6, rows: [{}] };
    throw new Error("Sheet is temporarily unavailable");
  };
  harness.context.extensionRequest = async () => {
    calls.push("print_labels");
    return { actualTotal: 6 };
  };

  assert.deepEqual(plain(await harness.context.printAndClear(true)), {
    printed: true,
    cleared: false,
  });
  assert.deepEqual(calls, [
    "buildPrintJob",
    "print_labels",
    "clearPrintQuantities",
  ]);
  assert.match(
    harness.elements.get("status").textContent,
    /6 labels were sent, but PrintQty could not be cleared/,
  );
  assert.equal(harness.elements.get("status").classList.contains("error"), true);
  assert.equal(harness.hostCloses.length, 0);
});

test("Sidebar sends requests to and accepts replies from only the top Sheet window", async () => {
  const {
    context,
    posts,
    intermediateParentPosts,
    parent,
    topWindow,
    windowListeners,
  } = makeSidebarHarness();
  assert.equal(posts.length, 1);
  assert.equal(intermediateParentPosts.length, 0);

  let settled = false;
  const request = context.extensionRequest("test_connection").then((result) => {
    settled = true;
    return result;
  });
  assert.equal(posts.length, 2);
  assert.equal(intermediateParentPosts.length, 0);
  const requestId = posts.at(-1).message.requestId;
  const reply = {
    channel: "PETES_GARDEN_LABELS",
    requestId,
    ok: true,
    result: { reachable: true },
  };

  windowListeners.message({
    origin: "https://docs.google.com",
    source: parent,
    data: reply,
  });
  await Promise.resolve();
  assert.equal(settled, false);

  windowListeners.message({
    origin: "https://docs.google.com",
    source: topWindow,
    data: reply,
  });
  assert.deepEqual(plain(await request), { reachable: true });
  assert.equal(settled, true);
});

test("Sidebar gives print_labels 120 seconds and locks printing after an unknown timeout", async () => {
  const { context, elements, timers } = makeSidebarHarness();
  const printButton = elements.get("print-labels");
  const request = context.withButton(printButton, () => context.extensionRequest("print_labels", { rows: [] }));
  const printTimer = timers.at(-1);
  assert.equal(printTimer.delay, 120_000);
  printTimer.callback();
  await request;
  assert.equal(printButton.disabled, true);
  assert.equal(
    elements.get("status").textContent,
    "Print status is unknown. Do not print again until you check the printer.",
  );

  context.extensionRequest("test_connection");
  assert.equal(timers.at(-1).delay, 15_000);
});

test("Sidebar locks Print Labels when the extension returns the indeterminate warning early", async () => {
  const { context, elements, posts, topWindow, windowListeners } = makeSidebarHarness();
  const printButton = elements.get("print-labels");
  const request = context.withButton(printButton, () => context.extensionRequest("print_labels", { rows: [] }));
  const requestId = posts.at(-1).message.requestId;

  windowListeners.message({
    origin: "https://docs.google.com",
    source: topWindow,
    data: {
      channel: "PETES_GARDEN_LABELS",
      requestId,
      ok: false,
      error: "Print status is unknown. Do not print again until you check the printer.",
    },
  });
  await request;

  assert.equal(printButton.disabled, true);
  assert.equal(
    elements.get("status").textContent,
    "Print status is unknown. Do not print again until you check the printer.",
  );
});

test("Sidebar parses preferences as strict bounded integers including inclusive limits", () => {
  const { context, elements } = makeSidebarHarness();
  elements.get("horizontal-offset").value = "-100";
  elements.get("vertical-offset").value = "100";
  elements.get("text-size-large").checked = false;
  elements.get("text-size-medium").checked = true;
  let preferences = plain(context.currentPreferences());
  assert.equal(preferences.horizontalOffset, -100);
  assert.equal(preferences.verticalOffset, 100);
  assert.equal(preferences.textSize, "medium");

  elements.get("horizontal-offset").value = "100";
  elements.get("vertical-offset").value = "-100";
  preferences = plain(context.currentPreferences());
  assert.equal(preferences.horizontalOffset, 100);
  assert.equal(preferences.verticalOffset, -100);
  assert.ok(elements.get("horizontal-offset").validityChecks > 0);
  assert.ok(elements.get("vertical-offset").validityChecks > 0);
});

test("Sidebar hides one-time authorization and displays the detected printer and saved preset", () => {
  const { context, elements } = makeSidebarHarness();
  context.applyStatus({
    authorized: true,
    helperReady: true,
    printerReady: true,
    printerName: "Petes_Garden_ZD220_USB",
    setupError: "",
    preferences: {
      textSize: "compact",
      horizontalOffset: 4,
      verticalOffset: -2,
    },
  });
  assert.equal(elements.get("authorization-row").hidden, true);
  assert.equal(elements.get("detected-printer").textContent, "Petes_Garden_ZD220_USB");
  assert.equal(elements.get("text-size-compact").checked, true);
  assert.equal(elements.get("horizontal-offset").value, "4");
  assert.equal(elements.get("vertical-offset").value, "-2");
  assert.equal(elements.get("setup-panel").open, false);
});

test("Sidebar keeps setup collapsed when authorization or the local printer needs attention", () => {
  const { context, elements } = makeSidebarHarness();
  context.applyStatus({
    authorized: false,
    helperReady: false,
    printerReady: false,
    printerName: "",
    setupError: "The local printer helper is not installed.",
    preferences: {
      textSize: "large",
      horizontalOffset: 0,
      verticalOffset: 0,
    },
  });
  assert.equal(elements.get("authorization-row").hidden, false);
  assert.equal(elements.get("setup-panel").open, false);
  assert.match(elements.get("status").textContent, /not installed/);
  assert.equal(elements.get("status").classList.contains("error"), true);
});

test("Sidebar visibly rejects fractional, string, and out-of-range preferences", () => {
  const cases = [
    ["horizontal-offset", "1.5", /Horizontal offset must be a whole number from -100 through 100/],
    ["vertical-offset", "not-a-number", /Vertical offset must be a whole number from -100 through 100/],
    ["horizontal-offset", "-101", /Horizontal offset must be a whole number from -100 through 100/],
    ["vertical-offset", "101", /Vertical offset must be a whole number from -100 through 100/],
  ];

  for (const [id, value, expected] of cases) {
    const { context, elements } = makeSidebarHarness();
    elements.get(id).value = value;
    assert.throws(() => context.currentPreferences(), expected, `${id}=${value}`);
    assert.ok(elements.get(id).validityReports > 0);
  }
});
