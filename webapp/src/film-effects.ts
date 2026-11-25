// Stable bit order in the optional OM3L record, byte 976.
import sunlitTableUrl from './data/sunlit.lut?url&inline';

export const filmEffects = ['trichrome', 'infrared', 'screenprint', 'leader', 'lightLeak', 'sunlit'] as const;
export type FilmEffect = typeof filmEffects[number];
export const effectNames: Record<FilmEffect, string> = {
  trichrome: '分色不同步', infrared: '假色红外', screenprint: '彩色网版印刷',
  leader: '卷首燃烧纹', lightLeak: '机背漏光', sunlit: 'Sunlit 重着色',
};
export function parseFilmEffects(input: unknown): FilmEffect[] {
  if (!Array.isArray(input) || input.some(x => !filmEffects.includes(x))) throw new Error('胶卷效果无效');
  return filmEffects.filter(x => input.includes(x));
}

/** Static first-frame preview. A roll seed on the camera comes from its clock. */
export function previewFilmEffects(img: Float32Array, w: number, h: number, effects: FilmEffect[], name: string) {
  if (effects.includes('sunlit')) previewSunlit(img, w, h);
  const ir = effects.includes('infrared'), print = effects.includes('screenprint');
  const leader = effects.includes('leader'), back = effects.includes('lightLeak');
  if (!(ir || print || leader || back)) return;
  let seed = 2166136261;
  for (const c of name) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  const limit = (v: number) => Math.max(0, Math.min(v, 1));
  const pigments = [[.16,.72,.80],[.88,.25,.49],[.99,.82,.15],[.18,.19,.21]];
  const directions = [[3,1],[1,3],[3,0],[2,2]];
  const pitch = Math.max(1, w / 800);
  const pattern = new Float32Array(32 * 32 * 4);
  if (print) for (let y=0;y<32;y++) for (let x=0;x<32;x++) directions.forEach(([a,b],p) => {
    const phase = 2*Math.PI/32;
    pattern[(y*32+x)*4+p] = .5-.242*(Math.cos(phase*(a*x+b*y))+Math.cos(phase*(-b*x+a*y)));
  });
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const i=3*(y*w+x);
    let r=img[i], g=img[i+1], b=img[i+2];
    if (ir) {
      const leaf=limit((g-b-.025)*8)*limit((g-.82*r)*13);
      const tint=.19+.94*(.299*r+.587*g+.114*b);
      const rest=(1-leaf)*(1-.42*limit((b-r)*4)*limit((b-g)*9));
      r=r*rest+leaf*limit(tint*1.32); g=g*rest+leaf*tint*.2; b=b*rest+leaf*tint*.37;
    }
    if (print) {
      const k=.84*(1-Math.max(r,g,b)), base=1-k;
      const index=4*((Math.floor(y/pitch)&31)*32+(Math.floor(x/pitch)&31));
      const c=1-r/base,m=1-g/base,yellow=1-b/base;
      r=.99; g=.965; b=.90;
      for (let p=0;p<4;p++) {
        const ink=p===0?c:p===1?m:p===2?yellow:k;
        if (ink >= pattern[index+p]) {
          r*=pigments[p][0]; g*=pigments[p][1]; b*=pigments[p][2];
        }
      }
    }
    const pos=(seed&2 ? 1-x/w : x/w)*255;
    const edge=60+((seed>>>8)&63)+(y/h-.5)*(((seed>>>16)&63)-32);
    const mask=limit(((leader ? Math.max(0,(edge-pos+16)*4) : 0) +
      (back ? Math.max(0,25-Math.abs(pos-(8+((seed>>>24)&31)))) : 0))/63);
    img[i]=r+(1-r)*mask;
    img[i+1]=g+(limit(.28+mask*mask)-g)*mask;
    img[i+2]=b+(limit(.08+mask**4)-b)*mask;
  }
}

let sunlitTable: Uint8Array | undefined;
function previewSunlit(img: Float32Array, w: number, h: number) {
  sunlitTable ??= Uint8Array.from(atob(sunlitTableUrl.split(',')[1]), c => c.charCodeAt(0));
  const table = sunlitTable;
  const byte = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
  let seed = 21760;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 3 * (y * w + x);
      const [r, g, b] = [img[i], img[i+1], img[i+2]];
      const yy = 255 * (.299*r + .587*g + .114*b);
      const cb = byte(128 + (255*b - yy) / 1.772) >> 4;
      const cr = byte(128 + (255*r - yy) / 1.402) >> 4;
      const light = table[(cb * 16 + cr) * 64 + (byte(yy) >> 2)];
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const idx = 16384 + ((seed >>> 26) * 256 + light) * 4;
      const outY = table[idx], u = table[idx+1] - 128, v = table[idx+3] - 128;
      img[i] = byte(outY + 1.402*v) / 255;
      img[i+1] = byte(outY - .344*u - .714*v) / 255;
      img[i+2] = byte(outY + 1.772*u) / 255;
    }
  }
}
