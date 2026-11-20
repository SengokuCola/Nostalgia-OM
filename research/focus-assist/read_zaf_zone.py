"""Decode the central ZAF maker inputs and published descriptor from ZAFZONE.BIN."""
import argparse
import json
import struct
from pathlib import Path

HEADER = struct.Struct('<4s4I')
ROW = struct.Struct('<III4B4h4B2h')


def decode_row(fields):
    seq, tick, token, slot, mode, ready, layout = fields[:7]
    values, flags = fields[7:11], fields[11:15]
    published = slot <= 2 and mode in (0, 1) and ready == 1
    inputs = []
    if layout in (1, 2):
        for i, (v, f) in enumerate(zip(values, flags)):
            inputs.append(dict(bank=i // 2, plane=i % 2, value=v, flag=f,
                               rejected_by_flag=f in (1, 2)))
    return dict(seq=seq, read_tick=tick, layout=layout, inputs=inputs,
                slot=slot, bank=mode if published else None, ready=ready,
                publish_token=token if published else None,
                published_values=[None if v == -32768 else v for v in fields[-2:]]
                if published else None)


def decode(data):
    if len(data) != HEADER.size + 32 * ROW.size:
        raise ValueError('Unexpected ZAF zone trace size')
    magic, version, capacity, stride, head = HEADER.unpack_from(data)
    if (magic, version, capacity, stride) != (b'OMZR', 1, 32, ROW.size):
        raise ValueError('Unsupported ZAF zone trace')
    events, missing = [], []
    for expected in range(max(1, head - capacity + 1), head + 1):
        fields = ROW.unpack_from(data, HEADER.size + expected % capacity * stride)
        if expected != fields[0]:
            missing.append(expected)
            continue
        events.append(decode_row(fields))
    return dict(total_logged=head, missing=missing, events=events)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    print(json.dumps(decode(parser.parse_args().file.read_bytes()), indent=2))
