import { describe, expect, it } from 'vitest';
import { blankLook } from '../src/pack';
import { emptyBank, lookFromRecord, profilesBin } from '../src/om3';
import { renderLook } from '../src/preview';

// v0.41 settings, previewed as the camera makes them (calibration cards 2026-11-18).
const grey = (w: number, h: number, v = 128) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : v)) }) as unknown as ImageData;
const render = (l: ReturnType<typeof blankLook>, w = 160, h = 120, v = 128) => {
  const out = grey(w, h, 0);
  renderLook(grey(w, h, v), out, { ...l, lens_correction: true }, { advice: true, camera: 'om3' });
  return out.data;
};
const px = (d: Uint8ClampedArray, w: number, x: number, y: number) => d[(y * w + x) * 4];

describe('OM-3 v0.41 preview', () => {
  it('Border: + white, - black, 4.5 % of the short side at 3', () => {
    const l = blankLook('colour', 'b');
    l.border = 3;
    let d = render(l);
    expect(px(d, 160, 2, 60)).toBe(255);
    expect(px(d, 160, 80, 4)).toBe(255);          // 120 x 2949 / 65536 = 5.4 -> 5 rows
    expect(Math.abs(px(d, 160, 80, 6) - 128)).toBeLessThanOrEqual(1);
    l.border = -3;
    d = render(l);
    expect(px(d, 160, 2, 60)).toBe(0);
  });
  it('Shading -5: the centre stays, the corner goes to a few % of it (the camera\'s own)', () => {
    const l = blankLook('colour', 's');
    l.vignette = -5;
    const d = render(l);
    expect(Math.abs(px(d, 160, 80, 60) - 128)).toBeLessThanOrEqual(1);
    expect(px(d, 160, 0, 0)).toBeLessThan(12);
    l.vignette = 5;
    expect(px(render(l), 160, 0, 0)).toBeGreaterThan(240);
  });
  it('Film Grain Med: about the camera photo\'s texture shrunk 4x (Y sigma ~7)', () => {
    const l = blankLook('colour', 'g');
    l.film_grain = 2;
    const w = 1296, h = 972, d = render(l, w, h);
    let s = 0, s2 = 0, n = 0;
    for (let y = 100; y < 200; y++) for (let x = 100; x < 200; x++) { const v = px(d, w, x, y); s += v; s2 += v * v; n++; }
    const sd = Math.sqrt(s2 / n - (s / n) ** 2);
    expect(Math.abs(s / n - 128)).toBeLessThan(1);
    expect(sd).toBeGreaterThan(5.5);
    expect(sd).toBeLessThan(9);
  });
});

describe('OM-3 v0.41 Border in LOOKS.BIN', () => {
  it('is +48 (signed) for firmware v0.28 or later and read back; older exports leave it out', () => {
    const l = blankLook('colour', 'Border');
    l.border = -4;
    const bank = emptyBank(); bank[0][0] = l;
    const rec = profilesBin(bank, 28).slice(32, 96);
    expect((rec[48] << 24) >> 24).toBe(-4);
    expect(lookFromRecord(rec, 'x', true).border).toBe(-4);
    expect(profilesBin(bank, 26)[32 + 48]).toBe(0);
  });
});
