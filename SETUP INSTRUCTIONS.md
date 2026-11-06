# Pete's Garden Google Sheets Zebra Label Printing

This package prints two identical 2-inch × 0.75-inch labels across each media
row on a Zebra ZD220 or ZD230. Google Sheets printing is fixed to 203-dpi ZPL
and uses a small local helper on Windows or macOS. The extension automatically
detects the connected ZD220/ZD230 printer queue, so there is no connection,
profile, queue, or IP choice in the sidebar.

The Google Sheet is here: [Pete's Garden Google Sheets Label Printing](https://docs.google.com/spreadsheets/d/1cM452BrDfjIxqqfmLnjD9rb_J61HfWQNhcXqqUUlep0/edit)

## Package contents

- `chrome-extension` — load this complete folder in Chrome.
- `google-apps-script` — `Code.gs`, `Sidebar.html`, and `appsscript.json`.
- `windows-helper/Petes Garden Zebra Helper Setup.exe` — Windows USB helper.
- `mac-helper` — macOS USB helper, installer, and uninstaller.
- `spreadsheet` — an Excel copy ready to import into Google Sheets.
- `samples` — technical printer-language samples.

The extension ID is `agiabldkomibfhdfpdfmlfikhjcjbibn`. Both helpers accept
messages only from that extension.

## 1. Load the Chrome extension

Do this once on every computer that will print labels.

1. Unzip `Petes Garden Google Sheets Zebra Printing.zip` into a permanent
   folder.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Choose **Load unpacked**.
5. Select the package's `chrome-extension` folder.
6. Confirm that **Pete's Garden Zebra Labels** is enabled, shows version 1.0.4,
   and has ID `agiabldkomibfhdfpdfmlfikhjcjbibn`.

Do not move or delete the unzipped folder while Chrome is using it.

## 2. Install the local USB helper

Install the helper for the computer's operating system. Administrator access is
not required.

### Windows

The Windows installer is unsigned, so Windows may show **Unknown publisher** or
Microsoft Defender SmartScreen. Continue only when the installer came from this
package and its SHA-256 matches `CHECKSUMS.txt`.

1. Install the normal Zebra driver and confirm the ZD220/ZD230 appears in
   **Settings > Bluetooth & devices > Printers & scanners**.
2. Quit Chrome completely.
3. Run `windows-helper/Petes Garden Zebra Helper Setup.exe`.
4. If SmartScreen appears, choose **More info**, then **Run anyway**.
5. When installation completes, reopen Chrome.

The helper automatically detects the installed ZD220/ZD230 queue. To remove it,
use **Windows Settings > Apps > Installed apps > Pete's Garden Zebra Helper >
Uninstall**.

### macOS

1. Add the ZD220/ZD230 in **System Settings > Printers & Scanners** and confirm
   that macOS can see it.
2. Quit Chrome completely.
3. Open the package's `mac-helper` folder.
4. Right-click `Install Pete's Garden Zebra Helper.command`, choose **Open**,
   then choose **Open** again if macOS asks.
5. Wait for **Installation complete**, press Return, and quit Terminal.
6. Quit and reopen Chrome before printing.

To remove the helper later, right-click
`Uninstall Pete's Garden Zebra Helper.command`, choose **Open**, and follow the
same prompts.

## 3. Add the Apps Script files

Do this for each separate copy of the Sheet.

1. Open the Sheet and choose **Extensions > Apps Script**.
2. Replace all contents of `Code.gs` with the packaged
   `google-apps-script/Code.gs`.
3. Add or open the HTML file named `Sidebar`, then replace all contents with
   `google-apps-script/Sidebar.html`.
4. In **Project Settings**, enable **Show "appsscript.json" manifest file in
   editor**.
5. Open `appsscript.json` and replace all contents with the packaged
   `google-apps-script/appsscript.json`.
6. Save the project, return to the Sheet, and refresh the browser page.

No Apps Script deployment is required.

Choose **Pete's Garden Labels > Open Label Printer**. Google may request access
to the current spreadsheet the first time the script runs.

## 4. Authorize and test once

1. In the sidebar, open **Setup & troubleshooting**.
2. Choose **Authorize This Sheet** and approve the one intentional security
   confirmation. This button disappears after authorization.
3. Confirm that the detected printer is the expected ZD220/ZD230.
4. Keep **Text size** at **Large** for the easiest reading.
5. Choose **Test Printer**.
6. Choose **Print Test Pair** and inspect the two labels.

The helper and printer are detected automatically. This release has no network
or IP setup and no printer/profile dropdown.

## 5. Add the one-click Print Labels button

Do this once in the desktop-browser version of Google Sheets:

1. Open the label data tab and choose **Insert > Drawing**.
2. Add a green rectangle containing the words **PRINT LABELS**, then save and
   place it wherever it is convenient over the sheet.
3. Select the drawing, open its three-dot menu, and choose **Assign script**.
4. Enter `quickPrintLabels` exactly, without parentheses, and choose **OK**.

The drawing starts printing with one click. A temporary printing panel opens,
sends the job, clears `PrintQty` after confirmed success, and closes itself.
Use the regular **Pete's Garden Labels > Open Label Printer** sidebar only for
authorization, testing, text size, and alignment.

## Daily printing

1. Enter a positive whole number in `PrintQty` for each row to print.
2. Confirm each selected row has `LotNum`, a real `UseFreezeDate`, and
   `FoodContents` that fits on no more than two FoodContents lines.
3. Click the floating **PRINT LABELS** drawing once.
4. Check the physical labels.

Quantities silently round up to a full pair: 1 prints 2, 2 prints 2, 3 prints 4,
and 4 prints 4. Printing does not ask for confirmation. The one-click flow
clears PrintQty only after the printer confirms the job was accepted. PrintQty
remains unchanged after a failure or timeout.

Each label shows `#LotNum`, the fixed words `Use By`, `UseFreezeDate`, and
`FoodContents`. The layout can use one header row plus up to two FoodContents
lines.

## Text size and alignment

Open **Setup & troubleshooting** only when adjustment is needed.

- **Text size:** Large is recommended; Medium and Compact remain available.
- **Horizontal offset:** moves both labels left or right from `-100` to `100`.
- **Vertical offset:** moves the text up or down from `-100` to `100`.
- Changes save automatically; there is no Save button.
- Use **Print Test Pair** after changing alignment.

## Upgrading an existing installation

1. Replace the old unpacked `chrome-extension` folder with the new one.
2. At `chrome://extensions`, choose **Reload** and confirm version 1.0.4. The
   extension ID must remain `agiabldkomibfhdfpdfmlfikhjcjbibn`.
3. Install the new Windows or macOS helper.
4. Replace all three Apps Script files as described above; do not deploy.
5. Refresh the Sheet and reopen the sidebar.
6. If the floating drawing is not already present, add it and assign
   `quickPrintLabels` as described above.

Existing Sheet authorization is retained. The authorization control appears
only if that Sheet or Chrome profile still needs approval.

## Troubleshooting

### The extension did not respond

At `chrome://extensions`, confirm the extension is present and enabled. If its
folder moved, remove the stale entry and use **Load unpacked** again. Refresh
the Sheet after reloading.

### The local printer helper is not installed

Quit Chrome, run the correct helper installer again, then reopen Chrome. On
macOS, use right-click **Open** for the `.command` installer. On Windows,
confirm the unsigned installer was allowed to finish.

### No compatible printer was found

Confirm the ZD220/ZD230 is on and connected by USB, and that its queue exists in
Windows Printers & scanners or macOS Printers & Scanners. Remove unused
duplicate Zebra queues if the sidebar reports more than one compatible queue.

### The print result is unknown

Do not click Print Labels again until the printer has been checked. The first
job may still finish, so retrying could create duplicate labels.

### A sheet row will not print

Fix the row named in the error. `PrintQty` must be a whole number from 1 through
10,000. `UseFreezeDate` must be a real date cell. `LotNum` and `FoodContents`
must use ordinary printable characters and fit the label.

## Excel fallback

The separate Excel package remains available for a Windows-only fallback. Its
macro and instructions are included in
`Petes Garden Excel Zebra Label Printing.zip`.
