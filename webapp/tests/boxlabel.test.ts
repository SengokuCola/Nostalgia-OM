import { describe, expect, it } from 'vitest';
import { crc32 } from '../src/format';
import { blankProfile, emptyBank, profilesBin, readProfiles } from '../src/om3';
import { parseLook } from '../src/pack';

describe('optional OM3L box labels', () => {
  function file() {
    const bank = emptyBank();
    bank[3][4] = blankProfile('Last');
    const prefix = profilesBin(bank, 28);
    const bytes = new Uint8Array(1632 + 16 + 20 * 1024);
    bytes.set(prefix);
    const tail = bytes.subarray(1632);
    tail.set(new TextEncoder().encode('OM3L'));
    const record = tail.subarray(16 + 19 * 1024);
    record[0] = 3;
    record.set(new TextEncoder().encode('MOSS 200'), 12);
    record.set(new TextEncoder().encode('雨后微光'), 45);
    const header = new DataView(tail.buffer, tail.byteOffset);
    header.setUint32(4, tail.length, true);
    header.setUint32(8, crc32(tail.subarray(16)), true);
    header.setUint32(12, crc32(prefix.subarray(32)), true);
    return bytes;
  }
  it('restores editable fields for slot 20 and reads its original v1 prefix independently', () => {
    const bytes = file();
    const look = readProfiles(bytes)[3][4]!;
    expect(look.boxLabel).toMatchObject({ style: 2, title: 'MOSS 200', caption: '雨后微光' });
    expect(parseLook(JSON.parse(JSON.stringify(look))).boxLabel).toEqual(look.boxLabel);
    expect(readProfiles(bytes.subarray(0, 1632))[3][4]?.boxLabel).toBeUndefined();
  });
  it('rejects a truncated, damaged or mismatched trailer in the editor', () => {
    const bytes = file();
    expect(() => readProfiles(bytes.subarray(0, bytes.length - 1))).toThrow();
    bytes[bytes.length - 1] ^= 1;
    expect(() => readProfiles(bytes)).toThrow();
    bytes[bytes.length - 1] ^= 1;
    bytes[1632 + 12] ^= 1;
    expect(() => readProfiles(bytes)).toThrow();
  });
  it('round-trips per-roll effects without requiring custom art or modifying the legacy prefix', () => {
    const bank = emptyBank();
    bank[0][0] = blankProfile('IR');
    bank[3][4] = blankProfile('Leaks');
    const base = profilesBin(bank, 28);
    bank[0][0]!.filmEffects = ['infrared', 'screenprint'];
    bank[3][4]!.filmEffects = ['trichrome', 'leader', 'lightLeak'];
    const extended = profilesBin(bank, 28);
    expect(extended.slice(0,1632)).toEqual(base);
    expect(profilesBin(bank,28,false)).toEqual(base);
    const restored = readProfiles(extended);
    expect(restored[0][0]?.boxLabel).toBeUndefined();
    for (const [group,slot] of [[0,0],[3,4]]) {
      expect(parseLook(restored[group][slot]).filmEffects).toEqual(bank[group][slot]?.filmEffects);
    }
    expect(readProfiles(base)[3][4]?.filmEffects).toBeUndefined();
  });
});
