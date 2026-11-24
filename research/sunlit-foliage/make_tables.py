"""Generate the two packed tables used by the MN10300 still-image pass."""
from pathlib import Path
import numpy as np

here = Path(__file__).resolve().parent
target = here.parents[1] / "firmware/src/sunlit.lut"
cb, cr, y = np.indices((16, 16, 64), dtype=np.int32)
cb, cr, y = cb*16-120, cr*16-120, y*4+2
r = np.clip(y + ((359*cr+128) >> 8), 0, 255)
g = np.clip(y - ((88*cb+183*cr+128) >> 8), 0, 255)
b = np.clip(y + ((454*cb+128) >> 8), 0, 255)
lightness = (np.maximum.reduce([r,g,b]) + np.minimum.reduce([r,g,b]) + 1) >> 1
rng = np.random.default_rng(1984)
with np.load(here / "sunlit.npz") as lut:
    indices = lut["indices"][rng.integers(256, size=(64,256)), np.arange(256)]
    rgb = lut["colors"][indices] + rng.normal(0, 7.6, (64,256,3))
r,g,b = np.rint(np.rint(np.clip(rgb,0,255)*9/255)*255/9).astype(int).transpose(2,0,1)
y = (77*r+150*g+29*b+128) >> 8
cb = 128 + ((-43*r-85*g+128*b+128) >> 8)
cr = 128 + ((128*r-107*g-21*b+128) >> 8)
target.write_bytes(lightness.astype("u1").tobytes() + np.stack([y,cb,y,cr],axis=-1).clip(0,255).astype("u1").tobytes())
