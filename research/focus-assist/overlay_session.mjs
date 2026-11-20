// Emulator integration harness ONLY. No firmware hook, ISR or task is installed.
// Register offsets verified against E147's native writer at runtime 0x60211e1c.
export const OWN = new Map([
 ['IMG2DMASADR',0x394],['IMG2DMALD',0x3ac],['IMG2DMABN',0x3c4],
 ['IMG2FMT',0x404],['IMG2AREA1',0x438],['IMG2AREA2',0x43c],
 ['IMG2RSZ1',0x504],['IMG2RSZ2',0x508],['IMG2RSZ3',0x50c],
 ['IMG2RSZ4',0x510],['IMG2RSZ5',0x514],['IMG2RSZ6',0x518],['IMG2PLANC',0x624],
]);
const SPOS=0x7f00, ENABLE=0x10;
export class TileOverlay {
 constructor(lab,channel){this.lab=lab;this.channel=channel;this.saved=null;this.last=null;}
 bank(){return this.lab.vsc.bank(this.channel);}
 write(offset,value){
  // E147 disassembly notation, already mapped: no reference-model fallback.
  this.lab.call(0x501f0dfc,{d0:this.channel,d1:offset/4,a0:value>>>0},null,[0x80,4]);
 }
 owns(){
  const b=this.bank();
  return this.last!==null && !!(b.get('DMAEN')&ENABLE) &&
   [...this.last].every(([k,v])=>b.get(k)===v) && (b.get('IMGDMASPOS')&SPOS)===0;
 }
 acquire(){
  if(this.saved!==null)return this.owns();
  const b=this.bank();if(b.get('DMAEN')&ENABLE)return false;
  this.saved=new Map([...OWN].map(([k])=>[k,b.get(k)]));
  if([...this.saved.values()].some(x=>x===undefined))throw Error('unknown initial layer state');
  this.savedPos=b.get('IMGDMASPOS')&SPOS;
  return true;
 }
 values(address,x,y,size=128){
  const b=this.bank();
  if(!Number.isInteger(address)||address<0xa0000000||address>0xb2000000-32768||address%128 || size!==128)
   throw Error('only owned aligned 128-square DRAM YC tiles supported');
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||
     x+size>(b.get('IMG1AREA1')&0xffff)||y+size>(b.get('IMG1AREA2')&0xffff))
   throw Error('tile outside main image');
  const ox=b.get('IMG1AREA1')>>>16, oy=b.get('IMG1AREA2')>>>16;
  return new Map([
   ['IMG2DMASADR',address>>>4],['IMG2DMALD',16],['IMG2DMABN',16],['IMG2FMT',0],
   ['IMG2AREA1',((ox+x)<<16)|size],['IMG2AREA2',((oy+y)<<16)|size],
   ['IMG2RSZ1',0],['IMG2RSZ2',4096],['IMG2RSZ3',0],['IMG2RSZ4',4096],
   ['IMG2RSZ5',0],['IMG2RSZ6',0],['IMG2PLANC',0x100],
  ]);
 }
 present(address,x,y,size=128){
  const values=this.values(address,x,y,size),b=this.bank();
  if(!this.acquire())return false;
  // Native display hold / release pair; no writes to IMG1 or OSD state.
  this.lab.call(0x501ee1a0,{d0:this.channel,d1:0});
  for(const [k,v]of values)this.write(OWN.get(k),v);
  this.write(0x3d8,(b.get('IMGDMASPOS')&~SPOS)>>>0);
  this.write(0x60,b.get('DMAEN')|ENABLE);
  this.lab.call(0x501ee1a0,{d0:this.channel,d1:1});
  this.last=values;
  return true;
 }
 release(){
  if(this.saved===null)return false;
  const owned=this.owns();
  if(owned){
   const b=this.bank();
   this.lab.call(0x501ee1a0,{d0:this.channel,d1:0});
   this.write(0x60,b.get('DMAEN')&~ENABLE);
   for(const [k,v]of this.saved)this.write(OWN.get(k),v);
   this.write(0x3d8,((b.get('IMGDMASPOS')&~SPOS)|this.savedPos)>>>0);
   this.lab.call(0x501ee1a0,{d0:this.channel,d1:1});
  }
  this.saved=null;this.last=null;return owned;
 }
}
