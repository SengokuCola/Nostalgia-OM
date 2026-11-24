// CURVES.BIN v1 (432 bytes, firmware v0.30; docs/FORMATS.md "CURVES.BIN v1", reference card/mkcurves.py): each film's
// built-in RGB curves and colour mix, for the films of the LOOKS.BIN written with it. The camera reads
// OM3MOD/CURVES.BIN at the first half-press and gives film j entry j's values only while its LOOKS.BIN record's
// CRC-32 equals the entry's check; firmware before v0.30 never reads it.
import { crc32 } from './format';
import type { Bank } from './om3';

export const CURVES_LEN = 432, CURVES_COUNT = 20;
const ZERO5 = [0, 0, 0, 0, 0], ZERO6 = [0, 0, 0, 0, 0, 0];
const v7 = (x: number) => Math.max(-7, Math.min(7, x | 0));

/** CURVES.BIN for `bank` (COLOR k, look v at 5k + v, as LOOKS.BIN), checked against `looksBin` (the LOOKS.BIN written with it). */
export function curvesBin(looksBin: Uint8Array, bank: Bank): Uint8Array {
  if (looksBin.length < 1632 || String.fromCharCode(...looksBin.subarray(0, 4)) !== 'OM3P') throw new Error('CURVES.BIN needs a v1 LOOKS.BIN');
  const out = new Uint8Array(CURVES_LEN), dv = new DataView(out.buffer);
  out.set([0x4f, 0x4d, 0x33, 0x4b]);                       // 'OM3K'
  dv.setUint16(4, 1, true); dv.setUint16(6, CURVES_LEN, true); dv.setUint16(12, CURVES_COUNT, true);
  const looks = bank.flat();
  for (let j = 0; j < CURVES_COUNT; j++) {
    const e = 32 + 20 * j, l = looks[j];
    dv.setUint32(e, crc32(looksBin.subarray(32 + 64 * j, 96 + 64 * j)), true);
    const nib = [...(l?.rgb?.r ?? ZERO5), ...(l?.rgb?.g ?? ZERO5), ...(l?.rgb?.b ?? ZERO5)].map((x) => v7(x) & 15).concat([0]);
    for (let i = 0; i < 8; i++) out[e + 4 + i] = nib[2 * i] | (nib[2 * i + 1] << 4);
    (l?.mix ?? ZERO6).forEach((x, i) => dv.setInt8(e + 12 + i, v7(x)));
  }
  dv.setUint32(8, crc32(out.subarray(12)), true);
  return out;
}

/** True when any look of the bank has RGB curves or a colour mix (else CURVES.BIN would be all zero values). */
export const bankHasCurves = (bank: Bank) => bank.flat().some((l) => !!l && (!!l.rgb || !!l.mix?.some((x) => x)));
