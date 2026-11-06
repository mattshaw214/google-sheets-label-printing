# Pete's Garden Zebra Helper

This directory builds the native-messaging host `org.petesgarden.zebra` for:

- Windows x86-64, using the Windows print spooler.
- macOS Intel and Apple silicon, using CUPS `lpstat` and `lp -o raw`.

The same Chrome extension and native-messaging protocol are used on both
platforms. The helper supports `status`, `list_printers`, and `print_raw`.

## Release build

Place the stable 32-character Chrome extension ID in
`../extension-id.txt` (already included in this repository), install Go, then
run on macOS:

```sh
./build.sh
```

The script builds:

```text
../build/Petes Garden Zebra Helper Setup.exe
../build/Petes Garden Zebra Helper macOS/org.petesgarden.zebra
../build/Petes Garden Zebra Helper macOS/Install Pete's Garden Zebra Helper.command
../build/Petes Garden Zebra Helper macOS/Uninstall Pete's Garden Zebra Helper.command
```

The macOS binary is a universal Mach-O containing x86_64 and arm64.

Set `GO_BIN=/path/to/go` to use a specific Go installation. The script builds
both the Windows and macOS artifacts, so the complete release build must run on
macOS because it uses Apple's `lipo` utility for the universal macOS binary.

## Windows installation

The unsigned installer writes only beneath:

```text
%LOCALAPPDATA%\Pete's Garden\Zebra Helper
```

Registration uses HKCU for Chrome native messaging and Add/Remove Programs.
Administrator access is not required.

## macOS installation

The `.command` installer copies the universal helper to:

```text
~/Library/Application Support/Pete's Garden/Zebra Helper/org.petesgarden.zebra
```

It writes the Chrome manifest to:

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/org.petesgarden.zebra.json
```

Both locations are per-user. The uninstaller removes only those Pete's Garden
files and its empty helper directory.

The macOS backend discovers queues with `/usr/bin/lpstat -p`. Before printing,
it requires an exact queue name returned by CUPS, then supplies raw ZPL bytes to
`/usr/bin/lp -d <queue> -o raw` over standard input. It never invokes a shell.

## Protocol and safety

Messages use a four-byte little-endian length followed by strict UTF-8 JSON.
Requests are limited to 64 MiB and responses to 1 MiB. RAW payloads are limited
to 16 MiB and ASCII. The helper authorizes only the exact extension origin
compiled into the release. Standard output is reserved for native-messaging
frames; diagnostics go to standard error.

## Remaining platform checkpoint

The macOS helper can be built and exercised locally. The Windows installer,
Chrome launch, queue discovery, RAW spool write, and uninstall behavior still
require a short smoke test on Pete's Garden's Windows computer.
