#!/bin/bash
# run.sh KIND NAME 'SPEC' 'TOKENS'  ->  $OM3_WORK/screeninfo/NAME/*.png (real colours) + session.log + out.json
# KIND set|upd (see mkimg.py); SPEC '' = no change (a baseline). Emulator only. Needs the workspace
# (`. ~/om3-work/env.sh`). NV_SRC=FILE starts from saved camera settings (a copy is used, the file is not changed);
# DEVICE=evf runs on the viewfinder. Example (prototype, Information 1 with picture mode and WB hidden):
#   run.sh upd pmwb '4:2:60,4:1:39,4:1:401,4:2:404' 'info wait info wait shot:m1.png'
set -e
H="$(cd "$(dirname "$0")" && pwd)"
: "${OM3_REPO:?load ~/om3-work/env.sh first}"
KIND=$1; NAME=$2; SPEC=$3; TOKENS=$4
D="$OM3_WORK/screeninfo/$NAME"; rm -rf "$D"; mkdir -p "$D"; cd "$D"
python3 "$H/mkimg.py" "$KIND" img.bin "$SPEC"
[ -n "$NV_SRC" ] && cp "$NV_SRC" nv.bin && export NV_FILE="$PWD/nv.bin"
node "$H/../../tools/emulator/session_ed1.mjs" "$OM3_EMU" img.bin "$OM3_CARD" out.json saved.omsd "$TOKENS" > session.log 2>&1 \
  || { tail -5 session.log; exit 1; }
rm -f img.bin saved.omsd nv.bin
shopt -s nullglob
for f in *.png; do python3 "$H/../showcase/ycc2rgb.py" "$f"; mv "${f%.png}.rgb.png" "$f"; done
grep -o '"step":"[^"]*","state":[0-9]*,"gui":"[^"]*"' session.log | sed 's/"state":[0-9]*,//' | tail -3
