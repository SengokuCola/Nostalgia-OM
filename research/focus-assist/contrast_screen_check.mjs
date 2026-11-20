// Exercise the assembled estimator and the actual remapping. Chroma never
// changes the result. The soft edge is a box-blurred version of the same edge.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const [emu, build, file] = process.argv.slice(2);
const sy = JSON.parse(readFileSync(file));
const {DisplayLab} = await import(emu+'/src/lab/display.mjs');
const {labEnv} = await import(emu+'/checks/lib/env.mjs');
const {expandImage} = await import(emu+'/src/fw/expand.mjs');
const {IMAGE_BASE} = await import(emu+'/src/fw/model.mjs');
const lab = new DisplayLab(labEnv({rom:expandImage(readFileSync(build+'/main.bin'))}));
const call = (name,regs,frame) => lab.call(sy[name]-IMAGE_BASE+0x50000000,regs,null,[0xf0,frame],1200000);
const half=address=>Buffer.from(lab.sim.read(address,2)).readUInt16LE();
try {
  lab.start();
  for (const vertical of [true,false]) {
    const measured=[];
    for(const width of [16,8,4,2,1,2,4,8,16]){
      const tile=Buffer.alloc(32768);
      for(let y=0;y<128;y++)for(let x=0;x<128;x++){
        const t=vertical ? x : y;
        const i=2*(128*y+x);
        tile[i]=32+Math.round(180*Math.max(0,Math.min(1,(t-63)/width)));
        tile[i+1]=(x*17+y*5)&255;
      }
      lab.sim.write(sy.FS_SRC,tile);
      const strength=call('fs_measure',{},48).d0;
      measured.push(strength);
      call('fs_set_strength',{d0:strength},32);
      // Centre split displaces upper and lower pairs in opposite directions.
      for(const [y,sign] of [[56,1],[72,-1]]){
        const idx=y*64+32;
        assert.equal(half(sy.FS_MAP+2*idx),idx+sign*strength);
      }
    }
    assert.equal(measured[0],4);assert.equal(measured[4],0);
    assert.ok(new Set(measured).size>=3);
    assert.deepEqual(measured,measured.toReversed());
    assert.deepEqual(measured.slice(0,5),measured.slice(0,5).sort((a,b)=>b-a));
    console.log(vertical?'vertical':'horizontal',measured.join(' '));
  }
  lab.sim.write(sy.FS_SRC,Buffer.alloc(32768,128));
  assert.equal(call('fs_measure',{},48).d0,4,'featureless frame claimed a sharp edge');
  // Replay scores on either side of the real camera's last 1.92 reading.
  const coarse=131072;
  const vote=(score,raw,panel=1,energy=coarse)=>{
    lab.sim.word(sy.fs_focus_stats+0x40000000,Math.round(score*energy/16));
    lab.sim.word(sy.fs_focus_stats+0x40000004,energy);
    const level=call('fs_filter_band',{d0:raw,d1:panel},20).d0;
    call('fs_set_strength',{d0:level},32);
    return level;
  };
  assert.equal(vote(1.92,3),3);
  for(let i=0;i<128;i++)
    assert.equal(i%2?vote(1.90,3):vote(2.08,2),3);
  assert.deepEqual([1,2,3].map(()=>vote(2.4,2)),[3,3,2]);
  assert.equal(vote(1.92,3),2);
  assert.deepEqual([1,2,3].map(()=>vote(1.75,3)),[2,2,3]);
  assert.deepEqual([1,2,3].map(()=>vote(4.2,0)),[3,3,0]);
  assert.deepEqual([1,2,3].map(()=>vote(0,4,1,0)),[0,0,4]);
  assert.equal(vote(2.4,2,2),2);
  console.log('128 alternating threshold samples held; both transitions, low detail and display switching passed');
  // Each slot belongs to a single attempt, including across ring wrap.
  for(let seq=1;seq<=133;seq++){
    const outcome=seq%7;
    call('fs_trace_record',{d0:outcome,d1:1},20);
    const slot=sy.FS_TRACE_ROWS+(seq%128)*32;
    assert.equal(lab.sim.u32(slot),seq);
    assert.equal(lab.sim.u32(slot+8),outcome);
    assert.equal(lab.sim.u32(slot+24),[1,2,4].includes(outcome)?0xffffffff:lab.sim.u32(sy.fs_focus_stats+0x40000008));
  }
  assert.equal(lab.sim.u32(sy.FS_TRACE_HEAD),133);
  assert.equal(lab.sim.u32(sy.FS_TRACE_ROWS+6*32),6);
  console.log('trace ring wrapped with no stale scores on unsampled attempts');
  if (sy.aw_entry) {
    const source=0xa33eabe4;
    const calls=[0x6099ebeb,0x6099eed3,0x609a0db7];
    function publish(site,value) {
      const regs={d0:value>>>0,d1:0xb1234567,a0:0x62345678,a1:0x63456789};
      const result=lab.call(site-IMAGE_BASE+0x50000000,regs,null,[0,0],10000,new Set([site+5]));
      for(const [k,v] of Object.entries(regs)) assert.equal(result[k]>>>0,v);
      assert.equal(result.mdr>>>0,site+5);
      assert.equal(half(source),value&65535);
    }
    for(const [sections,on,mode] of [[0,1,1],[0x20,0,1],[0x20,1,0]]) {
      lab.sim.word(0xa32de58c,sections);
      lab.sim.word(sy.FS_ON,on);
      lab.sim.word(sy.PH_MODE,mode);
      publish(calls[0],-19);
      assert.equal(lab.sim.u32(sy.AW_HEAD),0);
    }
    lab.sim.word(sy.PH_MODE,1);
    let head=0,previous=null;
    for(let n=0;n<190;n++){
      const site=calls[n%3], value=[-32768,-32768,-32767,0,111,111,32767][n%7];
      publish(site,value);
      if(value!==-32768 || previous!==-32768){
        head++;
        const slot=sy.AW_ROWS+(head%128)*12;
        assert.equal(lab.sim.u32(slot),head);
        assert.equal(half(slot+8),value&65535);
        assert.equal(half(slot+10),(site+5)&65535);
      }
      previous=value;
      assert.equal(lab.sim.u32(sy.AW_HEAD),head);
    }
    assert.ok(head>128);
    lab.sim.word(sy.FS_ON,0);
    lab.sim.word(sy.PH_MODE,0);
    console.log('AF native setters, stock return/arguments, invalid runs, valid repeats and 128-slot wrap passed');
  }
  if (sy.dr_gate) {
    // Run each actual shim through its native call frame and intercept only
    // the downstream driver. A reused packet is valid for separate requests.
    const routes = [
      ['abs',0xb0,20], ['sync',0xf0,32], ['async',0x30,16],
      ['main',0x20,12], ['sub',0x20,12], ['abs2',0xb0,20],
      ['mft_move',0xe0,28], ['mft_move2',0xe0,32],
      ['mft_ofs',0xe0,32], ['mft_ofs2',0xe0,32],
    ];
    const packet = Buffer.alloc(168, 0x53);
    const address = lab.alloc(packet, 4);
    let reached, activeFrame, shim, seq = 0;
    for (const stock of new Set(routes.map(([n])=>sy['dr_stock_'+n]))) {
      lab.hook(stock-IMAGE_BASE+0x50000000,(h,r)=>{
        reached = stock;
        assert.equal(r.a0>>>0,address>>>0);
        assert.equal(r.d0>>>0,91);
        assert.equal(r.d1>>>0,73);
        assert.equal(r.a1>>>0,85);
        assert.deepEqual(Buffer.from(h.sim.read(address,packet.length)),packet);
        const callSite = (r.mdr-7)>>>0, insn=Buffer.from(h.sim.read(callSite,7));
        assert.equal(insn[0],0xdd);
        assert.equal((callSite+insn.readInt32LE(1))>>>0,shim);
        assert.deepEqual([...insn.subarray(5)],activeFrame);
        h.return_here({...r,d0:23},activeFrame);
      },'driver handoff');
    }
    const submit = (i,value) => {
      const [name,mask,frame] = routes[i];
      packet.fill(0x53);
      packet.writeInt16LE(value, i<6?0:i<8?56:54);
      packet.writeUInt16LE(408,52);
      packet[58]=3;
      packet[2]=1;
      lab.sim.write(address,packet);
      reached=null;
      activeFrame=[mask,frame];
      shim=sy['dr_'+name];
      const r=lab.call(sy['dr_'+name]-IMAGE_BASE+0x50000000,
        {a0:address,d0:91,d1:73,a1:85},null,[mask,frame],10000);
      assert.equal(reached,sy['dr_stock_'+name]);
      assert.equal(r.d0,23);
    };
    for (const [sections,on,mode] of [[0,1,1],[0x20,0,1],[0x20,1,0]]) {
      lab.sim.word(0xa32de58c,sections);
      lab.sim.word(sy.FS_ON,on);
      lab.sim.word(sy.PH_MODE,mode);
      submit(0,-13);
      assert.equal(lab.sim.u32(sy.DR_HEAD),0);
    }
    lab.sim.word(sy.PH_MODE,1);
    for (let n=0;n<69;n++) {
      const i=n%routes.length, value=[-127,0,127][n%3];
      lab.sim.word(0xa33eabe4,0xffee);
      submit(i,value);
      seq++;
      const slot=sy.DR_ROWS+(seq%64)*16;
      assert.equal(lab.sim.u32(sy.DR_HEAD),seq);
      assert.equal(lab.sim.u32(slot),seq);
      assert.ok(lab.sim.u32(slot+4)<=0x7fffffff);
      assert.equal(lab.sim.u32(slot+8),((i+1)<<16)|(value&65535));
      assert.equal(lab.sim.u32(slot+12),((i===0||i===5?1:i<6?0:i<8?3:408)<<16)|0xffee);
    }
    lab.sim.word(sy.FS_ON,0);
    lab.sim.word(sy.PH_MODE,0);
    console.log('ten native driver handoffs, registers, signed packets, startup gates and ring wrap passed');
  }
  if (sy.fs_phase_read) {
    let now = 200000;
    const base = 0xa33d1dd4;
    lab.hook(0x60023c05-IMAGE_BASE+0x50000000,(h,r)=>h.finish(r,{d0:now}),'controlled ZAF clock');
    const sample = (token, def, area=7, ranging=1) => {
      const record = Buffer.alloc(32);
      record[1] = ranging;
      record.writeUInt32LE(token,4);
      record.writeUInt16LE(area,10);
      record.writeInt16LE(def,12);
      record.writeInt32LE(def*3,16);
      lab.sim.write(base,record);
      return call('fs_phase_read',{},24).d0 | 0;
    };
    for (const [def,shift] of [[15,2],[0,0],[-15,-2]]) {
      const token = ++now;
      assert.equal(sample(token,def),99);
      assert.equal(sample(token,def),99,'same result counted twice');
      assert.equal(sample(++now,def),shift);
      call('fs_set_strength',{d0:shift>>>0},32);
      for (const [y,sign] of [[56,1],[72,-1]]) {
        const i=y*64+32;
        assert.equal(half(sy.FS_MAP+2*i),i+sign*shift);
      }
    }
    call('fs_trace_record',{d0:0,d1:2},20);
    const row=sy.FS_TRACE_ROWS+(134%128)*32;
    assert.ok(lab.sim.u32(row+12)&512);
    assert.equal(lab.sim.u32(row+20)|0,-15);
    assert.equal(lab.sim.u32(row+24)|0,-45);
    assert.equal(lab.sim.u32(row+28),65536+7);
    assert.equal(sample(now-150001,-15),99,'stale');
    assert.equal(sample(++now,-32768),99,'invalid optical value');
    assert.equal(sample(++now,15,7,0),99,'ranging inactive');
    assert.equal(sample(++now,15),99);
    assert.equal(sample(++now,15,8),99,'new area needs confirmation');
    console.log('ZAF near/zero/far inverse maps, age, validity, area and signed trace passed');
  }
  if (sy.zr_sample) {
    const native = pc => pc - IMAGE_BASE + 0x50000000;
    const dst = lab.alloc(Buffer.alloc(10560), 4);
    const putHalf = (address, value) => {
      const b = Buffer.alloc(2);
      b.writeInt16LE(value);
      lab.sim.write(address, b);
    };
    for (const [layout, raw, flags] of [[0,0xaa094900,0xa7c53c00],[1,0xae660f00,0xac220200]]) {
      // Execute the stock allocator through its last relevant store.
      lab.call(native(0x60991138), {d0:layout}, null, [0xe0,36], 20000, new Set([0x6099168a]));
      assert.equal(lab.sim.u32(0xa33e99e8),raw);
      assert.equal(lab.sim.u32(0xa33e99ac),flags);
      for (const bank of [0,1]) {
        const v = raw - 0x40000000 + bank*2176;
        const f = flags - 0x40000000 + bank*1152;
        putHalf(v+1052,-301-bank); putHalf(v+9756,800);
        lab.sim.write(f+526, Uint8Array.of(0));
        lab.sim.write(f+5134,Uint8Array.of(1+bank));
        lab.call(native(0x609aa79b), {d0:bank,a0:dst}, null, [0xf0,112], 2000000);
        assert.equal(half(dst+1052),(-301-bank)&65535);
        assert.equal(half(dst+3158),0x8000);
      }
    }
    console.log('Stock OM-3 allocator and ZAF maker verified both layouts, banks, centre offsets and invalid flags');
    // Simulate MF scratch changing while the published token is frozen. Move
    // the previous sample tick back to exercise the sampling interval directly.
    lab.sim.word(sy.ZR_HEAD,0);
    lab.sim.word(0xa33f2c38,0);
    lab.sim.word(0xa33eb074+10552,4242);
    lab.sim.write(0xa33eb074+10556,Uint8Array.of(1));
    for(let seq=1;seq<=36;seq++){
      if(seq>1){
        const prev=sy.ZR_ROWS+(seq-1)%32*32;
        lab.sim.word(prev+4,(lab.sim.u32(prev+4)-200001)&0x7fffffff);
      }
      putHalf(0x6e660f00+1052,seq-18);
      call('zr_sample',{},32);
      const row=sy.ZR_ROWS+seq%32*32;
      assert.equal(lab.sim.u32(sy.ZR_HEAD),seq);
      assert.equal(lab.sim.u32(row),seq);
      assert.equal(lab.sim.u32(row+8),4242);
      assert.equal(half(row+16),(seq-18)&65535);
      call('zr_sample',{},32);
      assert.equal(lab.sim.u32(sy.ZR_HEAD),seq,'sample interval not enforced');
    }
    console.log('Independent working values, frozen publication, rate limit and 32-slot wrap passed');
  }
} finally {lab.close();}
