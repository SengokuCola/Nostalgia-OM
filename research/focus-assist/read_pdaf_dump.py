#!/usr/bin/env python3
"""Decode OM3MOD/PDxxxxxx.BIN (OMPD v1 & v2) raw PDAF & TruePic X HW snapshots."""
import argparse
import collections
import struct
import sys
from pathlib import Path


def sad_xcorr(a, b, max_lag=24):
    n = min(len(a), len(b))
    if n <= 2 * max_lag + 16:
        return None
    best_lag, best_sad, worst_sad = 0, 1 << 60, 0
    for lag in range(-max_lag, max_lag + 1):
        s = 0
        for i in range(max_lag, n - max_lag):
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
    mid = len(u16) // 2
    head8 = ' '.join(f'{x:04x}' for x in u16[:8])
    mid8 = ' '.join(f'{x:04x}' for x in u16[mid:mid+8])
    return (f'{name}: nz={nz}/{len(buf)} ff={ff} '
            f'u16[min={min(u16)},max={max(u16)},mean={sum(u16)/len(u16):.1f},uniq={len(set(u16))}] '
            f'head=[{head8}] mid=[{mid8}]')


def decode_file(path: Path):
    data = path.read_bytes()
    if len(data) < 256 or data[:4] != b'OMPD':
        raise ValueError(f'{path}: invalid OMPD file (len={len(data)}, magic={data[:4]!r})')
    ver, seq, shutter, usclk = struct.unpack_from('<4I', data, 4)
    latest, locked, rf0, rf1, rf2, rf3 = struct.unpack_from('<6H', data, 20)
    pdaf_gain, lens_mounted, stream_en = struct.unpack_from('<hBB', data, 32)
    edge_fine, edge_coarse, raw_a0, raw_b0, raw_xcorr = struct.unpack_from('<5I', data, 36)
    cap_c, disp_c, lpos_c, llk1_c = struct.unpack_from('<4I', data, 56)
    ptr_a = struct.unpack_from('<4I', data, 0x48)
    zaf_ptrs = struct.unpack_from('<10I', data, 0x88)
    mask, total_sz = struct.unpack_from('<2I', data, 0xb0)

    print(f'=== {path.name} (OMPD v{ver}, seq={seq}, shutter={shutter}, t={usclk/1e6:.3f}s, size={len(data)}) ===')
    print(f'  slot: latest={latest} locked={locked} ring={[hex(x) for x in (rf0,rf1,rf2,rf3)]}')
    print(f'  pdaf_gain={pdaf_gain} ({pdaf_gain/128:+.2f} EV) lens_mounted={lens_mounted} stream_en={stream_en}')
    edge_score = (16 * edge_fine / edge_coarse) if edge_coarse and edge_coarse != 0xffffffff else None
    lag = struct.unpack('<h', struct.pack('<H', raw_xcorr & 0xffff))[0]
    contrast = raw_xcorr >> 16
    print(f'  edge: fine={edge_fine} coarse={edge_coarse} score={edge_score} | sw_raw: a0={raw_a0:#010x} b0={raw_b0:#010x} lag={lag} ctr={contrast}')
    print(f'  hooks: cap={cap_c} disp={disp_c} lpos={lpos_c} llk1={llk1_c} | valid_mask={mask:#x}')
    print(f'  ptr_a={[hex(x) for x in ptr_a]}')
    znames = ['99a8', '99ac', '99b0', '99e8', '99ec', '99f0', '99f4', '99fc', '9a08', '99c8']
    print('  zaf_ptrs: ' + ' '.join(f'{n}={v:#x}' for n, v in zip(znames, zaf_ptrs)))

    if ver == 2:
        if len(data) != 24928:
            raise ValueError(f'{path}: expected 24928 B for OMPD v2, got {len(data)}')
        tpl = struct.unpack_from('<128I', data, 0x0480)
        print(f'  Template[3]: +512={tpl[0]:#x} +532={tpl[5]:#x} +772={tpl[65]:#x} +776={tpl[66]:#x} '
              f'+780={tpl[67]:#x} +896={tpl[96]:#x} +900={tpl[97]:#x} +904={tpl[98]:#x} +908={tpl[99]:#x}')
        s_a40 = data[0x0680:0x1480]
        s_b40 = data[0x1480:0x2280]
        s_a41 = data[0x2280:0x2680]
        s_b41 = data[0x2680:0x2a80]
        s_a03 = data[0x2a80:0x3280]
        s_b03 = data[0x3280:0x3a80]
        s_a1 = data[0x5d60:0x5f60]
        s_b1 = data[0x5f60:0x6160]
        for label, sl in [
            ('ptr_a0 A r40 full', s_a40), ('ptr_a0 B r40 full', s_b40),
            ('ptr_a0 A r41     ', s_a41), ('ptr_a0 B r41     ', s_b41),
            ('ptr_a0 A r03     ', s_a03), ('ptr_a0 B r03     ', s_b03),
            ('ptr_a1 A r43     ', s_a1),  ('ptr_a1 B r43     ', s_b1),
        ]:
            print('  ' + summarize_raw_slice(label, sl))
        nz_ff_a = [i for i, b in enumerate(s_a40) if b != 0xff]
        nz_ff_b = [i for i, b in enumerate(s_b40) if b != 0xff]
        print(f'  row40 non-0xff byte span: A={nz_ff_a[0] if nz_ff_a else None}..{nz_ff_a[-1] if nz_ff_a else None} (cnt={len(nz_ff_a)}), '
              f'B={nz_ff_b[0] if nz_ff_b else None}..{nz_ff_b[-1] if nz_ff_b else None} (cnt={len(nz_ff_b)})')
        for fmt_name, fn, sl_start, sl_end in [
            ('u16-le ctr', lambda b: list(struct.unpack(f'<{len(b)//2}H', b)), 1024, 2560),
            ('u12-le ctr', unpack_12bit_le, 600, 2040),
            ('u10-le ctr', unpack_10bit_le, 500, 1700),
            ('u8     ctr', lambda b: list(b), 400, 1360),
        ]:
            va, vb = fn(s_a40[sl_start:sl_end]), fn(s_b40[sl_start:sl_end])
            res = sad_xcorr(va[:320], vb[:320], 24)
            if res:
                bl, bs, ws = res
                print(f'  xcorr(A40 vs B40, {fmt_name}): best_lag={bl:+3d} min_sad={bs} max_sad={ws} ratio={ws/(bs+1):.2f}')

        p99a8_0 = struct.unpack_from('<128I', data, 0x3a80)
        p99a8_b0 = struct.unpack_from('<1053I', data, 0x3c80)
        p99a8_b0_s16 = struct.unpack_from('<2106h', data, 0x3c80)
        print(f'  99a8 Pitch0 uniq={len(set(p99a8_0))} head={[hex(x) for x in p99a8_0[:8]]}')
        print(f'  99a8 Bank0 (1053 u32) uniq={len(set(p99a8_b0))} ctr526={p99a8_b0[526]:#010x} '
              f'ctr-2..+2={[hex(x) for x in p99a8_b0[524:529]]}')
        print(f'  99a8 Bank0 s16 lo/hi at ctr526: ({p99a8_b0_s16[526*2]}, {p99a8_b0_s16[526*2+1]})')

        b99b0_c = struct.unpack_from('<9I', data, 0x4d00 + 512 - 16)
        print('  99b0[ctr-4..ctr+4]: ' + ' '.join(f'{x:08x}' for x in b99b0_c))
        flags0 = list(data[0x5100:0x5100 + 1053])
        defs0 = list(struct.unpack_from('<1053h', data, 0x5520))
        print(f'  99ac Bank0 flags: {dict(sorted(collections.Counter(flags0).items()))}')
        valid_pts = [(i, defs0[i]) for i in range(1053) if flags0[i] == 0]
        print(f'  99e8 Bank0 valid(flag==0): {len(valid_pts)} pts; sample={valid_pts[:8]}')
    else:
        flags0 = list(data[0x3c80:0x3c80 + 1053])
        print(f'  [v1] 99ac Bank0 flags: {dict(sorted(collections.Counter(flags0).items()))}')


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
