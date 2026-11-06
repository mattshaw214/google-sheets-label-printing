#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$script_dir"
build_dir="$script_dir/../build"
extension_id_file="${EXTENSION_ID_FILE:-$script_dir/../extension-id.txt}"

if [[ -n "${GO_BIN:-}" ]]; then
  go_bin="$GO_BIN"
elif command -v go >/dev/null 2>&1; then
  go_bin="$(command -v go)"
elif [[ -x "$script_dir/.toolchains/go/bin/go" ]]; then
  go_bin="$script_dir/.toolchains/go/bin/go"
else
  echo "Go was not found. Install Go or set GO_BIN to the Go executable." >&2
  exit 1
fi

if [[ ! -f "$extension_id_file" ]]; then
  echo "Missing stable Chrome extension ID: $extension_id_file" >&2
  exit 1
fi

extension_id="$(<"$extension_id_file")"
extension_id="${extension_id%$'\r'}"
if [[ ! "$extension_id" =~ ^[a-p]{32}$ ]]; then
  echo "Invalid Chrome extension ID in $extension_id_file (expected exactly 32 letters a-p)" >&2
  exit 1
fi
if [[ ! -x "$go_bin" ]]; then
  echo "Go executable is not runnable: $go_bin" >&2
  exit 1
fi

origin="chrome-extension://$extension_id/"
staging_dir="$script_dir/work/release"
payload_dir="$script_dir/cmd/installer/payload"
helper_exe="$staging_dir/org.petesgarden.zebra.exe"
setup_staging="$staging_dir/Petes Garden Zebra Helper Setup.exe"
setup_output="$build_dir/Petes Garden Zebra Helper Setup.exe"
mac_staging="$script_dir/work/release-macos"
mac_output="$build_dir/Petes Garden Zebra Helper macOS"
mac_host="$mac_output/org.petesgarden.zebra"

mkdir -p \
  "$staging_dir" \
  "$payload_dir" \
  "$build_dir" \
  "$mac_staging" \
  "$mac_output" \
  "$script_dir/.cache/go-build" \
  "$script_dir/.cache/go-mod"

export CGO_ENABLED=0
export GOCACHE="$script_dir/.cache/go-build"
export GOMODCACHE="$script_dir/.cache/go-mod"

GOOS=windows GOARCH=amd64 "$go_bin" build \
  -trimpath \
  -buildvcs=false \
  -ldflags="-s -w -buildid= -X=main.allowedOrigin=$origin" \
  -o "$helper_exe" \
  "$script_dir/cmd/native-host"

cp -- "$helper_exe" "$payload_dir/org.petesgarden.zebra.exe"

GOOS=windows GOARCH=amd64 "$go_bin" build \
  -trimpath \
  -buildvcs=false \
  -ldflags="-s -w -buildid= -H=windowsgui -X=main.extensionID=$extension_id" \
  -o "$setup_staging" \
  "$script_dir/cmd/installer"

cp -- "$setup_staging" "$setup_output"

for architecture in arm64 amd64; do
  GOOS=darwin GOARCH="$architecture" "$go_bin" build \
    -trimpath \
    -buildvcs=false \
    -ldflags="-s -w -buildid= -X=main.allowedOrigin=$origin -X=main.extensionID=$extension_id" \
    -o "$mac_staging/org.petesgarden.zebra-$architecture" \
    "$script_dir/cmd/native-host"
done

/usr/bin/lipo -create \
  "$mac_staging/org.petesgarden.zebra-arm64" \
  "$mac_staging/org.petesgarden.zebra-amd64" \
  -output "$mac_host"

cp -- \
  "$script_dir/macos/Install Pete's Garden Zebra Helper.command" \
  "$script_dir/macos/Uninstall Pete's Garden Zebra Helper.command" \
  "$mac_output/"
chmod 755 \
  "$mac_host" \
  "$mac_output/Install Pete's Garden Zebra Helper.command" \
  "$mac_output/Uninstall Pete's Garden Zebra Helper.command"

lipo_info="$(/usr/bin/lipo -info "$mac_host")"
if [[ "$lipo_info" != *"arm64"* || "$lipo_info" != *"x86_64"* ]]; then
  echo "Universal macOS helper is missing an architecture: $lipo_info" >&2
  exit 1
fi

echo "Built native host: $helper_exe"
echo "Built installer: $setup_output"
echo "Built macOS helper: $mac_host"
echo "$lipo_info"
