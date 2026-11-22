#!/usr/bin/env python3
"""Convert a transparent PNG image into an OM-3 Cyber Card (CARD1.BIN .. CARD5.BIN).

Format ('OM3P' v1):
  +0  u32 magic = b'OM3P' (0x50334d4f)
  +4  u16 version = 1
  +6  u16 width   (even, 16..512)
  +8  u16 height  (16..512)
  +10 u16 flags   = 0
  +12 u32 reserved = 0
  +16 payload: height rows x width pixels x 4 bytes [Y, Cb, Cr, A] (BT.601 full-range)

Usage:
  python3 tools/make_card.py input.png CARD1.BIN [--max-size 256]
"""
import argparse, struct, sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install pillow")


def rgb_to_ycbcr(r, g, b):
    y  = int(round( 0.299 * r + 0.587 * g + 0.114 * b))
    cb = int(round(-0.168736 * r - 0.331264 * g + 0.5 * b + 128.0))
    cr = int(round( 0.5 * r - 0.418688 * g - 0.081312 * b + 128.0))
    return max(0, min(255, y)), max(0, min(255, cb)), max(0, min(255, cr))


MAX_PIX_BYTES = 98304  # 96 KiB static RAM buffer on camera (up to 24,576 px, e.g. 144x168)


def convert(src: Path, dst: Path, max_size: int = 160, trim_top: bool = True):
    im = Image.open(src).convert("RGBA")
    # Optionally trim fully transparent top/left/right margins while keeping bottom flush!
    if trim_top:
        bbox = im.getbbox()
        if bbox:
            l, t, r, b = bbox
            im = im.crop((l, t, r, b))
    w, h = im.size
    if w > max_size or h > max_size:
        scale = min(max_size / w, max_size / h)
        w = max(16, int(round(w * scale)))
        h = max(16, int(round(h * scale)))
    # Ensure width is even and total payload <= MAX_PIX_BYTES (96 KiB)
    w = min(512, max(16, (w + 1) & ~1))
    h = min(512, max(16, h))
    while w * h * 4 > MAX_PIX_BYTES:
        scale = ((MAX_PIX_BYTES / 4.0) / (w * h)) ** 0.5 * 0.98
        w = max(16, int(w * scale) & ~1)
        h = max(16, int(h * scale))
    if im.size != (w, h):
        resample = getattr(Image, "Resampling", Image).LANCZOS
        im = im.resize((w, h), resample)

    px = im.tobytes()
    out = bytearray(16 + w * h * 4)
    struct.pack_into("<4sHHHHI", out, 0, b"OM3P", 1, w, h, 0, 0)
    o = 16
    for i in range(0, len(px), 4):
        r, g, b, a = px[i], px[i + 1], px[i + 2], px[i + 3]
        if a == 0:
            out[o:o + 4] = b"\x00\x80\x80\x00"
        else:
            y, cb, cr = rgb_to_ycbcr(r, g, b)
            out[o] = y
            out[o + 1] = cb
            out[o + 2] = cr
            out[o + 3] = a
        o += 4
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(out)
    print(f"Wrote {dst}: {w}x{h} ({len(out)} bytes)")


def main():
    ap = argparse.ArgumentParser(description="Convert transparent PNG to OM-3 Cyber Card (.BIN)")
    ap.add_argument("input", type=Path)
    ap.add_argument("output", type=Path)
    ap.add_argument("--max-size", type=int, default=160, help="Max width/height (default 160; payload auto-capped to 96 KiB)")
    ap.add_argument("--no-trim", action="store_true", help="Do not trim transparent margins")
    args = ap.parse_args()
    convert(args.input, args.output, max_size=args.max_size, trim_top=not args.no_trim)


if __name__ == "__main__":
    main()
