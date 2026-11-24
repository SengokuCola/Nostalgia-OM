"""Decode the latest OM-3 split-screen trace saved with CADLOG."""
import argparse
import json
import struct
from pathlib import Path

HEADER = struct.Struct('<4s4I')
ROW = struct.Struct('<8I')
OUTCOMES = ('published', 'evf-address-miss', 'tiles-held', 'cancelled',
            'capture-rejected', 'publish-refused', 'map-error', 'phase-unavailable')
DEVICES = {1: 'EVF', 2: 'TFT'}
EMPTY = 0xffffffff


def decode(data):
    if len(data) != HEADER.size + 128 * ROW.size:
        raise ValueError('Incomplete or unsupported focus trace size')
    magic, version, count, stride, head = HEADER.unpack_from(data)
    if version not in (1, 2) or (magic, count, stride) != (b'OMFT', 128, ROW.size):
        raise ValueError('Unsupported focus trace header')
    rows = []
    missing = []
    for expected in range(max(1, head - count + 1), head + 1):
        offset = HEADER.size + (expected % count) * stride
        seq, panel, outcome, detail, fine, coarse, raw, filtered = ROW.unpack_from(data, offset)
        if seq != expected:
            # A newer display callback can reuse a slot during the chunked copy.
            missing.append(expected)
            continue
        if panel not in DEVICES or outcome >= (7 if version == 1 else len(OUTCOMES)):
            raise ValueError(f'Invalid panel or outcome at attempt {seq}')
        phase = None
        if version == 2 and detail & 512:
            token, defmm, defpls, area_flags = struct.unpack_from('<IiiI', data, offset + 16)
            phase = dict(token=token, defmm=defmm, defpls=defpls, area=area_flags & 65535,
                         is_ranging=area_flags >> 16)
            if outcome == 0:
                phase['displayed_pairs'] = 2 * ((defmm > 0) - (defmm < 0))
            score = fine = coarse = raw = filtered = None
        elif version == 2 and outcome == 7:
            # The writer can snapshot the last contrast state when a phase
            # sample is unavailable. It is not a measurement for this attempt.
            if (fine, coarse, raw, filtered) != (EMPTY,) * 4 and (raw > 4 or filtered > 4):
                raise ValueError(f'Invalid retained split level at attempt {seq}')
            score = fine = coarse = raw = filtered = None
        elif outcome in (0, 3, 5, 6):
            if raw > 4 or filtered > 4:
                raise ValueError(f'Invalid split level at attempt {seq}')
            score = round(16 * fine / coarse, 4) if coarse else None
        else:
            if (fine, coarse, raw, filtered) != (EMPTY,) * 4:
                raise ValueError(f'Unexpected measurement at attempt {seq}')
            score = fine = coarse = raw = filtered = None
        rows.append(dict(seq=seq, device=DEVICES[panel], outcome=OUTCOMES[outcome],
                         reason=detail & 255, owned=bool(detail & 256), fine=fine,
                         coarse=coarse, score=score, raw=raw, filtered=filtered, phase=phase))
    return dict(head=head, missing=missing, rows=rows)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    print(json.dumps(decode(parser.parse_args().file.read_bytes()), indent=2))
