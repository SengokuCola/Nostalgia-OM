#!/usr/bin/env python3
"""CURVES.BIN v1: each film's built-in RGB curves and colour mix, for the films of a LOOKS.BIN (docs/FORMATS.md).

    mkcurves.py LOOKS.BIN SPEC.json OUT.BIN

SPEC.json: {"Portra 400": {"r": [5 points], "g": [5], "b": [5], "mix": [hR, sR, hG, sG, hB, sB]}, ...}, film names as
in LOOKS.BIN's names (points at 0 / 25 / 50 / 75 / 100 %; every value -7..+7; a key left out = zeros). Films of the
LOOKS.BIN not in SPEC get zeros. Each entry carries the CRC-32 of the LOOKS.BIN record it was made for, so the camera
uses it only with that film. LookLab writes the same bytes (webapp, the CURVES.BIN export).
"""
import json, struct, sys, zlib

MAGIC, VERSION, LENGTH, COUNT, ENTRY = b'OM3K', 1, 432, 20, 20


def entry(check, r, g, b, mix):
    vals = list(r) + list(g) + list(b)
    assert len(vals) == 15 and len(mix) == 6 and all(-7 <= v <= 7 for v in vals + list(mix)), (vals, mix)
    nib = [v & 15 for v in vals] + [0]
    packed = bytes(nib[i] | nib[i + 1] << 4 for i in range(0, 16, 2))
    return struct.pack('<I', check) + packed + struct.pack('<6b', *mix) + b'\0\0'


def build(looks, spec):
    assert len(looks) == 1632 and looks[:4] == b'OM3P', 'not a LOOKS.BIN v1'
    names = [looks[1312 + 16 * j:1328 + 16 * j].rstrip(b'\0').decode('latin1') for j in range(COUNT)]
    unknown = set(spec) - set(names)
    assert not unknown, f'not in this LOOKS.BIN: {sorted(unknown)}'
    body = b''
    for j, n in enumerate(names):
        s = spec.get(n, {})
        body += entry(zlib.crc32(looks[32 + 64 * j:96 + 64 * j]), s.get('r', [0] * 5), s.get('g', [0] * 5),
                      s.get('b', [0] * 5), s.get('mix', [0] * 6))
    rest = struct.pack('<H', COUNT) + bytes(18) + body
    assert 12 + len(rest) == LENGTH
    return MAGIC + struct.pack('<HHI', VERSION, LENGTH, zlib.crc32(rest)) + rest


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    out = build(open(sys.argv[1], 'rb').read(), json.load(open(sys.argv[2])))
    open(sys.argv[3], 'wb').write(out)
    print(f'{sys.argv[3]}: {len(out)} bytes')
