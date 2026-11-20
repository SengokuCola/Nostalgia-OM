// OM-3 1.1 native Focus Indicator investigation, emulator only.
// Usage: OM_EMU_MODEL=E147 node probe.mjs EMU MAIN.BIN CARD.omsd OUT.json
// No camera image is produced. Synthetic records test code semantics, not optics.
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
const { S: CPU } = await import(EMU + '/src/core/cpu.mjs');
const image = fs.readFileSync(IMAGE);
if (createHash('sha256').update(image).digest('hex') !==
    '5e8d376e9111a44ac0352f26030d7c1b17026d42c45f3600cfa02a0e8c5b7d59')
  throw new Error('Requires unmodified decoded OM-3 1.1 main image');
let c0 = cardFromImage(new Uint8Array(fs.readFileSync(CARD)));
const env = { rom: expandImage(image), resBlock: loadBlock(), createHash,
  card: { open: () => c0, save: x => { c0 = x; } },
  deflate: (b,l) => new Uint8Array(zlib.deflateSync(b,{level:l})),
  inflate: b => new Uint8Array(zlib.inflateSync(b)) };
const pl = new Player({ ...PLAYER_PARSER, no_browser:true, idle:'off', a15:'on',
  out:'<out>', no_wait_on_error:true, device:'tft' },
  { ...env, wallClock: () => performance.now()/1000 });
pl.open_session();
const s = pl.session, lab = s.lab;
s.idle_slice(lab.lab_time() + 1500e6);
const dd = Debugger.attach(lab.sim,{lab});
const rd = (a,n) => lab.sim.read(a>>>0,n);
const word = v => Uint8Array.from([v&255,v>>>8&255,v>>>16&255,v>>>24&255]);
const saved = dd.m.getRegs().slice(), limit = CPU.limit;
const STUB=0xa7f00000, BUF=STUB+0x100, REC=STUB+0x1000;
const SP=((saved[8]-0x800)&~3)>>>0;
const results=[];
function run(name, fn, mask, frame, a0=BUF) {
  dd.write(STUB,Uint8Array.from([0xdd,...word((fn-STUB)|0),mask,frame,0xcb]));
  dd.write(BUF,Uint8Array.of(0xcc,0xcc,0xcc,0xa5));
  const r=saved.slice();
  r[0]=0; r[2]=0x22222222; r[3]=0x33333333; r[4]=a0;
  r[6]=0x66666666; r[7]=0x77777777; r[8]=SP; r[9]=STUB; r[14]=0;
  dd.m.setRegs(r);
  let n=0;
  while ((dd.m.getRegs()[9]>>>0)!==STUB+7 && n<200000) {dd.m.step();n++;}
  const g=dd.m.getRegs();
  const row={name,steps:n,returned:(g[9]>>>0)===STUB+7,
    preserved:g[2]===r[2]&&g[3]===r[3]&&g[6]===r[6]&&g[7]===r[7]&&(g[8]>>>0)===SP,
    d0:g[0]>>>0, bytes:[...rd(BUF,4)]};
  results.push(row); console.log(JSON.stringify(row));
  if (!row.returned || !row.preserved || row.bytes[3]!==0xa5) throw new Error(name+' failed ABI/guard');
  return row;
}
const changes=[];
function change(a,b) {changes.push([a,rd(a,b.length)]);dd.write(a,Uint8Array.from(b));}
function expect(row,bytes) {if (row.bytes.slice(0,3).join()!==bytes.join()) throw new Error(row.name+' unexpected output');}
CPU.limit=0;
try {
  // Native path, no substitution of the lens getter. A missing valid record must
  // suppress the indicator even if the old direction byte is nonzero.
  change(0xa32d3d32,[0]); change(0x62997470,[2]);
  expect(run('native no valid electronic lens record',0x60153ee1,0x20,8),[0,0,0]);
  while(changes.length){const [a,b]=changes.pop();dd.write(a,b);}
  // Controlled seam: replace ONLY the record accessor with a synthetic pointer.
  // All indicator visibility, normalization and direction-copy code is native.
  change(0x602f6460,[0xfc,0xdc,...word(REC),0xdf,0x80,8]);
  change(0xa32c9c28,[2,0]); change(0x62997490,[0]); change(0x62997470,[2]);
  const record=new Uint8Array(64), dv=new DataView(record.buffer);
  for(const [off,val] of [[22,0],[24,100],[34,900],[36,1000]])dv.setInt16(off,val,true);
  for(const [position,index] of [[0,1],[100,11],[500,50],[900,91],[1000,100]]) {
    dv.setInt16(40,position,true);dd.write(REC,record);
    const row=run('synthetic lens position '+position,0x60153ee1,0x20,8);
    expect(row,[1,index,2]);
  }
  change(0x62997490,[1]);
  expect(run('native inhibit flag with synthetic lens',0x60153ee1,0x20,8),[0,0,0]);
  dd.write(0x62997490,Uint8Array.of(0));dd.write(0xa32c9c28,Uint8Array.of(0x0a,0x0b));
  expect(run('native unsupported status with synthetic lens',0x60153ee1,0x20,8),[0,0,0]);
} finally {
  while(changes.length){const [a,b]=changes.pop();dd.write(a,b);}
  dd.m.setRegs(saved);CPU.limit=limit;
  fs.writeFileSync(OUT,JSON.stringify({status:'emulator only; no optical or physical lens validation',results},null,2));
}
