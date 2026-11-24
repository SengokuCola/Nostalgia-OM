"""Offline 800T-style halation study. CLI input is an sRGB image.

Example: python research/halation/film800t.py webapp/public/samples/brasserie.jpg glow.png
Requires NumPy, Pillow and SciPy. Strength and spread are aesthetic controls,
not measurements of 800T. A rendered JPEG cannot recover clipped lamp radiance.
"""
import argparse
import math

import numpy as np
from PIL import Image, ImageOps
from scipy.ndimage import gaussian_filter


def halation(rgb, strength=1.0, spread=1.0):
    """Apply the effect to an H×W×3 uint8 sRGB image; return a new uint8 array."""
    if rgb.ndim != 3 or rgb.shape[2] != 3 or rgb.dtype != np.uint8 or not rgb.size:
        raise ValueError("Expected a nonempty H×W×3 uint8 sRGB image")
    if not math.isfinite(strength) or not 0 <= strength <= 4:
        raise ValueError("strength must be between 0 and 4")
    if not math.isfinite(spread) or not 0 < spread <= 4:
        raise ValueError("spread must be positive and at most 4")
    if strength == 0:
        return rgb.copy()

    codes = np.arange(256, dtype=np.float32) / 255
    linear = np.where(codes <= 0.04045, codes / 12.92, ((codes + 0.055) / 1.055) ** 2.4)
    red, green, blue = (linear[rgb[..., i]] for i in range(3))
    # Approximate the spectral bias of returning light using display primaries.
    # A bright pure-blue sign contributes very little to the red record.
    signal = 0.84 * red + 0.14 * green + 0.02 * blue
    # Smooth onset above 0.52 linear, up to unit energy at display white.
    excess = np.maximum((signal - 0.52) / 0.48, 0)
    source = excess * excess
    if not source.any():
        return rgb.copy()

    unit = math.hypot(*rgb.shape[:2]) * spread
    def spill(fraction):
        blurred = gaussian_filter(source, sigma=unit * fraction, mode="nearest")
        # Isolate light reaching darker neighbours. A uniform field or the
        # centre of a clipped white lamp should keep its original colour.
        return np.maximum(blurred - source, 0)

    near = spill(0.0019)
    far = spill(0.0075)
    # Short-range orange/red response, plus a weaker red tail. Mix in linear
    # light, with no frame-wide coverage gate or exposure adjustment.
    red += strength * (0.28 * near + 0.085 * far)
    green += strength * 0.021 * near

    result = rgb.copy()
    for channel, radiance in enumerate((red, green)):
        value = np.minimum(radiance, 1)
        encoded = np.where(value <= 0.0031308, 12.92 * value, 1.055 * value ** (1 / 2.4) - 0.055)
        result[..., channel] = np.rint(255 * encoded).astype(np.uint8)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("output")
    parser.add_argument("--strength", type=float, default=1.0)
    parser.add_argument("--spread", type=float, default=1.0)
    args = parser.parse_args()
    with Image.open(args.source) as photo:
        rgb = np.asarray(ImageOps.exif_transpose(photo).convert("RGB"))
    Image.fromarray(halation(rgb, args.strength, args.spread)).save(args.output)
