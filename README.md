# Google Sheets Label Printing

This repository contains a label-printing solution for
Google Sheets and Zebra ZD220/ZD230 printers. It provides the ability to complete a
one-click printing from google sheets directly to label printer.

The labels are 2 inches wide by 0.75 inches tall and print two across. Each
label contains the lot number, the fixed words `Use By`, the use/freeze date,
and the food contents. An odd `PrintQty` automatically rounds up to the next
even number so every physical media row is filled.

## How it works

1. Google Apps Script reads and validates rows from the active Google Sheet.
2. The Apps Script sidebar sends only the validated label rows to the Chrome
   extension through the page's content script.
3. The extension creates fixed 203-dpi ZPL and sends it through Chrome Native
   Messaging.
4. The local helper finds the installed ZD220/ZD230 print queue and submits the
   ZPL as a raw print job through Windows Winspool or macOS CUPS.
5. After the helper accepts the print job, Apps Script clears the `PrintQty`
   column.

The extension ID is fixed as `agiabldkomibfhdfpdfmlfikhjcjbibn`. The native
helpers accept messages only from that extension origin.

## Repository contents

- `chrome-extension/` — readable Manifest V3 Chrome extension source.
- `google-apps-script/` — the three files copied into the Sheet's Apps Script
  project.
- `native-helper/` — Go source for the Windows/macOS Native Messaging helper,
  installer, and automated tests.
- `windows-helper/` — ready-to-install Windows helper executable.
- `mac-helper/` — ready-to-install universal macOS helper and install scripts.
- `samples/` — sample ZPL/EPL output.
- `tests/` and `fixtures/` — JavaScript and Apps Script automated tests.
- `SETUP INSTRUCTIONS.md` — complete end-user installation and operating guide.
- `CHECKSUMS.txt` — SHA-256 checksums for the distributed artifacts.

## Installation

Follow [SETUP INSTRUCTIONS.md](SETUP%20INSTRUCTIONS.md). The short version is:

1. Install the Zebra printer driver and connect the printer by USB.
2. Load `chrome-extension/` as an unpacked extension in Chrome.
3. Install the local helper for the computer's operating system.
4. Copy the three files from `google-apps-script/` into the Sheet's Apps Script
   project. No Apps Script deployment is required.
5. Authorize the Sheet once, test the printer, and assign `quickPrintLabels` to
   the Sheet's floating **PRINT LABELS** drawing.

## Why security software may warn

The included Windows installer and macOS helper are custom, unsigned binaries,
and the Chrome extension is loaded unpacked rather than installed from the
Chrome Web Store. Windows SmartScreen, endpoint protection, or an organization's
Chrome policy may therefore block them even though the source is included here.

For a managed rollout, the recommended next steps are:

- have the organization's IT/security firm review this repository and the
  helper's narrowly scoped behavior;
- build the helper from source in a controlled environment;
- code-sign the Windows installer and macOS helper with the organization's
  certificates;
- distribute the Chrome extension through the Chrome Web Store or managed
  enterprise extension policy; and
- verify the supplied artifact hashes before installation.

The helper is per-user, does not require administrator access, does not listen
on a network port, and does not send label data to an external service. Its
Native Messaging protocol accepts `status`, printer enumeration, and raw-print
requests only from the fixed extension origin.

## Development and verification

Requirements:

- Node.js 20 or newer for the JavaScript tests.
- Go 1.23 or newer for the native-helper tests and builds.
- macOS for the combined Windows/macOS release build, because the build uses
  Apple's `lipo` utility to make a universal macOS binary.

Run the JavaScript and Apps Script tests:

```sh
npm test
```

Run the portable native-helper tests:

```sh
cd native-helper
go test ./...
```

Build the native helper artifacts:

```sh
cd native-helper
./build.sh
```

Build output is written beneath `build/`. `extension-id.txt` is intentionally
tracked because the extension and helper must use the same stable identity.

## Verification status

- The final label layout and raw USB printing were physically verified on
   Zebra ZD220/ZD230 from macOS.
- The macOS helper was verified end-to-end through Chrome Native Messaging and
  the real printer queue.
- The portable Go test suite covers Windows Winspool flow and installation
  behavior, but the Windows installer still requires an acceptance smoke test
  on the charity's actual managed Windows computer.

See `native-helper/TEST_EVIDENCE.md` for the detailed boundary.

## Licensing

No open-source license has been assigned. The public repository is provided so
Pete's Garden and its technical consultants can inspect, build, and support the
solution. Confirm ownership and licensing terms before broader redistribution.
