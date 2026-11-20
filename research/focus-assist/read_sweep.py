"""Read V12 MF sweep pages in order, with lens position and ZAF in each sample."""
import argparse
import json
import struct
from pathlib import Path

from read_zaf_zone import ROW, decode_row


HEADER = struct.Struct('<4s5I')
LENS = struct.Struct('<hBBI')
STRIDE = ROW.size + LENS.size


def decode_pages(paths):
    sessions = {}
    damaged = []
    for path in sorted(paths):
        data = path.read_bytes()
        if len(data) < HEADER.size:
            damaged.append(path.name)
            continue
        magic, version, session, first, count, stride = HEADER.unpack_from(data)
        if magic != b'OMSW':
            damaged.append(path.name)
            continue
        if (version, stride) != (1, STRIDE):
            raise ValueError(f'{path}: unsupported sweep version {version} or row size {stride}')
        if not session or not first or not 1 <= count <= 64 or len(data) != HEADER.size + count * stride:
            damaged.append(path.name)
            continue
        page = {}
        for i in range(count):
            at = HEADER.size + i * stride
            row = decode_row(ROW.unpack_from(data, at))
            if row['seq'] != first + i:
                break
            pos, valid, inhibit, shutter = LENS.unpack_from(data, at + ROW.size)
            row.update(lens_position=pos if valid and pos != -32768 else None,
                       lens_valid=bool(valid), lens_inhibit=inhibit, shutter_event=shutter)
            page[first + i] = row
        if len(page) != count:
            damaged.append(path.name)
            continue
        rows = sessions.setdefault(session, {})
        for seq, row in page.items():
            if seq in rows and rows[seq] != row:
                raise ValueError(f'{path}: conflicting sample {seq} in session {session}')
            rows[seq] = row
    result = []
    for session, rows in sorted(sessions.items()):
        missing = []
        previous = 0
        for seq in sorted(rows):
            if seq > previous + 1:
                missing.append([previous + 1, seq - 1])
            previous = seq
        result.append(dict(session=session, missing_ranges=missing, rows=[rows[i] for i in sorted(rows)]))
    return dict(damaged_pages=damaged, sessions=result)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    paths = sorted(args.directory.glob('ZS[0-9][0-9][0-9][0-9][0-9][0-9].BIN'))
    if not paths:
        parser.error('No MF sweep pages in this directory')
    print(json.dumps(decode_pages(paths), indent=2))
