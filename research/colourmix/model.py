#!/usr/bin/env python3
"""Colour mix per film (feature/rgb-curves): the exact model of the firmware's mx_go matrix (colourmix.inc).

Six values per COLOR / film, -7..+7: for red, green and blue (j = 0, 1, 2) a hue h and a strength s (stored h R, s R,
h G, s G, h B, s B). Hue moves colour j toward the next one (R -> G -> B -> R: red toward yellow, green toward cyan, blue
toward purple), strength makes it stronger. Column j of our 3 x 3 (s16, 256 = 1.0):
    M[next][j] = 8 (h - s),  M[prev][j] = 8 (-h - s),  each diagonal = 256 - its row's other two
so every row sums to 256 and greys stay grey. The camera then multiplies ours x its own matrix (0x60514290) and scales
each row to 128 (0x605144ef).

usage: python3 model.py   print the matrix for a few settings
"""
UNIT = 8


def matrix(v):
    """v = [h R, s R, h G, s G, h B, s B] -> 3 x 3 rows (s16)"""
    m = [[0] * 3 for _ in range(3)]
    for j in range(3):
        h, s = v[2 * j], v[2 * j + 1]
        m[(j + 1) % 3][j] = UNIT * (h - s)
        m[(j + 2) % 3][j] = UNIT * (-h - s)
    for i in range(3):
        m[i][i] = 256 - sum(m[i][c] for c in range(3) if c != i)
    return m


if __name__ == '__main__':
    for v in ([0] * 6, [3, 0, 0, 0, 0, 0], [0, 5, 0, 0, 0, 0], [-2, 3, 0, 0, 2, -1], [7, 7, 7, 7, 7, 7]):
        print(v, matrix(v))
