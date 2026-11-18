import { describe, expect, it } from 'vitest';
import { curveDelta, mixMatrix, parseCurves, parseMix } from '../src/curves';
import { blankLook } from '../src/pack';
import { renderLook } from '../src/preview';
import { bendSplit } from '../src/split';

// research/rgbcurves/model.py (feature/rgb-curves, test 4) d_at at these inputs, for these 5-point curves
const TS = [0, 1, 512, 1024, 1500, 2048, 2600, 3072, 3600, 4000, 4095];
const CASES: Record<string, [number[], number[]]> = {
  flat: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  black7: [[7, 0, 0, 0, 0], [336, 335, 126, 0, 0, 0, 0, 0, 0, 0, 0]],
  mid7: [[0, 0, 7, 0, 0], [0, 0, 0, 0, 150, 336, 148, 0, 0, 0, 0]],
  ramp: [[0, 2, 3, 4, 5], [0, 0, 52, 96, 120, 144, 169, 192, 216, 235, 239]],
  zig: [[-7, 7, -7, 7, -7], [-336, -336, 84, 336, 35, -336, 39, 336, 70, -268, -336]],
  sc: [[0, -3, 0, 3, 0], [0, -1, -90, -144, -97, 0, 96, 144, 87, 14, 0]],
};

describe('RGB curves', () => {
  it('match the firmware model bit for bit', () => {
    for (const [name, [v, want]] of Object.entries(CASES)) expect(TS.map(curveDelta(v)), name).toEqual(want);
  });
  it('parse only valid curves, flat ones drop out', () => {
    expect(parseCurves({ r: [0, 1, 0, 0, 0] })).toEqual({ r: [0, 1, 0, 0, 0], g: [0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0] });
    expect(parseCurves({ r: [0, 0, 0, 0, 0] })).toBeUndefined();
    expect(parseCurves({ g: [0, 8, 0, 0, 0] })).toBeUndefined();
    expect(parseCurves({ b: [0, 1, 0] })).toBeUndefined();
  });
  it('bend the preview like the camera: a red lift in the shadows', () => {
    const img = new Float32Array([0.25, 0.25, 0.25, 0.75, 0.75, 0.75]);
    bendSplit(img, 2, undefined, 1, 0, { r: [0, 7, 0, 0, 0], g: [0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0] });
    expect(img[0]).toBeGreaterThan(0.3);          // red up by about 336 / 4095 at 25 %
    expect(img[1]).toBeCloseTo(0.25, 2);
    expect(img[3]).toBeCloseTo(0.75, 2);         // nothing at 75 %
  });
});

// research/colourmix/model.py (feature/rgb-curves, test 6): the matrix (s16, 256 = 1.0) for these settings
const MIX: [number[], number[][]][] = [
  [[0, 0, 0, 0, 0, 0], [[256, 0, 0], [0, 256, 0], [0, 0, 256]]],
  [[3, 0, 0, 0, 0, 0], [[256, 0, 0], [24, 232, 0], [-24, 0, 280]]],
  [[0, 5, 0, 0, 0, 0], [[256, 0, 0], [-40, 296, 0], [-40, 0, 296]]],
  [[-2, 3, 0, 0, 2, -1], [[232, 0, 24], [-40, 304, -8], [-8, 0, 264]]],
  [[7, 7, 7, 7, 7, 7], [[368, -112, 0], [0, 368, -112], [-112, 0, 368]]],
];
describe('Colour mix', () => {
  it('matches the firmware model', () => {
    for (const [v, want] of MIX) expect(mixMatrix(v).map((r) => r.map((x) => Math.round(x * 256) + 0))).toEqual(want);
  });
  it('parses only valid mixes, flat ones drop out', () => {
    expect(parseMix([0, 1, 0, 0, 0, -7])).toEqual([0, 1, 0, 0, 0, -7]);
    expect(parseMix([0, 0, 0, 0, 0, 0])).toBeUndefined();
    expect(parseMix([0, 8, 0, 0, 0, 0])).toBeUndefined();
    expect(parseMix([1, 2, 3])).toBeUndefined();
  });
  it('keeps greys grey and moves colours in the preview', () => {
    const src: any = { width: 2, height: 1, data: new Uint8ClampedArray([128, 128, 128, 255, 200, 40, 40, 255]) };
    const dst: any = { width: 2, height: 1, data: new Uint8ClampedArray(8) };
    const l = blankLook('colour', 't'); l.mix = [7, 0, 0, 0, 0, 0];      // red toward yellow
    renderLook(src, dst, l, { advice: true, camera: 'om3' });
    expect(Math.abs(dst.data[0] - dst.data[1]) + Math.abs(dst.data[1] - dst.data[2])).toBeLessThanOrEqual(1);
    const ref: any = { width: 2, height: 1, data: new Uint8ClampedArray(8) };
    renderLook(src, ref, blankLook('colour', 't'), { advice: true, camera: 'om3' });
    expect(dst.data[5]).toBeGreaterThan(ref.data[5] + 10);   // the red patch gains green (toward yellow)
  });
});
