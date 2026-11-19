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

describe('OM-3 v0.40 crops, grain strength and photo codes', () => {
  it('XPan / 21:9 / 5:4 crops are centred at the camera\'s shapes, turned for an upright photo', async () => {
    const { cropRect } = await import('../src/preview');
    expect(cropRect(1296, 972, 'xpan')).toEqual({ x: 0, y: 246, w: 1296, h: 480 });
    expect(cropRect(1296, 972, '21:9')).toEqual({ x: 0, y: 208, w: 1296, h: 556 });
    expect(cropRect(1296, 972, '5:4')).toEqual({ x: 40, y: 0, w: 1216, h: 972 });
    expect(cropRect(972, 1296, 'xpan')).toEqual({ x: 246, y: 0, w: 480, h: 1296 });
    expect(cropRect(1296, 972, '4:3')).toEqual({ x: 0, y: 0, w: 1296, h: 972 });
  });
  it('the Border sits inside the crop, its width from the crop\'s short side', async () => {
    const { cropRect } = await import('../src/preview');
    const w = 160, h = 120, cr = cropRect(w, h, 'xpan');   // 160 x 59 at y 30
    const l = blankLook('colour', 'b');
    l.border = 5;
    const out = grey(w, h, 0);
    renderLook(grey(w, h), out, { ...l, lens_correction: true }, { advice: true, camera: 'om3', crop: cr });
    const B = Math.max(1, Math.round((Math.min(cr.w, cr.h) * 4915) / 65536));   // 4 rows
    expect(px(out.data, w, 80, cr.y)).toBe(255);
    expect(px(out.data, w, 80, cr.y + B - 1)).toBe(255);
    expect(Math.abs(px(out.data, w, 80, cr.y + B) - 128)).toBeLessThanOrEqual(1);
    expect(Math.abs(px(out.data, w, 80, cr.y - 2) - 128)).toBeLessThanOrEqual(1);   // outside the crop: untouched
  });
  it('Film Grain 1..5: the looks file keeps the camera\'s level (1-2 Low, 3 Med, 4-5 High)', async () => {
    const { setGrainStrength, grainStrength } = await import('../src/om3');
    const l = blankLook('colour', 'g');
    const bank = emptyBank(); bank[0][0] = l;
    for (const [x, lv] of [[1, 1], [2, 1], [3, 2], [4, 3], [5, 3]]) {
      setGrainStrength(l, x);
      expect(grainStrength(l)).toBe(x);
      expect(profilesBin(bank, 28)[32 + 51]).toBe(lv);
      expect(grainStrength(lookFromRecord(profilesBin(bank, 28).slice(32, 96), 'x', true))).toBe([0, 2, 3, 5][lv]);
    }
    setGrainStrength(l, 0);
    expect(l.film_grain).toBeUndefined();
  });
  it('a photo code with a black Border reads back as black', async () => {
    const { photoCodeOf, lookFromPhotoCode } = await import('../src/om3');
    const l = blankLook('colour', 'p');
    l.border = -3;
    expect(lookFromPhotoCode(`Caduceus FILM 1 p ${photoCodeOf(l)}`).border).toBe(-3);
    l.border = 4;
    expect(lookFromPhotoCode(`Caduceus FILM 1 p ${photoCodeOf(l)}`).border).toBe(4);
  });
});
