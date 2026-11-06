#!/bin/bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
"$script_dir/org.petesgarden.zebra" --uninstall
printf '\nPress Return to close this window.'
read -r
