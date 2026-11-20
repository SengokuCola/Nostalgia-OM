#!/usr/bin/env bash
# Requires screen_check.py outputs and the pinned OM3 workspace. No flash build.
set -euo pipefail
here=$(cd -- "$(dirname -- "$0")" && pwd)
work=${OM3_WORK:-/opt/caduceus-om3-dev}
out=${1:?pass screen_check output directory}
tc=$work/toolchain/build
"$tc/gas/as-new" -I "$here/../../firmware/src" -o "$out/overlay.o" "$here/overlay_native.s"
# Keep external target unresolved until link: GAS literal call operands are offsets.
"$tc/ld/ld-new" --defsym=ov_hold=0x6020f1c0 -Ttext=0xa7f20000 \
 -e overlay_native -o "$out/overlay.elf" "$out/overlay.o"
"$tc/binutils/objcopy" -O binary -j .text "$out/overlay.elf" "$out/overlay.bin"
"$tc/gas/as-new" -I "$here/../../firmware/src" -o "$out/capture.o" "$here/capture_native.s"
"$tc/ld/ld-new" --defsym=cap_lock=0x60075f73 --defsym=cap_unlock=0x60075fbc \
 -Ttext=0xa7f40000 -e capture_native -o "$out/capture.elf" "$out/capture.o"
"$tc/binutils/objcopy" -O binary -j .text "$out/capture.elf" "$out/capture.bin"
export OM_EMU_MODEL=E147
"$work/node/bin/node" "$here/overlay_check.mjs" "$work/om-emu/emu" "$out"
"$work/node/bin/node" "$here/overlay_check.mjs" "$work/om-emu/emu" "$out" --native
cmp "$out/overlay-results.json" "$out/overlay-native-results.json"
"$work/node/bin/node" "$here/overlay_check.mjs" "$work/om-emu/emu" "$out" --native --capture
"$work/node/bin/node" "$here/overlay_check.mjs" "$work/om-emu/emu" "$out" --native --capture --scaled
