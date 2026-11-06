# Test and release evidence

Status: **MACOS VERIFIED; WINDOWS RUNTIME PENDING**

## Automated coverage

The portable Go suite covers:

- Strict native-messaging framing, JSON, caller origin, and command handling.
- Windows printer normalization and RAW spooler flow.
- Windows per-user installer paths, manifest, registry commands, and cleanup.
- CUPS queue parsing, exact queue validation, raw standard-input preservation,
  and rejection of unknown queue names.
- macOS per-user paths, exact allowed origin, atomic helper/manifest writes,
  executable permissions, reinstall, and idempotent uninstall.

The JavaScript suite covers:

- Fixed 203-dpi ZPL output for Google Sheets.
- Automatic ZD220/ZD230 queue selection and safe ambiguity errors.
- Preference-only storage and migration from legacy settings.
- No network, profile, queue, or raw-command override.
- Native print timeouts without automatic retry.

## Build evidence

`build.sh` produces:

- A Windows PE32+ x86-64 GUI installer.
- A universal macOS Mach-O helper containing x86_64 and arm64.
- The exact stable extension origin in both helpers.
- No CGO or external Go module dependencies.

The release ZIP verifier confirms:

- The Chrome extension ID matches the embedded helper origin.
- The macOS helper and both `.command` files retain executable mode bits.
- The Windows executable begins with the PE `MZ` signature.
- The macOS helper begins with the universal Mach-O signature.
- No private keys, user paths, test folders, or toolchain folders are packaged.

## Physical evidence

Pete's Garden's ZD220/ZD230 was physically printed over USB from macOS using the
same CUPS raw-print route. The final label layout, three-row spillover, offsets,
and Large text size were adjusted from those physical samples.

The packaged macOS helper was installed in its final per-user location and
validated through Chrome's native-messaging framing. It discovered the real
`Petes_Garden_ZD220_USB` queue and printed a two-label test job through CUPS.
CUPS job `Petes_Garden_ZD220_USB-224` completed and the printer returned to idle.

The remaining acceptance check is the same print initiated from the Google
Sheets sidebar in the user's ordinary Chrome profile after replacing the three
Apps Script files and reloading extension version 1.0.4.

## Windows runtime boundary

The Windows code is cross-compiled and portable behavior is tested, but these
items require the charity's real Windows computer:

- Chrome launching the registered native host.
- Winspool queue enumeration and RAW printing to its installed Zebra queue.
- SmartScreen/unsigned-installer flow.
- Add/Remove Programs entry and uninstall cleanup.

