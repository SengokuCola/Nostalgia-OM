#!/usr/bin/env bash
# Moves the om-emu pin to upstream's newest commit, with a suite run at both commits.
#
#   tools/emulator/bump_om_emu.sh
#
# Needs a workspace (research/setup.sh). Builds this checkout, runs tools/test/emu_test.py with the pinned om-emu and
# with upstream's newest, prints the result lines that differ, and writes the new pin to tools/emulator/om-emu.pin.
# Exit 0 when no result line changed, 1 when one did (the new pin is written, so the tests can be fixed against it),
# 2 on an error. To keep the old pin instead: git checkout tools/emulator/om-emu.pin, then research/setup.sh.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)
ENV=${OM3_WORK:-$HOME/om3-work}/env.sh
[ -f "$ENV" ] || { echo "no workspace: run research/setup.sh first"; exit 2; }
. "$ENV"
EMU=$OM3_WORK/om-emu
. "$REPO/tools/emulator/om_emu.sh"
emu_read_pin || exit 2
[ -z "$(git -C "$REPO" status --porcelain)" ] \
  || { echo "commit or stash your changes first: the bump builds this checkout, at both om-emu commits"; exit 2; }

latest=$(git ls-remote "$EMU_GIT" HEAD | cut -f1) || true
[ -n "$latest" ] || { echo "could not read om-emu's newest commit from $EMU_GIT"; exit 2; }
today=$(date +%F)
if [ "$latest" = "$EMU_REV" ]; then
  echo "$EMU_REV $today" >"$EMU_PIN"
  echo "om-emu ${EMU_REV:0:7} is still upstream's newest. Commit tools/emulator/om-emu.pin with today's date."
  exit 0
fi

OUT=$OM3_WORK/out-bump
RES=$OM3_WORK/bump
rm -rf "$OUT"
mkdir -p "$RES"
python3 "$REPO/firmware/build.py" --stock "$OM3_STOCK" --toolchain "$OM3_TOOLCHAIN" --out "$OUT" >"$RES/build.log" 2>&1 \
  || { echo "build failed: see $RES/build.log"; exit 2; }

# suite NAME REV: runs the suite on the build, keeps its result lines and their failure details in $RES/NAME.lines.
suite() {
  python3 "$REPO/tools/test/emu_test.py" "$OUT" --stock "$OM3_STOCK" >"$RES/$1.txt" 2>&1 || true
  grep -E '^(pass|known|FAIL) |^      ' "$RES/$1.txt" >"$RES/$1.lines" \
    || { echo "the suite printed no results with om-emu $2: see $RES/$1.txt"; exit 2; }
}
emu_use "$EMU_REV" "$OM3_STOCK"
suite old "${EMU_REV:0:7}"
emu_use "$latest" "$OM3_STOCK"
echo "$latest $today" >"$EMU_PIN"
suite new "${latest:0:7}"

echo "om-emu ${EMU_REV:0:7} -> ${latest:0:7} (git -C $EMU log --oneline ${EMU_REV:0:7}..${latest:0:7})"
if diff "$RES/old.lines" "$RES/new.lines"; then
  echo "No result changed. Commit tools/emulator/om-emu.pin."
else
  echo "Results changed (< old, > new; full output in $RES). Fix the tests, then commit them with tools/emulator/om-emu.pin."
  echo "To keep the old pin instead: git checkout tools/emulator/om-emu.pin, then research/setup.sh."
  exit 1
fi
