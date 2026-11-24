"""Desktop OM-3 still-buffer model. Requires Pillow, NumPy and adjacent sunlit.npz."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


def pairs_422(image):
    """Approximate full-range JPEG YCbYCr by sharing each pair's chroma."""
    values = np.array(image.convert("YCbCr"))
    end = values.shape[1] // 2 * 2
    left = values[:, :end:2, 1:]
    right = values[:, 1:end:2, 1:]
    shared = (left.astype(np.uint16) + right + 1) // 2
    left[:] = shared
    right[:] = shared
    return Image.frombytes("YCbCr", image.size, values.tobytes())


def process(photo, output, *, full_frame=False, quality=92):
    with Image.open(photo) as source:
        frame = pairs_422(ImageOps.exif_transpose(source).convert("RGB"))
    width = 978
    height = max(1, round(width * frame.height / frame.width)) if full_frame else 404
    # Resize the developed frame before calculating lightness, so texture size is stable.
    grid = ImageOps.fit(frame, (width, height), method=Image.Resampling.LANCZOS)
    rgb = np.asarray(grid.convert("RGB")).astype(np.uint16)
    lightness = (rgb.max(axis=2) + rgb.min(axis=2) + 1) >> 1
    rng = np.random.default_rng(21760)
    # Model random-byte table lookups. A device implementation can stream rows.
    with np.load(Path(__file__).with_name("sunlit.npz")) as lut:
        slot = rng.integers(256, size=lightness.shape, dtype=np.uint8)
        base = lut["colors"][lut["indices"][slot, lightness]].astype(np.int16)
    noise_rng = np.random.default_rng(1984)
    noise_table = np.rint(noise_rng.normal(0, 7.6, 4096)).astype(np.int16)
    noisy = np.clip(base + noise_table[noise_rng.integers(4096, size=base.shape)], 0, 255)
    levels = ((noisy * 9 + 127) // 255 * 255 + 4) // 9
    result = Image.fromarray(levels.astype(np.uint8))
    if full_frame:
        result = result.resize(frame.size, Image.Resampling.NEAREST)
    pairs_422(result).save(output, quality=quality, subsampling=1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("photo", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--full-frame", action="store_true")
    args = parser.parse_args()
    process(args.photo, args.output, full_frame=args.full_frame)
