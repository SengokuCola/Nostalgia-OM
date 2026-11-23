#!/usr/bin/env python3
# Modified by SengokuCola for the Caduceus for OM-3 fork.
"""Make releases/vX/patch.json from a developer build (firmware/build.py --out DIR): the changed bytes of the decoded
main block as runs (our code, hooks and tables only), the white Frame layers (rebuilt by patch.py from their window
sizes, frames.py), and the expected checksums. Writes no OM bytes.

usage: tools/mkpatch.py --stock OLY_E_147_1100_0000_0000_3.BIN --build DIR --version v0.20 --description TEXT --out patch.json"""
import argparse, hashlib, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'firmware'))
import patch as P                                   # firmware/patch.py: parse/decode
import frames

ap = argparse.ArgumentParser()
for k in ('stock', 'build', 'version', 'description', 'out'):
    ap.add_argument('--' + k, required=True)
ap.add_argument('--name', default='Caduceus for OM-3', help='project name shown by the patch launcher')
a = ap.parse_args()
raw = Path(a.stock).read_bytes()
b = Path(a.build)
main = (b / 'main.bin').read_bytes()
pkg = (b / 'E1479999.BIN').read_bytes()
comps = P.parse(raw)
stock_main = P.decode(comps[0]['enc'])
assert len(stock_main) == len(main)
main_base = 0x60021020
runs, i = [], 0
while i < len(main):
    if main[i] == stock_main[i]:
        i += 1; continue
    start = i
    while i < len(main) and main[i] != stock_main[i]:
        i += 1
    runs.append([hex(main_base + start), main[start:i].hex()])
out = dict(format='om3-patch-2', name=a.name, version=a.version, description=a.description,
           stock_file=P.STOCK_NAME, stock_sha256=hashlib.sha256(raw).hexdigest(), stock_size=len(raw),
           main_sha256_before=hashlib.sha256(stock_main).hexdigest(), main_sha256_after=hashlib.sha256(main).hexdigest(),
           result_sha256=hashlib.sha256(pkg).hexdigest(), main_base=hex(main_base),
           changed_bytes=sum(len(data) // 2 for _, data in runs),
           frames=dict(component=2, base=hex(frames.BASE), layers=[list(x) for x in frames.LAYERS],
                       note='white Frame layers: rebuilt by patch.py (frames.py), window edges measured from the stock masks'),
           card_files=[n for n in ('GUIDES.BIN', 'LABELS.BIN', 'TONES.BIN') if (Path(a.build) / n).is_file()],   # TONES.BIN: v0.26
           runs=runs)
Path(a.out).write_text(json.dumps(out, indent=0))
print(a.out, len(runs), 'runs', out['changed_bytes'], 'bytes changed')
