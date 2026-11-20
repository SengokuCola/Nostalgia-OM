// Observe the frame boundary between a native display update and the next histogram tick.
// baseline reproduces test 3. stable is the acceptance criterion for a future fix.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const [emu,build,symbols,mode='baseline']=process.argv.slice(2);
assert(['baseline','stable'].includes(mode));
const D=await import(emu+'/src/lab/display.mjs');
const {labEnv}=await import(emu+'/checks/lib/env.mjs');
const {expandImage}=await import(emu+'/src/fw/expand.mjs');
const {IMAGE_BASE}=await import(emu+'/src/fw/model.mjs');
const sym=JSON.parse(readFileSync(symbols));
const lab=new D.DisplayLab(labEnv({rom:expandImage(readFileSync(build+'/main.bin'))}));
try {
  lab.start(); lab.sim.word(0xa32de590,0x3ff); lab.set_gui_buffers(); lab.open('tft'); lab.palettes(); lab.update();
  lab.through_permit('tft',1); lab.assume('A15',true);
  const address=lab.load_lv_frame(D.test_card(),0x0a,1,D.LV_SCALED_CROP);
  const req=D.ThRequest.scaled(1,address,D.LV_SCALED_CROP,[1600,1080],[900,600],[0,0]);
  const setSource=()=>lab.live_view('tft',req);
  setSource(); lab.update();
  lab.sim.word(sym.FS_ON,1); lab.sim.write(0xa32d9d0d,Uint8Array.of(2));
  lab.sim.write(0x62ce5864,Uint8Array.of(1,8));
  // Arm before recording the first TH geometry, as in steady-state shooting.
  setSource(); lab.update();
  const tick=()=>lab.call(sym.fs_tick-IMAGE_BASE+0x50000000,{d0:1},null,[0xf0,48],2000000);
  const events=[];
  const sample=(phase)=>{
    lab.vsc.set_view(2,2); // isolate the split-image plane for the latched-frame check
    const c=lab.compose('tft');
    assert.deepEqual(c.errors,[]);
    events.push({phase,drawn:!!(c.header.drawn&2),enabled:!!(lab.vsc.bank(2).get('DMAEN')&0x10)});
    return c.words;
  };

  for(let i=0;i<3;i++){
    tick();
    const visible=sample('after histogram');
    assert(events.at(-1).drawn);
    setSource();
    lab.update();
    const intermediate=sample('after stock commit, before next histogram');
    if(mode==='stable'){
      assert(events.at(-1).drawn,'overlay did not survive stock commit');
      assert.deepEqual(intermediate,visible,'stock commit changed the displayed tile');
    }else assert(!events.at(-1).drawn,'expected test-3 baseline to drop the overlay');
  }
  if(mode==='stable'){
    // Exercise repeated commits before a fresh published image and before menu stop.
    for(let i=0;i<16;i++){
      setSource();lab.update();
      sample('uninterrupted stock refresh');
      assert(events.at(-1).drawn);
    }
    // Exercise an empty native slot with its opacity still set to fully opaque.
    // A register snapshot cannot establish the originating request, so this
    // is a controlled transition case, not a timed capture of a camera shot.
    const idleRequest=lab.alloc(lab.sim.read(D.IMG_STATE+2*3112,128),16);
    lab.sim.word(idleRequest+4,0);lab.sim.word(idleRequest+16,128);
    lab.call(0x501eff74,{d0:2,a0:idleRequest},null,[0xf0,28]);
    sample('empty full-opacity request');assert(events.at(-1).drawn,'idle opaque slot dropped the overlay');
    lab.sim.write(0x62ce5864,Uint8Array.of(2,0));lab.update();
    sample('menu');assert(!events.at(-1).drawn,'overlay carried into menu');
    tick();assert.equal(lab.sim.u32(sym.FS_OWNER),0);
    lab.sim.write(0x62ce5864,Uint8Array.of(1,8));tick();
    assert.equal(lab.sim.u32(sym.FS_OWNER),1);
    // Let the native compositor request an IMG2 of its own at zero opacity.
    const pending=lab.alloc(lab.sim.read(D.IMG_STATE+2*3112,128),16);
    lab.sim.word(pending+4,address);lab.sim.word(pending+16,0);
    lab.call(0x501eff74,{d0:2,a0:pending},null,[0xf0,28]);
    assert.equal(lab.vsc.bank(2).get('IMG2DMASADR'),address/16);
    assert.equal(lab.vsc.bank(2).get('IMG2PLANC')&511,0,'native transparency overridden');
    tick();assert.equal(lab.sim.u32(sym.FS_OWNER),0,'native takeover was reversed');
  }
  console.log(JSON.stringify({mode,events}));
}finally{lab.close();}
