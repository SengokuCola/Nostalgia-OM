#!/usr/bin/env python3
"""Per-film R / G / B tone curves (feature/rgb-curves): the exact integer model of the firmware's cv_prm / cv_d.

Each channel has 5 points at input 0 / 25 / 50 / 75 / 100 % of the gamma tables' 12-bit output (X below; test 4,
owner's choice: on the page grid's quarter lines), each an offset of -7..+7 steps of STEP (48 = 1.2 % of full scale).
They are kept as 6 values, as tests 1..2b had 6 points (0 / 10 / 25 / 50 / 75 / 100 %): the points are values
0, 2, 3, 4, 5 (PTS), value 1 (the old 10 % point) is unused and always 0. The curve's delta D(t) is a monotone-preserving
cubic (Hermite, tangents by the harmonic mean, as Fritsch-Butland), evaluated on every table entry t (0..4095):
t' = t + D(t), then st_run's clamp and running max. All zero = stock (no work). Firmware and this model must agree
bit for bit (integer ops, truncating division as the CPU's `div`, arithmetic shifts as `asr`).

usage: python3 model.py            print D at a few inputs for example curves
"""
X = [0, 1024, 2048, 3072, 4096]
PTS = [0, 2, 3, 4, 5]                               # the 5 points' places among a channel's 6 kept values
H = [X[i + 1] - X[i] for i in range(4)]
INV = [(1 << 24) // h for h in H]                   # Q12 reciprocal: s = x * INV >> 12
STEP = 48

def tdiv(a, b):                                     # C / mn10300 `div`: truncates toward zero
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q

def prm(v):
    """a channel's 6 kept values (offsets -7..7; value 1 unused) -> (Y[5], A[4], B[4]) as the firmware's block"""
    Y = [max(-7, min(7, v[j])) * STEP for j in PTS]
    d = [tdiv((Y[i + 1] - Y[i]) << 12, H[i]) for i in range(4)]
    m = [d[0]] + [0] * 3 + [d[3]]
    for i in range(1, 4):
        a, b = d[i - 1], d[i]
        m[i] = 0 if a == 0 or b == 0 or (a < 0) != (b < 0) else tdiv(2 * a * b, a + b)
    A = [(H[i] * m[i]) >> 12 for i in range(4)]
    B = [(H[i] * m[i + 1]) >> 12 for i in range(4)]
    return Y, A, B

def d_at(p, t):
    Y, A, B = p
    i = min(3, t >> 10)
    s = ((t - X[i]) * INV[i]) >> 12
    s2 = (s * s) >> 12
    s3 = (s2 * s) >> 12
    h00 = 2 * s3 - 3 * s2 + 4096
    h10 = s3 - 2 * s2 + s
    h01 = 3 * s2 - 2 * s3
    h11 = s3 - s2
    return (h00 * Y[i] + h10 * A[i] + h01 * Y[i + 1] + h11 * B[i]) >> 12

def bend(table, v):
    """one channel's 256 + 64 entries (as st_run: each part kept rising on its own, clamped 0..4095)"""
    p = prm(v); out = []
    for part in (table[:256], table[256:320]):
        mx = 0
        for t in part:
            u = max(0, min(4095, t + d_at(p, t)))
            mx = max(mx, u); out.append(mx)
    return out

if __name__ == '__main__':
    for v in ([0, 0, 0, 0, 0, 0], [7, 0, 0, 0, 0, 0], [0, 0, 0, 7, 0, 0], [0, 0, 2, 3, 4, 5], [-7, 0, 7, -7, 7, -7]):
        p = prm(v)
        print(v, [d_at(p, t) for t in (0, 512, 1024, 1500, 2048, 2600, 3072, 3600, 4095)])
