// OM-3 screen test 5 EVF_PRE/POST. AREA3 and pixel data were not in that log.
// Exercise the native tick against the recorded layout; deliberately place a
// different prior second-field origin so accidental reuse cannot pass.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const [emu,build,symbols,mode='fixed']=process.argv.slice(2);
const D=await import(emu+'/src/lab/display.mjs');
const {labEnv}=await import(emu+'/checks/lib/env.mjs');
const {expandImage}=await import(emu+'/src/fw/expand.mjs');
const {IMAGE_BASE}=await import(emu+'/src/fw/model.mjs');
const sy=JSON.parse(readFileSync(symbols));
const lab=new D.DisplayLab(labEnv({rom:expandImage(readFileSync(build+'/main.bin'))}));
const call=(name,args={},frame=[0xf0,48])=>lab.call(sy[name]-IMAGE_BASE+0x50000000,args,null,frame,2000000);
const tick=()=>call('fs_tick',{d0:2});
const write=(off,value)=>lab.call(0x501f0dfc,{d0:1,d1:off/4,a0:value},null,[0x80,4]);
const get=name=>lab.vsc.bank(1).get(name);
try {
  lab.start();
  // Standalone DISPLAY fixture after loader and service initialization.
  lab.props.set(270, 0);
  lab.sim.word(0xa32de590, 0x3ff);
  lab.sim.word(0xa32de58c, 0x3ff);
   lab.set_gui_buffers(); lab.open('evf'); lab.palettes(); lab.update();
  lab.assume('A15',true); lab.vsc.set_view(1,2);
  // Replay the E147 scan registers; the GUI and source are synthetic.
  for(const [off,value] of [[0x720,1],[0x730,410],[0x420,0x00140400],[0x424,0x00110180],
    [0x42c,0x00140400],[0x430,0x00110180],[0x3a8,696],[0x3c0,128],[0x3d8,0],[0x400,0],
    [0x4f0,0],[0x4f4,256],[0x4f8,0],[0x4fc,256],[0x500,0],[0x60,47],[0x440,41]]) write(off,value);
  lab.sim.word(sy.FS_ON,1);lab.sim.write(0xa32d9d0d,Uint8Array.of(2));lab.sim.write(0x62ce5864,Uint8Array.of(1,8));

  for(const [n,reg] of [0x09a43e00,0x09d21f00].entries()){
    const rows=Array.from({length:384},(_,y)=>Uint8Array.from({length:2048},(_,i)=>(31*n+7*y+3*i)%211+17));
    lab.bus_rows(reg*16,11136,2048,384,rows);write(0x390,reg);tick();
    assert.equal(lab.sim.u32(sy.FS_FRAMES),n+1,'EVF did not publish');
    if(mode!=='baseline'){
      const mirror=[0x2394,0x23ac,0x2438,0x243c,0x2440].map(off=>lab.sim.u32(0x9bb88000+off));
      const captured=mirror.map((_,i)=>lab.sim.u32(sy.FS_ACTIVE+156+4*(34+i)));
      assert.deepEqual(captured,mirror,'EVF diagnostic lost the latched descriptor');
    }
    const map=Buffer.from(lab.sim.read(sy.FS_MAP,16384));
    const frame=lab.compose('evf');
    assert.deepEqual(frame.errors,[]);assert.equal(frame.header.drawn,2);
    assert.equal(frame.header.width,1024);assert.equal(frame.header.height,768);
    if(mode==='baseline'){
      assert.equal(get('IMG2AREA2')&65535,128);assert.equal(get('IMG2AREA3'),41);
      assert.notEqual(frame.words[320*1024+448],frame.words[321*1024+448]);
      console.log('v5: 128 rows per field, stale injected second-field origin, parity mismatch');break;
    }
    assert.equal(get('IMG2AREA2'),(177<<16)|64);assert.equal(get('IMG2AREA3'),177);
    assert.equal(get('IMG2DMALD'),16);assert.equal(get('IMG2DMABN'),16);
    const bg=frame.words[0],tile=Buffer.from(lab.sim.read(sy.FS_SRC,32768));
    for(let y=0;y<128;y++)assert.deepEqual(tile.subarray(y*256,(y+1)*256),
      Buffer.from(rows[160+(y>>1)].subarray(896,1152)),'incorrect centre capture');
    for(let y=0;y<768;y++)for(let x=0;x<1024;x++){
      let expected=bg;
      if(x>=448&&x<576&&y>=320&&y<448){
        const row=y-320, col=x-448;
        const pair=map.readUInt16LE(2*(row*64+(col>>1)));
        if(pair>=65534)expected=0x808000|(pair===65535?235:16);
        else {
          const p=pair*4;
          expected=(tile[p+3]<<16)|(tile[p+1]<<8)|tile[p+2*(col&1)];
        }

      }
      assert.equal(frame.words[y*1024+x],expected,'field pixel at '+x+','+y);
    }
  }
  if(mode!=='baseline'){
    lab.sim.word(sy.lg_cur,sy.lg_buf);lab.sim.word(sy.lg_lim,sy.lg_bend);lab.sim.word(sy.lg_ls,sy.lg_buf);
    call('fs_diag_text',{},[0xf0,24]);
    const log=Buffer.from(lab.sim.read(sy.lg_buf,lab.sim.u32(sy.lg_cur)-sy.lg_buf)).toString('latin1');
    const line=log.split(/\r?\n/).find(s=>s.startsWith('EVF_POST active:'));
    const words=line.split(':')[1].trim().split(/\s+/).map(s=>parseInt(s,16));
    assert.equal(words.length,39);assert.deepEqual(words.slice(30,32),[1,410]);
    assert.equal(words[19],(177<<16)|64);assert.equal(words[33],177);
    write(0x60,get('DMAEN')&~16);tick();
    assert.equal(lab.sim.u32(sy.FS_FRAMES),3,'failed to reacquire disabled field plane');
    call('fs_stop',{d0:2},[0xf0,64]);
    assert.equal(get('IMG2AREA3'),41);assert.equal(get('DMAEN')&16,0);
    tick();write(0x440,60);call('fs_stop',{d0:2},[0xf0,64]);
    assert.equal(get('IMG2AREA3'),60,'overwrote native second-field origin');
    const count=lab.sim.u32(sy.FS_FRAMES);
    write(0x60,get('DMAEN')&~16);write(0x730,411);tick();
    assert.equal(lab.sim.u32(sy.FS_FRAMES),count,'unknown field timing published');
    assert.equal(get('IMG2AREA3'),60);
    write(0x730,410);tick();
    const request=lab.alloc(lab.sim.read(D.IMG_STATE+3112,128),16);
    lab.sim.word(request,0x9d21f000);lab.sim.word(request+4,0);lab.sim.word(request+16,128);
    const commit=()=>lab.call(0x501eff74,{d0:1,a0:request},null,[0xf0,28]);
    for(let i=0;i<8;i++){
      commit();
      assert(get('DMAEN')&16,'empty EVF commit hid the overlay');
      const between=lab.compose('evf');
      assert.equal(between.header.drawn,2,'missing latched EVF tile between ticks');
    }
    // One address-only change at the end of each selected capture.
    const {w: programmed,m: latched}=lab.sim.m.devices.vsc.ch[1];
    let swap=0, changeStride=false, keepLatched=false;
    lab.hook(sy.cap_recheck-IMAGE_BASE+0x50000000,h=>{
      if(swap){
        h.sim.m.devices.vsc.write(0x8390,swap,4,false);
        if(!keepLatched)latched[0x390/4]=swap;
        swap=0;
      }
      if(changeStride){h.sim.m.devices.vsc.write(0x83a8,704,4,false);changeStride=false;}
      h.sim.run([],true);
    },'TEST-EVF-source-rotation');
    const before=lab.sim.u32(sy.FS_FRAMES);
    swap=0x09a43e00;tick();
    assert.equal(lab.sim.u32(sy.FS_D+32),14);
    assert.equal(lab.sim.u32(sy.FS_FRAMES),before);
    assert.equal(lab.sim.u32(sy.FS_OWNER),1);
    swap=0x09d21f00;tick();
    assert.equal(lab.sim.u32(sy.FS_OWNER),0,'repeated capture misses left a frozen overlay');
    tick();assert.equal(lab.sim.u32(sy.FS_FRAMES),before+1);
    changeStride=true;swap=0x09a43e00;tick();
    assert.equal(lab.sim.u32(sy.FS_D+32),13);
    assert.equal(lab.sim.u32(sy.FS_OWNER),0,'geometry change retained a stale tile');
    assert.deepEqual([0,4,8].map(off=>lab.sim.u32(sy.FS_EV_MISS+off)),[2,1,1]);
    write(0x3a8,696);tick();
    write(0x440,60);commit();
    assert.equal(get('DMAEN')&16,0,'held EVF layer after the native field origin changed');
    tick();assert.equal(lab.sim.u32(sy.FS_OWNER),1);
    lab.sim.word(request+4,0x9d21f000);lab.sim.word(request+16,0);commit();
    assert.equal(get('IMG2DMASADR'),0x09d21f00);
    assert.equal(get('IMG2PLANC')&511,0,'changed native opacity');
    tick();assert.equal(lab.sim.u32(sy.FS_OWNER),0,'took back an occupied native EVF layer');
    console.log('two 1024x768 composites: both field origins, crop, stride, every pixel and ownership verified');

    // Test 2 camera EVF_POST/SEVF. DMAEN and the descriptor may be in
    // different stages in the programmed and latched banks. Pixel content
    // and the order of the swaps below are fixtures.
    const cameraRegs=[
      [0x60,0x2f],[0x390,0x09e90f88],[0x3a8,0x2b8],[0x3c0,0x70],
      [0x3d8,0],[0x400,0],[0x42c,0x00540380],[0x430,0x00110180],
      [0x4f0,0],[0x4f4,0x100],[0x4f8,0],[0x4fc,0x100],[0x500,0]
    ];
    const addresses=[0x09e90f88,0x09a43e08];
    const sources=addresses.map((address,i)=>{
      const rows=Array.from({length:384},(_,y)=>
        Uint8Array.from({length:1792},(_,x)=>(i*61+7*y+3*x)%211+17));
      lab.bus_rows(address*16,11136,1792,384,rows);
      return rows;
    });
    for(const [reg,value] of cameraRegs)write(reg,value);
    const pinInput=()=>{
      for(const [reg] of cameraRegs)latched[reg/4]=programmed[reg/4];
      latched[0x60/4]&=~16;
    };
    const first=lab.sim.u32(sy.FS_FRAMES);
    keepLatched=true;
    for(let i=0;i<8;i++){
      const n=i%2;
      pinInput();
      swap=addresses[1-n];
      tick();
      assert.equal(lab.sim.u32(sy.FS_FRAMES),first+i+1,'lost a still-latched EVF source: '+JSON.stringify({
        tick:i,cap:lab.sim.u32(sy.FS_D+28),why:lab.sim.u32(sy.FS_D+32),
        pub:lab.sim.u32(sy.FS_D+36),
        bank:cameraRegs.map(([r])=>[r,programmed[r/4],lab.sim.u32(0x9bb8a000+r)])
      }));
      assert.equal(lab.sim.u32(sy.FS_OWNER),1);
      assert.deepEqual(lab.sim.read(sy.FS_SRC,256),sources[n][160].subarray(768,1024),
        'used the pending source instead of the one that stayed latched');
    }
    assert.equal(lab.sim.u32(sy.FS_EV_LATCHED),8);
    // A latch that already disagrees at the start is insufficient proof.
    latched[0x42c/4]^=2;
    swap=addresses[1];tick();
    assert.equal(lab.sim.u32(sy.FS_D+32),14);
    // A latch that switches to the new frame during the copy is also unsafe.
    keepLatched=false;
    pinInput();swap=addresses[0];tick();
    assert.equal(lab.sim.u32(sy.FS_D+32),14);
    assert.equal(lab.sim.u32(sy.FS_EV_LATCHED),8);
    tick();
    assert.equal(lab.sim.u32(sy.FS_OWNER),1);

    // Same geometry with both outputs selected, followed by a different
    // TFT-only size. Only a subsequent change to the EVF may release it.
    const requestGeometry=(mask,height)=>{
      const req=D.ThRequest.scaled(mask,addresses[0]*16,[0,0],[896,768],[896,height],[0,0]);
      call('fs_th_geometry',{a0:lab.alloc(req.pack(),16)},[0xf0,32]);
    };
    requestGeometry(2,768);
    tick();
    const epoch=lab.sim.u32(sy.FS_EPOCH);
    requestGeometry(3,768);
    requestGeometry(1,600);
    assert.equal(lab.sim.u32(sy.FS_EPOCH),epoch,'TFT request invalidated the EVF');
    assert.equal(lab.sim.u32(sy.FS_OWNER),1);
    requestGeometry(2,378);
    assert.equal(lab.sim.u32(sy.FS_EPOCH),epoch+1);
    assert.equal(lab.sim.u32(sy.FS_OWNER),0,'changed EVF geometry retained an old tile');
    // Test 4 camera at XPan 65:24. The upper ring and corrupt lower block
    // in IMG_9478/9479 are consistent with scanning beyond one owned tile.
    write(0x42c,0x00140400); write(0x430,0x007200bd);
    write(0x3c0,0x80); write(0x390,addresses[0]); tick();
    assert.equal(get('IMG2AREA2'),0x00b00040);
    const tileAddress=get('IMG2DMASADR')*16;
    const physicalRows=64, burst=256;
    const dmaEnd=ld=>tileAddress + (2*(physicalRows-1)+1)*ld*16+burst;
    assert.equal(dmaEnd(get('IMG2DMALD')),tileAddress+32768);
    assert(dmaEnd(32)>tileAddress+32768,'test 4 doubled pitch did not reproduce the overrun');
    const shot=lab.compose('evf');
    assert.deepEqual(shot.errors,[]);
    const painted=Buffer.from(lab.sim.read(tileAddress,32768));
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      const pos=y*256+4*(x>>1);
      const yc=(painted[pos+3]<<16)|(painted[pos+1]<<8)|painted[pos+2*(x&1)];
      assert.equal(shot.words[(318+y)*1024+448+x],yc,'XPan field or pitch mismatch');
    }
    console.log('eight latched rotations preserved the EVF, stale latches rejected, per-output TH invalidation verified');
  }
} finally {lab.close();}
