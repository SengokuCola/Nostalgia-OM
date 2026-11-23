#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo"
version=${1:?usage: bash tools/release-build.sh vX.Y.Z OUTPUT_DIR}
output=${2:?missing output directory}
if [[ ! $version =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ || ${#version} -gt 10 ]]; then
    echo "Use vMAJOR.MINOR.PATCH (e.g. v0.1.0), with at most nine characters after v: $version" >&2
    exit 2
fi

work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
stock=${OM3_STOCK:-"$work/stock.bin"}
if [[ -z ${OM3_STOCK:-} ]]; then
    python3 -B - "$stock" <<'PY'
import json
import sys
from pathlib import Path

sys.path.insert(0, 'firmware')
from patch import fetch_stock, sha

reference = json.loads(Path('releases/v0.40.2/patch.json').read_text())
raw = fetch_stock(reference['stock_size'])
if sha(raw) != reference['stock_sha256']:
    raise SystemExit('OM download does not match firmware 1.1')
Path(sys.argv[1]).write_bytes(raw)
PY
fi

build="$work/build"
name="nostalgia-$version"
bundle="$work/$name"
release="$bundle/releases/$version"
mkdir -p "$release" "$bundle/firmware"
python3 firmware/build.py --stock "$stock" --toolchain "${OM3_TOOLCHAIN:?set OM3_TOOLCHAIN to the binutils build directory}" \
    --out "$build" --version "$version" --without-sunlit
python3 tools/mkpatch.py --stock "$stock" --build "$build" --version "$version" \
    --name "Nostalgia 怀旧" --description "Firmware patch for OM SYSTEM OM-3 firmware 1.1" --out "$release/patch.json"

cp -p LICENSE NOTICE README.md 'Make SD card files (Mac).command' 'Make SD card files (Windows).bat' "$bundle/"
cp firmware/{patch,frames}.py "$bundle/firmware/"
cp "$build/"{GUIDES,LABELS,TONES}.BIN "$release/"
cp releases/v0.40.2/{LOOKS.BIN,CURVES.BIN,DEBUG.TXT} "$release/"

# Test through the same launcher entry point and compare against the developer build.
reconstructed="$work/reconstructed"
python3 -B "$bundle/firmware/patch.py" --release "$version" --stock "$stock" --out "$reconstructed"
cmp "$build/E1479999.BIN" "$reconstructed/DCOLYMP/E1479999.BIN"
for card_file in GUIDES.BIN LABELS.BIN TONES.BIN; do
    cmp "$build/$card_file" "$reconstructed/OM3MOD/$card_file"
done

mkdir -p "$output"
output=$(cd "$output" && pwd)
archive="$name.zip"
(cd "$work" && python3 -m zipfile -c "$archive" "$name")
(cd "$work" && sha256sum "$archive" > SHA256SUMS)
cp "$work/$archive" "$work/SHA256SUMS" "$output/"
