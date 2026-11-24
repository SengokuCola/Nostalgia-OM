"""Render four independent film-response studies from the repo's sRGB JPEGs.

python research/film-grading/trait_study.py out-local/film-traits
Needs Pillow, NumPy and SciPy. All profiles are illustrative, not measured stocks.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter


SAMPLES = Path(__file__).resolve().parents[2] / "webapp/public/samples"
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def decode(image):
    x = np.asarray(image, dtype=np.float32) / 255
    return np.where(x <= .04045, x / 12.92, ((x + .055) / 1.055) ** 2.4)


def encode(x):
    x = np.clip(x, 0, 1)
    v = np.where(x <= .0031308, 12.92 * x, 1.055 * x ** (1 / 2.4) - .055)
    return Image.fromarray(np.rint(v * 255).astype(np.uint8))


def exposure(x, ev, broad, cheek):
    # Softly bounded straight section in log exposure, per colour record.
    stops = np.log2(np.maximum(x, 1e-6) / .18) + ev
    toe, shoulder, slope = (-4.6, 3.8, .96) if broad else (-3.2, 2.4, 1.12)
    lo = toe + np.array([-.20, 0, .18])
    hi = shoulder + np.array([.20, 0, -.16])
    def softplus(t):
        return np.logaddexp(0, 1.6 * t) / 1.6
    density = lo + softplus(stops - lo) - softplus(stops - hi)
    rendered = .18 * np.exp2(density * slope)
    # Equal print brightness at the same cheek patch in every exposure.
    return rendered * (np.mean(x[cheek] @ LUMA) / np.mean(rendered[cheek] @ LUMA))


def lighting(x, illumination, balance):
    # Known, synthetic RGB illuminants. Hold neutral-patch linear luma fixed.
    gains = illumination * balance
    return x * gains / (gains @ LUMA)[..., None]


def recovered_grain(x, ev):
    # After compensating exposure, a weaker record carries less colour and
    # stronger density fluctuations. The noise field stays fixed across EVs.
    recorded = (x @ LUMA) * 2.0 ** ev
    weakness = .095 / (.095 + recorded)
    rng = np.random.default_rng(800)
    def clumps(sigma):
        n = gaussian_filter(rng.standard_normal(recorded.shape), sigma)
        return (n - n.mean()) / n.std()
    mono = clumps(.62)
    colour = np.stack([clumps(.95) for _ in range(3)], axis=-1)
    colour -= (colour @ LUMA)[..., None]
    y = (x @ LUMA)[..., None]
    base = y + (x - y) * (1 - .36 * weakness[..., None] ** 1.5)
    # Multiplicative grain in linear light, normalised for mean exposure.
    sigma = (.018 + .28 * weakness ** 1.35)[..., None]
    return base * np.exp(sigma * (mono[..., None] + .18 * colour) - .5 * sigma ** 2)


def texture(x, strength):
    # Work on perceived lightness. Reduce fine low-contrast texture, preserve
    # hard contours and restore a little contrast on the 3-pixel scale.
    y = np.cbrt(x @ LUMA)
    fine_base = gaussian_filter(y, 1.2)
    middle = fine_base - gaussian_filter(y, 3.5)
    fine = y - fine_base
    weight = np.exp(-(fine / .066) ** 2)
    target = np.maximum(y + strength * (.13 * middle - .86 * fine * weight), 0)
    return x * ((target + 1e-6) / (y + 1e-6))[..., None] ** 3


def sheet(path, rows, cell):
    w,h = cell
    font = ImageFont.load_default(size=16)
    board = Image.new("RGB", ((w+8)*len(rows[0])+8,(h+40)*len(rows)+8), "#222424")
    draw = ImageDraw.Draw(board)
    for r,row in enumerate(rows):
        for c,(label,img) in enumerate(row):
            left,top = 8+c*(w+8),8+r*(h+40)
            draw.text((left,top), label, font=font, fill="#f3efe8")
            board.paste(img.resize(cell, Image.Resampling.LANCZOS),(left,top+25))
    board.save(path)


def run(out):
    out.mkdir(parents=True, exist_ok=True)
    with Image.open(SAMPLES / "portrait.jpg") as photo:
        face = decode(photo.crop((830,180,1650,1000)).resize((440,440), Image.Resampling.LANCZOS))
        detail = decode(photo.crop((1040,450,1380,710)))
    cheek = np.s_[216:227, 218:229]
    rows = []
    for broad,name in [(True,"Soft"),(False,"Contrast")]:
        row = []
        for ev in range(-2,3):
            image = exposure(face,ev,broad,cheek)
            assert abs(np.mean(np.clip(image[cheek],0,1) @ LUMA) - np.mean(face[cheek] @ LUMA)) < .005
            row.append((f"{name}  {ev:+d} EV",encode(image)))
        rows.append(row)
    sheet(out/"exposure.png",rows,(228,228))

    neutral = np.ones(3)
    warm = np.array([1.50,.92,.50])
    ramp = np.linspace(0,1,face.shape[1])[None,:,None]
    mixed = warm*(1-ramp) + neutral*ramp
    rows = []
    for label,balance in [("Day",neutral),("Tungsten",1/warm)]:
        rows.append([(f"{label} / {name}",encode(lighting(face,light,balance)))
                     for name,light in [("daylight",neutral),("warm",warm),("mixed",mixed)]])
    sheet(out/"lighting.png",rows,(280,280))
    assert np.allclose(lighting(face,warm,1/warm),face)
    with Image.open(SAMPLES / "brasserie.jpg") as photo:
        street = decode(photo.crop((70,10,970,550)))
    sheet(out/"lighting-street.png",[[
        ("Day balance",encode(street)),
        ("Tungsten balance",encode(lighting(street,neutral,1/warm)))
    ]],(500,300))

    row = [("Source / 1:1",encode(detail))]
    for ev in [0,-1,-2]:
        result = recovered_grain(detail,ev)
        row.append((f"{ev:+d} EV / compensated",encode(result)))
    sheet(out/"grain.png",[row],(340,260))
    with Image.open(SAMPLES / "brasserie.jpg") as photo:
        letters = decode(photo.crop((100,55,440,315)))
    rows = []
    for x in (detail,letters):
        rows.append([(label,encode(texture(x,k))) for label,k in
                     [("Source / 1:1",0),("Soft detail / 1:1",.7),("Stronger / 1:1",1.2)]])
    sheet(out/"texture.png",rows,(340,260))
    assert np.array_equal(np.array(encode(texture(detail,0))),np.array(encode(detail)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output",type=Path)
    run(parser.parse_args().output)
