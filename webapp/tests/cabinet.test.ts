import { expect, it } from 'vitest';
import { RollCabinet } from '../src/cabinet';
import { blankProfile, emptyBank } from '../src/om3';

it('restores shared rolls, loose rolls and camera slot order without merging identically named recipes', () => {
  const cabinet = new RollCabinet();
  const loose = blankProfile('Gold');
  const shared = blankProfile('Gold');
  const portrait = emptyBank(), travel = emptyBank();
  portrait[0][2] = travel[3][4] = shared;
  cabinet.register(loose);
  const stored = cabinet.encode('portrait', {portrait, travel});
  const restored = RollCabinet.decode(stored);
  expect(restored.cabinet.encode(restored.current, restored.lists)).toBe(stored);
  expect(restored.cabinet.rolls.size).toBe(2);
  expect(restored.lists.portrait[0][2]).toBe(restored.lists.travel[3][4]);
  restored.lists.portrait[0][2] = null;
  expect(restored.lists.travel[3][4]?.name).toBe('Gold');
  expect(restored.cabinet.rolls.size).toBe(2);
});
