"""Illustrations for v0.40's settings that the LookLab preview doesn't model yet: the Border, our Film Grain and Grain
Size, and the three crop shapes.
- Border: the firmware's own widths and colours (research/border/model.py `widths`), on meadow cut to 3:2.
- Grain: the grain tile's recipe (research/grain/tile_model.py: Y and Cb / Cr noise as w x w box sums of uniform bytes,
  the chroma at half size, scaled to the same strength for every size; w = Grain Size 1..3) with the code block's
  strength-5 gains (tools/test/emu_test.py GRAIN_GAINS), added over the camera's grain curve (research/grain/model.py
  G: none in deep shadows). The camera's own blend is not modelled: an illustration, a 100% crop of portrait.
- Crops: the sample cut to 4:3 (the sensor's shape); the page lights the XPan, 21:9 and 5:4 parts (centred).
usage: illus40.py SAMPLES_DIR OUT_DIR"""
import importlib.util, os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter
H = os.path.dirname(os.path.abspath(__file__))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, os.path.join(H, path))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


grain_model = load('grain_model', '../grain/model.py')      # G, the camera's grain curve
border_model = load('border_model', '../border/model.py')   # widths
src, out = sys.argv[1], sys.argv[2]


def sized(name, w):
    im = Image.open(f'{src}/{name}.jpg').convert('RGB')
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


# Border +3 (white) and -3 (black), at 3:2 (the border sits inside the photo at every ratio)
im = sized('meadow', 1000); h32 = round(1000 * 2 / 3); im = im.crop((0, (im.height - h32) // 2, 1000, (im.height - h32) // 2 + h32))
for level, name in ((3, 'border-a'), (-3, 'border-b')):
    a = np.asarray(im).copy(); B, Bp = border_model.widths(a.shape[1], a.shape[0], level)
    c = 255 if level > 0 else 0
    a[:B] = c; a[-B:] = c; a[:, :2 * Bp] = c; a[:, -2 * Bp:] = c
    Image.fromarray(a).save(f'{out}/{name}.jpg', quality=88)

# Grain: Off / strength 5 Medium (Film Grain), Fine / Coarse at strength 5 (Grain Size)
crop = Image.open(f'{src}/portrait.jpg').convert('RGB').crop((700, 250, 1600, 850))
ycc = np.asarray(crop.convert('YCbCr')).astype(np.float64)
rng = np.random.default_rng(40)
GY, GC = 1536 / 1024, 672 / 1024                             # strength 5: texture Y gain, Cb / Cr gain
LOOK = 0.45                                                  # the camera's blend, roughly (its photos: Cb high-pass 5..8)


def noise(h, w, size):
    u = rng.integers(0, 256, (h, w)).astype(np.float64)
    return (uniform_filter(u, size, mode='wrap') - 127.5) * (16 * size / 73.9)   # sd 16 at every size, as the tile


def grain(size):
    h, w = ycc.shape[:2]; cs = (size + 1) // 2
    ny = noise(h, w, size)
    nc = [np.kron(noise(h // 2, w // 2, cs), np.ones((2, 2))) for _ in range(2)]
    y = ycc[..., 0]; g = grain_model.G[np.clip(y, 0, 255).astype(int)] / 255 * (1 - np.clip((y - 235) / 20, 0, 1))
    o = ycc.copy()
    o[..., 0] = y + LOOK * GY * ny * g
    o[..., 1] += LOOK * GC * nc[0] * g; o[..., 2] += LOOK * GC * nc[1] * g
    o = np.clip(o, 0, 255).round().astype(np.uint8)
    return Image.merge('YCbCr', [Image.fromarray(o[..., k]) for k in range(3)]).convert('RGB')


crop.save(f'{out}/grain-a.jpg', quality=92)
grain(2).save(f'{out}/grain-b.jpg', quality=92)
grain(1).save(f'{out}/grain-size-a.jpg', quality=92)
grain(3).save(f'{out}/grain-size-b.jpg', quality=92)

# Crop shapes: the sample cut to 4:3, the sensor's shape (5184 x 3888); the page lights the XPan (5184 x 1920), 21:9
# (5184 x 2224) and 5:4 (4864 x 3888) parts of it, centred, as the camera saves them
im = Image.open(f'{src}/ocean.jpg').convert('RGB')
w43 = round(im.height * 4 / 3); im = im.crop(((im.width - w43) // 2, 0, (im.width - w43) // 2 + w43, im.height))
im.resize((1296, 972), Image.LANCZOS).save(f'{out}/crop-full.jpg', quality=86)
print('ok')
