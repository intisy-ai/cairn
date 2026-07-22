#!/usr/bin/env bash
# Launch the Cairn dashboard in dev mode (macOS / Linux).
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
exec npm run dev
