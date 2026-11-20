import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const [emu, build, symbols] = process.argv.slice(2);
const {DisplayLab} = await import(emu+'/src/lab/display.mjs');
const {labEnv} = await import(emu+'/checks/lib/env.mjs');
const {expandImage} = await import(emu+'/src/fw/expand.mjs');
const {IMAGE_BASE} = await import(emu+'/src/fw/model.mjs');
const sy = symbols ? JSON.parse(readFileSync(symbols)) : Object.fromEntries(
  execFileSync('nm',[build+'/p.elf'],{encoding:'utf8'}).split('\n')
    .map(line=>/^(\w+) \w (\S+)$/.exec(line)).filter(Boolean)
    .map(([,address,name])=>[name,parseInt(address,16)]));
const lab = new DisplayLab(labEnv({rom:expandImage(readFileSync(build+'/main.bin'))}));

try {
  lab.start();
  const desc = lab.alloc(new Uint8Array(224), 16);
  const stack = Buffer.alloc(4);
  stack.writeUInt32LE(desc, 0);
  // Even a stale opt-in word must not let a section-one handler enter
  // the extension before the stock loader has copied section six.
  assert.ok(sy.FS_ON >= 0xa031e900 && sy.FS_ON < 0xa031f000);
  assert.equal(lab.sim.u32(sy.FS_ON),0);
  const paths = [
    {name:'fs_update', hook:0x601f15c4, stock:0x60205e6b, regs:{d0:1}},
    {name:'fs_stop_armed', hook:0x601f158a, stock:0x60205e40, regs:{d0:1}},
    {name:'fs_th', hook:0x601f1d66, stock:0x601f61cd, regs:{a0:desc}},
    {name:'fs_commit_image', hook:0x60210fd3, stock:0x60211000, regs:{d1:32}, stack},
    {name:'fs_commit_level', hook:0x60211067, stock:0x6021106c, regs:{a3:desc,d0:0xfffffe00,d2:0xffffffff}},
  ];
  for (const bits of [0,0x1f,0x20,0x3ff]) {
    lab.sim.word(0xa32de590,bits ^ 0x3ff);
    lab.sim.word(0xa32de58c,bits);
    for (const arm of [0,1]) {
      lab.sim.word(sy.FS_ON, arm);
      for (const entry of paths) {
        const hook = entry.hook-IMAGE_BASE+0x50000000;
        const stop = new Set([entry.stock, sy[entry.name]]);
        const regs = lab.call(hook,entry.regs,entry.stack ?? null,[0xf0,76],10000,stop);
        if (!(arm && (bits & 0x20)) && (entry.name==='fs_update' || entry.name==='fs_stop_armed')) {
          const frame=entry.name==='fs_update' ? 48 : 4;
          // At the original callee, the stack top must hold the original DISPLAY return PC.
          assert.equal(lab.sim.u32(regs.sp+frame),entry.hook+7);
        }
        assert.equal(regs.pc,arm && (bits & 0x20) ? sy[entry.name] : entry.stock,
          entry.name + ' with loaded-section mask 0x' + bits.toString(16));
      }
    }
    const sb = lab.call(0x6054c30f-IMAGE_BASE+0x50000000,{d3:desc},null,[0xf0,76],10000,
      new Set([sy.sb_record_done,sy.sb_reply_join]));
    assert.equal(sb.pc,bits & 0x20 ? sy.sb_record_done : sy.sb_reply_join);
    for (const arm of [0,1]) {
      lab.sim.word(sy.FS_ON, arm);
      const armed = Boolean(arm && (bits & 0x20));
      const zLv = lab.call(0x609ed0d4-IMAGE_BASE+0x50000000,{d0:0,d2:0x1700},null,[0xf0,36],10000,
        new Set([sy.zaf_lv_armed,sy.zaf_stock_lens_ptr]));
      assert.equal(zLv.pc,armed ? sy.zaf_lv_armed : sy.zaf_stock_lens_ptr);
      const zEng = lab.call(0x60902150-IMAGE_BASE+0x50000000,{d1:0x1234,d3:3},null,[0xf0,44],10000,
        new Set([sy.zaf_eng_armed,sy.zaf_eng_resume]));
      assert.equal(zEng.pc,armed ? sy.zaf_eng_armed : sy.zaf_eng_resume);
      const zLlk = lab.call(0x6098fcc4-IMAGE_BASE+0x50000000,{d0:0,d1:472},null,[0xe0,44],10000,
        new Set([sy.zaf_llk1_armed,sy.zaf_llk1_resume]));
      assert.equal(zLlk.pc,armed ? sy.zaf_llk1_armed : sy.zaf_llk1_resume);
    }
  }
  // Execute the assembled first-event routine with a mounted marker and a
  // successful RTOS task allocation. DisplayLab.call verifies the entire
  // saved register set and caller stack on return. Full sessions use the real services.
  const pc = name => sy[name]-IMAGE_BASE+0x50000000;
  for(const [name,result] of [
    ['hl_ok',{d0:0}],['fopen',{a0:desc}],['fclose',{d0:0}],
    ['sdl_task_create',{d0:15}],['sdl_task_start',{d0:0}]
  ]) lab.hook(pc(name),(h,r)=>h.finish(r,result),'first-event fixture '+name);
  lab.sim.word(sy.sb_checked,0);
  lab.call(pc('sb_arm'),{},null,[0xf0,32],20000);
  assert.equal(lab.sim.u32(sy.sb_enabled+0x40000000),1);
  console.log('PASS: display uses stock until the card-ready opt-in; recorder waits for section six');
} finally {
  lab.close();
}
