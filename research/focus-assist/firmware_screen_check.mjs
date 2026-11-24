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
class FilmDisplayLab extends D.DisplayLab { static INSN_LIMIT=100000000; }
const out=[];
for(const device of ['tft','evf']){
 const lab=new FilmDisplayLab(labEnv({rom:expandImage(fs.readFileSync(BUILD+'/main.bin'))}));
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
  const call=(k,args={},frame=[0xf0,48])=>lab.call(sy[k]-IMAGE_BASE+0x50000000,args,null,frame,10000000);
  const tick=()=>call('fs_tick',{d0:mask});
  if(device==='tft'){
   if(sy.hilat_tail_86){
    const rom=fs.readFileSync(BUILD+'/main.bin'), main=0x6066c56c-0x60021020;
    const job=new Uint8Array(3200);
    for(let channel=0;channel<3;channel++){
     const pos=1252+640*channel;
     job.set(rom.subarray(main,main+512),pos);
     job.set(rom.subarray(main-128,main),pos+512);
    }
    const data=lab.alloc(job,16),diag=lab.alloc(new Uint8Array(64),16);
    const apply=()=>call('hilat_apply',{a3:data,a1:diag},[0xf0,20]).d0;
    assert(apply()===7,'camera highlight reference curve rejected');
    const result=lab.sim.read(data,job.length);
    for(let channel=0;channel<3;channel++){
     const pos=1252+640*channel, curve=new DataView(result.buffer,result.byteOffset+pos,512);
     assert(hash(result.slice(pos,pos+322))===hash(job.slice(pos,pos+322)),'highlight midtones changed');
     assert(curve.getUint16(482,true)<4095 && curve.getUint16(510,true)===4095,'highlight shoulder');
    }
    job[1252+640+510]^=1;
    lab.sim.write(data,job);
    assert(apply()===6 && hash(lab.sim.read(data,job.length))===hash(job),'mismatched RGB curve mutated');
   }
   // LookLab's custom caption bitmap can contain any pattern, including edge pixels.
   const bits=Uint8Array.from({length:288},(_,i)=>(i*37+129)&255);
   const sourceAddress=lab.alloc(bits,16);
   const want=new Uint8Array(30*sy.FB_PITCH).fill(33), page=lab.alloc(want.slice(),16);
   for(let y=0;y<30;y++)for(let x=0;x<240;x++){
    const sx=Math.floor(x*3/5),sourceY=Math.floor(y*16/30);
    if(bits[sourceY*18+(sx>>3)] & (128>>(sx&7)))want[y*sy.FB_PITCH+x*2]=224;
   }
   call('fb_stamp_caption',{a0:sourceAddress,a1:page},[0xf0,28]);
   assert(hash(lab.sim.read(page,want.length))===hash(want),'custom caption raster changed');
  }
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
   // PH_MODE=1 (ZAF.TXT on card) enables sweep/AF diagnostics while drawing
   // contrast-based split displacement even with no lens or ZAFInfo.
   put('PH_MODE',1);
   lab.sim.write(0xa32d3d32,Uint8Array.of(0));
   lab.sim.write(0xa33d1dd4,Buffer.alloc(32));
   frame(640,480,640,480,2);
   const beforeDiag=get('FS_FRAMES');
   tick();
   assert(get('FS_FRAMES')===beforeDiag+1 && get('FS_OWNER')===1,'ZAF.TXT suppressed contrast screen on '+device);
   call('fs_stop',{d0:mask},[0xf0,64]);
   lab.update();

   // PH_MODE=2 exercises the signed ZAFInfo phase-only path.
   let now=10000;
   const record=Buffer.alloc(32);
   record[1]=1;
   record.writeUInt16LE(7,10);
   lab.hook(0x60023c05-IMAGE_BASE+0x50000000,(h,r)=>h.finish(r,{d0:now}),'controlled ZAF clock');
   put('PH_MODE',2);
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
  if (sy.FB_SLOT && !(device==='evf' && sy.FB_DISPLAY_MASK)) {
   frame(640,480,640,480,0);
   // The lab has no stock attach for custom IMG2. Check its actual DMA source and taps.
   const composeTile=()=>{
    const req=sy.FS_REQ, word=i=>lab.sim.u32(req+i*4);
    const w=word(4)&65535,h=word(5)&65535;
    const picker=get('FS_LV_CARD')===2, pitch=picker?120:32, lastX=picker?899:127,lastY=picker?599:127;
    assert(word(0)*16===(picker?get('FB_FRONT_PAGE'):sy.FS_DST) &&
     word(1)===pitch && word(2)===pitch,'IMG2 buffer');
    assert(word(6)===(picker && w===900 && h===600?0:17) && Math.abs((w-1)*word(7)/4096-lastX)<1 &&
     Math.abs((h-1)*word(9)/4096-lastY)<1,'IMG2 scaler span');
    if(!picker){
     // The emulator implements YC422, not the stock colour wheel's RGBA format.
     // Verify the native descriptor and actual source pixels independently.
     assert(word(3)===3 && word(12)===0x1100,'pixel-alpha plane disabled');
     assert(lab.sim.u32(sy.FS_DST)===0 && lab.sim.u32(sy.FS_DST+8*4)===0x80808080 &&
       lab.sim.u32(sy.FS_DST+16*4)===0x808080ff,'transparent, half and opaque card pixels');
     assert(lab.sim.u32(sy.FS_DST+24*4)===0xfe0000c0,'red channel or alpha packing');
     return;
    }
    const view=lab.compose(device);
    assert((view.header.drawn&2) && view.errors.every(e=>e.source==='harness' &&
     e.name==='IMG_EDGE_UNKNOWN' && e.value===1 &&
     e.offset===0x504),JSON.stringify(view.errors));
    return view;
   };
   const card=Buffer.alloc(16+16*16*4,128);
   card[19]=0;card[27]=255;card.set([76,85,255,192],28);
   card.writeUInt16LE(16,6);card.writeUInt16LE(16,8);
   put('CC_BUF_UC',lab.alloc(card,16));put('MF_CFG_CARD',1);put('MF_CFG_PREV',1);
   let reviewHandle;
   if(device==='tft'){
    const h=lab.alloc(Buffer.alloc(4),4), rec=sy.cc_rec_sample+0x40000000;
    reviewHandle=h;
    lab.sim.word(h,0x60f147f8);let calls=0;
    lab.hook(sy.cc_stock_recdisp-IMAGE_BASE+0x50000000,(hle,r)=>{
     assert(r.a0===h && r.a1===h,'capture-review handle');
     if(!get('CC_BUF_UC'))assert(!get('FB_SLOT') && !get('FS_OWNER'),'picker active at first review submit');
     calls++;hle.finish(r,{d0:17});
    },'native capture-review submit');
    const submit=()=>call('cc_recdisp',{a0:h,a1:h},[0x30,24]);
    put('FS_BLACKOUT',4);
    lab.sim.write(sy.lg_on,Uint8Array.of(2));submit();
    assert(get('FS_OWNER')===1 && get('CC_REVIEW') && get('FS_BLACKOUT')===4,'review must publish during blackout with debug off');
    composeTile();
    call('fs_stop',{d0:mask},[0xf0,64]);
    // Replay REC_DISP's pending TFT DMAEN (IMG1 plus native OSD, IMG2 cleared).
    lab.sim.word(0x9bb90060,0x27);
    lab.update();
    assert(get('FS_OWNER')===1 && (lab.vsc.bank(ch).get('DMAEN')&16),'review lost after histogram stop and stock commit');
    assert(!lab.sim.u32(rec),'disabled capture-review probe');
    lab.sim.write(sy.lg_on,Uint8Array.of(1));submit();
    assert(calls===2 && lab.sim.u32(rec)===1 && lab.sim.u32(rec+4)===0x60f147f8,'capture-review diagnostic');
    assert(lab.sim.u32(rec+72)===bank.get('IMG1DMASADR') &&
     lab.sim.u32(rec+192)===bank.get('IMG1DMASADR'),'capture-review TFT snapshots');
   }
   put('CC_REVIEW',0);put('FS_BLACKOUT',0);
   put('MF_CFG_POS',2);
   for(let n=0;n<3;n++){tick();lab.update();lab.compose(device);}

   assert(get('FS_OWNER')===1,'card acquisition');composeTile();
   const osdBefore=lab.vsc.bank(ch).get('DMAEN')&15;
   const focusStrength=lab.sim.u32(sy.fs_strength+0x40000000);
   const focusMap=hash(lab.sim.read(sy.FS_MAP,16384));
   // Use the same native MM allocation as the actual GUI entry.
   const savedState=lab.sim.read(sy.STATE,2).slice(),testP=sy.POOL+0xa000;
   const bankFixture=Buffer.alloc(1632);
   for(let n=0;n<20;n++)bankFixture.write('Test '+(n+1),1312+n*16,'ascii');
   const savedP=lab.sim.u32(testP),savedL=lab.sim.u32(testP+sy.LPTR),savedMask=get('MF_CFG_FLMASK');
   lab.sim.write(sy.STATE,Uint8Array.of(1,0xa0));lab.sim.word(testP,sy.MAGIC);
   lab.sim.word(testP+sy.LPTR,lab.alloc(bankFixture,16));put('MF_CFG_FLMASK',0xfffff);
   lab.props.set(4000,2048);lab.props.set(4001,768);lab.props.set(6,0);
   const originalIndexes=lab.sim.read(testP+sy.LIDX,4).slice(),oldBlock=lab.sim.u32(testP+sy.TORG);
   lab.sim.word(testP+sy.TORG,lab.alloc(Buffer.alloc(sy.SP_BLK),16));
   lab.sim.write(testP+sy.LIDX,Uint8Array.of(0,2,0,2)); // second COLOR 4 recipe = FILM 17
   // Native profile attributes for the occupied rows (also exercise older firmware).
   for(let i=0;i<18;i++){
    const def=sy.pf_ids+4*i,id=lab.sim.u32(def)&65535,step=lab.sim.read(def+2,1)[0];
    for(const slot of [1,3])if(!lab.props.has(id+slot*step))lab.props.set(id+slot*step,0);
   }
   lab.sim.write(sy.LG_GUI,Uint8Array.of(4,3));put('FB_SCP_COLOR',1);
   for(let id=15746;id<15754;id++){
    assert(call('ar_ic',{d0:id},[0,0]).a0===sy.fb_scp_badge_slot,'inconsistent Film cell '+id);
   }
   put('FB_SCP_COLOR',2);
   assert(call('ar_ic',{d0:15749},[0,0]).a0!==sy.fb_scp_badge_slot,'Film badge without binding');
   put('FB_SCP_COLOR',0);lab.sim.write(sy.LG_GUI,Uint8Array.of(1,8));
   lab.sim.write(testP+sy.LIDX,originalIndexes);lab.sim.word(testP+sy.TORG,oldBlock);
   assert(call('fb_pages_init',{},[0xf0,24]).d0===1 && get('FB_HANDLE')>>>8===0x32 &&
     get('FB_PAGE2')-get('FB_PAGES')===sy.FB_PAGE_BYTES,'exclusive native-resolution pages');
   put('FB_SLOT',1);
   const before=get('FS_FRAMES');
   const previousTile=sy.FS_DST+get('FS_FLIP')*32768;
   const original=hash(lab.sim.read(previousTile,32768));
   put('FB_OPEN_GUI',0x0401);
   lab.sim.write(sy.LG_GUI,Uint8Array.of(1,4));tick();
   assert(get('FB_SLOT')===1 && get('FS_FRAMES')===before,'black transition closed pending picker');
   lab.sim.write(sy.LG_GUI,Uint8Array.of(1,8));
   if(sy.fb_inset_request){
    // Original full-size stock requests enter the built hook. Do not supply
    // inset geometry from the host or put scene pixels into a UI page.
    const nativeOsd=lab.vsc.bank(ch);
    const stockBase=nativeOsd.get('OSD1DMASADR'),stockPitch=nativeOsd.get('OSD1DMALD');
    const paletteBefore=Array.from(lab.vsc.palette(ch)[0]);
    let last;
    for(const [sw,sh] of [[800,600],[810,540],[800,450]]){
     for(const i of [0,1]){
      const rows=Array.from({length:sh},(_,y)=>Uint8Array.from({length:sw*2},(_,b)=>
       b%2?128:i*16+(b<24?32:b>=2*sw-24?64:y<12?96:y>=sh-12?128:160)));
      const address=lab.load_lv_frame([sw,sh,rows],10,i+1,[50,0]);
      const req=D.ThRequest.scaled(mask,address,[50,0],[sw,sh],[sw,sh],[50,0]);
      const result=lab.live_view(device,req);
      assert(hash(lab.sim.read(result.request,224))===hash(req.pack()),'TH caller request overwritten');
      lab.update();lab.compose(device);tick();lab.update();
      const v=lab.compose(device),regs=lab.vsc.bank(ch);
      const rw=regs.get('IMG1AREA1')&65535,rh=regs.get('IMG1AREA2')&65535;
      const rx=(regs.get('IMG1AREA1')>>>16)-(regs.get('VIDEOAREA1')>>>16);
      const ry=(regs.get('IMG1AREA2')>>>16)-(regs.get('VIDEOAREA2')>>>16);
      assert(rw<=574&&rh<=430&&rw>500&&rx>=298&&Math.abs(rw/rh-sw/sh)<0.015,
       'native TH inset '+[sw,sh,rx,ry,rw,rh]);
      assert((regs.get('IMG2AREA1')&65535)===270 && get('FB_COPY_US')===0,'sidebar owns scene');
      assert(v.errors.length===0,'native composite '+JSON.stringify(v.errors));
      if(sy.fb_rim_bind){
       assert((v.header.drawn&8) && regs.get('OSD1DMASADR')===get('RIM_DMA') &&
        regs.get('OSD1DMALD')===stockPitch,'frame did not acquire its indexed plane');
       const luma=(x,y)=>v.words[y*v.header.width+x]&255;
       assert(luma(500,20)>140 && luma(500,60)>20,'matte top plate or surround missing');
       for(const scan of [[[500,76],[500,93]],[[500,524],[500,544]],
                          [[278,300],[297,300]],[[874,300],[892,300]]]){
        const [[ax,ay],[bx,by]]=scan, levels=[];
        for(let y=ay;y<=by;y++)for(let x=ax;x<=bx;x++)levels.push(luma(x,y));
        assert(Math.max(...levels)-Math.min(...levels)>80,'missing bezel edge '+scan);
       }
      }
      const edge=[[2,rh>>1],[rw-3,rh>>1],[rw>>1,2],[rw>>1,rh-3],[rw>>1,rh>>1]]
       .map(([x,y])=>v.words[(ry+y)*v.header.width+rx+x]&255);
      assert(String(edge)===String([32,64,96,128,160].map(x=>x+16*i)),'view edges '+edge);
      if(i===1){
       const currentPage=get('FB_FRONT_PAGE');
       const sidebar=hash(lab.sim.read(currentPage,sy.FB_PAGE_BYTES));
       const row=new Uint8Array(sw*2);
       for(let j=0;j<row.length;j+=2){row[j]=208;row[j+1]=128;}
       lab.load_lv_frame([sw,sh,Array(sh).fill(row)],10,i+1,[50,0]);
       // Native scanout sees a fresh sensor frame without even running fs_tick.
       const live=lab.compose(device);
       assert((live.words[(ry+(rh>>1))*live.header.width+rx+(rw>>1)]&255)===208 &&
        !live.errors.length,'new scene waited for sidebar render');
       assert(get('FB_FRONT_PAGE')===currentPage &&
        hash(lab.sim.read(currentPage,sy.FB_PAGE_BYTES))===sidebar,'scene repainted sidebar');
      }
      last={req,address,sw,sh};
     }
    }
    const step=(slot,dir)=>{call('fb_enqueue',{d0:slot,d2:dir},[0xf0,32]);put('FB_SLOT',slot);put('FB_DIRECTION',dir);};
    const paint=()=>{lab.update();lab.compose(device);tick();return get('FB_PAINTED')&31;};
    step(2,1);step(3,1);step(4,1);
    assert(paint()===2,'first detent lost');
    step(3,-1);step(2,-1);step(1,-1);
    assert(paint()===1,'reversal replayed superseded detents');
    step(2,1);step(3,1);step(4,1);
    for(const n of [2,3,4])assert(paint()===n,'continuous rotation skipped '+n);
    // Advance every enabled position across wrap, with several detents per
    // input report. The displayed slot must never skip an intermediate roll.
    let cursor=4;
    for(const dir of [1,-1]){
     const expected=[];
     for(let n=0;n<20;n++){cursor=(cursor-1+dir+20)%20+1;step(cursor,dir);expected.push(cursor);}
     for(const slot of expected)assert(paint()===slot,'burst skipped '+slot);
    }
    const old=get('FB_PAINTED');
    step(5,1);
    let reversed=false;
    lab.hook_rt(sy.fb_draw,h=>{
     if(!reversed){reversed=true;put('FB_Q_WRITE',get('FB_Q_WRITE')-1);
      put('FB_Q_REV',get('FB_Q_REV')+1);put('FB_SLOT',4);put('FB_DIRECTION',-1);}
     h.sim.run([],true);
    },'reverse-in-flight');
    try{paint();}finally{lab.hooks.delete(sy.fb_draw);}
    assert(reversed && get('FB_PAINTED')===old,'cancelled back page reached the LCD');
    assert(get('FB_TH_STATS')>=6,'native requests not recorded');
    if(process.env.FILM_SCENE && process.env.FILM_BANK){
     const raw=fs.readFileSync(process.env.FILM_SCENE),w=raw.length/2160;
     assert([1440,1620].includes(w),'unexpected scene fixture');
     const rows=Array.from({length:1080},(_,i)=>raw.subarray(i*w*2,(i+1)*w*2));
     const addr=lab.load_lv_frame([w,1080,rows]);
     const request=D.ThRequest.scaled(mask,addr,[0,0],[w,1080],[w*600/1080,600],[0,0]);
     lab.live_view(device,request);lab.update();
     lab.sim.word(testP+sy.LPTR,lab.alloc(fs.readFileSync(process.env.FILM_BANK),16));
     put('FB_PAINTED',0);put('FB_CACHE',0);lab.sim.word(sy.FB_CACHE+12,0);
     for(let i=0;i<2;i++)paint();
     const view=lab.compose(device);
     assert(!view.errors.length,'camera scene composition');
     write_png(OUT+'/picker-native-scene.png',view.header.width,view.header.height,D.words_to_rgb(view.words));
    }
    let latestOsdBase=stockBase;
    if(sy.fb_rim_inks){
     // Stock can rotate a GUI buffer and switch LUTs while the picker is open.
     latestOsdBase=lab.vsc.bank(ch).get('OSD2DMASADR');
     writer(0x39c,latestOsdBase);
     const selector=lab.sim.u32(0x9bb904e0);
     writer(0x4e0,selector^1);
     assert(call('fb_rim_bind',{},[0xf0,20]).d0===4,'failed to follow OSD rotation');
     writer(0x4e0,selector);
    }
    call('fb_close',{},[0xf0,24]);
    if(sy.fb_rim_bind){
     assert(!get('RIM_DMA') && lab.sim.u32(0x9bb9039c)===latestOsdBase &&
      lab.sim.u32(0x9bb903b4)===stockPitch,'native HUD descriptor not restored');
     assert(Array.from(lab.vsc.palette(ch)[0]).every((v,i)=>v===paletteBefore[i]),
      'native palette changed after picker exit');
     writer(0x39c,stockBase);
    }
    lab.live_view(device,last.req);lab.update();
    assert((lab.vsc.bank(ch).get('IMG1AREA1')&65535)===last.sw,'native viewport survived exit');
   }else{
   const sourceFormat=lab.sim.u32(0x9bb80000+ch*0x8000+0x400);
   writer(0x400,3);
   tick();
   if(!get('FS_OWNER'))assert(hash(lab.sim.read(previousTile,32768))===original,'latched card was overwritten');
   for(let n=0;n<3 && !get('FS_OWNER');n++){lab.update();lab.compose(device);tick();}
   assert(get('FS_OWNER')===1 && get('FS_FRAMES')===before+1,'film box missing on '+device);
   assert(get('FB_MISSES') && lab.sim.u32(get('FB_FRONT_PAGE')+309*1920+586*2)===0x80108010,
     'first open without readable preview');
   writer(0x400,sourceFormat);lab.update();lab.compose(device);tick();
   assert((lab.vsc.bank(ch).get('DMAEN')&15)===0 && get('FB_OSD_CHANNEL')===ch,'picker HUD mask '+[lab.vsc.bank(ch).get('DMAEN'),get('FB_OSD_CHANNEL'),ch]);
   const firstPage=get('FB_FRONT_PAGE'), pageBytes=sy.FB_PAGE_BYTES;
   const first=hash(lab.sim.read(firstPage,pageBytes));
   const vw=get('FB_VIEW_W'),vh=get('FB_VIEW_H'),left=((1172-vw)>>1)&~1,top=(618-vh)>>1;
   const dx=Math.floor(638*4096/(vw-2)),dy=Math.floor(479*4096/(vh-1));
   for(const [x,y] of [[0,0],[vw-2,0],[0,vh-1],[vw-2,vh-1]]){
    const sx=(x*dx>>12)&~1,sy=y*dy>>12;
    assert(Math.abs(sx-x*638/(vw-2))<=2 && Math.abs(sy-y*479/(vh-1))<=1,'cropped preview');
    assert(hash(lab.sim.read(firstPage+(top+y)*1920+(left+x)*2,4))===
      hash(source[0].rows[sy].subarray(sx*2,sx*2+4)),'incorrect preview corner '+[device,x,y]);
   }
   composeTile();
   const areaX=lab.sim.u32(sy.FS_REQ+16);
   const areaY=lab.sim.u32(sy.FS_REQ+20);
   const sourceX=bank.get('VIDEOAREA1')>>>16,sourceY=bank.get('VIDEOAREA2')>>>16;
   const panelW=bank.get('VIDEOAREA1')&65535,panelH=bank.get('VIDEOAREA2')&65535;
   const nativeCanvas=sy.cap_picker_four_rows && device==='evf' && panelW>=900 && panelH>=600;
   const cw=nativeCanvas?900:panelW, chh=nativeCanvas?600:panelH;
   assert((areaX&65535)===cw && (areaY&65535)===chh,'picker size '+[device,areaX,areaY,cw,chh]);
   assert((areaX>>>16)===sourceX+(((panelW-cw)>>1)&~1) && (areaY>>>16)===sourceY+((panelH-chh)>>1),'picker placement');
   assert(get('FB_PAINTED')===1,'first high-resolution page');
   put('FB_DIRECTION',1);put('FB_SLOT',2);
   const phaseCosts=[];
   for(const phase of [1,2,3,4,0]){
    lab.update();lab.compose(device);
    const previous=get('FB_FRONT_PAGE'), pixels=hash(lab.sim.read(previous,pageBytes));
    phaseCosts.push(tick().insns);
    if(sy.cap_double_eight){
     const row=(y)=>lab.sim.read(get('FB_FRONT_PAGE')+(top+y)*1920+left*2,vw*2);
     if(sy.FB_MIRRORED){
      if(phase)for(let y=0;y<vh;y++)assert(hash(row(y))===hash(lab.sim.read(previous+(top+y)*1920+left*2,vw*2)),
       'animation changed the complete preview at row '+y);
     }else if(sy.cap_picker_four_rows){
      assert(hash(row(1))===hash(row(2)) && (hash(row(1))===hash(row(4)))===(phase!==0),'incorrect preview sampling group');
     }else assert((hash(row(1))===hash(row(2)))===(phase!==0),'incorrect moving/settled preview rows');
     const movingLast=lab.sim.read(get('FB_FRONT_PAGE')+(top+vh-1)*1920+left*2,4);
     assert(hash(movingLast)===hash(source[0].rows[(vh-1)*dy>>12].subarray(0,4)),'last preview row lost');
    }
    assert(get('FB_PAINTED')===(phase*64+2),'wrong scroll phase on '+device);
    assert(get('FB_FRONT_PAGE')!==previous && hash(lab.sim.read(previous,pageBytes))===pixels,
     'scanout page overwritten on '+device);
    assert(get('FS_OWNER')===1 && (lab.vsc.bank(ch).get('DMAEN')&31)===16,'native HUD flashed on '+device);
    composeTile();
   }
   if(sy.FB_FINE){
    for(let n=0;n<2;n++){lab.update();lab.compose(device);tick();}
    assert(get('FB_FINE')===1,'stationary scene did not request full detail');
    for(const y of [1,2,3,31,67]){
     const expected=source[0].rows[y*dy>>12];
     assert(hash(lab.sim.read(get('FB_FRONT_PAGE')+(top+y)*1920+left*2,4))===hash(expected.subarray(0,4)),
      'stationary preview still duplicated rows');
    }
   }
   fs.writeFileSync(OUT+'/'+device+'-scroll-cost.json',JSON.stringify(phaseCosts));
   assert(hash(lab.sim.read(get('FB_FRONT_PAGE'),pageBytes))!==first,'unchanged film box');
   const previewOffset=309*1920+586*2;
   const dma=bank.get('IMG1DMASADR'),origin=dma*16,bankStride=0x16f0800;
   const next=origin+(origin+bankStride<0xa0000000?bankStride:-bankStride);
   const nextRows=source[0].rows.map(row=>Uint8Array.from(row,x=>x^63));
   lab.bus_rows(next,D.LV_STRIDE,1280,480,nextRows);
   const rotateDuringCopy=(newDma,returnDma)=>{
    let row=0;
    lab.hook_rt(sy.cap_row,(h)=>{
     if(++row===8)h.sim.m.devices.vsc.write(ch*0x8000+0x390,newDma,4,false);
     if(row===16 && returnDma)h.sim.m.devices.vsc.write(ch*0x8000+0x390,returnDma,4,false);
     h.sim.run([],true);
    },'TEST-camera-IMG1-bank-rotation');
    try{lab.update();lab.compose(device);tick();}finally{lab.hooks.delete(sy.cap_row);}
    assert(row>=8,'rotation did not reach sampler');
   };
   const misses=get('FB_MISSES'),published=get('FB_PUBLISHED');
   rotateDuringCopy(next/16);
   assert(get('FB_PUBLISHED')===published+1 && get('FB_MISSES')===misses,'ordinary DMA rotation lost picker');
   const corner=(x,y)=>lab.sim.read(get('FB_FRONT_PAGE')+(top+y)*1920+(left+x)*2,4);
   const lastRow=(vh-1)*dy>>12;
   assert(hash(corner(0,0))===hash(source[0].rows[0].subarray(0,4)) &&
     hash(corner(0,vh-1))===hash((sy.FB_DISPLAY_MASK?source[0].rows:nextRows)[lastRow].subarray(0,4)),'wrong source after DMA rotation');
   const held=lab.sim.u32(get('FB_FRONT_PAGE')+previewOffset);
   rotateDuringCopy(next/16+8);
   assert(get('FB_PUBLISHED')===published+2 && get('FB_MISSES')===misses+1 &&
     get('FB_MISS_REASON')===14 && lab.sim.u32(get('FB_FRONT_PAGE')+previewOffset)===held,
     'invalid source change leaked a partial preview');
   if(sy.FB_DISPLAY_MASK){
    writer(0x390,dma);
    rotateDuringCopy(next/16,dma);
    assert(get('FB_MISSES')===misses+2 && get('FB_MISS_REASON')===14 &&
     lab.sim.u32(get('FB_FRONT_PAGE')+previewOffset)===held,'reused ring slot presented mixed rows');
   }
   writer(0x390,dma);lab.update();lab.compose(device);tick();
   const previousPixel=lab.sim.u32(get('FB_FRONT_PAGE')+previewOffset);
   const lastPanel=lab.sim.read(get('FB_FRONT_PAGE')+488*1920,268*2);
   frame(640,480,640,480,4,false);
   lab.update();lab.compose(device);tick();
   assert(lab.sim.u32(get('FB_FRONT_PAGE')+previewOffset)!==previousPixel,'preview froze on stationary film');
   assert(hash(lastPanel)===hash(lab.sim.read(get('FB_FRONT_PAGE')+488*1920,268*2)),'caption changed with scene');
   const advance=(want)=>{
    lab.update();lab.compose(device);tick();
    assert(get('FB_PAINTED')===want,'rapid wheel phase '+get('FB_PAINTED')+' expected '+want);
   };
   put('FB_SLOT',3);advance(64+3);
   put('FB_SLOT',5);advance(64+5);advance(128+5);
   put('FB_DIRECTION',-1);put('FB_SLOT',3);advance(7*64+3);advance(8*64+3);advance(3);
   if(sy.fb_enqueue){
    // Two more detents arrive before the first back page is published.
    const start=get('FB_Q_READ');
    for(const [slot,dir] of [[4,1],[5,1],[4,-1],[3,-1]]){
     call('fb_enqueue',{d0:slot,d2:dir},[0xf0,20]);
    }
    put('FB_SLOT',3);
    for(const [index,slot] of [4,5,4,3].entries()){
     lab.update();lab.compose(device);tick();
     assert((get('FB_PAINTED')&31)===slot && (get('FB_PAINTED')>>6)>0 &&
      get('FB_Q_READ')===start+index+1,'queued wheel pose lost '+[slot,get('FB_PAINTED'),get('FB_Q_READ')]);
    }
   }
   if(sy.FB_LAG){
    // A detent arrives while a settled page is already sampling sensor rows.
    for(let i=0;i<5;i++){lab.update();lab.compose(device);tick();}
    const total=get('FB_LAG'),start=get('FB_Q_WRITE'),front=get('FB_FRONT_PAGE');
    let rows=0;
    lab.hook_rt(sy.cap_row,h=>{
     if(++rows===8){
      const ix=start&1023;
      h.sim.write(sy.fb_queue_slots+0x40000000+ix,Uint8Array.of(4));
      put('FB_Q_WRITE',start+1);put('FB_SLOT',4);
     }
     h.sim.run([],true);
    },'TEST-wheel-during-preview');
    try{lab.update();lab.compose(device);tick();}finally{lab.hooks.delete(sy.cap_row);}
    assert(rows===8 && (get('FB_PAINTED')&31)===4 && get('FB_LAG')===total+1,'detent waited for full capture');
    const back=get('FB_FRONT_PAGE');
    for(let y=0;y<vh;y++)
     assert(hash(lab.sim.read(back+(top+y)*1920+left*2,vw*2))===hash(lab.sim.read(front+(top+y)*1920+left*2,vw*2)),
      'interrupted capture leaked partial preview');
   }
   // An optional visual fixture runs the same compositor with a captured
   // 1620x1080 YC422 frame and a legacy-format bank supplied by the caller.
   if(device==='tft' && process.env.FILM_SCENE && process.env.FILM_BANK){
    const sourceFile=fs.readFileSync(process.env.FILM_SCENE);
    const looks=fs.readFileSync(process.env.FILM_BANK);
    const w=sourceFile.length/(1080*2);
    assert([1440,1620].includes(w) && looks.length>=1632,'visual fixture dimensions');
    const rows=Array.from({length:1080},(_,i)=>sourceFile.subarray(w*2*i,w*2*(i+1)));
    const address=lab.load_lv_frame([w,1080,rows],0xa,1,[0,0]);
    lab.live_view(device,D.ThRequest.scaled(mask,address,[0,0],[w,1080],[w/1.8,600],[0,0]));
    lab.update();
    const priorState=lab.sim.read(sy.STATE,2).slice(), p=sy.POOL+0xa000;
    const priorTag=lab.sim.u32(p),priorBank=lab.sim.u32(p+sy.LPTR);
    lab.sim.write(sy.STATE,Uint8Array.of(1,0xa0));lab.sim.word(p,sy.MAGIC);
    lab.sim.word(p+sy.LPTR,lab.alloc(looks,16));
    const priorMask=get('MF_CFG_FLMASK');put('MF_CFG_FLMASK',0xfffff);
    put('FB_SLOT',4);put('FB_PAINTED',0);
    tick();lab.update();const view=composeTile();
    assert((lab.sim.u32(sy.FS_REQ+16)&65535)===900,'full width display');
    write_png(OUT+'/picker-scene.png',view.header.width,view.header.height,D.words_to_rgb(view.words));
    let index=0;
    const costs={scroll:[],preview:[]};
    for(const [slot,direction] of [[5,1],[4,-1]]){
     put('FB_SLOT',slot);put('FB_DIRECTION',direction);
     for(let phase=0;phase<5;phase++){
      lab.update();lab.compose(device);
      costs.scroll.push(tick().insns);lab.update();
      const pose=composeTile();
      write_png(OUT+'/picker-phase-'+(++index)+'.png',pose.header.width,pose.header.height,D.words_to_rgb(pose.words));
     }
    }
    for(let i=0;i<4;i++){
     lab.update();lab.compose(device);
     costs.preview.push(tick().insns);
    }
    fs.writeFileSync(OUT+'/picker-instructions.json',JSON.stringify(costs));
    lab.sim.write(sy.STATE,priorState);lab.sim.word(p,priorTag);lab.sim.word(p+sy.LPTR,priorBank);
    put('MF_CFG_FLMASK',priorMask);
    frame(640,480,640,480,0);
   }
   }
   lab.sim.write(sy.STATE,savedState);lab.sim.word(testP,savedP);lab.sim.word(testP+sy.LPTR,savedL);
   put('MF_CFG_FLMASK',savedMask);
   call('fb_close',{},[0xf0,24]);
   assert(!get('FB_SLOT') && !get('FS_OWNER'),'film box did not release '+device);
   assert((lab.vsc.bank(ch).get('DMAEN')&15)===osdBefore && !get('FB_OSD_CHANNEL'),'restore HUD');
   // Replay capture disabling DMA, changing the format, or submitting review first.
   for(const transition of (reviewHandle?['disabled','format','submit']:['disabled','format'])){
    assert(call('fb_pages_init',{},[0xf0,24]).d0===1,'reopen pages');
    put('FB_SLOT',1);lab.update();lab.compose(device);tick();
    assert(get('FS_OWNER')===1,'failed to reacquire picker');
    const reg=off=>lab.sim.u32(0x9bb80000+ch*0x8000+off);
    const savedAddress=lab.sim.u32(sy.FS_OWNER+16), last=reg(0x394);
    const offsets=[0x394,0x3ac,0x3c4,0x404,0x438,0x43c,0x504,0x508,0x50c,0x510,0x514,0x518,0x624];
    const saved=offsets.map((_,i)=>lab.sim.u32(sy.FS_OWNER+16+i*4));
    assert(last===get('FB_FRONT_PAGE')/16,'missing private page before capture '+[last,get('FB_FRONT_PAGE')/16,device]);
    if(transition==='disabled'){
     writer(0x60,reg(0x60)&~16);
     lab.update();lab.compose(device);
     // Stock has disabled scanout, but the close still owns the descriptor.
     put('FB_RETIRE',1);call('fb_retire_pages',{},[0xf0,20]);
     assert(get('FB_HANDLE') && get('FB_PAGES'),'returned buffer before descriptor restore');
    }
    else if(transition==='format')writer(0x404,3);
    if(transition==='submit'){
     const cardAddress=get('CC_BUF_UC');put('CC_BUF_UC',0);
     call('cc_recdisp',{a0:reviewHandle,a1:reviewHandle},[0x30,24]);
     put('CC_BUF_UC',cardAddress);
     assert(!get('FB_SLOT'),'picker still open at native review');
    }else call('fb_close',{},[0xf0,24]);
    assert(reg(0x394)===savedAddress && !(reg(0x60)&16),'stale capture page '+transition);
    offsets.forEach((off,i)=>assert(reg(off)===(transition==='format' && off===0x404?3:saved[i]),
      'stale capture descriptor '+transition+' '+off.toString(16)));
   }
   lab.update();lab.compose(device);call('fb_retire_pages',{},[0xf0,20]);
   assert(!get('FB_HANDLE') && !get('FB_PAGES'),'released resize buffer');
   tick();assert(get('FS_LV_CARD')===1 && get('FS_OWNER')===1,'card resume');
   call('fs_set_strength',{d0:focusStrength},[0xf0,32]);
   assert(hash(lab.sim.read(sy.FS_MAP,16384))===focusMap,'focus map after picker close');
   call('fs_stop',{d0:mask},[0xf0,64]);
   assert(!get('FS_OWNER'),'stale card survived capture stop');
   put('FS_BLACKOUT',2);tick();tick();assert(!get('FS_OWNER'),'card in shutter blackout');
   const invalidRow=Buffer.alloc(640*2);
   for(let x=0;x<invalidRow.length;x+=4)invalidRow.set([8,250,8,250],x);
   lab.bus_rows(source[0].address,D.LV_STRIDE,invalidRow.length,480,Array(480).fill(invalidRow));
   tick();assert(get('FS_OWNER')===1,'card lost on changing background');composeTile();
   frame(640,480,640,480,3);
   tick();assert(get('FS_OWNER')===1,'card after shutter blackout');
   put('MF_CFG_CARD',0);call('fs_stop',{d0:mask},[0xf0,64]);
  }
  // Changed epoch during render: force the race at the entry of our own renderer.
  const framesBeforeRace=get('FS_FRAMES');
  const renderer=sy.screen_map-IMAGE_BASE+0x50000000;
  lab.hook(renderer,(h,r)=>{put('FS_EPOCH',get('FS_EPOCH')+1);h.sim.run([],true);},'TEST-screen-epoch');
  tick();assert(get('FS_OWNER')===0&&get('FS_FRAMES')===framesBeforeRace,'published invalidated frame');
  if(device==='evf' && sy.FB_DISPLAY_MASK){
   put('FB_SLOT',1);
   tick();
   assert(!get('FB_SLOT') && !get('FB_OSD_CHANNEL') && !get('FB_Q_ACTIVE'),'EVF did not dismiss picker');
   call('fb_open_color',{},[0xf0,28]);
   assert(!get('FB_SLOT'),'opened picker on EVF');
  }else if(device==='evf' && sy.cap_picker_four_rows){
   // Measured 410-line field timing. A white 256x256 square occupies
   // 128 rows of the source field. It must remain square in the picker.
   lab.hooks.delete(renderer);
   assert(call('fb_pages_init',{},[0xf0,24]).d0===1,'field picker pages');
   put('FB_SLOT',1);put('MF_CFG_CARD',0);
   const base=0x09a43e00;
   const rows=Array.from({length:384},(_,y)=>Uint8Array.from({length:2048},(_,i)=>
    (i&1)?128:(y>=128&&y<256&&i>=768&&i<1280?220:32)));
   lab.bus_rows(base*16,11136,2048,384,rows);
   for(const [off,val] of [[0x720,1],[0x730,410],[0x420,0x00140400],[0x424,0x00110180],
    [0x42c,0x00140400],[0x430,0x00110180],[0x3a8,696],[0x3c0,128],[0x3d8,0],[0x400,0],
    [0x4f0,0],[0x390,base],[0x60,47]])writer(off,val);
   tick();
   const w=get('FB_VIEW_W'),h=get('FB_VIEW_H'), page=get('FB_FRONT_PAGE');
   const left=((1172-w)>>1)&~1, top=(618-h)>>1;
   assert(page && w===572 && h===430,'EVF 4:3 aperture '+[w,h,page]);
   const read=(x,y)=>lab.sim.read(page+(top+y)*1920+(left+x)*2,1)[0];
   const wide=Array.from({length:w},(_,x)=>read(x,h>>1)).filter(v=>v===220).length;
   const tall=Array.from({length:h},(_,y)=>read(w>>1,y)).filter(v=>v===220).length;
   assert(wide>130 && Math.abs(wide-tall)<=3,'EVF square stretched '+[wide,tall]);
   assert((get('FS_REQ')===page/16) && lab.sim.u32(sy.FS_REQ+16)===((82<<16)|900)
    && lab.sim.u32(sy.FS_REQ+20)===((59<<16)|300),'EVF field window');
   lab.vsc.set_view(ch,2);
   const raster=lab.compose(device);
   assert(!raster.errors.length && raster.header.width===1024 && raster.header.height===768,'field composite '+JSON.stringify(raster.errors));
   const ox=62+left,oy=84+top,mx=w>>1,my=h>>1;
   const colour=(x,y)=>raster.words[(oy+y)*1024+ox+x],white=colour(mx,my);
   const rw=Array.from({length:w},(_,x)=>colour(x,my)).filter(v=>v===white).length;
   const rh=Array.from({length:h},(_,y)=>colour(mx,y)).filter(v=>v===white).length;
   assert(rw===wide && rh===tall,'EVF field composition stretched square '+[rw,rh,wide,tall]);
   console.log('EVF square on simulated display: '+rw+'x'+rh);
   call('fb_close',{},[0xf0,24]);
  }
  out.push({device,cameraAlignedOffset:true,bufferSwapRetainsEpoch:true,stockDisabledLayerRecovered:true,
   ...(device==='evf'&&sy.FB_DISPLAY_MASK?{pickerDismissedOnEVF:true,pickerOpenBlockedOnEVF:true}:
    {filmCellConsistent:true,pickerSurvivesReturnToLiveView:true,pickerFollowsBankRotation:true,...(sy.fb_inset_request?{nativeCornersAndBanks:true,reverseDuringPaint:true}:{pickerRestoresMissedPreview:true})}),
   stopRestores:true,videoGate:true,menuGate:true,invalidCaptureRejected:true,reentrancyGate:true,epochCancelsPublish:true,
   // H7 camera log showed 778 successful presents while the photographed
   // TFT aperture contained corrupt pixels. Register-level IMG3 checks
   // cannot certify physical YC422 scanout on this plane.
   pickerScanout:sy.fb_inset_request?(device==='tft'?'stock IMG1 inset plus IMG2 sidebar':'stock EVF'):'sampled IMG1 through owned IMG2',
   limitation:'native pipeline called by harness; source and GUI are fixtures; not camera timing'});
 }finally{lab.close();}
}
fs.writeFileSync(OUT+'/firmware-screen-results.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out));
