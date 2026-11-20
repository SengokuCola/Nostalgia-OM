"""Decode AFWRITE.BIN. write_tick uses the same clock as LENSDRV.BIN."""
import argparse
import json
import struct
from pathlib import Path

HEADER = struct.Struct('<4s4I')
ROW = struct.Struct('<IIhH')
# The native CALLs are five bytes long. Capture the low word of their return PC.
CALL_SITES = {0xebf0: 0x6099ebeb, 0xeed8: 0x6099eed3, 0x0dbc: 0x609a0db7}


def decode(data):
    if len(data) != HEADER.size + 128 * ROW.size:
        raise ValueError('Incomplete or unsupported AF write trace')
    magic, version, capacity, stride, head = HEADER.unpack_from(data)
    if (magic, version, capacity, stride) != (b'OMAW', 1, 128, ROW.size):
        raise ValueError('Unsupported AF write header')
    events, missing = [], []
    for expected in range(max(1, head - capacity + 1), head + 1):
        offset = HEADER.size + (expected % capacity) * stride
        seq, tick, value, caller = ROW.unpack_from(data, offset)
        if seq != expected:
            missing.append(expected)
            continue
        if tick > 0x7fffffff:
            raise ValueError(f'Invalid clock value at AF write {seq}')
        events.append(dict(seq=seq, write_tick=tick, af_value=None if value == -32768 else value,
                           return_low=hex(caller), call_site=hex(CALL_SITES[caller]) if caller in CALL_SITES else None))
    return dict(total_logged=head, missing=missing, events=events)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    print(json.dumps(decode(parser.parse_args().file.read_bytes()), indent=2))
