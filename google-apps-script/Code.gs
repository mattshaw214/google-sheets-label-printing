var PETES_LABEL_VERSION_ = 1;
var PETES_MAX_ROW_LABELS_ = 10000;
var PETES_MAX_JOB_LABELS_ = 100000;
var PETES_MAX_FOOD_LINE_ = 28;
var PETES_MAX_HEADER_ = 30;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Pete's Garden Labels")
    .addItem("Open Label Printer", "showLabelSidebar")
    .addToUi();
}

function showLabelSidebar() {
  showLabelSidebar_(false, "Pete's Garden Labels");
}

function quickPrintLabels() {
  showLabelSidebar_(true, "Printing Pete's Garden Labels");
}

function showLabelSidebar_(quickPrintMode, title) {
  var spreadsheet = SpreadsheetApp.getActive();
  var template = HtmlService.createTemplateFromFile("Sidebar");
  template.sheetId = spreadsheet.getId();
  template.quickPrintMode = Boolean(quickPrintMode);
  var output = template.evaluate().setTitle(title);
  SpreadsheetApp.getUi().showSidebar(output);
}

function buildPrintJob() {
  var spreadsheet = SpreadsheetApp.getActive();
  var values = spreadsheet.getActiveSheet().getDataRange().getValues();
  var columns = requiredColumns_(values);
  var timeZone = spreadsheet.getSpreadsheetTimeZone();
  var rows = [];
  var errors = [];
  var requestedTotal = 0;
  var actualTotal = 0;

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    var sourceRow = rowIndex + 1;
    var row = values[rowIndex];
    var rawQuantity = row[columns.printqty];

    if (rawQuantity === null || rawQuantity === undefined ||
        (typeof rawQuantity === "string" && rawQuantity.trim() === "")) {
      continue;
    }

    var quantity = typeof rawQuantity === "boolean" ? NaN : Number(rawQuantity);
    if (quantity === 0) {
      continue;
    }
    if (!isFinite(quantity) || Math.floor(quantity) !== quantity ||
        quantity < 0 || quantity > PETES_MAX_ROW_LABELS_) {
      errors.push("Row " + sourceRow +
        ": PrintQty must be a whole number from 0 through 10,000.");
      continue;
    }

    try {
      var lotNum = normalizedAscii_(row[columns.lotnum], "LotNum");
      if (!lotNum) {
        throw new Error("LotNum is required.");
      }

      var dateValue = row[columns.usefreezedate];
      if (Object.prototype.toString.call(dateValue) !== "[object Date]" ||
          isNaN(dateValue.getTime())) {
        throw new Error("UseFreezeDate must be a date cell.");
      }
      var dateText = Utilities.formatDate(dateValue, timeZone, "M/d/yyyy");
      if (("#" + lotNum + "  Use By  " + dateText).length > PETES_MAX_HEADER_) {
        throw new Error("the composed label header cannot exceed 30 characters.");
      }

      var foodContents = normalizedAscii_(row[columns.foodcontents], "FoodContents");
      if (!foodContents) {
        throw new Error("FoodContents is required.");
      }
      validateFoodContents_(foodContents);

      var actualQuantity = quantity % 2 === 0 ? quantity : quantity + 1;
      requestedTotal += quantity;
      actualTotal += actualQuantity;
      rows.push({
        sourceRow: sourceRow,
        PrintQty: quantity,
        actualQty: actualQuantity,
        LotNum: lotNum,
        UseFreezeDate: dateText,
        FoodContents: foodContents,
      });
    } catch (error) {
      errors.push("Row " + sourceRow + ": " + error.message);
    }
  }

  if (errors.length) {
    throw new Error("Please fix these sheet rows before printing:\n" + errors.join("\n"));
  }
  if (!rows.length) {
    throw new Error("No labels are selected. Enter a positive whole number in PrintQty.");
  }
  if (actualTotal > PETES_MAX_JOB_LABELS_) {
    throw new Error("Job total cannot exceed 100,000 actual labels.");
  }

  return {
    version: PETES_LABEL_VERSION_,
    sheetId: spreadsheet.getId(),
    rows: rows,
    requestedTotal: requestedTotal,
    actualTotal: actualTotal,
  };
}

function clearPrintQuantities() {
  var sheet = SpreadsheetApp.getActive().getActiveSheet();
  var values = sheet.getDataRange().getValues();
  var columns = requiredColumns_(values);
  var rowCount = Math.max(0, values.length - 1);
  if (rowCount > 0) {
    sheet.getRange(2, columns.printqty + 1, rowCount, 1).clearContent();
  }
  return { clearedRows: rowCount };
}

function requiredColumns_(values) {
  if (!values || !values.length || !values[0].length) {
    throw new Error("The active sheet does not have a header row.");
  }
  var columns = {};
  for (var columnIndex = 0; columnIndex < values[0].length; columnIndex += 1) {
    var key = normalizedHeader_(values[0][columnIndex]);
    if (key && columns[key] === undefined) {
      columns[key] = columnIndex;
    }
  }
  var required = ["lotnum", "printqty", "usefreezedate", "foodcontents"];
  var display = {
    lotnum: "LotNum",
    printqty: "PrintQty",
    usefreezedate: "UseFreezeDate",
    foodcontents: "FoodContents",
  };
  for (var index = 0; index < required.length; index += 1) {
    if (columns[required[index]] === undefined) {
      throw new Error("Missing required header: " + display[required[index]] + ".");
    }
  }
  return columns;
}

function normalizedHeader_(value) {
  return String(value === null || value === undefined ? "" : value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizedAscii_(value, fieldName) {
  var text = String(value === null || value === undefined ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
  for (var index = 0; index < text.length; index += 1) {
    var code = text.charCodeAt(index);
    if (code < 32 || code > 126) {
      throw new Error(fieldName + " must contain printable ASCII characters only.");
    }
  }
  return text;
}

function validateFoodContents_(text) {
  var words = text.split(" ");
  for (var index = 0; index < words.length; index += 1) {
    if (words[index].length > PETES_MAX_FOOD_LINE_) {
      throw new Error("FoodContents contains a word longer than 28 characters.");
    }
  }

  var lines = ["", ""];
  var lineIndex = 0;
  for (var wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    var candidate = lines[lineIndex]
      ? lines[lineIndex] + " " + words[wordIndex]
      : words[wordIndex];
    if (candidate.length <= PETES_MAX_FOOD_LINE_) {
      lines[lineIndex] = candidate;
    } else {
      lineIndex += 1;
      if (lineIndex >= lines.length) {
        throw new Error("FoodContents cannot fit safely on two 28-character lines.");
      }
      lines[lineIndex] = words[wordIndex];
    }
  }
}
