#!/usr/bin/env python3
"""Gentler Shading s1 (#22, 2026-11-18): the vignette's mask and the exact model of the firmware's pass (editor.s
`vg_run`, via vg_tab.inc), shared by the build and the om-emu check (research/shading/emu_check.py).

Owner (2026-11-18): "the +2 and -2 options are fine, but they should be at the max end. aka, it gets too strong, too
quick." So Shading -5 / +5 is about the camera's own -2 / +2 and the levels between are even steps of one mask:
    m(level, r) = |level| / 5 x M5(r)
r = the distance from the photo's centre / the half-diagonal (a circle; the corners are r = 1). Darker (-): every pixel
is blended toward black, Y' = Y (1 - m), the colour toward grey by the same amount; lighter (+): toward white,
Y' = Y + m (255 - Y). That is the camera's own Shading blend (research/NOTES.md "Gentler Shading", probes s1 / s2:
the corners are faded linearly toward a target colour), only with our own strength.

M5 (analysis, from the camera's s2 photos, research/NOTES.md): the camera's -1 / -3 keep Y / centre about 0.75 / 0.68
at r 0.45..0.6, 0.28 / 0.22 at r 0.7..0.8 and 0.082 / 0.045 in the corners, so its -2 is about m 0.28 at r 0.525,
0.75 at r 0.75 and 0.94 at r 1 (+5's corner on a plain wall, s1: m 0.90). Below r 0.3 the camera's mask is about 0.
The curve is a monotone cubic through those points; its numbers are ours.

The model, in integers (bit for bit what vg_run does):
    X = 4 p + 2 - W, Y = 2 y + 1 - H (pair p's centre and row y, in half pixels from the photo's centre), D = W^2 + H^2
    C = 2^41 // D, idx = min(512, ((X^2 + Y^2) C) >> 32), so idx / 512 ~ r^2
    g = 256 - (((|level| M[idx] + 2) 13108) >> 16)          (= 256 - (|level| M[idx] + 2) // 5 for these sizes)
    darker:  Y' = (Y g + 128) >> 8
    lighter: Y' = 255 - (((255 - Y) g + 128) >> 8)
    Cb', Cr' = (C g + 32896 - 128 g) >> 8                   (= 128 + (C - 128) g / 256, rounded)
The buffer is the camera's YCbYCr 4:2:2 (byte 0 Y0, 1 Cb, 2 Y1, 3 Cr), rows `pitch` bytes apart; a pair shares its
gain. At any ratio but 4:3 the centred part the camera keeps (crop.s cr_bdc, as the Border)."""
import math

POINTS = ((0.0, 0.0), (0.30, 0.02), (0.525, 0.28), (0.75, 0.75), (1.0, 0.94))   # (r, m) of the strongest level
N = 512                            # the table's steps over r^2 = 0 .. 1


def _pchip(points):
    """Fritsch-Carlson monotone cubic through points: -> m(r)."""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    t = [0.0] * n
    t[0] = 0.0                     # flat at the centre
    t[-1] = d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            t[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            t[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def m(r):
        r = min(max(r, xs[0]), xs[-1])
        i = min(n - 2, max(0, next(k for k in range(n - 1) if r <= xs[k + 1])))
        s = (r - xs[i]) / h[i]
        h00, h10 = 2 * s ** 3 - 3 * s ** 2 + 1, s ** 3 - 2 * s ** 2 + s
        h01, h11 = -2 * s ** 3 + 3 * s ** 2, s ** 3 - s ** 2
        return h00 * ys[i] + h10 * h[i] * t[i] + h01 * ys[i + 1] + h11 * h[i] * t[i + 1]
    return m


def table():
    """M[idx] = round(256 m5(sqrt(idx / N))), idx = 0 .. N (u8: the strongest mask stays below 1)."""
    m = _pchip(POINTS)
    t = [int(math.floor(256 * m(math.sqrt(i / N)) + 0.5)) for i in range(N + 1)]
    assert all(0 <= v <= 255 for v in t) and all(a <= b for a, b in zip(t, t[1:])), 'monotone, 8 bits'
    return t


M = table()


def gain(level, idx):
    """Q8 gain of the pixel's distance to the target (256 = unchanged)."""
    return 256 - (((abs(level) * M[idx] + 2) * 13108) >> 16)


def check():
    """The conditions the firmware's shortcuts rely on (editor.s vg_run)."""
    for lv in range(1, 6):
        for i in range(N + 1):
            assert gain(lv, i) == 256 - (lv * M[i] + 2) // 5, 'the multiply equals the division'
            assert 0 <= gain(lv, i) <= 256
        assert all(gain(lv, i) >= gain(lv, i + 1) for i in range(N)), 'g only falls along a row from its centre'
    for g in (0, 1, 128, 255, 256):     # no carry between the two 16-bit lanes of one product
        assert 255 * g + 128 < 65536 and 255 * g + 32896 - 128 * g < 65536 and 32896 - 128 * g >= 0


def crop_area(W, H, crop):
    """(x0 pairs, y0 rows, Wc, Hc): the part of the 4:3 buffer the camera keeps at Image Aspect `crop` (crop.s cr_bdc,
    shared with the Border): research/border/model.py crop_area is its exact model."""
    import importlib.util, pathlib
    spec = importlib.util.spec_from_file_location(
        'border_model', pathlib.Path(__file__).resolve().parents[1] / 'research' / 'border' / 'model.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.crop_area(W, H, crop)


def ok(W, H, pitch, level):
    return 1 <= abs(level) <= 5 and 64 <= W <= 8192 and W % 4 == 0 and 64 <= H <= 8192 and pitch >= 2 * W


def vignette(buf, W, H, pitch, level, crop=0):
    """buf (numpy uint8, H x pitch bytes) changed in place as vg_run does; -> 'on' or 'off'."""
    import numpy as np
    if not ok(W, H, pitch, level):
        return 'off'
    x0, y0, W, H = crop_area(W, H, crop)
    P = W // 2
    C = (1 << 41) // (W * W + H * H)
    X = 4 * np.arange(P, dtype=np.int64) + 2 - W
    Y = 2 * np.arange(H, dtype=np.int64) + 1 - H
    S = (X * X)[None, :] + (Y * Y)[:, None]
    idx = np.minimum(N, (S * C) >> 32)
    Mt = np.array(M, np.int64)
    g = 256 - (((abs(level) * Mt[idx] + 2) * 13108) >> 16)
    rows = buf.reshape(-1, pitch)[y0:y0 + H]
    px = rows[:, 4 * x0:4 * (x0 + P)].reshape(H, P, 4).astype(np.int64)
    for b in (0, 2):
        if level < 0:
            px[:, :, b] = (px[:, :, b] * g + 128) >> 8
        else:
            px[:, :, b] = 255 - (((255 - px[:, :, b]) * g + 128) >> 8)
    for b in (1, 3):
        px[:, :, b] = (px[:, :, b] * g + 32896 - 128 * g) >> 8
    rows[:, 4 * x0:4 * (x0 + P)] = px.reshape(H, 4 * P).astype(np.uint8)
    return 'on'


def inc():
    """vg_tab.inc for editor.s: the mask table (u8, N + 1 entries)."""
    check()
    rows = [f' .set VG_N, {N}', 'vg_m:']
    for i in range(0, N + 1, 32):
        rows.append(' .byte ' + ', '.join(str(v) for v in M[i:i + 32]))
    rows.append(' .balign 4')
    return '\n'.join(rows) + '\n'


if __name__ == '__main__':
    check()
    print('mask M5 by r:', ', '.join(f'{r:.2f} {M[min(N, round(r * r * N))] / 256:.3f}'
                                    for r in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0)))
    for lv in range(1, 6):
        print(f'level {lv}: corner Y x {gain(lv, N) / 256:.2f} (darker) / centre-to-corner gain at r 0.75 '
              f'{gain(lv, round(0.5625 * N)) / 256:.2f}')
