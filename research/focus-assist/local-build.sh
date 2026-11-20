#!/usr/bin/env bash
# Run from WSL using the project's OM-3 development image and toolchain.
set -euo pipefail
repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
work=${OM3_WORK:-/opt/caduceus-om3-dev}
exec docker run --rm -v "$repo:/repo" -v "$work:/opt/caduceus-om3-dev:ro" \
    -w /repo caduceus-om3-dev:zh-cn bash -euc '
    source /opt/caduceus-om3-dev/env.sh
    export PATH="$OM3_WORK/node/bin:$PATH"
    git config --global --add safe.directory /repo
    git config --global --add safe.directory "$OM3_WORK/om-emu"
    dest=$1
    [[ $dest =~ ^out-local/[a-zA-Z0-9_-]+$ ]]
    mkdir -p out-local
    mkdir "$dest"
    python3 firmware/build.py --stock "$OM3_STOCK" --toolchain "$OM3_TOOLCHAIN" --out "$dest/build" > "$dest/build.log" 2>&1
    shift
    python3 tools/test/emu_test.py "$dest/build" --stock "$OM3_STOCK" --out "$dest/tests" "$@" > "$dest/tests.log" 2>&1
    mkdir -p "$dest/card/DCOLYMP" "$dest/card/OM3MOD"
    cp "$dest/build/E1479999.BIN" "$dest/card/DCOLYMP/"
    cp "$dest/build/"{GUIDES,LABELS,TONES}.BIN "$dest/card/OM3MOD/"
    cp research/focus-assist/FOCUS.TXT "$dest/card/OM3MOD/"
    if "$OM3_TOOLCHAIN/binutils/nm-new" "$dest/build/p.elf" | grep -w PH_MODE >/dev/null; then
        cp research/focus-assist/{ZAF,BEEP}.TXT debug-log/DEBUG.TXT "$dest/card/OM3MOD/"
    fi
    (cd "$dest/card" && sha256sum DCOLYMP/* OM3MOD/*) > "$dest/card.sha256"
    ' bash "$@"
