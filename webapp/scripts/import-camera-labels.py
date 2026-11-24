"""Import native artwork from a built firmware directory's fb_art.inc."""
import base64
import json
import re
import struct
import sys
from pathlib import Path


def read_table(source, label):
    match = re.search(rf"^{label}:\r?\n((?:[ \t]+\.byte [^\n]+\n)+)", source, re.M)
    if not match:
        raise ValueError(f"Missing firmware table: {label}")
    return bytes(int(value, 16) for value in re.findall(r"0x([\da-fA-F]{2})", match[1]))


def artwork(source):
    names = read_table(source, "fb_names")
    tiles = read_table(source, "fb_tags")
    palettes = read_table(source, "fb_palettes")
    offsets = [offset for (offset,) in struct.iter_unpack("<H", read_table(source, "fb_tag_offsets"))]
    if len(names) != len(offsets) * 16 or len(palettes) != len(offsets) * 64:
        raise ValueError("Inconsistent film gate tables")
    ends = offsets[1:] + [len(tiles)]
    labels = {}
    for i, (start, end) in enumerate(zip(offsets, ends)):
        name = names[i*16:i*16+16].split(b"\0")[0].decode("ascii")
        pixels = tiles[start:end]
        if len(pixels) not in (1600, 3200):
            raise ValueError(f"Expected a packed 80 px tile for {name!r}")
        labels[name] = {
            "pixels": base64.b64encode(pixels).decode("ascii"),
            "palette": base64.b64encode(palettes[i*64:i*64+64]).decode("ascii"),
        }
    return labels


if __name__ == "__main__":
    output = Path(__file__).resolve().parents[1] / "src/data/camera-labels.json"
    labels = artwork(Path(sys.argv[1]).read_text(encoding="utf-8"))
    output.write_text(json.dumps(labels, indent=2) + "\n", encoding="utf-8")
