// Real native DISPLAY histogram queue calls the patched update/stop sites.
// Sensor image and ordinary-shooting GUI are explicit fixtures, not camera proof.
const [EMU,BUILD,CARD,SYMS,OUT]=process.argv.slice(2);
const fs=await import('node:fs'),zlib=await import('node:zlib');
const {createHash}=await import('node:crypto');
const {Player}=await import(EMU+'/src/lab/player.mjs');
const {PLAYER_PARSER}=await import(EMU+'/scenarios/session_replay.mjs');
const {expandImage}=await import(EMU+'/src/fw/expand.mjs');
const {loadBlock}=await import(EMU+'/bin/run.mjs');
const {cardFromImage,cardImage}=await import(EMU+'/src/lab/sdcard.mjs');
const D=await import(EMU+'/src/lab/display.mjs');
const sy=JSON.parse(fs.readFileSync(SYMS)),card=cardFromImage(fs.readFileSync(CARD));
const {CA_TASK_ENTRIES}=await import(EMU+'/src/lab/camapp.mjs');
CA_TASK_ENTRIES.push((sy.lg_wk-0x10021020)>>>0);
const pl=new Player({...PLAYER_PARSER,lang:'en',no_browser:true,idle:'off',a15:'on',out:'<out>',no_wait_on_error:true,device:'tft'},
 {rom:expandImage(fs.readFileSync(BUILD+'/main.bin')),resBlock:loadBlock(),createHash,card:{open:()=>card,save:()=>{}},
  deflate:(b,l)=>new Uint8Array(zlib.deflateSync(b,{level:l})),inflate:b=>new Uint8Array(zlib.inflateSync(b)),wallClock:()=>performance.now()/1000});
pl.camapp_components=true;pl.camapp_native_tra=true;pl.open_session();
const s=pl.session,lab=s.lab;
const {uiin_layout,set_bit}=await import(EMU+'/src/lab/play.mjs');
const positions=[];
uiin_layout(lab.image).groups.forEach(({entries},g)=>entries.forEach(([b,bit,code,typ,pol])=>{
 if(code===0x1909&&typ===1)positions.push([g,b,bit,pol]);
}));
positions.forEach(([g,b,bit,pol],i)=>set_bit(s.images[g],b,bit,i===2?pol:1-pol));
for(const g of new Set(positions.map(v=>v[0]))){const [codes]=s.push_group(g);for(const code of codes||[]){const [idx]=s.keymap(code);if(idx!==null)s.event(idx);}}
s.camapp.pump();s.switch_input('mode_dial',2);
const assert=(v,m)=>{if(!v)throw Error(m);},get=k=>lab.sim.u32(sy[k]);
const idle=()=>s.idle_slice(lab.lab_time()+1200e6);
const key=k=>{s.key(k,'down');s.camapp.pump();s.idle_slice(lab.lab_time()+150e6);s.key(k,'up');s.camapp.pump();idle();};
idle();assert(get('FS_ON')===0,'startup enabled');
key('s1');lab.sim.word(sy.FS_ON,1);
const attach=(n,doAttach=true)=>{
 lab.sim.write(0xa32d9d0d,Uint8Array.of(2));lab.sim.write(0x62ce5864,Uint8Array.of(1,8));
 const rows=Array.from({length:1080},(_,y)=>{
  const row=new Uint8Array(3240);for(let x=0;x<1620;x+=2)row.set([(x+y+n*37)%220+16,120,(x+y+n*37+1)%220+16,140],x*2);return row;
 });
 const addr=lab.load_lv_frame([1620,1080,rows],0x0a,1,[0,0]);
 if(doAttach){lab.through_permit('tft',1);lab.live_view('tft',D.ThRequest.scaled(1,addr,[0,0],[1620,1080],[900,600],[0,0]));lab.update();}
};
attach(0);const before=get('FS_FRAMES');idle();
assert(get('FS_FRAMES')>before,'native histogram did not drive overlay');
const hash=()=>createHash('sha256').update(lab.sim.read(sy.FS_DST+get('FS_FLIP')*32768,32768)).digest('hex');
const first=hash(),afterFirst=get('FS_FRAMES');attach(1,false);idle();
assert(get('FS_FRAMES')>afterFirst&&hash()!==first,'native queue left a frozen frame');
// Run a full shutter button cycle without reattaching the sensor fixture or
// restoring the GUI. Sample recovery over multiple native refresh intervals.
for(const [button,edge,ms] of [['s1','down',600],['s2','down',700],['s2','up',150],['s1','up',2000]]){
 s.key(button,edge);s.camapp.pump();s.idle_slice(lab.lab_time()+ms*1e6);
}
const postshotFrames=[get('FS_FRAMES')];
for(let i=0;i<3;i++){
 idle();
 const frames=get('FS_FRAMES');
 assert(frames>postshotFrames.at(-1),'no new split image after shutter release');
 assert(get('FS_OWNER')===1&&(lab.vsc.bank(2,true).get('DMAEN')&16),'latched overlay missing after shutter release');
 postshotFrames.push(frames);
}
fs.writeFileSync(OUT+'/focus-trace.omsd',cardImage(card));
key('menu');assert(get('FS_OWNER')===0,'menu left overlay');
const menuCount=get('FS_FRAMES');idle();assert(get('FS_FRAMES')===menuCount,'menu kept rendering');
key('menu');key('s1');attach(2);idle();
const resumed=get('FS_FRAMES')>menuCount,bank=lab.vsc.bank(2),deferred=!resumed&&get('FS_OWNER')===0&&!!(bank.get('DMAEN')&0x10);
assert(resumed||deferred,'halfpress did not resume or defer to occupied layer '+JSON.stringify({frames:get('FS_FRAMES'),menuCount,last:get('FS_LAST'),dma:bank.get('DMAEN'),fmt:bank.get('IMG2FMT')}));
// Menu's IMG2 remains enabled in this model. Refusing it is required; do not clear
// its registers merely to force the effect back. Power-on / a stock release frees it.
key('info');assert(get('FS_OWNER')===0,'INFO stop left overlay');
const stopped=get('FS_FRAMES');idle();assert(get('FS_FRAMES')===stopped,'INFO stop kept rendering');
const result={nativeQueueDrivesFrames:true,movingSourceUpdates:true,menuStops:true,halfpressResumes:resumed,menuLayerDeferred:deferred,infoStops:true,
 postshotFrames,frames:get('FS_FRAMES'),limitation:'synthetic sensor and GUI fixtures; no real-camera performance or lifecycle guarantee'};
fs.writeFileSync(OUT+'/cadence-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));

if (sy.dr_gate) {
 // Use the same native recorder and shutter/card writer with two known
 // micro-four-thirds offset packets. Actual AF input is supplied on camera.
 lab.sim.word(sy.PH_MODE,1);
 if(sy.zr_sample){
  const sample=()=>lab.call(sy.zr_sample-0x60021020+0x50000000,{},null,[0xf0,32]);
  const halfword=(a,v)=>{const b=Buffer.alloc(2);b.writeInt16LE(v);lab.sim.write(a,b);};
  const slot=0xa33eb074+2*10560;
  lab.sim.word(0xa33f2c38,2);
  lab.sim.write(slot+10536,Uint8Array.of(1));
  lab.sim.write(slot+10556,Uint8Array.of(1));
  for(const [layout,value,flag,token] of [[1,0x6a094900,0x67c53c00,4242],[2,0x6e660f00,0x6c220200,4243]]){
   lab.sim.word(0xa33e99e8,(value+0x40000000)>>>0);
   lab.sim.word(0xa33e99ac,(flag+0x40000000)>>>0);
   for(const [i,off] of [1052,9756,3228,11932].entries())halfword(value+off,-101-layout-i);
   for(const [i,off] of [526,5134,1678,6286].entries())lab.sim.write(flag+off,Uint8Array.of(i));
   lab.sim.word(slot+10552,token);
   halfword(slot+1052,-32768);halfword(slot+3158,88);
   idle();sample();
  }
  // Mismatched allocation pair and invalid published index must be ignored.
  lab.sim.word(0xa33e99e8,0xaa094900);lab.sim.word(0xa33f2c38,3);
  idle();sample();
 }
 const packet=Buffer.alloc(168);
 packet.writeUInt16LE(320,52);
 const address=lab.alloc(packet,4);
 for(const move of [-137,137]){
  packet.writeInt16LE(move,54);
  lab.sim.write(address,packet);
  if(sy.aw_entry){
   const site=move<0?0x6099ebeb:0x6099eed3;
   lab.call(site-0x60021020+0x50000000,{d0:move>>>0},null,[0,0],10000,new Set([site+5]));
   idle();
  }
  lab.call(sy.dr_gate-0x60021020+0x50000000,{d0:9,a0:address},null,[0xf0,40]);
  idle();
 }
 key('s1');
 fs.writeFileSync(OUT+'/drive-trace.omsd',cardImage(card));
}

// Long MF sweep with known positions, native Focus Indicator, raw PDAF ring
// and auxiliary center arrays, followed by a manual-lens live-view sweep + hold.
if (sy.sw_flush) {
 const first=get('SW_HEAD')+1;
 const lens=0x63ef3000, total=550;
 const slot=0xa33eb074, src=0x6a094900;
 const half=(addr,v)=>{const b=Buffer.alloc(2);b.writeInt16LE(v);lab.sim.write(addr,b);};
 lab.sim.word(0xa33e99e8,0xaa094900);lab.sim.word(0xa33e99ac,0xa7c53c00);
 lab.sim.word(0xa33e99ec,0xaa0c0000);lab.sim.word(0xa33e99f0,0xaa0e0000);
 lab.sim.word(0xa33e99f4,0xaa0e2000);lab.sim.word(0xa33e99fc,0xaa0e4000);
 lab.sim.word(0xa33e9a08,0xaa0e8000);lab.sim.word(0xa33e99c8,0xaa0ec000);
 lab.sim.word(0xa33f2c38,0);lab.sim.write(slot+10536,Uint8Array.of(0));
 lab.sim.write(slot+10556,Uint8Array.of(1));lab.sim.write(0xa32d3d32,Uint8Array.of(1));
 lab.sim.word(0xa32c9c24,lens);
 // Populate valid electronic lens calibration limits for native 0x60153ee1.
 lab.sim.write(0xa32c9c28,Uint8Array.of(2,0));
 lab.sim.write(0x62997490,Uint8Array.of(0));
 for(const [off,v] of [[22,0],[24,100],[34,900],[36,1000]])half(lens+off,v);
 // Populate Layer 0 raw PDAF ring slot 1 with distinct A/B bank content.
 lab.sim.write(0x62b3d938,Uint8Array.of(1));
 lab.sim.write(0x62b3d93a,Uint8Array.of(1));
 lab.sim.write(0x62b3d97c,Uint8Array.of(1));
 lab.sim.word(0x62b3d9c8,2);
 lab.sim.write(0xa33e9c80,Uint8Array.of(0,0, 2,0, 0,0, 0,0));
 lab.sim.write(0xa33e9c8a,Uint8Array.of(1,0, 1,0, 0xff,0xff, 0xff,0xff));
 lab.sim.word(0xa33e9be0+16,0xa6600000);
 lab.sim.word(0xa33e9c20+16,0xa6900000);
 lab.sim.word(0xa33e9c94+332,0x12345678);
 lab.sim.word(0xa33d1e40,1);
 lab.sim.word(0xa33eabd8,0);
 const invoke=name=>lab.call(sy[name]-0x60021020+0x50000000,{},null,[0xf0,32],2000000);
 for(let i=0;i<total;i++){
  const pos=250+Math.min(i,500);
  half(lens+40,pos);half(src+1052,pos-500);half(slot+1052,pos-500);
  lab.sim.write(0x62997470,Uint8Array.of(i<=500?1:0));
  half(0x6299748e,pos);
  lab.sim.word(0x62997474,i<=500?50000+i:50500);
  half(0x6a0c0000+1052,pos-500);
  half(0x6a0e0000+1052,0x1000+i);half(0x6a0e0000+3158,0);
  half(0x6a0e2000+1052,0x2000+i);half(0x6a0e2000+3158,0);
  lab.sim.word(0x6a0e4000+2104,0x3000+i);lab.sim.word(0x6a0e4000+6316,0x4000+i);
  lab.sim.word(0x6a0e8000+2104,0x5000+i);lab.sim.word(0x6a0ec000+2104,0x6000+i);
  lab.sim.word(0x66600000+933888,0x11110000+i);
  lab.sim.word(0x66900000+933888,0x22220000+i);
  lab.sim.word(slot+10552,100000+i);
  const prev=sy.ZR_ROWS+get('ZR_HEAD')%32*32;
  lab.sim.word(prev+4,(lab.sim.u32(prev+4)-200001)&0x7fffffff);
  invoke('zr_sample');
  assert(get('SW_HEAD')===first+i,'sampler lost position event '+i);
  if((i+1)%64===0)invoke('sw_flush');
 }
 // Release requests a flush even for a partly filled last page.
 key('s1');idle();
 assert(get('sw_saved')>=first+total-1,'last sweep page was not flushed');
 const lastFile=get('sw_number');
 // Restart logging state for a manual-lens live-view sweep + noisy ring-stop hold
 // drained via quiet tail (no extra shutter event), verifying sharpness & stability.
 for(const state of ['ZR_HEAD','SW_HEAD','SW_RELEASE','sw_saved','sw_seen','sw_quiet','sw_number','sw_session'])
  lab.sim.word(sy[state],0);
 lab.sim.write(sy.sw_digits,Buffer.from('000000.BIN\0'));
 // Manual lens: no electronic record, stale raw_dir=2 must be suppressed by stock 0x60153ee1.
 lab.sim.write(0xa32d3d32,Uint8Array.of(0));
 lab.sim.write(0xa32c9c28,Uint8Array.of(0,0));
 lab.sim.write(0x62997470,Uint8Array.of(0));
 half(0x6299748e,-32768);
 lab.sim.word(0x62997474,0);
 lab.sim.write(0x62b3d938,Uint8Array.of(0));
 lab.sim.write(0xa33e9c8c,Uint8Array.of(0xff,0xff));
 // Re-attach TFT live-view edge frames, release the earlier menu fixture's
 // occupied IMG2 layer (simulating a fresh boot / stock release), and drive fs_tick.
 lab.sim.write(0xa32d9d0d,Uint8Array.of(2));lab.sim.write(0x62ce5864,Uint8Array.of(1,8));
 lab.sim.word(sy.PH_MODE,1);
 const edgeSeq=[16,16,16, 4,4,4, 1,1,1, 4,4,4, 16,16,16, 4,4,4, 4,4,4];
 const tickTft=()=>lab.call(sy.fs_tick-0x60021020+0x50000000,{d0:1},null,[0xf0,48],2000000);
 let lvAddr=null;
 for(let k=0;k<edgeSeq.length;k++){
  const w=edgeSeq[k], jitter=k>=15?(k%2?0.12:-0.12):0;
  const rows=Array.from({length:480},(_,y)=>{
   const row=new Uint8Array(640*2);
   for(let x=0;x<640;x+=2){
    const l0=32+Math.round(180*Math.max(0,Math.min(1,(x-319)/(w+jitter))));
    const l1=32+Math.round(180*Math.max(0,Math.min(1,(x+1-319)/(w+jitter))));
    row.set([l0,128,l1,128],x*2);
   }
   return row;
  });
  lvAddr=lab.load_lv_frame([640,480,rows],0x0a,1,[0,0]);
  if(k===0){
   lab.through_permit('tft',1);
   lab.live_view('tft',D.ThRequest.scaled(1,lvAddr,[0,0],[640,480],[640,480],[0,0]));
   lab.update();
   lab.call(0x501ee1a0,{d0:2,d1:0},null,[0xc0,8]);
   lab.call(0x501f0dfc,{d0:2,d1:0x60/4,a0:(bank.get('DMAEN')&~0x10)>>>0},null,[0x80,4]);
   lab.call(0x501ee1a0,{d0:2,d1:1},null,[0xc0,8]);
  }
  if(k>0){
   const prev=sy.ZR_ROWS+get('ZR_HEAD')%32*32;
   lab.sim.word(prev+4,(lab.sim.u32(prev+4)-200001)&0x7fffffff);
  }
  tickTft();
 }
 for(let poll=0;poll<22;poll++)invoke('sw_flush');
 assert(get('sw_saved')===edgeSeq.length&&get('sw_session')===lastFile+1,'manual-lens session lost its quiet tail or reused an old page');
 fs.writeFileSync(OUT+'/sweep-card.omsd',cardImage(card));
 fs.writeFileSync(OUT+'/sweep-range.json',JSON.stringify({first,total,manualCount:edgeSeq.length,lastFile:get('sw_number')}));
}
