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


def ok(W, H, pitch, level):
    return 1 <= level <= 5 and 64 <= W <= 8192 and W % 4 == 0 and H >= 64 and pitch >= 2 * W


def border(buf, W, H, pitch, level):
    """buf (uint8, H x pitch bytes) changed in place as bd_run does; returns 'on' or 'off'."""
    if not ok(W, H, pitch, level):
        return 'off'
    B, Bp = widths(W, H, level)
    P = W // 2
    rows = buf.reshape(H, pitch)
    pairs = rows[:, :4 * P].reshape(H, P, 4)
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
