"""Exact integer model of our colour grain tile (firmware/src/editor.s `tg_fill`, better grain g1..g3).

The tile: 1536 x 1536 YCbYCr 4:2:2 (3072 bytes a row), Y = 48 + noise, Cb / Cr = 128 + noise, each noise a w x w box
sum of uniform random bytes (w = the Grain Size 1..3, Cb / Cr (w + 1) // 2 at half width and half height), seamless in
both directions. Row y + 768 = row y.

- `full_tile(w, sb)`: g1..g2c, and g3 when the tile is across a 128 MB window edge: all 768 rows by the box filter.
- `fast_tile(w, sb)`: g3 (2026-11-17): a band of 128 rows by the box filter (period 128), then rows 128..767 from 20
  strips of 32 band rows each, turned round by a random sx and crossfaded over their first B = 2 w rows from the strip
  before (cos / sin weights, so the grain keeps its strength); the last strip is crossfaded into rows 0..B - 1.

`sb` is the tile's seed (`tg_sb`, read back from the camera code). Results are uint8 arrays (1536, 3072).
"""
import numpy as np

M32 = 0xffffffff
KT = [14189, 7094, 4730, 3547, 2838]          # tg_kt: 16 / (73.9 w) x 65536
BAND, STRIP, STRIPS, SY_CHOICES = 128, 32, 20, 44
WT = {1: [(222, 128), (128, 222)],             # tg_wt: round(256 cos / sin ((i + 1) 90 / (B + 1) degrees)), B = 2 w
      2: [(243, 79), (207, 150), (150, 207), (79, 243)],
      3: [(250, 57), (231, 111), (200, 160), (160, 200), (111, 231), (57, 250)],
      4: [(252, 44), (241, 88), (222, 128), (196, 165), (165, 196), (128, 222), (88, 241), (44, 252)],
      5: [(253, 36), (246, 72), (233, 106), (215, 138), (193, 168), (168, 193), (138, 215), (106, 233), (72, 246),
          (36, 253)]}
MID = np.tile(np.array([48, 128, 48, 128], np.int64), 768)


def seed(row, ch, sb):
    """tg_seed: row, channel (0 Y, 1 Cb, 2 Cr, 3 g3's strips) -> a 32-bit stream seed, never 0."""
    d0 = ((row ^ (ch << 28)) * 0x9e3779b9) & M32
    d0 ^= sb
    d0 ^= d0 >> 16
    d0 = (d0 * 0x7feb352d) & M32
    d0 ^= d0 >> 15
    d0 = (d0 * 0x846ca68b) & M32
    d0 ^= d0 >> 16
    return d0 or 1


def rowbytes(s, n):
    """tg_col's bytes: xorshift32 (13, 17, 5) words, low byte first."""
    out = np.empty(n, np.int64)
    x = s
    for g in range(n // 4):
        x ^= (x << 13) & M32
        x ^= x >> 17
        x ^= (x << 5) & M32
        out[4 * g:4 * g + 4] = (x & 255, (x >> 8) & 255, (x >> 16) & 255, x >> 24)
    return out


def plane(n, period, w, ch, sb, base):
    """One plane, `period` rows (row period = row 0): column sums of w rows, a running sum of w along the row."""
    k = KT[w - 1]
    add = (base << 16) + 32768 - ((255 * w * w * k) >> 1)
    rows = [rowbytes(seed(j, ch, sb), n) for j in range(period)]
    out = np.empty((period, n), np.int64)
    c = sum(rows[j % period] for j in range(w))
    for y in range(period):
        cs = np.concatenate([[0], np.cumsum(np.concatenate([c, c[:w]]))])
        out[y] = np.clip((k * (cs[w:w + n] - cs[0:n]) + add) >> 16, 0, 255)
        c = c + rows[(y + w) % period] - rows[y]
    return out


def rows(w, sb, period):
    """`period` rows of the tile by the box filter, as bytes (period, 3072)."""
    wc = (w + 1) >> 1
    b = np.empty((period, 3072), np.int64)
    b[:, 0::2] = plane(1536, period, w, 0, sb, 48)
    b[:, 1::4] = np.repeat(plane(768, period // 2, wc, 1, sb, 128), 2, axis=0)
    b[:, 3::4] = np.repeat(plane(768, period // 2, wc, 2, sb, 128), 2, axis=0)
    return b


def full_tile(w, sb):
    t = rows(w, sb, 768).astype(np.uint8)
    return np.vstack([t, t])


def blend(p, n, c, s):
    """tg_bl: clamp(mid + ((c (p - mid) + s (n - mid) + 128) >> 8)), mid 48 (Y) / 128 (Cb, Cr)."""
    return np.clip(MID + ((c * (p - MID) + s * (n - MID) + 128) >> 8), 0, 255)


def strip(k, sb):
    """Strip k's first band row sy (even, 0..86) and its turn sx (bytes, a multiple of 4)."""
    h = seed(k, 3, sb)
    return 2 * (((h & 0xffff) * SY_CHOICES) >> 16), 4 * (((h >> 16) * 768) >> 16)


def fast_tile(w, sb):
    bd = rows(w, sb, BAND)
    t = np.zeros((768, 3072), np.int64)
    t[:BAND] = bd
    turn = lambda row, sx: np.roll(row, -sx)
    prow, psx = 0, 0                           # the band going on: its row 128 is row 0
    for k in range(STRIPS):
        sy, sx = strip(k, sb)
        r0 = BAND + STRIP * k
        for i in range(STRIP):
            t[r0 + i] = turn(bd[sy + i], sx)
        for i, (c, s) in enumerate(WT[w]):
            t[r0 + i] = blend(turn(bd[prow + i], psx), t[r0 + i], c, s)
        prow, psx = sy + STRIP, sx
    for i, (c, s) in enumerate(WT[w]):         # the tile's wrap: row 767 -> row 0
        t[i] = blend(turn(bd[prow + i], psx), t[i], c, s)
    t = t.astype(np.uint8)
    return np.vstack([t, t])
