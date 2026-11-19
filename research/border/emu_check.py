#!/usr/bin/env python3
"""The firmware's photo border (editor.s `bd_run`) against the exact model (model.py), bit for bit, in om-emu.

    python3 research/border/emu_check.py BUILD_DIR [--out DIR] [--only NAME ...] [--card C]

BUILD_DIR is a firmware/build.py --out folder (main.bin, p.elf). Each case is a test frame of random bytes in the
camera's buffer format (YCbYCr 4:2:2, rows `pitch` bytes apart; the padding past 2 W bytes must stay as it is): the
four photo shapes, the smallest frame, a short wide one, a 8192 px wide one (few rows per lock), black borders
(levels -1..-5), and levels the firmware must leave alone (0, 6, -6). research/halation/emu_hl.mjs runs `bd_run` on each in om-emu (single steps;
FLUSH stubbed) and the result must equal model.border's byte for byte, with the callee-saved registers, sp and a guard
after the frame intact. Prints one line per case. Exit 0 when every case is bit-exact.
"""
import argparse, json, os, pathlib, subprocess, sys, tempfile
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / 'tools' / 'test'))
import model  # noqa: E402
from emu_test import elf_symbols  # noqa: E402

DRIVER = REPO / 'research' / 'halation' / 'emu_hl.mjs'
FRAME = 88                     # bd_run's `call bd_run,[d2,d3,a2,a3],88`


def frame(W, H, pad, seed):
    rng = np.random.default_rng(seed)
    pitch = 2 * (W + pad)
    return rng.integers(0, 256, H * pitch, dtype=np.uint8), W, H, pitch


CASES = {   # name: (W, H, pad pixels, level[, Image Aspect 1..9: 2 3:2, 3 16:9, 4 1:1, 5 5:4, 6 XPan, 7 21:9, 9 3:4])
    'land5': (640, 480, 16, 5),
    'port3': (480, 640, 0, 3),
    'wide2': (1024, 576, 8, 2),
    'square4': (512, 512, 0, 4),
    'min1': (64, 64, 0, 1),
    'short4': (1028, 131, 24, 4),
    'w8192': (8192, 64, 0, 2),
    'level0': (320, 240, 0, 0),
    'level6': (320, 240, 0, 6),
    'big5': (5184, 3888, 0, 5),
    'big169': (5184, 3888, 0, 5, 3),   # the owner's 16:9 / 3:4 photos (5184 x 2920 / 2912 x 3888) at Border 5
    'big34': (5184, 3888, 0, 5, 9),
    'xpan3': (640, 480, 16, 3, 6),     # crop round 7: the border inside the crop's centred band
    'xp169': (1024, 576, 8, 2, 6),
    'w219': (640, 480, 0, 4, 7),
    'c54': (640, 480, 16, 3, 5),
    'xpcut': (640, 240, 0, 3, 6),      # a buffer already the crop's shape: as without a crop
    'c43': (640, 480, 0, 3, 1),        # 2026-11-18: the camera's own ratios cut from the 4:3 buffer too (Image
    'c32': (640, 480, 16, 5, 2),       # Aspect 1 4:3, 2 3:2, 3 16:9, 4 1:1, 9 3:4; owner's camera, Border 5: cut off)
    'c169': (1024, 768, 8, 3, 3),
    'c11': (640, 480, 0, 4, 4),
    'c34': (640, 480, 16, 5, 9),
    'c169cut': (1024, 576, 0, 2, 3),
    'black5': (640, 480, 16, -5),      # 2026-11-18: Border -1..-5 black, the same widths
    'black1': (480, 640, 0, -1),
    'black3c': (1024, 768, 8, -3, 3),
    'levelm6': (320, 240, 0, -6),      # below -5: nothing
}
CR_A1 = 0x629209c2                     # Image Aspect in the camera's settings image (crop.s CR_A1)
BIG = ('big5', 'big169', 'big34')   # camera-sized (20 MP): for the counts, not in the default run


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
    out = (a.out or pathlib.Path(tempfile.mkdtemp(prefix='bd-check-'))).resolve()
    out.mkdir(parents=True, exist_ok=True)
    names = a.only or [n for n in CASES if n not in BIG]
    cases, expect = [], {}
    for i, n in enumerate(names):
        W, H, pad, level, *crop = CASES[n]
        crop = crop[0] if crop else 1
        buf, W, H, pitch = frame(W, H, pad, 100 + i)
        (out / f'{n}.in').write_bytes(buf.tobytes())
        e = buf.copy()
        expect[n] = (e.tobytes() if model.border(e, W, H, pitch, level, crop) == 'off' else e.tobytes(),
                     'on' if model.ok(W, H, pitch, level) else 'off')
        cases.append({'name': n, 'in': str(out / f'{n}.in'), 'out': str(out / f'{n}.out'), 'W': W, 'H': H,
                      'pitch': pitch, 'level': level, 'pokes': [[CR_A1, f'{crop:02x}']]})
    syms = elf_symbols(build / 'p.elf')
    spec = out / 'spec.json'
    spec.write_text(json.dumps({'fn': syms['bd_run'], 'frame': FRAME, 'flush': syms['FLUSH'], 'lock': syms['LOCK'],
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
        cw, ch = model.crop_area(cs['W'], cs['H'], int(cs['pokes'][0][1], 16))[2:]
        B = model.widths(cw, ch, cs['level'])[0] if status == 'on' else 0
        print(f'{"exact" if good else "DIFF":<6}{cs["name"]:<8} {cs["W"]}x{cs["H"]} L{cs["level"]} {status:<3} B {B:>3} '
              f'{changed:>8} B changed  steps {o["steps"]:>10,}  locks {o["locks"]:>4}  flushes {o["flushes"]:>3}  '
              f'max under lock {o["maxLock"]:>7,}' + ('' if good else f'  [{diff.size} bytes differ{where}; done '
              f'{o["done"]} regs {o["regsBack"]} guard {o["guard"]}]'))
    print(f'{len(cases) - bad} of {len(cases)} bit-exact; files in {out}')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
