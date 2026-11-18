// OM-3 1.1 stacking eligibility, directly executed in om-emu.
// OM_EMU_MODEL=E147 node focus_stacking.mjs EMU MAIN.BIN CARD.omsd OUT.json
// Lens hardware is not emulated. Substitute only the two query results, then run
// the actual eligibility routine. This tests the branch, not capture or merging.
const [EMU, IMAGE, CARD, OUT] = process.argv.slice(2);
const fs = await import('node:fs');
const { createHash } = await import('node:crypto');
const zlib = await import('node:zlib');
const { expandImage } = await import(EMU + '/src/fw/expand.mjs');
const { loadBlock } = await import(EMU + '/bin/run.mjs');
const { Player } = await import(EMU + '/src/lab/player.mjs');
const { PLAYER_PARSER } = await import(EMU + '/scenarios/session_replay.mjs');
const { cardFromImage } = await import(EMU + '/src/lab/sdcard.mjs');
const { Debugger } = await import(EMU + '/src/debug/debugger.mjs');
let c0 = cardFromImage(new Uint8Array(fs.readFileSync(CARD)));
const card = { open: () => c0, save: (x) => { c0 = x; } };
const env = { rom: expandImage(new Uint8Array(fs.readFileSync(IMAGE))), resBlock: loadBlock(), createHash, card,
  deflate: (b, l) => new Uint8Array(zlib.deflateSync(b, { level: l })), inflate: (b) => new Uint8Array(zlib.inflateSync(b)) };
const pl = new Player({ ...PLAYER_PARSER, no_browser: true, idle: 'off', a15: 'on', out: '<out>',
  no_wait_on_error: true, device: 'tft' }, { ...env, wallClock: () => performance.now() / 1000 });
pl.open_session();
const s = pl.session, lab = s.lab;
s.idle_slice(lab.lab_time() + 1500e6);
const dd = Debugger.attach(lab.sim, { lab });
const saved = dd.m.getRegs().slice();
const SP = ((saved[8] - 0x800) & ~3) >>> 0, STUB = 0xa7f00000;
const u32b = (v) => [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24 & 255];
const QUERY1 = 0x602f3671, QUERY2 = 0x602fdc68;
const original = [QUERY1, QUERY2].map((a) => lab.sim.read(a, 5).slice());
const debugWord = lab.sim.read(0xa33f3620, 4).slice();
const results = [];
try {
  // Disable only this routine's optional diagnostic print, so it cannot wait on a task.
  dd.write(0xa33f3620, Uint8Array.from([0, 0, 0, 0]));
  dd.write(STUB, Uint8Array.from([0xdd, ...u32b(0x60901988 - STUB), 0x80, 0x08, 0xcb]));
  for (const [name, excluded, capability, want] of [
    ['unlisted-af-lens', 0, 0, 1], ['listed-af-lens', 0, 1, 1],
    ['excluded-unlisted-lens', 1, 0, 0], ['excluded-listed-lens', 1, 1, 0],
  ]) {
    // mov value,d0; ret [],4: stand in for the hardware queries, not the decision.
    dd.write(QUERY1, Uint8Array.from([0x80, excluded, 0xdf, 0x00, 0x04]));
    dd.write(QUERY2, Uint8Array.from([0x80, capability, 0xdf, 0x00, 0x04]));
    const r = saved.slice();
    r[2] = 0x22222222; r[3] = 0x33333333; r[6] = 0x66666666; r[7] = 0x77777777;
    r[8] = SP; r[9] = STUB; r[14] = 0; dd.m.setRegs(r);
    let steps = 0;
    while ((dd.m.getRegs()[9] >>> 0) !== STUB + 7 && steps < 1000) { dd.m.step(); steps++; }
    const g = dd.m.getRegs();
    results.push({ name, want, got: g[0] >>> 0, returned: (g[9] >>> 0) === STUB + 7,
      registers: g[2] === r[2] && g[3] === r[3] && g[6] === r[6] && g[7] === r[7] && (g[8] >>> 0) === SP });
  }
} finally {
  [QUERY1, QUERY2].forEach((a, i) => dd.write(a, original[i]));
  dd.write(0xa33f3620, debugWord); dd.m.setRegs(saved);
}
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
process.exitCode = results.every((r) => r.returned && r.registers && r.got === r.want) ? 0 : 1;
