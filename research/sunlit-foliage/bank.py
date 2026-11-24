"""Generate a separate emulator bank, changing only FILM 20 and the bank CRC."""
import argparse
import struct
import zlib
from pathlib import Path


def sunlit_bank(original):
    if len(original) != 1632 or original[:4] != b'OM3P' or struct.unpack_from('<I', original, 8)[0] != zlib.crc32(original[12:]):
        raise ValueError('Invalid LOOKS.BIN')
    result = bytearray(original)
    result[1248:1312] = bytes(64)
    result[1616:1632] = b'Sunlit Foliage'.ljust(16, b'\0')
    struct.pack_into('<I', result, 8, zlib.crc32(result[12:]))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    with args.output.open('xb') as output:
        output.write(sunlit_bank(args.baseline.read_bytes()))
