"""Decode the most recent OM-3 driver submissions in LENSDRV.BIN."""
import argparse
import json
import struct
from pathlib import Path

HEADER = struct.Struct('<4s4I')
ROW = struct.Struct('<4I')
KINDS = {1: 'absolute', 2: 'sync_def', 3: 'async_def', 4: 'main_def',
         5: 'sub_def', 6: 'absolute_direct', 7: 'mft_move', 8: 'mft_move_alt',
         9: 'mft_offset_vd', 10: 'mft_offset_vd_sim'}


def signed_half(word):
    return ((word & 0xffff) ^ 0x8000) - 0x8000


def decode(data):
    if len(data) != HEADER.size + 64 * ROW.size:
        raise ValueError('Incomplete or unsupported lens drive trace')
    magic, version, capacity, stride, head = HEADER.unpack_from(data)
    if (magic, version, capacity, stride) != (b'OMLD', 1, 64, ROW.size):
        raise ValueError('Unsupported lens drive header')
    events, missing = [], []
    for expected in range(max(1, head - capacity + 1), head + 1):
        offset = HEADER.size + (expected % capacity) * stride
        seq, tick, command, context = ROW.unpack_from(data, offset)
        if seq != expected:
            missing.append(expected)
            continue
        kind = command >> 16
        if kind not in KINDS or tick > 0x7fffffff:
            raise ValueError(f'Invalid lens drive record at {seq}')
        value = signed_half(command)
        source = signed_half(context)
        event = dict(seq=seq, submit_tick=tick, kind=KINDS[kind],
                     af_input=None if source == -32768 else source)
        if kind in (1, 6):
            event.update(target_position=value, direction_flag=context >> 16)
        elif kind in (7, 8):
            event.update(iaf_target=value, iaf_flag=context >> 16)
        elif kind in (9, 10):
            event.update(ofs_move=value, ofs_time=context >> 16)
        else:
            event['drive_def'] = value
        events.append(event)
    return dict(total=head, missing=missing, events=events)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    print(json.dumps(decode(parser.parse_args().file.read_bytes()), indent=2))
