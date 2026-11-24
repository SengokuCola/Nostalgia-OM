import { COLORS, PER, type Bank } from './om3';
import type { Look } from './pack';

// The editor works with Look objects. A box stores references to those same
// objects in camera order, including empty positions.
export class RollCabinet {
  readonly rolls = new Map<Look, string>();

  register(look: Look) {
    if (!this.rolls.has(look)) this.rolls.set(look, Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-'));
  }

  encode(current: string, boxes: Record<string, Bank>) {
    const placements = Object.entries(boxes).map(([name, bank]) => [name, bank.map(row =>
      row.map(look => {
        if (!look) return null;
        this.register(look);
        return this.rolls.get(look);
      }))]);
    return JSON.stringify({current, rolls: [...this.rolls].map(([look, id]) => [id, look]), boxes: placements});
  }

  static decode(raw: string) {
    const data = JSON.parse(raw) as {
      current: string; rolls: [string, Look][]; boxes: [string, (string | null)[][]][];
    };
    const cabinet = new RollCabinet();
    const byId = new Map(data.rolls);
    for (const [id, look] of byId) {
      if (!look?.tone || typeof id !== 'string') throw Error('无效的胶卷');
      cabinet.rolls.set(look, id);
    }
    const lists: Record<string, Bank> = Object.create(null);
    for (const [name, slots] of data.boxes) {
      if (slots.length !== COLORS || slots.some(row => row.length !== PER)) throw Error('无效的胶片盒');
      lists[name] = slots.map(row => row.map(id => {
        if (id === null) return null;
        const look = byId.get(id);
        if (!look) throw Error('找不到盒内胶卷');
        return look;
      }));
    }
    if (!Object.hasOwn(lists, data.current)) throw Error('找不到当前胶片盒');
    return {cabinet, lists, current: data.current};
  }
}
