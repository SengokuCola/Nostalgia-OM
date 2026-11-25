import { crc32 } from './format';
import { filmEffects } from './film-effects';
import type { Bank } from './om3';
import nativeLabels from './data/camera-labels.json';

export const styles = ['横带', '波浪', '斜分', '竖脊', '三道杠', '反转片框', '电影票根',
  '800T 红圆', 'Gold 双色', 'Portra 紫金', 'Velvia 绿标', 'E100 黄蓝', '600 彩带',
  'Provia 蓝带', '400H 黑金', '160S 灰阶', 'NHG 金标', 'Superia X-TRA', 'C200 斜标', '200 紫标', 'Natura 虹边'] as const;
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
  if (l.style >= 7) {
    const block = (color: string, x: number, y: number, w: number, h: number) => {
      c.fillStyle = color; c.fillRect(x,y,w,h);
    };
    const text = (str: string, color: string, x: number, y: number, font: string, width = 44) => {
      c.fillStyle = color; c.font = font; c.fillText(str,x,y,width);
    };
    const white = '#fff8e8';
    switch (l.style) {
      case 7:
        c.fillStyle = l.accent; c.beginPath(); c.arc(24,21,23,0,2*Math.PI); c.fill();
        text(l.title,l.ink,6,21,'19px sans-serif',36);
        text('Still',l.ink,12,37,'20px sans-serif',31);
        text('800T',l.ink,1,47,'bold 7px sans-serif');
        break;
      case 8:
        block(l.accent,0,20,48,28);
        text('Kodak',l.ink,2,14,'bold 12px sans-serif',26);
        text('200','#342a21',33,14,'bold 7px sans-serif',14);
        text(l.title,white,3,41,'21px sans-serif');
        break;
      case 9:
        block(l.accent,0,0,48,34);
        text('120',white,2,7,'6px sans-serif');
        text(l.title+' 400',white,2,24,'13px sans-serif');
        text('Kodak Professional',l.ink,2,44,'bold 6px sans-serif');
        break;
      case 10:
        c.fillStyle=l.accent; c.beginPath(); c.moveTo(0,0); c.lineTo(17,0); c.lineTo(29,16); c.lineTo(0,16); c.fill();
        text('FUJIFILM',l.ink,2,11,'bold 7px sans-serif',23);
        block('#25568a',8,24,7,12); block(l.accent,15,24,33,12);
        text(l.title,l.ink,16,33,'bold 10px sans-serif',31);
        text('FUJICHROME',white,14,45,'bold 6px sans-serif',33);
        break;
      case 11:
        block(l.accent,0,15,48,33);
        text('Kodak Professional',l.ink,2,11,'bold 7px sans-serif');
        text('EKTACHROME',white,2,23,'7px sans-serif');
        text(l.title,white,8,43,'bold 19px sans-serif',38);
        break;
      case 12:
        [l.accent,'#96b653','#f5c43b','#ef903b','#dc433d'].forEach((color,i)=>block(color,3,2+i*7,42,7));
        text('Color',white,5,11,'bold 10px sans-serif');
        text(l.title,white,5,20,'bold 11px sans-serif');
        text('Film',white,5,29,'bold 10px sans-serif');
        text('polaroid',l.ink,12,46,'bold 8px sans-serif');
        break;
      case 13:
        text('FUJICHROME',white,2,14,'bold 7px sans-serif');
        block(l.accent,0,18,48,15); text(l.title+' 100F',white,2,29,'12px serif');
        block(l.ink,0,33,48,15); text('Super Fine Grain',white,4,42,'italic 6px serif');
        break;
      case 14:
        block(l.ink,20,0,28,38); text('FUJICOLOR',white,21,9,'bold 6px sans-serif',26);
        text('PRO',l.ink,1,31,'bold 12px sans-serif',19);
        text(l.title,l.accent,21,31,'italic bold 15px serif',26);
        block('#93258f',20,38,28,7);
        break;
      case 15:
        block(l.ink,0,25,35,23); block(l.accent,35,0,13,48);
        text('FUJICOLOR',white,2,11,'bold 6px sans-serif',31);
        text(l.title,white,2,40,'bold 11px sans-serif',31);
        text('S',l.ink,35,38,'bold 31px sans-serif',13);
        break;
      case 16:
        text('FUJICOLOR',white,16,12,'bold 7px sans-serif',30);
        text('NHG II 120',white,2,25,'bold 7px sans-serif');
        block(l.accent,0,28,48,20); block('#b92a9d',22,28,2,20);
        text('800',l.ink,2,41,'13px serif',19); text(l.title,l.ink,25,41,'14px serif',22);
        break;
      case 17:
        text('SUPERIA',white,12,13,'bold 8px sans-serif');
        text(l.title,l.accent,2,29,'italic bold 16px sans-serif');
        block('#2397aa',0,32,48,16); text('400',l.ink,15,45,'italic bold 13px serif');
        break;
      case 18:
      case 19: {
        const classic = l.style === 18;
        c.fillStyle=white; c.beginPath(); c.moveTo(classic?8:2,5); c.lineTo(46,5);
        c.lineTo(42,22); c.lineTo(classic?20:6,22); c.fill();
        text(classic?'FUJICOLOR':'FUJIFILM',l.ink,classic?13:7,16,'bold 8px sans-serif',32);
        c.fillStyle=l.accent; c.beginPath(); c.moveTo(classic?18:6,22); c.lineTo(42,22);
        c.lineTo(39,37); c.lineTo(classic?29:10,37); c.fill();
        text(l.title,white,classic?23:10,34,'italic bold 14px serif',classic?17:29);
        text(classic?'24':'36',white,2,45,'bold 7px sans-serif');
        break;
      }
      case 20: {
        const edge=c.createLinearGradient(0,0,0,48);
        ['#c8acd7','#edc788','#b6cda7','#ddd2e4'].forEach((v,i)=>edge.addColorStop(i/3,v));
        c.fillStyle=edge; c.fillRect(43,0,5,48);
        text('FUJIFILM',l.ink,2,7,'bold 6px sans-serif');
        text(l.title,l.accent,2,17,'bold 10px serif'); text('1600',l.ink,3,25,'bold 8px serif');
        for(const [x,y,angle] of [[15,31,-0.3],[29,34,0.28]]) {
          c.save(); c.translate(x,y); c.rotate(angle); block(white,-6,-5,13,12);
          block(l.ink,-5,-4,11,8); block(l.accent,0,-1,5,5); c.restore();
        }
        break;
      }
    }
    return c;
  }
  if (l.style >= 3) {
    const words = l.title.match(/^(.*?)(\d+[A-Za-z]?)$/);
    let x = 3, width = 42, baseline = 36;
    c.fillStyle = l.accent;
    switch (l.style) {
      case 3:
        c.fillRect(0,0,9,48);
        c.fillStyle = l.ink; c.fillRect(10,0,2,48);
        x = 15; width = 31;
        break;
      case 4:
        for (const y of [0,5,10]) c.fillRect(0,y,48,3);
        baseline = 44;
        break;
      case 5:
        c.fillRect(0,0,48,48);
        c.fillStyle = l.paper; c.fillRect(4,6,40,36);
        x = 7; width = 34;
        break;
      case 6:
        c.fillRect(36,0,12,48);
        c.fillStyle = l.paper;
        for (let y = 3; y < 48; y += 8) c.fillRect(40,y,5,4);
        width = 31;
        break;
    }
    c.fillStyle = l.ink;
    c.font = 'bold 9px sans-serif';
    if (words) c.fillText(words[1].trim(), x, baseline - 18, width);
    c.font = 'bold 20px sans-serif';
    c.fillText(words ? words[2] : l.title, x, baseline, width);
    return c;
  }
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
  const editable = [l.paper,l.ink,l.accent].map(rgb);
  editable.forEach((color,i) => record.set(color,1+3*i));
  // Four hardware colours: use warm and green bands instead of spending
  // three entries on white, black and near-white in the instant-film tile.
  const colors = (l.style === 12 ? [l.paper,l.accent,'#96b653','#eb873b']
    : [l.paper,l.ink,l.accent,l.style >= 13 ? '#fff8e8' : contrast(l.accent)]).map(rgb);
  colors.forEach(([r,g,b],i) => {
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
  // Earlier camera firmware accepts art types 1–3 and blits the packed tile.
  record[0]=l.style < 3 ? l.style+1 : 1;
  if (l.style >= 3) record[10]=l.style+1;
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
    l.boxLabel=parseLabel({style:(r[10] || r[0])-1,paper:color(1),ink:color(4),accent:color(7),title:str(12,33),caption:str(45,41)});
  });
}
