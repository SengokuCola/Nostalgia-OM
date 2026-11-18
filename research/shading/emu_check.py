#!/usr/bin/env python3
"""The firmware's gentler Shading vignette (shading.s `vg_run`) against the exact model (firmware/shading.py), bit for
bit, in om-emu.

    python3 research/shading/emu_check.py BUILD_DIR [--out DIR] [--only NAME ...] [--card C]

BUILD_DIR is a firmware/build.py --out folder (main.bin, p.elf). Each case is a test frame of random bytes in the
camera's buffer format (YCbYCr 4:2:2, rows `pitch` bytes apart; the padding past 2 W bytes must stay as it is):
darker and lighter at every level, the photo shapes, the smallest frame, a short wide one, an 8192 px wide one (one row
per lock), the crop modes, and levels the firmware must leave alone (0, 6, -6). research/halation/emu_hl.mjs runs
`vg_run` on each in om-emu (single steps; FLUSH stubbed) and the result must equal shading.vignette's byte for byte,
with the callee-saved registers, sp and a guard after the frame intact. Prints one line per case (steps, locks, the
most instructions under one lock). Exit 0 when every case is bit-exact.
"""
import argparse, json, os, pathlib, subprocess, sys, tempfile
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / 'firmware'))
sys.path.insert(0, str(REPO / 'tools' / 'test'))
import shading  # noqa: E402
from emu_test import elf_symbols  # noqa: E402

DRIVER = REPO / 'research' / 'halation' / 'emu_hl.mjs'
FRAME = 104                    # vg_run's `call vg_run,[d2,d3,a2,a3],104`
CR_A1 = 0x629209c2             # Image Aspect in the camera's settings image (crop.s CR_A1)


def frame(W, H, pad, seed):
    rng = np.random.default_rng(seed)
    pitch = 2 * (W + pad)
    return rng.integers(0, 256, H * pitch, dtype=np.uint8), W, H, pitch


CASES = {   # name: (W, H, pad pixels, level[, Image Aspect: 5 / 6 / 7 = 5:4 / XPan / 21:9])
    'land-5': (640, 480, 16, -5),
    'land-1': (640, 480, 0, -1),
    'land+5': (640, 480, 16, 5),
    'land+2': (640, 480, 0, 2),
    'port-3': (480, 640, 0, -3),
    'port+4': (480, 640, 8, 4),
    'wide-2': (1024, 576, 8, -2),
    'wide+1': (1024, 576, 0, 1),
    'square-4': (512, 512, 0, -4),
    'square+3': (512, 512, 0, 3),
    'min-5': (64, 64, 0, -5),
    'short-4': (1028, 131, 24, -4),
    'w8192+5': (8192, 64, 0, 5),
    'level0': (320, 240, 0, 0),
    'level6': (320, 240, 0, 6),
    'level-6': (320, 240, 0, -6),
    'xpan-3': (640, 480, 16, -3, 6),     # the crop's centred band: the vignette is the kept photo's
    'w219+2': (640, 480, 0, 2, 7),
    'c54-5': (640, 480, 16, -5, 5),
    'big-5': (5184, 3888, 0, -5),         # camera-sized (20 MP): for the counts, not in the default run
    'big+3': (5184, 3888, 0, 3),
}
BIG = ('big-5', 'big+3')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('build', type=pathlib.Path)
    ap.add_argument('--out', type=pathlib.Path)
    ap.add_argument('--only', nargs='+', choices=list(CASES))
    ap.add_argument('--card', help='an om-emu card image to boot with (default $OM3_CARD)')
    a = ap.parse_args()
    card = a.card or os.environ.get('OM3_CARD')
    if not os.environ.get('OM3_EMU') or not card:
        sys.exit('OM3_EMU / OM3_CARD not set: . ~/om3-work/env.sh')
    build = a.build.resolve()
    out = (a.out or pathlib.Path(tempfile.mkdtemp(prefix='vg-check-'))).resolve()
    out.mkdir(parents=True, exist_ok=True)
    names = a.only or [n for n in CASES if n not in BIG]
    cases, expect = [], {}
    for i, n in enumerate(names):
        W, H, pad, level, *crop = CASES[n]
        crop = crop[0] if crop else 1
        buf, W, H, pitch = frame(W, H, pad, 300 + i)
        (out / f'{n}.in').write_bytes(buf.tobytes())
        e = buf.copy()
        status = shading.vignette(e, W, H, pitch, level, crop)
        expect[n] = (e.tobytes(), status)
        cases.append({'name': n, 'in': str(out / f'{n}.in'), 'out': str(out / f'{n}.out'), 'W': W, 'H': H,
                      'pitch': pitch, 'level': level, 'pokes': [[CR_A1, f'{crop:02x}']]})
    syms = elf_symbols(build / 'p.elf')
    spec = out / 'spec.json'
    spec.write_text(json.dumps({'fn': syms['vg_run'], 'frame': FRAME, 'flush': syms['FLUSH'], 'lock': syms['LOCK'],
                                'unlock': syms['UNLOCK'], 'cases': cases}))
    env = {**os.environ, 'OM_EMU_MODEL': 'E147'}
    r = subprocess.run(['node', DRIVER, os.environ['OM3_EMU'], build / 'main.bin', card, spec, out / 'res.json'],
                       env=env, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'emu_hl.mjs exit {r.returncode}: {r.stderr[-2000:]}')
    results = json.loads((out / 'res.json').read_text())
    bad = 0
    for cs in cases:
        o = next(x for x in results if x['name'] == cs['name'])
        got = (out / f'{cs["name"]}.out').read_bytes()
        want, status = expect[cs['name']]
        orig = (out / f'{cs["name"]}.in').read_bytes()
        diff = np.flatnonzero(np.frombuffer(got, np.uint8) != np.frombuffer(want, np.uint8))
        changed = int((np.frombuffer(want, np.uint8) != np.frombuffer(orig, np.uint8)).sum())
        good = o['done'] and o['regsBack'] and o['guard'] and diff.size == 0
        bad += not good
        where = '' if not diff.size else f' first at row {diff[0] // cs["pitch"]} byte {diff[0] % cs["pitch"]}'
        print(f'{"exact" if good else "DIFF":<6}{cs["name"]:<9} {cs["W"]}x{cs["H"]} L{cs["level"]:+d} {status:<3} '
              f'{changed:>9} B changed  steps {o["steps"]:>12,}  locks {o["locks"]:>5}  flushes {o["flushes"]:>4}  '
              f'max under lock {o["maxLock"]:>7,}' + ('' if good else f'  [{diff.size} bytes differ{where}; done '
              f'{o["done"]} regs {o["regsBack"]} guard {o["guard"]}]'))
    print(f'{len(cases) - bad} of {len(cases)} bit-exact; files in {out}')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
