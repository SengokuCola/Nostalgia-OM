// Exercise the stock through-image request at the film picker's viewport.
// The harness supplies sensor frames. No picker CPU sampler participates.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const [emu] = process.argv.slice(2);
const { DisplayLab, DEVICE, ThRequest } = await import(emu + '/src/lab/display.mjs');
const { labEnv } = await import(emu + '/checks/lib/env.mjs');
const { MODEL_INFO } = await import(emu + '/src/fw/model.mjs');
const digest = words => createHash('sha256').update(Buffer.from(Uint32Array.from(words).buffer)).digest('hex');

for (const device of ['tft', 'evf']) {
  const lab = new DisplayLab(labEnv());
  try {
    lab.start(); lab.set_gui_buffers(); lab.open(device); lab.palettes(); lab.update();
    lab.through_permit(device, 1); lab.assume('A15', true);
    const { mask } = DEVICE[device];
    const [pw, ph] = MODEL_INFO.panels[device];
    const even = n => Math.round(n / 2) * 2;
    const dims = [even(574 * pw / 900), even(430 * ph / 600)];
    const at = [even(299 * pw / 900), even(94 * ph / 600)];
    // Test a 4:3 active source. Four different luma quadrants make cropping visible.
    const scene = shift => Array.from({length:1200}, (_, y) =>
      Uint8Array.from({length:3200}, (_, b) => b % 2 ? 128 :
        32 + shift + 32 * ((b >= 1600 ? 1 : 0) + (y >= 600 ? 2 : 0))));
    const first = scene(0), second = scene(48);
    const address = lab.load_lv_frame([1600, 1200, first]);
    const present = (size, xy, sourceAddress = address) => {
      const r = lab.live_view(device, ThRequest.scaled(mask, sourceAddress, [0,0], [1600,1200], size, xy));
      assert.equal(r.img0, r.start);
      lab.update();
    };
    const frame = () => {
      const f = lab.compose(device); assert.deepEqual(f.errors, []); return f;
    };
    present([pw,ph], [0,0]);
    const baseline = digest(frame().words);
    present(dims, at);
    const a = frame();
    const probe = f => [0.25,0.75].flatMap(y => [0.25,0.75].map(x =>
      f.words[(at[1]+Math.floor(y*dims[1]))*f.header.width+at[0]+Math.floor(x*dims[0])]));
    assert.equal(new Set(probe(a)).size, 4);
    lab.load_lv_frame([1600,1200,second]);
    const b = frame();
    assert(probe(a).every((word, i) => word !== probe(b)[i]));
    let count = 0;
    for(let i=0;i<a.words.length;i++) {
      if(a.words[i] === b.words[i]) continue;
      const x=i%a.header.width, y=Math.floor(i/a.header.width);
      assert(x>=at[0] && x<at[0]+dims[0] && y>=at[1] && y<at[1]+dims[1]);
      count++;
    }
    assert(count >= dims[0]*dims[1]*0.95);
    // A fresh through request carries its own rectangle as well as its DMA
    // address. Reapply the inset to the new request when the bank rotates.
    const nextAddress = lab.load_lv_frame([1600,1200,first], 0x0a, 2);
    assert.notEqual(address, nextAddress);
    present(dims, at, nextAddress);
    assert.deepEqual(probe(frame()), probe(a));
    lab.load_lv_frame([1600,1200,first]);
    present([pw,ph], [0,0]);
    assert.equal(digest(frame().words),baseline);
    console.log(JSON.stringify({device,viewport:dims,position:at,changedPixels:count,bankRotation:true,restored:true}));
  } finally { lab.close(); }
}
