"""Generate the two packed tables used by the MN10300 still-image pass."""
import argparse
import hashlib
import io
from pathlib import Path
import subprocess
import tempfile
import urllib.request
import zipfile
import numpy as np

here = Path(__file__).resolve().parent
revision = 'b38582e175208989cdf3b93f777408d689ff086f'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archive', type=Path, help='use a previously downloaded reference source ZIP')
parser.add_argument('--out', type=Path, default=here.parents[1] / 'webapp/src/data/sunlit.lut')
args = parser.parse_args()


def measure():
    if args.archive:
        source = args.archive.read_bytes()
    else:
        url = f'https://codeload.github.com/CharTyr/ZATO-photo/zip/{revision}'
        with urllib.request.urlopen(url, timeout=90) as response:
            source = response.read()
    if hashlib.sha256(source).hexdigest() != '6750c59f4e73e5de326d4bc8091acb1c49c7e612016e699ce024013f87f31bb6':
        raise ValueError('Unexpected reference source archive')
    with tempfile.TemporaryDirectory() as directory, zipfile.ZipFile(io.BytesIO(source)) as archive:
        root = Path(directory)
        for name in ('colorSpace', 'curves', 'gradients', 'palettes', 'prng', 'presets', 'pipeline'):
            filename = name + '.ts'
            (root / filename).write_bytes(archive.read(f'ZATO-photo-{revision}/src/engine/{filename}'))
        output = root / 'ramp.rgba'
        subprocess.run(['node', str(here / 'measure-ramp.mjs'), str(root), str(output)], check=True)
        return np.frombuffer(output.read_bytes(), np.uint8).reshape(256, 256, 4)[:, :, :3]


cb, cr, y = np.indices((16, 16, 64), dtype=np.int32)
cb, cr, y = cb*16-120, cr*16-120, y*4+2
r = np.clip(y + ((359*cr+128) >> 8), 0, 255)
g = np.clip(y - ((88*cb+183*cr+128) >> 8), 0, 255)
b = np.clip(y + ((454*cb+128) >> 8), 0, 255)
lightness = (np.maximum.reduce([r,g,b]) + np.minimum.reduce([r,g,b]) + 1) >> 1
rng = np.random.default_rng(1984)
ramp = measure()
rgb = ramp[rng.integers(256, size=(64,256)), np.arange(256)] + rng.normal(0, 7.6, (64,256,3))
r,g,b = np.rint(np.rint(np.clip(rgb,0,255)*9/255)*255/9).astype(int).transpose(2,0,1)
y = (77*r+150*g+29*b+128) >> 8
cb = 128 + ((-43*r-85*g+128*b+128) >> 8)
cr = 128 + ((128*r-107*g-21*b+128) >> 8)
packed = lightness.astype("u1").tobytes() + np.stack([y,cb,y,cr],axis=-1).clip(0,255).astype("u1").tobytes()
if hashlib.sha256(packed).hexdigest() != '263d71c77495beafe2078d3b59e427ad956ed201bd2c2f7cf7d4c503c1ac7702':
    raise ValueError('Generated lookup differs from 0.1.1-SL')
args.out.write_bytes(packed)
