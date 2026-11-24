import { crc32 } from './format';
import { filmEffects } from './film-effects';
import type { Bank } from './om3';
import nativeLabels from './data/camera-labels.json';

export const styles = ['横带', '波浪', '斜分'] as const;
export interface BoxLabel { style: number; paper: string; ink: string; accent: string; title: string; caption: string }
export function parseLabel(value: unknown): BoxLabel {
  const l = value as BoxLabel;
  if (!l || !Number.isInteger(l.style) || l.style < 0 || l.style >= styles.length ||
      ![l.paper, l.ink, l.accent].every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) ||
      typeof l.title !== 'string' || [...l.title].length > 8 || typeof l.caption !== 'string' || [...l.caption].length > 10 ||
      /[\u0000-\u001f]/.test(l.title + l.caption)) throw new Error('盒签参数无效');
  return { style: l.style, paper: l.paper, ink: l.ink, accent: l.accent, title: l.title, caption: l.caption };
}

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i+2), 16));
function contrast(color: string) {
  const [r,g,b] = rgb(color);
  return .299*r + .587*g + .114*b > 145 ? '#1c1b19' : '#fff8e8';
}
function surface(w: number, h: number) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  return canvas.getContext('2d', { willReadFrequently: true })!;
}
function paintLabel(l: BoxLabel, size = 48) {
  const c = surface(size, size);
  c.scale(size / 48, size / 48);
  c.fillStyle = l.paper; c.fillRect(0,0,48,48);
  c.fillStyle = l.accent; c.beginPath();
  if (l.style === 1) { c.moveTo(0,19); c.bezierCurveTo(18,15,30,32,48,21); }
  else { c.moveTo(0,l.style === 2 ? 13 : 20); c.lineTo(48,l.style === 2 ? 28 : 20); }
  c.lineTo(48,48); c.lineTo(0,48); c.fill();
  c.fillStyle = l.ink; c.fillRect(0,43,48,2);
  const words = l.title.match(/^(.*?)(\d+[A-Za-z]?)$/);
  c.font = 'bold 10px sans-serif';
  if (words) c.fillText(words[1].trim(), 2,13,44);
  c.fillStyle = contrast(l.accent); c.font = 'bold 16px sans-serif';
  c.fillText(words ? words[2] : l.title, 2,40,44);
  return c;
}
const BASE=1632, HEADER=16, RECORD=1024, TOTAL=HEADER+20*RECORD;
const encoder=new TextEncoder(), decoder=new TextDecoder('utf-8',{fatal:true});
function writeTile(record: Uint8Array, l: BoxLabel) {
  const colors=[l.paper,l.ink,l.accent,contrast(l.accent)].map(rgb);
  colors.forEach(([r,g,b],i) => {
    if (i<3) record.set([r,g,b],1+3*i);
    const y=Math.round(.299*r+.587*g+.114*b);
    const clamp=(v:number)=>Math.max(0,Math.min(255,Math.round(v)));
    record.set([y,clamp(128-.168736*r-.331264*g+.5*b),y,clamp(128+.5*r-.418688*g-.081312*b)],96+4*i);
  });
  const pixels=paintLabel(l).getImageData(0,0,48,48).data;
  for(let i=0;i<2304;i++) {
    let best=0, error=Infinity;
    colors.forEach((c,k)=>{ const e=c.reduce((sum,v,j)=>sum+(v-pixels[i*4+j])**2,0); if(e<error){best=k;error=e;} });
    record[112+(i>>2)] |= best << (6-2*(i%4));
  }
}

// fb_blit_label writes Y0 Cb Y1 Cr. The second pixel in each LCD pair
// gets its own luma and shares the first pixel's chroma.
function renderTile(size: number, pixels: Uint8Array, palette: Uint8Array) {
  const bits = pixels.length * 8 / (size * size);
  const mask = (1 << bits) - 1;
  const ctx = surface(size, size);
  const frame = ctx.createImageData(size, size);
  let cb = 0, cr = 0;
  for (let i = 0; i < size * size; i++) {
    const bit = i * bits;
    const index = (pixels[bit >> 3] >> (8 - bits - bit % 8)) & mask;
    const y = palette[index * 4];
    if (i % 2 === 0) {
      cb = palette[index * 4 + 1] - 128;
      cr = palette[index * 4 + 3] - 128;
    }
    frame.data[i*4] = y + 1.402 * cr;
    frame.data[i*4+1] = y - .344136 * cb - .714136 * cr;
    frame.data[i*4+2] = y + 1.772 * cb;
    frame.data[i*4+3] = 255;
  }
  ctx.putImageData(frame, 0, 0);
  return ctx;
}

export function drawLabel(label: BoxLabel) {
  const record = new Uint8Array(688);
  writeTile(record, label);
  return renderTile(48, record.subarray(112), record.subarray(96, 112));
}

const builtIns = new Map<string, HTMLCanvasElement>();
const decode = (text: string) => Uint8Array.from(atob(text), ch => ch.charCodeAt(0));

export function drawRollLabel(look: {name: string; boxLabel?: BoxLabel}, artworkSize?: number) {
  if (look.boxLabel) {
    if (artworkSize) return paintLabel(look.boxLabel, artworkSize).canvas;
    const tile = drawLabel(look.boxLabel).canvas;
    tile.classList.add('native-label');
    return tile;
  }
  const name = Object.hasOwn(nativeLabels, look.name) ? look.name as keyof typeof nativeLabels : '';
  let image = builtIns.get(name);
  if (!image) {
    const {pixels, palette} = nativeLabels[name];
    image = renderTile(80, decode(pixels), decode(palette)).canvas;
    builtIns.set(name, image);
  }
  const copy = surface(80, 80);
  copy.drawImage(image, 0, 0);
  copy.canvas.classList.add('native-label');
  return copy.canvas;
}

function packRecord(record: Uint8Array, l: BoxLabel) {
  parseLabel(l);
  record[0]=l.style+1;
  record.set(encoder.encode(l.title),12); record.set(encoder.encode(l.caption),45);
  writeTile(record, l);
  const c=surface(144,16); c.font='13px "Microsoft YaHei",sans-serif'; c.fillText(l.caption,0,13,144);
  const alpha=c.getImageData(0,0,144,16).data;
  for(let i=0;i<144*16;i++) if(alpha[4*i+3]>=88) record[688+(i>>3)] |= 128>>(i%8);
}
export function appendLabels(base: Uint8Array, bank: Bank, includeEffects = true) {
  if (!bank.flat().some(l=>l?.boxLabel || (includeEffects && l?.filmEffects?.length))) return base;
  const out=new Uint8Array(BASE+TOTAL); out.set(base);
  const tail=out.subarray(BASE), d=new DataView(tail.buffer,tail.byteOffset);
  tail.set(encoder.encode('OM3L'));d.setUint32(4,TOTAL,true);d.setUint32(12,crc32(base.subarray(32)),true);
  bank.flat().forEach((look,i)=>{
    const record = tail.subarray(HEADER+i*RECORD, HEADER+(i+1)*RECORD);
    if (look?.boxLabel) packRecord(record,look.boxLabel);
    if (includeEffects) record[976] = filmEffects.reduce((mask, effect, bit) =>
      mask | (look?.filmEffects?.includes(effect) ? 1 << bit : 0), 0);
  });
  d.setUint32(8,crc32(tail.subarray(HEADER)),true);return out;
}
export function readLabels(b: Uint8Array, bank: Bank) {
  if(b.length===BASE)return;
  const t=b.subarray(BASE),d=new DataView(t.buffer,t.byteOffset,t.byteLength);
  if(t.length!==TOTAL || decoder.decode(t.subarray(0,4))!=='OM3L' || d.getUint32(4,true)!==TOTAL ||
     d.getUint32(8,true)!==crc32(t.subarray(HEADER)) || d.getUint32(12,true)!==crc32(b.subarray(32,BASE)))
    throw new Error('盒签扩展校验失败');
  bank.flat().forEach((l,i)=>{
    const r=t.subarray(HEADER+i*RECORD,HEADER+(i+1)*RECORD);
    if (r[976]) {
      if (!l || r[976] >= (1 << filmEffects.length)) throw new Error('胶卷效果记录无效');
      l.filmEffects = filmEffects.filter((_,bit) => r[976] & (1 << bit));
    }
    if (!r[0]) return;
    if (!l) throw new Error('空配方含有盒签');
    const color=(p:number)=>'#'+Array.from(r.subarray(p,p+3),x=>x.toString(16).padStart(2,'0')).join('');
    const str=(p:number,n:number)=>{const s=r.subarray(p,p+n);const z=s.indexOf(0);return decoder.decode(s.subarray(0,z<0?n:z));};
    l.boxLabel=parseLabel({style:r[0]-1,paper:color(1),ink:color(4),accent:color(7),title:str(12,33),caption:str(45,41)});
  });
}
