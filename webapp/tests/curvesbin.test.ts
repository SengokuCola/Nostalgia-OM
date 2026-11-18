import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { curvesBin } from '../src/curvesbin';
import { CAMERA_FILMS, filmLook } from '../src/om3films';
import { emptyBank, profilesBin, PER } from '../src/om3';

// CURVES.BIN v1 (docs/FORMATS.md on try/v0.30, card/mkcurves.py): the standard 20 with their curves + mix, made against
// the camera's 20 as released in v0.29.5's LOOKS.BIN; sha256 and Portra 400's entry from the RGB Curves session's
// reference build (mkcurves.py, 2026-11-15).
const bank = emptyBank();
CAMERA_FILMS.forEach((f, i) => { bank[Math.floor(i / PER)][i % PER] = filmLook(f); });
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('CURVES.BIN', () => {
  const looks = profilesBin(bank, 28), curves = curvesBin(looks, bank);
  it('goes with a LOOKS.BIN equal to v0.29.5\'s (the camera\'s built-in films)', () => {
    expect(hex(looks)).toBe(hex(new Uint8Array(readFileSync(new URL('../../releases/v0.29.5/LOOKS.BIN', import.meta.url)))));
  });
  it('matches the reference build byte for byte', () => {
    expect(curves.length).toBe(432);
    expect(hex(curves.subarray(0, 8))).toBe(hex(new Uint8Array([0x4f, 0x4d, 0x33, 0x4b, 1, 0, 0xb0, 1])));
    expect(hex(curves.subarray(32, 52))).toBe('1c8fb44b' + '00f0000000001201' + '0000ffffff00' + '0000');
    expect(createHash('sha256').update(curves).digest('hex')).toBe('4c009f9c0e2f62f00bf5eb994b13c031ce34d3f2f2f7526d5d563ba8ac352291');
  });
  it('gives a look without curves or mix zero values, still with its check', () => {
    const b2 = emptyBank(); b2[0][0] = filmLook(CAMERA_FILMS[7]);       // Kodachrome 64: mix only
    delete b2[0][0]!.mix;
    const lb = profilesBin(b2, 28), c = curvesBin(lb, b2);
    expect(hex(c.subarray(36, 52))).toBe('00'.repeat(16));
    expect(c.subarray(32, 36).some((x) => x)).toBe(true);
  });
});
