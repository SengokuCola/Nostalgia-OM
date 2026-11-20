// Execute the built firmware's capture/render/owner pipeline; no code injection.
const [EMU,BUILD,SYMS,OUT]=process.argv.slice(2);
const fs=await import('node:fs');
const {createHash}=await import('node:crypto');
const D=await import(EMU+'/src/lab/display.mjs');
const {labEnv}=await import(EMU+'/checks/lib/env.mjs');
const {expandImage}=await import(EMU+'/src/fw/expand.mjs');
const {IMAGE_BASE}=await import(EMU+'/src/fw/model.mjs');
const {write_png}=await import(EMU+'/checks/lib/png.mjs');
const sy=JSON.parse(fs.readFileSync(SYMS));
const hash=x=>createHash('sha256').update(x).digest('hex');
const words=x=>hash(new Uint8Array(Uint32Array.from(x).buffer));
const assert=(v,m)=>{if(!v)throw Error(m);};
const out=[];
for(const device of ['tft','evf']){
 const lab=new D.DisplayLab(labEnv({rom:expandImage(fs.readFileSync(BUILD+'/main.bin'))}));
 try{
  lab.start();
  // Standalone DISPLAY fixture after loader and service initialization.
  lab.props.set(270, 0);
  lab.sim.word(0xa32de590, 0x3ff);
  lab.sim.word(0xa32de58c, 0x3ff);
  lab.set_gui_buffers();lab.open(device);lab.palettes();lab.update();
  lab.through_permit(device,1);lab.assume('A15',true);
  const ch=D.DEVICE[device].channel,mask=D.DEVICE[device].mask;
  const put=(k,v)=>lab.sim.word(sy[k],v),get=k=>lab.sim.u32(sy[k]);
  const call=(k,args={},frame=[0xf0,48])=>lab.call(sy[k]-IMAGE_BASE+0x50000000,args,null,frame,2000000);
  const tick=()=>call('fs_tick',{d0:mask});
  const source=[],baseline=()=>{lab.vsc.set_view(ch,0x3d);const c=lab.compose(device);lab.vsc.set_view(ch,0x3f);assert(!c.errors.length,'baseline '+JSON.stringify(c.errors));return c;};
  const frame=(w,h,dw,dh,n,attach=true)=>{
   const rows=Array.from({length:h},(_,y)=>{
    const row=new Uint8Array(w*2);
    for(let x=0;x<w;x+=2)row.set([(x+y+n*37)%220+16,95+(x+n)%60,(x+y+n*37+5)%220+16,100+(y+n)%50],x*2);
    return row;
   });
   const address=lab.load_lv_frame([w,h,rows],0x0a,1,[0,0]);
   if(attach){lab.live_view(device,D.ThRequest.scaled(mask,address,[0,0],[w,h],[dw,dh],[0,0]));lab.update();}
   source[0]={rows,address,w,h};return baseline();
  };
  let base=frame(640,480,640,480,0);
  const offState=hash(lab.sim.read(sy.FS_OWNER,120));
  tick();assert(get('FS_FRAMES')===0&&get('FS_ON')===0,'startup/disabled gate');
  assert(lab.sim.read(sy.FS_D,64).every(v=>v===0),'diagnostics write while disabled');
  assert(hash(lab.sim.read(sy.FS_OWNER,120))===offState,'inactive owner writes');
  // Fixture enters the same ordinary stills GUI as the stock logger's shoot state.
  put('FS_ON',1);lab.sim.write(0xa32d9d0d,Uint8Array.of(2));lab.sim.write(0x62ce5864,Uint8Array.of(1,8));
  let previous=null;
  for(const [i,g]of [[640,480,640,480],[1280,960,640,480],[1620,1080,900,600]].entries()){
   base=frame(...g,i+1);
   assert(get('FS_OWNER')===0,'TH did not release old overlay');
   tick();assert(get('FS_FRAMES')===i+1,'native frame missing, status '+get('FS_LAST'));
   const c=lab.compose(device);assert(!c.errors.length,'composite '+JSON.stringify(c.errors));
   const x=((g[2]-128)>>1)&~1,y=(g[3]-128)>>1;
   let changed=0;
   for(let yy=0;yy<c.header.height;yy++)for(let xx=0;xx<c.header.width;xx++){
    const p=yy*c.header.width+xx,inside=xx>=x&&xx<x+128&&yy>=y&&yy<y+128;
    if(!inside)assert(c.words[p]===base.words[p],'changed outside tile');
    else changed+=c.words[p]!==base.words[p];
   }
   assert(changed>100,'no visual effect');assert(words(c.words)!==previous,'no new image');previous=words(c.words);
   const {address,rows,w,h}=source[0];
   for(let r=0;r<h;r+=97)assert(hash(lab.bus_read(address+r*D.LV_STRIDE,w*2))===hash(rows[r]),'source changed');
   const mb=lab.sim.read(sy.FS_MAP,16384),src=lab.sim.read(sy.FS_SRC,32768),expected=new Uint8Array(32768);
   for(let p=0;p<8192;p++){
    const q=mb[p*2]|mb[p*2+1]<<8;
    expected.set(q===65535?[235,128,235,128]:q===65534?[16,128,16,128]:src.subarray(q*4,q*4+4),p*4);
   }
   assert(hash(expected)===hash(lab.sim.read(sy.FS_DST+get('FS_FLIP')*32768,32768)),'built map/render mismatch');
   write_png(OUT+`/${device}-firmware-${i}.png`,c.header.width,c.header.height,D.words_to_rgb(c.words));
   out.push({device,geometry:g,nativePipeline:true,outsideUnchanged:true,sourceUnchanged:true,changed});
  }
  // Repeated TH / rotating image addresses must retain the same overlay and epoch.
  const heldEpoch=get('FS_EPOCH');
  for(let n=0;n<4;n++){
   const req=D.ThRequest.scaled(mask,source[0].address+(n%2)*128,[0,0],[1620,1080],[900,600],[0,0]);
   lab.live_view(device,req);lab.update();
   const padded=req.pack();padded.fill(0xa5+n,26,40);padded[70]=123;padded[71]=45;
   call('fs_th_geometry',{a0:lab.alloc(padded,16)},[0xf0,32]);
   assert(get('FS_EPOCH')===heldEpoch&&get('FS_OWNER')===1,'ordinary TH cleared overlay');
   tick();assert(get('FS_FRAMES')===4+n,'TH buffer-swap frame missing');
   assert((lab.vsc.bank(ch).get('DMAEN')&0x10)!==0,'tick did not restore stock-disabled overlay');
  }
  lab.live_view(device,D.ThRequest.scaled(mask,source[0].address,[0,0],[1620,1080],[900,600],[0,0]));lab.update();
  // A source update with no TH reconfiguration must also change the output.
  base=frame(1620,1080,900,600,7,false);tick();assert(get('FS_FRAMES')===8,'continuous tick '+JSON.stringify({frames:get('FS_FRAMES'),last:get('FS_LAST'),diag:Array.from(new Uint32Array(lab.sim.read(sy.FS_D,64).buffer))}));
  const cont=lab.compose(device);assert(words(cont.words)!==previous,'continuous frame frozen');
  call('fs_stop',{d0:mask},[0xf0,64]);
  assert(get('FS_OWNER')===0&&words(lab.compose(device).words)===words(base.words),'stock stop did not restore');
  tick();assert(get('FS_OWNER')===1,'resume failed');
  lab.sim.write(0xa32d9d0d,Uint8Array.of(1));tick();assert(get('FS_OWNER')===0,'video not removed');
  const count=get('FS_FRAMES');tick();assert(get('FS_FRAMES')===count,'video drew');
  lab.sim.write(0xa32d9d0d,Uint8Array.of(2));tick();assert(get('FS_OWNER')===1,'stills resume failed');
  lab.sim.write(0x62ce5864,Uint8Array.of(2,0));tick();assert(get('FS_OWNER')===0,'menu not removed');
  lab.sim.write(0x62ce5864,Uint8Array.of(1,8));
  // Invalid display configurations must reject before touching output or mapper.
  const bank=lab.vsc.bank(ch),writer=(off,v)=>lab.call(0x501f0dfc,{d0:ch,d1:off/4,a0:v>>>0},null,[0x80,4]);
  const invalid=[[0x400,3,'format',2],[0x3a8,17,'stride',3],[0x4f0,0x80,'resize-mode',6],
   [0x4f4,0,'zero-step',7],[0x390,0,'source-address',4],[0x3d8,(bank.get('IMGDMASPOS')&~255)|1,'odd-source',4],
   [0x42c,64,'small-width',5],[0x430,64,'small-height',5],[0x3c0,8,'short-burst',9]];
  for(const [off,value,name,why]of invalid){
   const restore=lab.sim.u32((0x9bb80000+ch*0x8000+off)>>>0);
   const win=lab.sim.u32(D.BUS_WINDOW_REG);
   lab.sim.write(sy.FS_SRC,new Uint8Array(32768).fill(0xa5));writer(off,value);
   const r=call('capture_native',{d0:ch,a0:sy.FS_SRC},[0xf0,160]);
   assert(r.d0===1,'capture accepted '+name);
   assert(r.d1===why,'incorrect rejection reason '+name+': '+r.d1);
   assert(lab.sim.read(sy.FS_SRC,32768).every(v=>v===0xa5),'capture wrote rejected '+name);
   assert(lab.sim.u32(D.BUS_WINDOW_REG)===win,'capture changed mapper on rejection');writer(off,restore);
  }
  for(const dst of [0,sy.FS_SRC+1,0x9bb80000,0xb1ff8004]){
   assert(call('capture_native',{d0:ch,a0:dst},[0xf0,160]).d0===1,'bad destination accepted');
  }
  // Camera test-2 TFT register snapshot: aligned address plus independent SPOS=50.
  const realOffsets=[0x60,0x390,0x3a8,0x3c0,0x3d8,0x400,0x42c,0x430,0x4f0,0x4f4,0x4f8,0x4fc,0x500];
  const realValues=[0x2f,0x09e90f80,0x2b8,0x70,0x32,0,0x00940320,0x00080258,0x10,0x100,0,device==='tft'?0x2000:0x1000,0];
  const saved=realOffsets.map(off=>lab.sim.u32((0x9bb80000+ch*0x8000+off)>>>0));
  const cameraTile=Array.from({length:128},(_,y)=>Uint8Array.from({length:256},(_,x)=>(x+y*3)&255));
  const cameraStart=0x9e90f800+100+236*11136+336*2;
  lab.bus_rows(cameraStart,11136,256,128,cameraTile);
  realOffsets.forEach((off,i)=>writer(off,realValues[i]));
  const real=call('capture_native',{d0:ch,a0:sy.FS_SRC},[0xf0,160]);
  assert(real.d0===0,'camera aligned-base capture rejected: '+real.d1);
  assert(hash(lab.sim.read(sy.FS_SRC,32768))===hash(Buffer.concat(cameraTile)),'camera offset sampled wrong pixels');
  writer(0x390,0x09e90f81); // inconsistent nonzero low bits must still reject
  const bad=call('capture_native',{d0:ch,a0:sy.FS_SRC},[0xf0,160]);
  assert(bad.d0===1&&bad.d1===4,'inconsistent unaligned source accepted');
  realOffsets.forEach((off,i)=>writer(off,saved[i]));
  assert(call('capture_native',{d0:3,a0:sy.FS_SRC},[0xf0,160]).d0===1,'unsupported display accepted');
  const beforeBusy=get('FS_FRAMES');put('FS_BUSY',1);tick();assert(get('FS_FRAMES')===beforeBusy&&get('FS_BUSY')===1,'reentrant call');put('FS_BUSY',0);
  const savedDMA=lab.vsc.bank(ch).get('DMAEN');writer(0x60,savedDMA|0x10);
  tick();assert(get('FS_OWNER')===0&&lab.sim.u32(sy.FS_D+36)===1,'busy layer not diagnosed');
  writer(0x60,savedDMA);
  const savedFmt=lab.vsc.bank(ch).get('IMG1FMT');writer(0x400,3);tick();writer(0x400,savedFmt);
  assert(lab.sim.u32(sy.FS_D+28)===1&&lab.sim.u32(sy.FS_D+32)===2,'capture rejection not recorded');
  assert(lab.sim.u32(sy.FS_D_RAW+20)===3,'rejected source snapshot missing');
  // Exercise actual bounded CADLOG text formatter with a known capture rejection.
  lab.sim.word(sy.lg_cur,sy.lg_buf);lab.sim.word(sy.lg_lim,sy.lg_bend);lab.sim.word(sy.lg_ls,sy.lg_buf);
  const diagBefore=new Map(lab.vsc.bank(ch));
  call('fs_diag_text',{},[0xf0,24]);
  assert([...diagBefore].every(([k,v])=>lab.vsc.bank(ch).get(k)===v),'diagnostic changed display');
  const diag=Buffer.from(lab.sim.read(sy.lg_buf,lab.sim.u32(sy.lg_cur)-sy.lg_buf)).toString('latin1');
  assert(diag.includes('SCREEN VISUAL TEST 2')&&diag.includes('STFT current regs:')&&diag.includes('SEVF current regs:'),'diagnostic text incomplete');
  for(const phase of ['PRE','POST']){
   const label=device.toUpperCase()+'_'+phase+' active: ';
   const row=diag.split(/\r?\n/).find(line=>line.startsWith(label));
   const words=row.slice(label.length).trim().split(/\s+/).map(value=>parseInt(value,16));
   assert(words.length===39&&words[30]===diagBefore.get('SYNC1')&&words[31]===diagBefore.get('SYNC4'),'wrong retained '+label+'scan timing');
  }
  fs.writeFileSync(OUT+`/${device}-diagnostic.txt`,diag);
  // After leaving EVF the cached pre/post geometry must survive both an inactive
  // EVF tick and another channel's tick. Logging cannot depend on eye-sensor timing.
  if(device==='evf'){
   const retained=hash(lab.sim.read(sy.FS_ACTIVE,312)),dma=bank.get('DMAEN');
   writer(0x60,dma&~0x20);tick();writer(0x60,dma);
   call('fs_tick',{d0:1});
   assert(hash(lab.sim.read(sy.FS_ACTIVE,312))===retained,'EVF capture lost after switching away');
  }
  if (sy.fs_phase_read) {
   let now=10000;
   const record=Buffer.alloc(32);
   record[1]=1;
   record.writeUInt16LE(7,10);
   lab.hook(0x60023c05-IMAGE_BASE+0x50000000,(h,r)=>h.finish(r,{d0:now}),'controlled ZAF clock');
   put('PH_MODE',1);
   frame(640,480,640,480,1);
   for(const def of [20,0,-20]){
    const before=get('FS_FRAMES');
    record.writeInt16LE(def,12);
    for(let n=0;n<2;n++){
     record.writeUInt32LE(++now,4);
     lab.sim.write(0xa33d1dd4,record);
     tick();
    }
    assert(get('FS_FRAMES')===before+1 && get('FS_OWNER')===1,'ZAF did not publish on '+device);
    const dest=sy.FS_DST+get('FS_FLIP')*32768;
    for(const [y,side] of [[56,1],[72,-1]]){
     const i=y*64+32;
     assert(hash(lab.sim.read(dest+4*i,4))===hash(lab.sim.read(sy.FS_SRC+4*(i+side*Math.sign(def)*2),4)),
      'wrong ZAF pixel displacement on '+device);
    }
   }
   now+=150001;
   tick();
   assert(get('FS_OWNER')===0,'stale ZAF remained visible');
   put('PH_MODE',0);
  }
  // Changed epoch during render: force the race at the entry of our own renderer.
  const framesBeforeRace=get('FS_FRAMES');
  const renderer=sy.screen_map-IMAGE_BASE+0x50000000;
  lab.hook(renderer,(h,r)=>{put('FS_EPOCH',get('FS_EPOCH')+1);h.sim.run([],true);},'TEST-screen-epoch');
  tick();assert(get('FS_OWNER')===0&&get('FS_FRAMES')===framesBeforeRace,'published invalidated frame');
  out.push({device,cameraAlignedOffset:true,bufferSwapRetainsEpoch:true,stockDisabledLayerRecovered:true,
   stopRestores:true,videoGate:true,menuGate:true,invalidCaptureRejected:true,reentrancyGate:true,epochCancelsPublish:true,
   limitation:'native pipeline called by harness; source and GUI are fixtures; not camera timing'});
 }finally{lab.close();}
}
fs.writeFileSync(OUT+'/firmware-screen-results.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out));
