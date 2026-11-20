#!/usr/bin/env python3
"""Decode CFPROBE.BIN. Values are uncalibrated snapshots, not focus verdicts."""
import argparse
import hashlib
import json
import struct
from pathlib import Path


def word_hash(raw):
    value = 0
    for (word,) in struct.iter_unpack('<I', raw):
        value = ((value * 33) & 0xffffffff) ^ word
    return value


def decode(data):
    if len(data) != 12832:
        raise ValueError('Expected exactly 12832 bytes (probe 2)')
    magic, version, slots, stride, latest, work, config, length = struct.unpack_from('<4s7I', data)
    if (magic, version, slots, stride, work, config, length) != (
            b'OMCF', 2, 8, 1600, 0x62fa1d94, 0xa33d07ba, 1496):
        raise ValueError('Unexpected probe header; do not guess its format')
    rows = []
    for i in range(slots):
        r = data[32+i*stride:32+(i+1)*stride]
        event, = struct.unpack_from('<I', r)
        if event == 0:
            continue
        if event % slots != i or not max(1, latest-7) <= event <= latest:
            raise ValueError('Inconsistent event ring')
        fp_event, valid, inhibit, direction, record, status, pos, lo, hi = struct.unpack_from('<IBBBBHhhh', r, 4)
        raw = r[64:1560]
        stored_hash, = struct.unpack_from('<I', r, 1560)
        if fp_event != event or word_hash(raw) != stored_hash:
            raise ValueError('Lens event mismatch or damaged snapshot/hash')
        pre = struct.unpack_from('<II', r, 48)
        post = struct.unpack_from('<II', r, 56)
        values = list(struct.unpack('<372I', raw[:1488]))
        rows.append(dict(event=event, lens=dict(valid=valid, inhibit=inhibit, direction=direction,
                         record=record, status=status, position=pos, lo=lo, hi=hi),
                         config_hex=r[20:36].hex(), config_enable0=r[20], config_enable14=r[34],
                         config_columns=struct.unpack_from('<H', r, 30)[0],
                         config_rows=struct.unpack_from('<H', r, 32)[0],
                         debug_mask=hex(struct.unpack_from('<I', r, 36)[0]),
                         debug_history_count=struct.unpack_from('<H', r, 40)[0],
                         producer_state=r[44], metadata_pre=pre, metadata_post=post,
                         metadata_changed_during_copy=pre != post,
                         data_hash=hashlib.sha256(raw[:1488]).hexdigest(),
                         nonzero_words=sum(v != 0 for v in values),
                         raw_triplets=[values[k:k+3] for k in range(0, len(values), 3)]))
    rows.sort(key=lambda r: r['event'])
    if len(rows) != min(latest, slots):
        raise ValueError('Missing records in event ring')
    return dict(format='OMCF 2', latest_event=latest,
                interpretation='Uncalibrated AF work-area snapshots. No proven frame counter, region mapping, '
                               'coherence, optical validity or signed defocus. Stable metadata is not a validity flag.',
                distinct_data_snapshots=len({r['data_hash'] for r in rows}), rows=rows)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('file', type=Path)
    ap.add_argument('--out', type=Path)
    args = ap.parse_args()
    result = decode(args.file.read_bytes())
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out:
        args.out.write_text(text + '\n', encoding='utf-8')
    else:
        print(text)
