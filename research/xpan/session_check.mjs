// Run the integration check in each OM-3 display configuration. The camera's
// codec is represented by S-JPEGENC, so the synthetic JPEG cannot prove crop.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const [emu, build, device, markedCard] = process.argv.slice(2);
const {Player} = await import(emu+'/src/lab/player.mjs');
const {PLAYER_PARSER} = await import(emu+'/scenarios/session_replay.mjs');
const {readMainFile, patchedFirmware, loadNand} = await import(emu+'/checks/lib/env.mjs');
const {SdCard,cardFromImage} = await import(emu+'/src/lab/sdcard.mjs');
const {IMAGE_BASE} = await import(emu+'/src/fw/model.mjs');
const res = await import(emu+'/src/lab/resources.mjs');
const card = markedCard ? cardFromImage(readFileSync(markedCard)) : new SdCard();
const fw = patchedFirmware(readMainFile(build+'/E1479999.BIN'));
assert.equal(Buffer.compare(fw.raw,readFileSync(build+'/main.bin')),0);
const {rom,resBlock:block} = fw;
const symbols = Object.fromEntries(execFileSync('nm',[build+'/p.elf'],{encoding:'utf8'}).trim().split('\n')
  .map(line=>line.match(/^(\w+) \w (\S+)$/)).filter(Boolean).map(([,a,n])=>[n,parseInt(a,16)]));
for (const row of res.languages(rom,block).filter(x=>x.lang==='en'||x.lang.startsWith('zh'))) {
  const t = new res.StringTable(row.strings_record,res.raw_record(row.strings_record,block));
  console.log(row.lang, 'aspect menu label:', t.text(241));
}
const player = new Player({...PLAYER_PARSER,no_browser:true,idle:'off',a15:'on',device,out:'<out>',no_wait_on_error:true,debug_api:true},
  {rom,resBlock:block,patch:fw.summary,patchRanges:fw.changed,nand:loadNand(),createHash,card:{open:()=>card,save(){}},wallClock:()=>performance.now()/1000});
player.open_session();
try {
  const session=player.session, lab=session.lab;
  let written=0;
  const commands=[], sends=[];
  // Use the same electronic capture in both tests. The simulated sensor
  // omits this metadata halfword from its native recording request.
  lab.observe(0x6054c263-IMAGE_BASE+0x50000000,(h,r)=>{
    const job=h.sim.u32(r.a0+20);
    assert.ok(job);
    h.sim.write(job+6110,Uint8Array.of(4,0));
    written++;
  },'electronic drive fixture');
  const workerStack=regs=>regs.sp>=symbols.sb_stack && regs.sp<symbols.sb_stack+8192;
  lab.observe(symbols.sb_shutter_sound-IMAGE_BASE+0x50000000,(h,r)=>{
    if(workerStack(r))commands.push([r.d0,r.d1]);
  },'native single shutter command');
  lab.observe(0x60449fd8-IMAGE_BASE+0x50000000,(h,r)=>{
    if(workerStack(r))sends.push([r.d0,r.d1,r.a0]);
  },'native shutter sound sent to audio service');
  const call=(address,regs={},frame=[0,0])=>lab.call(address-IMAGE_BASE+0x50000000,regs,null,frame,300000);
  const facade=call(0x60b8696a,{},[0,4]).a0;
  const aspectChoice=(offset,value)=>call(lab.sim.u32(lab.sim.u32(facade)+offset),
      {a0:facade,d0:269,d1:value,a1:0}).d0;
  const count=aspectChoice(28,0);
  const offered=Array.from({length:count},(_,i)=>aspectChoice(32,i)).filter(value=>aspectChoice(40,value)===1);
  assert.deepEqual([...offered].sort(),[1,2,3,4,5,6,7,9],'selectable still-image aspects in menu order');
  const run=inp=>{player.run_input(inp); if(player.error)throw Error(player.error.message);};
  // Crop pickers and their icons run in the upstream crop tests. Exercise
  // the capture/beep path using upstream's XPan selection here.
  session.set(269,6);
  run({type:'scene',change:{liveview:true}});
  run({type:'token',token:'WAIT:300'});
  run({type:'key',id:'s1',action:'down'});
  assert.equal(lab.sim.u32(symbols.sb_produced+0x40000000),0);
  assert.deepEqual(commands,[]);
  assert.equal(session.camapp.images.length,0);
  for(const inp of [{type:'key',id:'s2',action:'down'}, {type:'token',token:'WAIT:700'},
       {type:'key',id:'s2',action:'up'}, {type:'key',id:'s1',action:'up'}, {type:'token',token:'WAIT:300'}]) run(inp);
  const recorded=session.storage.rec.images.at(-1);
  assert.equal(recorded?.reply.status,0);
  assert.equal(recorded.reply.aspect,6);
  assert.ok(session.camapp.images.at(-1)?.file?.size>0);
  assert.ok(written);
  if (markedCard) {
    assert.equal(lab.sim.u32(symbols.sb_checked),1,'card marker checked');
    assert.equal(lab.sim.u32(symbols.sb_enabled+0x40000000),1,'worker started');
    assert.equal(lab.sim.u32(symbols.sb_produced+0x40000000),1,'one confirmed capture');
    const route=commands[0]?.[1];
    assert.ok([1,2,3].includes(route));
    if(lab.sim.u32(symbols.SB_RESULT)===1){
      assert.deepEqual(commands,[[0,route]],'muted: no end or retry');
      assert.deepEqual(sends,[]);
    }else{
      assert.equal(lab.sim.u32(symbols.SB_RESULT),0);
      assert.deepEqual(commands,[[0,route],[1,route]],'one stock single-shutter pair');
      assert.ok(sends.length>=1 && sends.length<=2,'native audio handoff');
    }
    const before=commands.length;
    for(const inp of [{type:'key',id:'s1',action:'down'}, {type:'token',token:'WAIT:350'},
      {type:'key',id:'s1',action:'up'}])run(inp);
    assert.equal(commands.length,before,'subsequent half-press retriggered the shutter sound');
  } else {
    assert.equal(lab.sim.u32(symbols.sb_produced+0x40000000),0);
    assert.deepEqual(commands,[],'marker absent');
  }
  console.log(device,'PASS: native setting, saved exposure, aspect 6; shutter commands',commands,'audio submissions',sends);
} finally {player.close_session();}
