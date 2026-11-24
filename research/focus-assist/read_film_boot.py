"""Decode H11 Film Box boot journals, including partially written SD files."""
import argparse
import json
import struct
from pathlib import Path

RECORD = struct.Struct('<16I')
FIELDS = ('magic', 'boot', 'sequence', 'clock', 'shutter_events', 'published',
          'selected', 'paint_key', 'queue_write', 'queue_read', 'peak_depth',
          'queue_full_drops', 'last_wheel_us', 'peak_wheel_us', 'preview_us',
          'sequence_complement')


def decode(data):
    records = []
    invalid = []
    for offset in range(0, len(data), RECORD.size):
        chunk = data[offset:offset + RECORD.size]
        if len(chunk) == RECORD.size:
            row = dict(zip(FIELDS, RECORD.unpack(chunk)))
            if (row['magic'] == 0x314a4246 and row['boot'] and
                    row['sequence'] % 128 == offset // RECORD.size and
                    row['sequence_complement'] == row['sequence'] ^ 0xffffffff):
                del row['magic'], row['sequence_complement']
                records.append(row)
                continue
        invalid.append(offset)
    records.sort(key=lambda r: (r['boot'], r['sequence']))
    return dict(records=records, invalid_offsets=invalid)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('journals', type=Path, nargs='+')
    for journal in parser.parse_args().journals:
        print(json.dumps(dict(file=str(journal), **decode(journal.read_bytes())), indent=2))
