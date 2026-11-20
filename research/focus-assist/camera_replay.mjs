// Count-matched stress schedule, NOT a recording of camera event ordering or FPS.
const [EMU,BUILD,SYMS,OUT]=process.argv.slice(2);
const fs=await import('node:fs');const {default:assert}=await import('node:assert/strict');
const D=await import(EMU+'/src/lab/display.mjs');
const {labEnv}=await import(EMU+'/checks/lib/env.mjs');
const {expandImage}=await import(EMU+'/src/fw/expand.mjs');
const {IMAGE_BASE}=await import(EMU+'/src/fw/model.mjs');
const fixture=JSON.parse(fs.readFileSync(EMU+'/checks/fixtures/om3-camera-layout.json'));
const sy=JSON.parse(fs.readFileSync(SYMS));
const lab=new D.DisplayLab(labEnv({rom:expandImage(fs.readFileSync(BUILD+'/main.bin'))}));
try{
 lab.start(); lab.sim.word(0xa32de590,0x3ff);lab.set_gui_buffers();lab.open('tft');lab.palettes();lab.update();lab.through_permit('tft',1);lab.assume('A15',true);
 const put=(k,v)=>lab.sim.word(sy[k],v),get=k=>lab.sim.u32(sy[k]);
 const call=(k,args={},frame=[0xf0,48])=>lab.call(sy[k]-IMAGE_BASE+0x50000000,args,null,frame,2000000);
 const write=(off,v)=>lab.call(0x501f0dfc,{d0:2,d1:off/4,a0:v>>>0},null,[0x80,4]);
 const rows=fixture.addresses.map((_,n)=>Array.from({length:600},(_,y)=>Uint8Array.from({length:1600},(_,x)=>(x+y+n*31)&255)));
 const addresses=fixture.addresses.map(x=>parseInt(x,16)*16);
 addresses.forEach((a,n)=>lab.bus_rows(a+100,11136,1600,600,rows[n]));
 put('FS_ON',1);lab.sim.write(0xa32d9d0d,Uint8Array.of(2));lab.sim.write(0x62ce5864,Uint8Array.of(1,8));
 let th=0,stops=0,composites=0,continuityChecks=0;
 for(let i=0;i<fixture.counts.update;i++){
  const n=i%2,addr=addresses[n];
  const count=Math.floor((i+1)*fixture.counts.th/fixture.counts.update)-Math.floor(i*fixture.counts.th/fixture.counts.update);
  for(let j=0;j<count;j++){
   lab.live_view('tft',D.ThRequest.scaled(1,addr,[50,0],[800,600],[800,600],[50,0],[5568,3920]));lab.update();th++;
   if(get('FS_OWNER')===1){
    assert(lab.vsc.bank(2).get('DMAEN')&16,'stock refresh disabled the held TFT overlay');
    assert.equal(lab.vsc.bank(2).get('IMG2PLANC'),256,'stock refresh hid the held TFT overlay');
    continuityChecks++;
   }
  }
  fixture.offsets.forEach((off,k)=>write(off,k===1?addr/16:parseInt(fixture.registers[k],16)));
  call('fs_tick',{d0:1});
  assert.equal(get('FS_FRAMES'),i+1,'count-matched schedule stopped publishing');assert.equal(get('FS_OWNER'),1);
  assert.deepEqual(Array.from(lab.sim.read(sy.FS_SRC,4)),Array.from(rows[n][236].slice(672,676)),'wrong camera source offset');
  if(i%128===0||i===607){
   lab.img_attach.set(2,{regs:lab.img_steps(2),src:[800,600],base:addr+100,stride:11136,path:'camera-fixture'});
   lab.vsc.set_view(2,3);const composed=lab.compose('tft');assert.deepEqual(composed.errors,[]);
   assert.equal(composed.header.drawn&3,3,'image and split overlay not both drawn');
   const x0=148-composed.header.ox,y0=8-composed.header.oy;let changed=0;
   for(let y=0;y<600;y++)for(let x=0;x<800;x++){
    const row=rows[n][y],pair=(x>>1)*4;
    const original=(row[pair+3]<<16)|(row[pair+1]<<8)|row[pair+(x%2)*2];
    const got=composed.words[(y+y0)*composed.header.width+x+x0];
    if(x>=336&&x<464&&y>=236&&y<364)changed+=got!==original;
    else assert.equal(got,original,'overlay changed pixels outside centre');
   }
   assert(changed>100,'split overlay invisible in composite');composites++;
  }
  if(i===303||i===607){call('fs_stop',{d0:1},[0xf0,64]);stops++;assert.equal(get('FS_OWNER'),0);}
 }
 assert.equal(th,882);assert.equal(stops,2);
 // Native ownership takeover with enable still set: must NOT steal the layer.
 call('fs_tick',{d0:1});assert.equal(get('FS_OWNER'),1);
 write(0x624,0x80);const frames=get('FS_FRAMES');
 call('fs_tick',{d0:1});assert.equal(get('FS_OWNER'),0);assert.equal(get('FS_FRAMES'),frames);assert.equal(lab.vsc.bank(2).get('IMG2PLANC'),0x80);
 call('fs_tick',{d0:1});assert.equal(get('FS_FRAMES'),frames);assert.equal(lab.vsc.bank(2).get('IMG2PLANC'),0x80);
 assert(continuityChecks>800,'too few held-layer refreshes exercised');
 // test1 EVF_POST had pending B and latched A; a TFT refresh at this
 // point must leave both shared buffers byte-for-byte intact.
 const evf=lab.sim.m.devices.vsc.ch[1], enable=0x60/4, address=0x394/4;
 evf.w[enable]=evf.m[enable]=0x3f;
 evf.m[address]=sy.FS_DST>>>4;
 evf.w[address]=evf.m[address]+0x800;
 const beforeTiles=Buffer.from(lab.sim.read(sy.FS_DST,65536)),held=get('FS_HELD');
 call('fs_tick',{d0:1});
 assert.equal(get('FS_HELD'),held+1,'tick failed to defer both busy tiles');
 assert.equal(get('FS_BUSY'),0);
 assert.deepEqual(Buffer.from(lab.sim.read(sy.FS_DST,65536)),beforeTiles);
 const result={captureTicks:608,throughCalls:th,stops,publishedDuringReplay:608,visibleComposites:composites,continuityChecks,nativeTakeoverPreserved:true,
  retainedBothPendingAndLatchedTiles:true,
  evidence:'counts and two register snapshots observed; deterministic event order and pixels synthesized; no FPS, focus-distance, cache-coherence or camera visibility guarantee'};
 fs.writeFileSync(OUT+'/camera-replay-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{lab.close();}
