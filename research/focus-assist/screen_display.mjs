// Feed the tested tile through OM-3's native TH display API in om-emu.
// Harness-created frames/requests; NOT a camera capture or a firmware hook.
const [EMU, OUT] = process.argv.slice(2);
const fs=await import('node:fs');
const D=await import(EMU+'/src/lab/display.mjs');
const {labEnv}=await import(EMU+'/checks/lib/env.mjs');
const {write_png}=await import(EMU+'/checks/lib/png.mjs');
const {A,IMAGE_BASE,MODEL_INFO}=await import(EMU+'/src/fw/model.mjs');
const report=[];
for(const device of ['tft','evf']) {
 const lab=new D.DisplayLab(labEnv());
 try {
  lab.start();lab.set_gui_buffers();lab.open(device);lab.palettes();lab.update();
  lab.through_permit(device,1);lab.assume('A15',true);
  for(const name of ['off','strength-0','strength-6']) {
   const bytes=fs.readFileSync(OUT+'/'+name+'.output');
   const rows=Array.from({length:128},(_,y)=>new Uint8Array(bytes.subarray(y*256,(y+1)*256)));
   const addr=lab.load_lv_frame([128,128,rows],0x0a,1,[0,0]);
   const [w,h]=MODEL_INFO.panels[device];
   const req=D.ThRequest.scaled(D.DEVICE[device].mask,addr,[0,0],[128,128],[384,384],[(w-384)>>1,(h-384)>>1]);
   const th=lab.live_view(device,req);lab.update();const comp=lab.compose(device);
   if(comp.errors.length) throw Error(JSON.stringify(comp.errors));
   write_png(OUT+'/'+device+'-'+name+'.png',comp.header.width,comp.header.height,D.words_to_rgb(comp.words));
   report.push({device,name,status:comp.status,source:addr,attached:th.img0===th.start,
    thRuntime:A(0x501c3f4d)-0x50000000+IMAGE_BASE,width:comp.header.width,height:comp.header.height,
    assumptions:'om-emu display model, A15; harness supplies image and display request'});
  }
 } finally {lab.close();}
}
fs.writeFileSync(OUT+'/display-results.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
