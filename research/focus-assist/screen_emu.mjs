// Executes only our standalone renderer on owned test buffers. No camera hooks.
const [EMU, IMAGE, CARD, CODE, SPEC, OUT] = process.argv.slice(2);
const fs = await import('node:fs');
const {createHash} = await import('node:crypto');
const zlib = await import('node:zlib');
const {expandImage} = await import(EMU+'/src/fw/expand.mjs');
const {loadBlock} = await import(EMU+'/bin/run.mjs');
const {Player} = await import(EMU+'/src/lab/player.mjs');
const {PLAYER_PARSER} = await import(EMU+'/scenarios/session_replay.mjs');
const {cardFromImage} = await import(EMU+'/src/lab/sdcard.mjs');
const {Debugger} = await import(EMU+'/src/debug/debugger.mjs');
const {S:CPU} = await import(EMU+'/src/core/cpu.mjs');
const card0 = cardFromImage(new Uint8Array(fs.readFileSync(CARD)));
const pl = new Player({...PLAYER_PARSER, lang:'en', no_browser:true, idle:'off', a15:'on', out:'<out>', no_wait_on_error:true, device:'tft'}, {
 rom:expandImage(new Uint8Array(fs.readFileSync(IMAGE))),resBlock:loadBlock(),createHash,
 card:{open:()=>card0,save:()=>{}},deflate:(b,l)=>new Uint8Array(zlib.deflateSync(b,{level:l})),
 inflate:b=>new Uint8Array(zlib.inflateSync(b)),wallClock:()=>performance.now()/1000});
pl.open_session();
const lab=pl.session.lab;
pl.session.idle_slice(lab.lab_time()+1500e6);
const dd=Debugger.attach(lab.sim,{lab}), saved=dd.m.getRegs().slice();
const rd=(a,n)=>Buffer.from(lab.sim.read(a>>>0,n));
const SRC=0xa8000000,DST=0xa8020000,MAP=0xa8040000,ENTRY=0xa7f10000,STUB=0xa7f00000;
const SP=((saved[8]-0x800)&~3)>>>0;
const code=fs.readFileSync(CODE);
for(const [a,n] of [[ENTRY,code.length],[STUB,16],[SRC-32,32832],[DST-32,32832],[MAP-32,16448]])
 if(rd(a,n).some(b=>b!==0)) throw Error('scratch in use: '+a.toString(16));
dd.write(ENTRY,code);
const call=Buffer.alloc(9,0xcb);call[0]=0xdd;call.writeInt32LE(ENTRY-STUB,1);call[5]=0xf0;call[6]=40;dd.write(STUB,call);
const oldLimit=CPU.limit;CPU.limit=0;
const out=[];
for(const cs of JSON.parse(fs.readFileSync(SPEC))) {
 const src=fs.readFileSync(cs.source),map=fs.readFileSync(cs.map),guard=Buffer.alloc(32,0x67);
 dd.write(SRC-32,guard);dd.write(SRC,src);dd.write(SRC+src.length,guard);
 dd.write(DST-32,guard);dd.write(DST,Buffer.alloc(src.length,0xa5));dd.write(DST+src.length,guard);
 dd.write(MAP-32,guard);dd.write(MAP,map);dd.write(MAP+map.length,guard);
 const r=saved.slice();r[14]=0;r[0]=cs.map_address??MAP;r[1]=cs.count??src.length/4;
 r[2]=0x22222222;r[3]=0x33333333;r[4]=cs.source_address??SRC;r[5]=cs.dest_address??DST;
 r[6]=0x66666666;r[7]=0x77777777;r[8]=SP;r[9]=STUB;
 dd.m.setRegs(r);let steps=0;
 while((dd.m.getRegs()[9]>>>0)!==STUB+7&&steps<1000000){dd.m.step();steps++;}
 const g=dd.m.getRegs();
 const result={name:cs.name,steps,returned:(g[9]>>>0)===STUB+7,status:g[0]>>>0,
  preserved:g[2]===r[2]&&g[3]===r[3]&&g[6]===r[6]&&g[7]===r[7]&&(g[8]>>>0)===SP,
  sourceUnchanged:rd(SRC,src.length).equals(src),mapUnchanged:rd(MAP,map.length).equals(map),
  guards:[[SRC,src.length],[DST,src.length],[MAP,map.length]].every(([a,n])=>rd(a-32,32).equals(guard)&&rd(a+n,32).equals(guard))};
 fs.writeFileSync(cs.output,rd(DST,src.length));out.push(result);console.log(JSON.stringify(result));
}
dd.m.setRegs(saved);CPU.limit=oldLimit;
fs.writeFileSync(OUT,JSON.stringify(out,null,2));
