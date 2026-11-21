#!/usr/bin/env python3
"""Decode OM3MOD/PDxxxxxx.BIN (OMPD v1) raw PDAF & TruePic X HW snapshots."""
import argparse
import collections
import struct
import sys
from pathlib import Path

EXPECTED_SIZE = 19456


def sad_xcorr(a, b, max_lag=16):
    n = min(len(a), len(b))
    if n <= 2 * max_lag + 8:
        return None
    best_lag, best_sad, worst_sad = 0, 1 << 60, 0
    for lag in range(-max_lag, max_lag + 1):
        s = 0
        start = max_lag
        end = n - max_lag
        for i in range(start, end):
            s += abs(a[i] - b[i + lag])
        if s < best_sad:
            best_sad, best_lag = s, lag
        if s > worst_sad:
            worst_sad = s
    return best_lag, best_sad, worst_sad


def unpack_12bit_le(buf):
    out = []
    for i in range(0, len(buf) - 2, 3):
        b0, b1, b2 = buf[i], buf[i + 1], buf[i + 2]
        out.append(b0 | ((b1 & 0x0f) << 8))
        out.append((b1 >> 4) | (b2 << 4))
    return out


def unpack_10bit_le(buf):
    out = []
    for i in range(0, len(buf) - 4, 5):
        v = int.from_bytes(buf[i:i + 5], 'little')
        for k in range(4):
            out.append((v >> (k * 10)) & 0x3ff)
    return out


def summarize_raw_slice(name, buf):
    nz = sum(1 for b in buf if b != 0)
    ff = sum(1 for b in buf if b == 0xff)
    u16 = struct.unpack(f'<{len(buf)//2}H', buf)
    first8 = ' '.join(f'{x:04x}' for x in u16[:8])
    return f'{name}: nz={nz}/{len(buf)} ff={ff} u16[min={min(u16)},max={max(u16)},mean={sum(u16)/len(u16):.1f}] head=[{first8}]'


def decode_file(path: Path):
    data = path.read_bytes()
    if len(data) != EXPECTED_SIZE or data[:4] != b'OMPD':
        raise ValueError(f'{path}: invalid OMPD file (len={len(data)}, magic={data[:4]!r})')
    ver, seq, shutter, usclk = struct.unpack_from('<4I', data, 4)
    latest, locked, rf0, rf1, rf2, rf3 = struct.unpack_from('<6H', data, 20)
    pdaf_gain, lens_mounted, stream_en = struct.unpack_from('<hBB', data, 32)
    edge_fine, edge_coarse, raw_a0, raw_b0, raw_xcorr = struct.unpack_from('<5I', data, 36)
    cap_c, disp_c, lpos_c, llk1_c = struct.unpack_from('<4I', data, 56)
    ptr_a = struct.unpack_from('<4I', data, 0x48)
    ptr_b = struct.unpack_from('<4I', data, 0x58)
    ptr_c60 = struct.unpack_from('<4I', data, 0x68)
    ptr_c70 = struct.unpack_from('<4I', data, 0x78)
    zaf_ptrs = struct.unpack_from('<10I', data, 0x88)
    mask, total_sz = struct.unpack_from('<2I', data, 0xb0)

    print(f'=== {path.name} (OMPD v{ver}, seq={seq}, shutter={shutter}, t={usclk/1e6:.3f}s) ===')
    print(f'  slot: latest={latest} locked={locked} ring={[hex(x) for x in (rf0,rf1,rf2,rf3)]}')
    print(f'  pdaf_gain={pdaf_gain} ({pdaf_gain/128:+.2f} EV) lens_mounted={lens_mounted} stream_en={stream_en}')
    edge_score = (16 * edge_fine / edge_coarse) if edge_coarse and edge_coarse != 0xffffffff else None
    lag = struct.unpack('<h', struct.pack('<H', raw_xcorr & 0xffff))[0]
    contrast = raw_xcorr >> 16
    print(f'  edge: fine={edge_fine} coarse={edge_coarse} score={edge_score} | sw_raw: a0={raw_a0:#010x} b0={raw_b0:#010x} lag={lag} contrast={contrast}')
    print(f'  hooks: cap={cap_c} disp={disp_c} lpos={lpos_c} llk1={llk1_c} | valid_mask={mask:#x}')
    print(f'  ptr_a={[hex(x) for x in ptr_a]}')
    print(f'  ptr_b={[hex(x) for x in ptr_b]}')
    print(f'  ptr_c60={[hex(x) for x in ptr_c60]}')
    znames = ['99a8', '99ac', '99b0', '99e8', '99ec', '99f0', '99f4', '99fc', '9a08', '99c8']
    print('  zaf_ptrs: ' + ' '.join(f'{n}={v:#x}' for n, v in zip(znames, zaf_ptrs)))

    # Raw A/B slices
    s_start = data[0x0480:0x0c80]
    s_a40 = data[0x0c80:0x1480]
    s_a41 = data[0x1480:0x1c80]
    s_b40 = data[0x1c80:0x2480]
    s_b41 = data[0x2480:0x2c80]
    s_a1 = data[0x2c80:0x3080]
    s_b1 = data[0x3080:0x3480]
    print('  ' + summarize_raw_slice('ptr_a0+0      ', s_start))
    print('  ' + summarize_raw_slice('ptr_a0 A r40  ', s_a40))
    print('  ' + summarize_raw_slice('ptr_a0 A r41  ', s_a41))
    print('  ' + summarize_raw_slice('ptr_a0 B r40  ', s_b40))
    print('  ' + summarize_raw_slice('ptr_a0 B r41  ', s_b41))
    print('  ' + summarize_raw_slice('ptr_a1 A ctr  ', s_a1))
    print('  ' + summarize_raw_slice('ptr_a1 B ctr  ', s_b1))

    # Multi-format 1D cross-correlation tests on ptr_a0 row 40 A vs B
    for fmt_name, fn in [
        ('u16-le', lambda b: list(struct.unpack(f'<{len(b)//2}H', b))),
        ('u16-be', lambda b: list(struct.unpack(f'>{len(b)//2}H', b))),
        ('u8', lambda b: list(b)),
        ('u12-le', unpack_12bit_le),
        ('u10-le', unpack_10bit_le),
    ]:
        va, vb = fn(s_a40), fn(s_b40)
        res = sad_xcorr(va[:256], vb[:256], 24)
        if res:
            bl, bs, ws = res
            print(f'  xcorr(A40 vs B40, {fmt_name:6s}): best_lag={bl:+3d} min_sad={bs} max_sad={ws} ratio={ws/(bs+1):.2f}')

    # TruePic X HW PDAF output 0xa33e99b0
    b99b0_hdr = struct.unpack_from('<16I', data, 0x3480)
    b99b0_ctr = struct.unpack_from('<16I', data, 0x3880 + 512 - 16)  # pt 522..537
    print('  99b0[0..15]: ' + ' '.join(f'{x:08x}' for x in b99b0_hdr[:8]))
    print('  99b0[ctr-4..ctr+4]: ' + ' '.join(f'{x:08x}' for x in b99b0_ctr[:9]))

    # Full 1053-point Bank 0 flags & defocus
    flags0 = list(data[0x3c80:0x3c80 + 1053])
    defs0 = list(struct.unpack_from('<1053h', data, 0x40a0))
    fcounts = collections.Counter(flags0)
    valid_pts = [(i, defs0[i]) for i in range(1053) if flags0[i] == 0]
    nonzero_defs = [(i, flags0[i], defs0[i]) for i in range(1053) if defs0[i] not in (0, -32768)]
    print(f'  99ac Bank0 flags (1053 pts): {dict(sorted(fcounts.items()))}')
    print(f'  99e8 Bank0 valid(flag==0): {len(valid_pts)} pts; non-zero/non-sentinel defocus: {len(nonzero_defs)} pts')
    if valid_pts:
        vals = [v for _, v in valid_pts]
        print(f'    valid defocus min={min(vals)} max={max(vals)} sample={valid_pts[:10]}')
    elif nonzero_defs:
        print(f'    nonzero defocus sample={nonzero_defs[:10]}')

    # Banks 1..4 center pt 526 (index 30 inside 496..559)
    b_summary = []
    for b in range(1, 5):
        bf = list(data[0x48e0 + (b - 1) * 64:0x48e0 + b * 64])
        bd = list(struct.unpack_from('<64h', data, 0x49e0 + (b - 1) * 128))
        b_summary.append(f'B{b}:f526={bf[30]},d526={bd[30]},f0cnt={bf.count(0)}')
    print('  Banks 1..4 (pts 496..559): ' + ' | '.join(b_summary))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('paths', nargs='+', type=Path)
    args = ap.parse_args()
    files = []
    for p in args.paths:
        if p.is_dir():
            files.extend(sorted(p.glob('PD[0-9][0-9][0-9][0-9][0-9][0-9].BIN')))
        else:
            files.append(p)
    if not files:
        sys.exit('No PDxxxxxx.BIN files found')
    for f in files:
        decode_file(f)
