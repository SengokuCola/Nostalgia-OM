// Verify independence of native LCD through-image and GUI planes. Synthetic
// grey edge bands distinguish the entire active image from a centre crop.
import assert from 'node:assert/strict';

const [emu] = process.argv.slice(2);
const { DisplayLab, ThRequest } = await import(emu + '/src/lab/display.mjs');
const { labEnv } = await import(emu + '/checks/lib/env.mjs');
const lab = new DisplayLab(labEnv());
const area = [5568, 2160], origin = [50, 0];
const pixel = (frame, x, y) => frame.words[y * frame.header.width + x];
function compose() {
  const frame = lab.compose('tft');
  assert.deepEqual(frame.errors, []);
  return frame;
}
function present(address, source, size, at) {
  lab.live_view('tft', ThRequest.scaled(1, address, origin, source, size, at, area));
  lab.update();
}
function load(width, height, bankElement, delta) {
  const rows = Array.from({length: height}, (_, y) =>
    Uint8Array.from({length: width * 2}, (_, b) => {
      if (b % 2) return 128;
      const x = b >> 1;
      return delta + (x < 12 ? 32 : x >= width-12 ? 64 :
        y < 12 ? 96 : y >= height-12 ? 128 : 160);
    }));
  return lab.load_lv_frame([width,height,rows], 10, bankElement, origin);
}
try {
  lab.start(); lab.set_gui_buffers(); lab.open('tft'); lab.palettes(); lab.update();
  lab.through_permit('tft', 1); lab.assume('A15', true);
  for (const [sw,sh] of [[800,600],[810,540],[800,450]]) {
    const factor = Math.min(574/sw,430/sh);
    const w = 2*Math.floor(sw*factor/2), h = 2*Math.floor(sh*factor/2);
    const x = 300 + 2*Math.floor((574-w)/4), y = 94 + 2*Math.floor((430-h)/4);
    const src = [sw,sh], size = [w,h], pos = [x,y];
    const first = load(sw,sh,1,0);
    present(first,src,size,pos);
    const scene = compose();
    const samples = [[2,h>>1],[w-3,h>>1],[w>>1,2],[w>>1,h-3],[w>>1,h>>1]];
    const read = frame => samples.map(([dx,dy])=>pixel(frame,x+dx,y+dy)&255);
    assert.deepEqual(read(scene),[32,64,96,128,160]);
    const sidebar = colour => lab.rectangle(18,210,230,56,colour,1,2);
    lab.draw(() => {
      lab.rectangle(0,0,270,600,33,1,2);
      sidebar(11);
      for (const [bx,by,bw,bh] of [[298,92,578,2],[298,524,578,2],
                                    [298,94,2,430],[874,94,2,430]]) {
        lab.rectangle(bx,by,bw,bh,16,1,2);
      }
    });
    lab.update();
    const a = compose();
    if (sw === 800 && sh === 600) assert.notEqual(pixel(a,300,92),pixel(scene,300,92));
    const second = load(sw,sh,2,16);
    present(second,src,size,pos);
    const b = compose();
    assert.deepEqual(read(b),[48,80,112,144,176]);
    lab.draw(()=>sidebar(6)); lab.update();
    const c = compose();
    let changedScene = 0, changedUi = 0;
    for (let py=0;py<600;py++) for (let px=0;px<900;px++) {
      const inside = px>=x && px<x+w && py>=y && py<y+h;
      if (inside) assert.equal(pixel(a,px,py),pixel(scene,px,py));
      if (pixel(a,px,py)!==pixel(b,px,py)) { assert(inside); changedScene++; }
      if (pixel(b,px,py)!==pixel(c,px,py)) {
        assert(px>=18 && px<248 && py>=210 && py<266); changedUi++;
      }
    }
    assert.equal(changedScene,w*h); assert.equal(changedUi,230*56);
    console.log(JSON.stringify({src,size,pos,changedScene,changedUi}));
  }
} finally { lab.close(); }
