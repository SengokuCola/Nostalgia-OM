#!/usr/bin/env python3
"""The exact model of the firmware's photo border (editor.s `bd_run`, the Border row 1..5; feature/image-borders).

A white border (Y 255, Cb = Cr = 128) painted over the photo's outer edge, the same width on all four sides:
B = (S T[level - 1]) >> 16 rows at the top and the bottom (at least 1), S = min(W, H); on the left and right whole
4:2:2 pairs, Bp = (B + 1) // 2 pairs (2 Bp pixels). The buffer is the camera's YCbYCr 4:2:2 (byte 0 Y0, 1 Cb, 2 Y1,
3 Cr), rows `pitch` bytes apart; the padding past 2 W bytes is left as it is. Level 0 or anything outside 1..5, or a
frame the firmware refuses (W not 64..8192 or not a multiple of 4, H < 64, pitch < 2 W): nothing changes.

    python3 research/border/model.py           # prints the border widths for the camera's photo sizes
"""
import numpy as np

T = (983, 1966, 2949, 3932, 4915)          # 1.5, 3, 4.5, 6, 7.5 % of the short side, in 1 / 65536
WORD = np.array([255, 128, 255, 128], np.uint8)


def widths(W, H, level):
    """(B rows, Bp pairs) for a W x H photo at level 1..5."""
    B = max(1, (min(W, H) * T[level - 1]) >> 16)
    return B, (B + 1) // 2


# crop.s cr_bdt, by Image Aspect id: (side: 1 rows from W, 2 sides from H), num, den, q, add -> ((X num + add) //
# (den << q)) << q. 2 3:2 / 3 16:9 up to 8, 4 1:1 down to 16, 9 3:4 nearest 16 (the camera's own photo sizes);
# 5 5:4, 6 XPan, 7 21:9 as crop round 7.
CROPS = {2: (1, 2, 3, 3, 23), 3: (1, 9, 16, 3, 127), 4: (2, 1, 1, 4, 0), 5: (2, 5, 4, 4, 32), 6: (1, 24, 65, 4, 520),
         7: (1, 9, 21, 4, 168), 9: (2, 3, 4, 4, 32)}


def crop_area(W, H, crop):
    """crop.s cr_bdc (crop round 7; every ratio 2026-11-18): at any Image Aspect but 4:3 the photo the camera keeps
    is a centred part of the 4:3 buffer: -> (x0 pairs, y0 rows, Wc, Hc); a buffer no larger: (0, 0, W, H)."""
    if crop not in CROPS:
        return 0, 0, W, H
    side, num, den, q, add = CROPS[crop]
    Xc = ((W if side == 1 else H) * num + add) // (den << q) << q
    if side == 1 and Xc < H:
        return 0, ((H - Xc) // 2) & ~1, W, Xc
    if side == 2 and Xc < W:
        return (W - Xc) // 4, 0, Xc, H
    return 0, 0, W, H


def ok(W, H, pitch, level):
    return 1 <= level <= 5 and 64 <= W <= 8192 and W % 4 == 0 and H >= 64 and pitch >= 2 * W


def border(buf, W, H, pitch, level, crop=0):
    """buf (uint8, H x pitch bytes) changed in place as bd_run does; returns 'on' or 'off'. crop: Image Aspect now."""
    if not ok(W, H, pitch, level):
        return 'off'
    x0, y0, W, H = crop_area(W, H, crop)
    B, Bp = widths(W, H, level)
    P = W // 2
    rows = buf.reshape(-1, pitch)[y0:y0 + H]
    pairs = rows[:, 4 * x0:4 * (x0 + P)].reshape(H, P, 4)
    pairs[:B] = WORD
    pairs[H - B:] = WORD
    pairs[B:H - B, :Bp] = WORD
    pairs[B:H - B, P - Bp:] = WORD
    return 'on'


if __name__ == '__main__':
    sizes = {'4:3 20 MP': (5184, 3888), '3:2': (5184, 3456), '16:9': (5184, 2916), '1:1': (3888, 3888),
             '3:4': (3888, 5184), '4:3 M (3200)': (3200, 2400), '4:3 S (1280)': (1280, 960)}
    for name, (W, H) in sizes.items():
        print(f'{name:<14} {W} x {H}: ' + ', '.join(
            f'{lv}: {widths(W, H, lv)[0]} px ({100 * widths(W, H, lv)[0] / min(W, H):.1f} %)' for lv in range(1, 6)))
