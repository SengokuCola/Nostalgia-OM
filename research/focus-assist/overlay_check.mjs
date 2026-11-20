// Owned IMG2 overlay integration experiment. All frame ticks / transitions are harness-driven.
const [EMU, OUT]=process.argv.slice(2);
const fs=await import('node:fs');
const {createHash}=await import('node:crypto');
const D=await import(EMU+'/src/lab/display.mjs');
const {labEnv}=await import(EMU+'/checks/lib/env.mjs');
const {write_png}=await import(EMU+'/checks/lib/png.mjs');
const {IMAGE_BASE}=await import(EMU+'/src/fw/model.mjs');
const {TileOverlay,OWN}=await import('./overlay_session.mjs');
const {NativeTileOverlay}=await import('./overlay_native.mjs');
const native=process.argv.includes('--native');
const capture=process.argv.includes('--capture'),scaled=process.argv.includes('--scaled');
const hash=x=>createHash('sha256').update(x).digest('hex');
const hashWords=x=>hash(new Uint8Array(Uint32Array.from(x).buffer));
const assert=(x,msg)=>{if(!x)throw Error(msg);};
const result=[];
const SRC=0xa8000000,DEST=[0xa8020000,0xa8040000],MAP=0xa8060000,CODE=0xa7f10000;
for(const device of ['tft','evf']){
 const lab=new D.DisplayLab(labEnv());
 try{
  lab.start();lab.set_gui_buffers();lab.open(device);lab.palettes();lab.update();
  lab.through_permit(device,1);lab.assume('A15',true);
  const channel=D.DEVICE[device].channel;
  const overlay=native?new NativeTileOverlay(lab,channel,fs.readFileSync(OUT+'/overlay.bin'),IMAGE_BASE):new TileOverlay(lab,channel);
  const W=640,H=480,at=[0,0],x=(W-128)/2,y=(H-128)/2;
  const IW=scaled?1280:W,IH=scaled?960:H;
  lab.sim.write(CODE,new Uint8Array(fs.readFileSync(OUT+'/screen.bin')));
  if(capture)lab.sim.write(0xa7f40000,fs.readFileSync(OUT+'/capture.bin'));
  const mapping=fs.readFileSync(OUT+'/strength-6.map');lab.sim.write(MAP,mapping);
  let prev=null,previousOutput=null,base,th;
  for(let frame=0;frame<4;frame++){
   // A moving, colourful target: frame number changes actual source data.
   const rows=Array.from({length:IH},(_,v)=>{
    const r=new Uint8Array(IW*2);
    for(let u=0;u<IW;u+=2){const j=u*2;
     const l=((Math.floor((u+frame*14)/16)+Math.floor(v/24))&1)?210:50;
     r.set([l,100+((u+frame*30)%55),l,100+((v+frame*19)%55)],j);
    }return r;
   });
   const address=lab.load_lv_frame([IW,IH,rows],0x0a,1,[0,0]);
   // Through setup is NOT a frame tick: attach once, then change the source bank.
   if(!frame){th=lab.live_view(device,D.ThRequest.scaled(D.DEVICE[device].mask,address,[0,0],[IW,IH],[W,H],at));lab.update();}
   // Hide IMG2 only in the emulator's inspection view to obtain a control image.
   // No firmware register or layer ownership is changed by this comparison.
   lab.vsc.set_view(channel,0x3d);base=lab.compose(device);lab.vsc.set_view(channel,0x3f);
   assert(!base.errors.length,'baseline composite errors');
   const before=new Map(lab.vsc.bank(channel));
   const tile=new Uint8Array(128*256);
   const winBefore=lab.sim.u32(D.BUS_WINDOW_REG);
   const b=lab.vsc.bank(channel),flags=b.get('IMG1RSZ1');
   const sh=flags&1?b.get('IMG1RSZ2'):4096,unit=channel===2?8192:4096;
   const sv=flags&16?b.get('IMG1RSZ4'):unit;
   for(let r=0;r<128;r++)for(let p=0;p<64;p++){
    const sy=Math.floor((y+r)*sv/unit),sx=Math.floor((x+p*2)*sh/4096)&~1;
    tile.set(rows[sy].subarray(sx*2,sx*2+4),r*256+p*4);
   }
   assert(lab.sim.u32(D.BUS_WINDOW_REG)===winBefore,'bus window not restored');
   if(capture){
    lab.sim.write(SRC-16,new Uint8Array(32800).fill(0x67));
    const kept={d2:0x12345678,d3:0x23456789,a2:0x34567890,a3:0x45678901};
    const got=lab.call(0xa7f40000-IMAGE_BASE+0x50000000,{...kept,d0:channel,a0:SRC},null,[0xf0,160],1000000);
    assert(got.d0===0,'native capture status '+got.d0);
    assert((got.d1>>>0)===(x|(y<<16)),'native capture centre');
    for(const [k,v] of Object.entries(kept))assert((got[k]>>>0)===v,'capture ABI '+k);
    for(const addr of [SRC-16,SRC+32768])assert(lab.sim.read(addr,16).every(v=>v===0x67),'capture overrun');
    assert(hash(lab.sim.read(SRC,32768))===hash(tile),'native capture != expected samples');
    assert(lab.sim.u32(D.BUS_WINDOW_REG)===winBefore,'native capture window not restored');
   }else lab.sim.write(SRC,tile);
   const dst=DEST[frame&1];
   const ran=lab.call(CODE-IMAGE_BASE+0x50000000,{a0:SRC,a1:dst,d0:MAP,d1:8192},null,[0xf0,40],1000000);
   assert(ran.d0===0,'native renderer rejected tile');
   assert(hash(lab.sim.read(SRC,tile.length))===hash(tile),'renderer modified source');
   if(previousOutput)assert(hash(lab.sim.read(DEST[(frame-1)&1],32768))===previousOutput,'active buffer overwritten');
   previousOutput=hash(lab.sim.read(dst,32768));
   assert(overlay.present(dst,x,y),'overlay acquire/present');
   const comp=lab.compose(device);assert(!comp.errors.length,JSON.stringify(comp.errors));
   let changed=0;
   for(let r=0;r<comp.header.height;r++)for(let c=0;c<comp.header.width;c++){
    const i=r*comp.header.width+c,inside=c>=x&&c<x+128&&r>=y&&r<y+128;
    if(!inside)assert(comp.words[i]===base.words[i],'overlay changed pixel outside its window');
    else changed+=comp.words[i]!==base.words[i];
   }
   assert(changed>100,'no split-image pixels visible');
   const after=lab.vsc.bank(channel);
   for(const [k,v]of before)if(k.startsWith('IMG1')||k.startsWith('OSD'))assert(after.get(k)===v,'main/GUI changed '+k);
   for(let r=0;r<IH;r+=31)assert(hash(lab.bus_read(address+r*D.LV_STRIDE,IW*2))===hash(rows[r]),'bus source modified');
   const digest=hashWords(comp.words);
   assert(prev!==digest,'frame did not update');prev=digest;
   write_png(OUT+`/overlay-${device}-${frame}.png`,comp.header.width,comp.header.height,D.words_to_rgb(comp.words));
   result.push({device,frame,changed,attached:th.img0===th.start,sourceReadOnly:true,outsideUnchanged:true,hash:digest});
  }
  assert(overlay.release(),'final release failed');
  const restored=lab.compose(device);
  assert(hashWords(restored.words)===hashWords(base.words),'exit did not restore exact picture');
  const restoredBank=lab.vsc.bank(channel);
  for(const args of [[0,x,y],[DEST[0]+4,x,y],[DEST[0],-1,y],[DEST[0],W,y]]){
   let rejected=false;try{overlay.present(...args);}catch{rejected=true;}
   assert(rejected && overlay.saved===null,'bad geometry/address changed ownership');
   assert([...restoredBank].every(([k,v])=>lab.vsc.bank(channel).get(k)===v),'invalid request wrote registers');
  }
  assert(overlay.present(DEST[0],x,y),'reacquire before shared-field test');
  overlay.write(0x60,lab.vsc.bank(channel).get('DMAEN')|8);
  overlay.write(0x3d8,lab.vsc.bank(channel).get('IMGDMASPOS')|0x20000);
  assert(overlay.release(),'release with unrelated shared-field changes');
  assert((lab.vsc.bank(channel).get('DMAEN')&8)!==0,'lost unrelated DMA enable');
  assert((lab.vsc.bank(channel).get('IMGDMASPOS')&0x20000)!==0,'lost unrelated source position');
  overlay.write(0x60,restoredBank.get('DMAEN'));overlay.write(0x3d8,restoredBank.get('IMGDMASPOS'));
  // Simulate a different owner taking IMG2. Our release must not undo its change.
  assert(overlay.present(DEST[0],x,y),'reacquire');
  overlay.write(0x394,DEST[1]>>>4);
  const takeover=new Map(lab.vsc.bank(channel));
  assert(!overlay.release(),'overwrote another owner');
  assert([...takeover].every(([k,v])=>lab.vsc.bank(channel).get(k)===v),'release touched takeover state');
  assert(!overlay.present(DEST[0],x,y),'borrowed busy layer');
  // Restore test-injected takeover state before closing the lab.
  for(const [k,offset]of OWN)overlay.write(offset,restoredBank.get(k));
  overlay.write(0x60,restoredBank.get('DMAEN'));
  result.push({device,restorePixelExact:true,takeoverPreserved:true,busyLayerRefused:true,invalidRequestsRejected:true,sharedFieldsPreserved:true,
   limitations:'frame ticks and lifecycle notifications supplied by harness; not hooked to camera'});
 }finally{lab.close();}
}
const suffix=capture?(scaled?'capture-scaled':'capture'):native?'native':'';
fs.writeFileSync(OUT+'/overlay'+(suffix?'-'+suffix:'')+'-results.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
