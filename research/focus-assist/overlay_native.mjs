// Harness adapter: native assembly owns all IMG2 state transitions.
// Request construction, frame timing and lifetime remain harness responsibilities.
import {TileOverlay} from './overlay_session.mjs';
export class NativeTileOverlay extends TileOverlay {
 constructor(lab,channel,code,imageBase){
  super(lab,channel);
  this.entry=0xa7f20000-imageBase+0x50000000;
  this.state=0xa7f30000;this.request=0xa7f30100;
  lab.sim.write(0xa7f20000,code);
  lab.sim.write(this.state-16,new Uint8Array(152).fill(0xa5));
  lab.sim.write(this.state,new Uint8Array(120));
 }
 run(request){
  const preserved={d2:0x12345678,d3:0x23456789,a2:0x34567890,a3:0x45678901};
  const r=this.lab.call(this.entry,{...preserved,a0:this.state,a1:request,d0:this.channel},null,[0xf0,40],10000);
  for(const [k,v] of Object.entries(preserved))if((r[k]>>>0)!==v)throw Error('native ABI changed '+k);
  for(const address of [this.state-16,this.state+120])
   if(!this.lab.sim.read(address,16).every(x=>x===0xa5))throw Error('native state overrun');
  this.saved=this.lab.sim.u32(this.state)?true:null;
  return r.d0;
 }
 present(address,x,y,size=128){
  const vals=this.values(address,x,y,size);
  const bytes=new Uint8Array(52),view=new DataView(bytes.buffer);
  [...vals.values()].forEach((v,i)=>view.setUint32(i*4,v>>>0,true));
  this.lab.sim.write(this.request,bytes);
  const result=this.run(this.request);
  if(!this.lab.sim.read(this.request,52).every((x,i)=>x===bytes[i]))throw Error('native request changed');
  return result===0;
 }
 release(){const active=this.saved!==null;return this.run(0)===0&&active;}
}
