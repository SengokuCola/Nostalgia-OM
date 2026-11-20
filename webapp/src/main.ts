import './style.css';
import './theme.css';
import libraryJson from './data/library.json';
import { type Problem } from './format';
import {
  KELVIN, NOTE_MAX, PACK_SCHEMA,
  parsePack, toneLimit, type FilmWb, type Look, type Pack, type Tone,
} from './pack';
import { History } from './history';
import { fromLibrary, libraryOrigin, resetLook } from './reset';
import { ASPECTS, cropRect, lastHalation, renderLook } from './preview';
import { makeZip } from './zip';
import { curvesBin } from './curvesbin';
import { rrpreset } from './rapidraw';
import { previewToneLut } from './tone';
import {
  BANK_SCHEMA, PHOTO_RE, COLORS, OM3, OM3_NAME_MAX, PER, lookFromPhotoCode, om3NameProblem, blankProfile, defaultBank, emptyBank, fromOldLookLab, parseBank, profilesBin, readProfiles,
  SHARP, sharpLabel, slowGrain, monoGrain, grainStrength, setGrainStrength, toOm3, validateBank, type Bank, type Fw, FW_NAME, bankMinFw, exportLook, minFw, v28Parts, recipeText,
} from './om3';
import { namesBin } from './om3names';
import { SPLIT_COLOURS, SPLIT_STEPS, fromSteps, toSteps, type Split } from './split';
import { CHANNELS, CURVE_MAX, CURVE_STEP, MIX_MAX, curveDelta, flatCurves, flatMix, hasCurves, hasMix, type Channel } from './curves';
import { CAMERA_FILMS, FILMS, FILM_GROUPS, filmLook, filmOf, type Film, type FilmGroup } from './om3films';
import { parseLook as parseStoredLook } from './pack';
import { localizeDescription } from './descriptions';
import { cubeApply, fitLook, lightroomExtras, lightroomTransform, looksLikeLog, parseCube, parseLightroom, type RGB, type Transform } from './convert';
// ---------------------------------------------------------------- state
function parseLook(value: unknown, what?: string): Look {
  const look = parseStoredLook(value, what);
  look.notes = localizeDescription(look.notes);
  return look;
}
const LIBRARY = parsePack(libraryJson);
for (const look of LIBRARY.looks) look.notes = localizeDescription(look.notes);
// The colour-frames test photo first, then public-domain (CC0) photos picked for skin, strong colour, greens, blues,
// night light and sunset.
/** Bump when a sample photo file changes, so browsers fetch the new one instead of their cached copy. */
const SAMPLE_REV = '2';
const OM3_SAMPLES = [
  { id: 'frames', label: '彩色窗框' }, { id: 'portrait', label: '人像' }, { id: 'headwrap', label: '头巾人像' },
  { id: 'taxi', label: '黄色出租车' }, { id: 'meadow', label: '山地草甸' }, { id: 'forest', label: '林间日出' }, { id: 'ocean', label: '海洋' },
  { id: 'bluehour', label: '蓝调时刻' }, { id: 'paris', label: '夜间街道' }, { id: 'neon', label: '黄昏餐馆' }, { id: 'paijanne', label: '日落' },
];
/** The camera's HSL wheel pages, in its INFO order (v0.26): Color (saturation), Hue, Luminance, Shadows, Highlights. */
type Tab = 'sat' | 'hue' | 'light' | 'sh' | 'hl';

let libNotice = '';
const S = {
  tab: 'sat' as Tab,
  sector: 0,            // the wheel's selected colour (the camera's front dial)
  rgb: 'r' as Channel,  // the RGB curves' colour (the camera's INFO on the RGB row)
  image: 'frames',
  cut: 50,
  aspect: (() => { try { const a = localStorage.getItem('caduceus.om3.aspect'); if (a && ASPECTS.some((x) => x.id === a)) return a; } catch { /* storage blocked */ } return '4:3'; })(),
};

// ---------------------------------------------------------------- camera: OM-3 only (owner 2026-11-09: the E-P7 side of the
// shared Caduceus Control Panel is gone from this tool)
const STORE_OM3 = 'caduceus.om3.bank.v1';
const CAM = 'om3' as const;
const samples = () => OM3_SAMPLES;
/** The OM-3 look bank: 4 COLORs x 5 numbers, positional like the camera's Film page. */
const O = { name: 'OM-3 looks', bank: startBank(), k: 0, v: 0 };
// Saved lists ("playlists"): named copies of all four COLORs' looks, kept in this browser. The list you're on is the
// one you edit: every change is saved into it. The looks you had before lists existed are the list "Default".
const STORE_LISTS = 'caduceus.om3.lists.v1', LIST_NAME_MAX = 40;
interface Lists { current: string; lists: Record<string, Bank> }
const LISTS: Lists = (() => {
  try {
    const raw = localStorage.getItem(STORE_LISTS);
    if (raw) {
      const j = JSON.parse(raw) as { current?: unknown; lists?: Record<string, unknown> };
      const lists: Record<string, Bank> = {};
      for (const [n, b] of Object.entries(j.lists ?? {})) {
        try { lists[n] = parseBank({ schema: BANK_SCHEMA, name: n, bank: b }, parseLook).bank; } catch { /* skip a damaged list */ }
      }
      const names = Object.keys(lists);
      if (names.length) {
        const current = typeof j.current === 'string' && lists[j.current] ? j.current : names[0];
        return { current, lists };
      }
    }
  } catch { /* storage blocked or damaged: start from the looks you have */ }
  return { current: 'Default', lists: { Default: O.bank } };
})();
// v0.22 (once): film sims added before they had a Sharp value get their film's, unless you set one yourself.
(() => {
  const KEY = 'caduceus.om3.filmsharp';
  try { if (localStorage.getItem(KEY)) return; } catch { return; }
  let n = 0;
  for (const bank of Object.values(LISTS.lists)) for (const row of bank) for (const l of row) {
    const f = l && filmOf(l);
    if (l && f && f.sharp && !(l.advice.sharpness ?? 0)) { l.advice = { ...l.advice, sharpness: f.sharp }; n++; }
  }
  try {
    localStorage.setItem(KEY, '1');
    if (n) localStorage.setItem(STORE_LISTS, JSON.stringify({ current: LISTS.current, lists: LISTS.lists }));
  } catch { /* private mode */ }
  if (n) libNotice = (libNotice ? libNotice + ' ' : '') + `Film sims now set Sharp (firmware v0.22): ${n} of your film looks got their film's value.`;
})();
O.bank = LISTS.lists[LISTS.current]; O.name = LISTS.current;
function storeLists() {
  LISTS.lists[LISTS.current] = O.bank;
  localStorage.setItem(STORE_LISTS, JSON.stringify({ current: LISTS.current, lists: LISTS.lists }));
}
const listNames = () => Object.keys(LISTS.lists).sort((a, b) => (a === 'Default' ? -1 : b === 'Default' ? 1 : a.localeCompare(b)));
function startBank(): Bank {
  try {
    const s = localStorage.getItem(STORE_OM3);
    if (s) return parseBank(JSON.parse(s), parseLook).bank;
    const old = fromOldLookLab(localStorage.getItem('om3-looklab'));
    if (old) { libNotice = 'Your looks from the earlier OM-3 Look Lab are here.'; return old; }
  } catch { /* fall through */ }
  return defaultBank(LIBRARY, fromLibrary);
}
const bankSnapshot = () => JSON.stringify({ schema: BANK_SCHEMA, name: O.name, bank: O.bank });

let saveTimer = 0;
function flush() {
  clearTimeout(saveTimer);
  try {
    storeLists();
  } catch {
    return false;
  }
  // Older versions read this backup; this version restores from STORE_LISTS first.
  try { localStorage.setItem(STORE_OM3, bankSnapshot()); } catch { /* best effort */ }
  return true;
}
function persist() { clearTimeout(saveTimer); saveTimer = window.setTimeout(flush, 250); }
window.addEventListener('pagehide', flush);

// ---------------------------------------------------------------- undo / redo
// Every edit calls save(). Continuous edits (slider drags, typing) run inside draft(): they are saved but only become
// an undo step at the end of the gesture (the input's change event: pointer-up, blur or Enter) via checkpoint().
const snapshot = () => bankSnapshot();
let hist = new History(snapshot(), 200);
let drafting = false;
function save() { persist(); if (!drafting) checkpoint(); }
function draft(f: () => void) { drafting = true; try { f(); } finally { drafting = false; } }
function checkpoint() { hist.commit(snapshot()); undoUi(); }
function undoUi() {
  const u = document.getElementById('undo') as HTMLButtonElement | null, r = document.getElementById('redo') as HTMLButtonElement | null;
  if (u) u.disabled = !hist.canUndo;
  if (r) r.disabled = !hist.canRedo;
}
function step(dir: 'undo' | 'redo') {
  checkpoint();
  const s = dir === 'undo' ? hist.undo() : hist.redo();
  if (s === null) return;
  O.bank = parseBank(JSON.parse(s), parseLook).bank;
  persist(); renderAll(); undoUi();
}
const isTextField = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable) ||
  (t instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file'].includes(t.type));
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextField(e.target) || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (k === 'z') step(e.shiftKey ? 'redo' : 'undo');
  else if (k === 'y' && !e.shiftKey) step('redo');
  else return;
  e.preventDefault();
});
const cur = (): Look | undefined => O.bank[O.k][O.v] ?? undefined;

// ---------------------------------------------------------------- DOM helpers
type Attrs = Record<string, unknown>;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | false | undefined)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'value') (el as HTMLInputElement).value = String(v);
    else if (k === 'checked') (el as HTMLInputElement).checked = Boolean(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== false && c !== undefined) el.append(c);
  return el;
}
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

function download(name: string, data: Uint8Array | string, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

let toastTimer = 0;
function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.className = 'toast'), 3200);
}

function modal(title: string, body: Node, actions: (HTMLElement | null)[] = []): HTMLDialogElement {
  const dlg = h('dialog', { class: 'modal' },
    h('form', { method: 'dialog', class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon', 'aria-label': '关闭' }, '×')),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-actions' }, ...actions) : null);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

async function copy(text: string, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(what); } catch { toast('Copy failed: select the text and copy it by hand', 'err'); }
}

const shareBase = () => location.origin + location.pathname;

// ---------------------------------------------------------------- layout
function shell() {
  const app = $('#app');
  app.replaceChildren(
    h('header', { class: 'top' },
      h('div', { class: 'brand' }, h('span', { class: 'mark', 'aria-hidden': 'true' }, '☤'), h('span', { class: 'word' }, 'LookLab'),
        h('span', { class: 'sub' }, 'Caduceus for OM-3')),
      h('nav', { class: 'actions' },
        h('span', { class: 'undo-btns' },
          h('button', { id: 'undo', class: 'icon', title: '撤销（Ctrl+Z）', 'aria-label': '撤销', disabled: true, onclick: () => step('undo') }, '↶'),
          h('button', { id: 'redo', class: 'icon', title: '重做（Ctrl+Shift+Z）', 'aria-label': '重做', disabled: true, onclick: () => step('redo') }, '↷')),
        menu('新建', [
          ['恢复默认胶片组', () => newBank('library')],
          ['新建空白胶片组', () => newBank('empty')],
        ]),
        h('button', { onclick: openFile, title: '打开卡内的 OM3MOD/LOOKS.BIN 或 LookLab 配方文件' }, '打开…'),
        h('button', { onclick: () => om3FilmPicker(), title: '从模拟库添加胶片' }, '胶片模拟'),
        h('button', { onclick: () => $<HTMLInputElement>('#grade').click(), title: '导入 .cube LUT 或 Lightroom 预设（.xmp、.lrtemplate）并拟合为机身配方' }, '从 LUT 或预设创建…'),
        h('button', { onclick: pasteDialog, title: '打开已分享的胶片或胶片组链接' }, '粘贴链接'),
        h('button', { onclick: om3Share }, '分享胶片组'),
        h('button', { onclick: om3InstallDialog }, '安装固件'),
        h('button', { class: 'primary', onclick: om3ExportDialog }, '导出'))),
    h('main', { class: 'layout' },
      h('aside', { class: 'pane list-pane', id: 'list' }),
      h('section', { class: 'pane preview-pane', id: 'preview' }),
      h('section', { class: 'pane editor-pane', id: 'editor' })),
    h('footer', { class: 'foot' },
      h('span', {}, 'Caduceus 是社区开发的 OM-3 固件扩展。此工具编辑 COLOR 彩色配方，文件均在浏览器内生成。'),
      h('span', { class: 'links' },
        h('a', { href: '../' }, '功能介绍'), h('a', { href: '../pages/install/' }, '安装'), h('a', { href: '../pages/faq/' }, '常见问题'),
        h('a', { href: './samples/CREDITS.md', target: '_blank', rel: 'noopener' }, '样片来源'))),
    h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }),
    h('input', { type: 'file', id: 'file', accept: '.json,application/json,.bin,.BIN,.jpg,.JPG,.jpeg,image/jpeg,.cube,.CUBE,.xmp,.XMP,.lrtemplate', hidden: true, onchange: om3OnFile }),
    h('input', { type: 'file', id: 'photo', accept: 'image/*', hidden: true, onchange: onPhoto }),
    h('input', { type: 'file', id: 'grade', accept: '.cube,.CUBE,.xmp,.XMP,.lrtemplate', hidden: true, onchange: om3OnGradeFile }));
  buildPreview();
  // owner 2026-11-13: the film list is as tall as the preview and scrolls on its own
  const listPane = $<HTMLElement>('#list'), pvPane = $<HTMLElement>('#preview');
  new ResizeObserver(() => listPane.style.setProperty('--pv-h', `${pvPane.offsetHeight}px`)).observe(pvPane);
}

function menu(label: string, items: [string, () => void][]): HTMLElement {
  const d = h('details', { class: 'menu' }, h('summary', {}, label),
    h('div', { class: 'menu-items' }, ...items.map(([t, f]) => h('button', { onclick: () => { d.open = false; f(); } }, t))));
  document.addEventListener('click', (e) => { if (!d.contains(e.target as Node)) d.open = false; });
  return d;
}

function renderAll() {
  renderList();
  renderEditor();
  schedulePreview();
}

// ---------------------------------------------------------------- look list
function renderList() {
  renderBank();
}

function enterCommits(e: KeyboardEvent) { if (e.key === 'Enter') checkpoint(); }
function focusSel() { ($('#list li.sel') as HTMLElement | null)?.focus(); }

// ---------------------------------------------------------------- editor
function renderEditor() {
  const el = $('#editor');
  const l = cur();
  if (!l) { el.replaceChildren(emptySlotPanel()); return; }
  renderOm3Editor(l);
}

/** The camera's slider bar: − and + at the ends (one step each, like a dial click) around the slider. */
function steps(inp: HTMLInputElement): HTMLElement {
  const bump = (d: number) => {
    const v = Math.max(Number(inp.min), Math.min(Number(inp.max), Number(inp.value) + d));
    if (v === Number(inp.value)) return;
    inp.value = String(v);
    inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
  };
  return h('div', { class: 'cam-bar' },
    h('button', { class: 'cam-step', 'aria-label': 'Less', tabindex: -1, onclick: () => bump(-1) }, '−'), inp,
    h('button', { class: 'cam-step', 'aria-label': 'More', tabindex: -1, onclick: () => bump(1) }, '+'));
}
/** A Picture Mode row: the camera's name, a slider and the value. */
function crow(label: string, lim: number, get: () => number, set: (x: number) => void, help: HelpBody): HTMLElement {
  const { inp, out } = slider(-lim, lim, get(), (x) => { set(x); save(); schedulePreview(); refreshProblems(); }, undefined, label);
  return withHelp(h('div', { class: 'crow' }, h('span', { class: 'cname' }, label), steps(inp), out), label, help);
}
/** A Picture Mode row with a few choices. */
function cseg(label: string, opts: [string, string][], value: string, on: (v: string) => void, help: HelpBody): HTMLElement {
  return withHelp(h('div', { class: 'crow seg-row' }, h('span', { class: 'cname' }, label),
    h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label }, ...opts.map(([v, t]) =>
      h('button', { role: 'radio', 'aria-checked': String(v === value), class: v === value ? 'on' : '', onclick: () => on(v) }, t)))), label, help);
}
/** Help (owner, 2026-11-18, as DxO PhotoLab): a "?" beside each setting's name opens a box under the setting with what
 *  it does and how to use it, in place of the always-on help text. Boxes left open stay open while the editor redraws. */
type HelpBody = (string | Node | null | false | undefined)[];
const helpOpen = new Set<string>();
function helpParts(key: string, body: HelpBody): { q: HTMLElement; box: HTMLElement } {
  const id = `help-${key.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}`, open = helpOpen.has(key);
  const box = h('div', { class: 'help-box', id, hidden: !open }, ...body.map((b) => (typeof b === 'string' ? h('p', {}, b) : b)));
  const q = h('button', { type: 'button', class: open ? 'help-q on' : 'help-q', 'aria-expanded': String(open), 'aria-controls': id, 'aria-label': `About ${key}`, title: 'What this does and how to use it' }, '?');
  q.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const show = box.hidden;
    box.hidden = !show; q.classList.toggle('on', show); q.setAttribute('aria-expanded', String(show));
    if (show) helpOpen.add(key); else helpOpen.delete(key);
  });
  return { q, box };
}
/** A settings row with a "?" after its name and its help box under it (plus any notes that belong to the row). */
function withHelp(row: HTMLElement, key: string, body: HelpBody, ...after: (Node | null)[]): HTMLElement {
  const { q, box } = helpParts(key, body);
  (row.querySelector('.cname') ?? row).append(q);
  return h('div', { class: 'crow-wrap' }, row, box, ...after);
}
const fwLine = (fw: string, text: string) => h('p', {}, h('b', {}, `${fw}: `), text);

function slider(min: number, max: number, value: number, on: (v: number) => void, fmt = (v: number) => (v > 0 ? `+${v}` : String(v)), aria = '') {
  const out = h('output', {}, fmt(value));
  const inp = h('input', {
    type: 'range', min, max, step: 1, value, 'aria-label': aria,
    oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); out.textContent = fmt(v); draft(() => on(v)); },
    onchange: checkpoint,
    ondblclick: () => { inp.value = '0'; out.textContent = fmt(0); on(0); },
  });
  return { inp, out };
}

/** Small live tone-curve graph: x = the stock rendering, y = with this look's tone (the camera LUT model). */
function toneCurve(tone: Tone): { svg: SVGSVGElement; draw: () => void; X: (v: number) => number; Y: (v: number) => number } {
  const NS = 'http://www.w3.org/2000/svg', S0 = 200, P = 8, W = S0 - 2 * P;
  const el = <K extends keyof SVGElementTagNameMap>(t: K, a: Record<string, string | number>) => {
    const e = document.createElementNS(NS, t);
    for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
    return e;
  };
  const svg = el('svg', { viewBox: `0 0 ${S0} ${S0}`, width: S0, height: S0, class: 'tone-curve cam-screen', role: 'img', 'aria-label': 'Tone curve: stock input to look output' });
  const X = (v: number) => P + v * W, Y = (v: number) => P + (1 - v) * W;
  svg.append(el('rect', { x: P, y: P, width: W, height: W, class: 'tc-frame' }));
  svg.append(el('line', { x1: X(0.5), y1: Y(0), x2: X(0.5), y2: Y(1), class: 'tc-grid' }));   // the camera's 2 x 2 grid
  svg.append(el('line', { x1: X(0), y1: Y(0.5), x2: X(1), y2: Y(0.5), class: 'tc-grid' }));
  svg.append(el('line', { x1: X(0), y1: Y(0), x2: X(1), y2: Y(1), class: 'tc-ident' }));
  const path = el('path', { class: 'tc-curve', d: '' });
  const dB = el('circle', { r: 3.5, class: 'tc-end' }), dW = el('circle', { r: 3.5, class: 'tc-end' });
  svg.append(path, dB, dW);
  const draw = () => {
    const t = previewToneLut(tone, 128);
    let d = '';
    t.forEach((v, i) => { d += `${i ? 'L' : 'M'}${X(i / 128).toFixed(1)},${Y(v).toFixed(1)}`; });
    path.setAttribute('d', d);
    dB.setAttribute('cx', String(X(0))); dB.setAttribute('cy', String(Y(t[0])));
    dW.setAttribute('cx', String(X(1))); dW.setAttribute('cy', String(Y(t[128])));
    dB.classList.toggle('on', tone.blacks !== 0); dW.classList.toggle('on', tone.whites !== 0);
  };
  draw();
  return { svg, draw, X, Y };
}


// ---------------------------------------------------------------- the camera's Picture Mode screen, as panels
const SVG_NS = 'http://www.w3.org/2000/svg';
/** The camera's row pictures (colour menu spec, test 7), small, for the headings. */
const PIE = ['#f2c400', '#f39a00', '#ee6a1c', '#de2f2f', '#d23fa6', '#8650d6', '#3b5fe0', '#2f8fe6', '#22bfd3', '#1fb486', '#3aac45', '#a3c52a'];
let pmIds = 0;
function pmIcon(kind: 'mix' | 'rgb' | 'wheel' | 'tb' | 'bw' | 'glow' | 'halo'): SVGSVGElement {
  const s = svgEl('svg', { viewBox: '0 0 24 24', width: 18, height: 18, class: 'pm-ic', 'aria-hidden': 'true' });
  const add = <K extends keyof SVGElementTagNameMap>(t: K, a: Record<string, string | number>, to: Element = s) => { const e = svgEl(t, a); to.append(e); return e; };
  const grad = (t: 'linearGradient' | 'radialGradient', stops: [number, string, number][]) => {
    const id = `pmg${++pmIds}`, defs = add('defs', {}), g = add(t, { id }, defs);
    for (const [o, c, a] of stops) add('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }, g);
    return `url(#${id})`;
  };
  if (kind === 'mix') {
    add('circle', { cx: 12, cy: 12, r: 8.5, fill: 'none', stroke: 'currentColor', 'stroke-opacity': 0.45, 'stroke-width': 1.2 });
    for (const [x, y, c, r] of [[12, 3.5, '#f0603a', 2.8], [19.4, 16.3, '#30a46c', 2.2], [4.6, 16.3, '#3e8ef7', 2.2]] as [number, number, string, number][]) {
      add('line', { x1: 12, y1: 12, x2: x, y2: y, stroke: c, 'stroke-width': 1 }); add('circle', { cx: x, cy: y, r, fill: c });
    }
  } else if (kind === 'rgb') {
    add('rect', { x: 3, y: 3, width: 18, height: 18, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 });
    add('path', { d: 'M3 21Q7 7 21 3', fill: 'none', stroke: '#f0603a', 'stroke-width': 1.6 });
    add('path', { d: 'M3 21L21 3', fill: 'none', stroke: '#30a46c', 'stroke-width': 1.6 });
    add('path', { d: 'M3 21Q17 17 21 3', fill: 'none', stroke: '#3e8ef7', 'stroke-width': 1.6 });
  } else if (kind === 'wheel') {         // the colour pie: the wheel's 12 colours, Yellow at 12 o'clock, clockwise
    const pt = (a: number) => `${(12 + 10 * Math.cos((a * Math.PI) / 180)).toFixed(2)} ${(12 + 10 * Math.sin((a * Math.PI) / 180)).toFixed(2)}`;
    PIE.forEach((c, k) => { const a0 = -105 + 30 * k; add('path', { d: `M12 12L${pt(a0)}A10 10 0 0 1 ${pt(a0 + 30)}Z`, fill: c }); });
    add('circle', { cx: 12, cy: 12, r: 10, fill: 'none', stroke: '#fff', 'stroke-width': 0.8 });
  } else if (kind === 'tb') {            // Split Tone Balance: a dark-to-light bar with a small triangle under its middle
    add('rect', { x: 2, y: 5, width: 20, height: 8, fill: grad('linearGradient', [[0, '#111', 1], [1, '#eee', 1]]), stroke: 'currentColor', 'stroke-width': 1 });
    add('path', { d: 'M12 15L9.5 20H14.5Z', fill: 'currentColor' });
  } else if (kind === 'bw') {            // Blacks / Whites: a black and a white square
    add('rect', { x: 2.5, y: 7, width: 8.5, height: 8.5, fill: '#111', stroke: '#aaa', 'stroke-width': 1 });
    add('rect', { x: 13, y: 7, width: 8.5, height: 8.5, fill: '#fff', stroke: '#888', 'stroke-width': 1 });
  } else if (kind === 'glow') {          // Glow Effect: a dot with a soft glow round it
    add('circle', { cx: 12, cy: 12, r: 10.5, fill: grad('radialGradient', [[0, 'currentColor', 0.6], [1, 'currentColor', 0]]) });
    add('circle', { cx: 12, cy: 12, r: 3.6, fill: 'currentColor' });
  } else {                               // Halation Effect: a dot in a red-orange ring
    add('circle', { cx: 12, cy: 12, r: 7.6, fill: 'none', stroke: '#f0603a', 'stroke-width': 2.6, 'stroke-opacity': 0.85 });
    add('circle', { cx: 12, cy: 12, r: 3.6, fill: 'currentColor' });
  }
  return s;
}

function svgEl<K extends keyof SVGElementTagNameMap>(t: K, a: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, t);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
  return e;
}
const signed = (v: number) => (v > 0 ? `+${v}` : String(v));
const TAB_NAME: Record<Tab, string> = { sat: '饱和度', hue: '色相', light: '明度', sh: '阴影', hl: '高光' };

/** The HSL wheel with the camera's five pages. Color / Hue / Luminance: a value for each of the 12 colours (±5).
 *  Shadows / Highlights (v0.26 split toning): one colour and a strength, 0..10 as the camera's v0.28 wheel (half the
 *  v0.26 step; the look keeps v0.26 steps in halves). Click a colour (or ← →, the front dial),
 *  then set the value with the slider (or ↑ ↓ / the mouse wheel, the rear dial). */
function hslPanel(l: Look, changed: () => void): HTMLElement {
  const tab = S.tab;
  const split = tab === 'sh' || tab === 'hl';
  const sp = (): Split => l.split ?? { sh_color: 8, sh: 0, hl_color: 1, hl: 0 };
  const cKey = tab === 'sh' ? 'sh_color' : 'hl_color';
  const lim = split ? SPLIT_STEPS : 5;
  if (split) S.sector = sp()[cKey as 'sh_color'];
  const cur = () => toSteps(sp()[tab as 'sh']);                // split: the strength in the camera's 0..10
  const valueOf = (i: number) => (split ? (i === sp()[cKey as 'sh_color'] ? cur() : 0) : l[tab as 'sat'][i]);
  const setValue = (i: number, v: number) => {
    v = Math.max(split ? 0 : -lim, Math.min(lim, v));
    if (split) {
      const s = { ...sp(), [cKey]: i, [tab]: fromSteps(v) } as Split;
      if (s.sh || s.hl) l.split = s; else delete l.split;
    } else l[tab as 'sat'][i] = v;
    changed();
  };
  const tabHas = (t: Tab) => (t === 'sh' || t === 'hl' ? !!l.split?.[t] : l[t].some((x) => x !== 0));

  // The wheel as the camera draws it: the 12 colours as a ring (Yellow at 12 o'clock, clockwise), and inside it an
  // outline through one corner per colour that moves out (+) or in (−) with that colour's value; the dashed circle is 0.
  // Shadows / Highlights as the camera's v0.28 wheel: the strength 0..10 on the same −5..+5 scale (0 at the inner
  // edge, 5 on the dashed circle, 10 at the outer edge), the other colours at the inner edge; readout ±0, +1..+9, 10.
  // Only one colour can be set (choosing another moves the strength to it).
  const SZ = 290, C = SZ / 2, R0 = 104, R1 = 122, RZ = 64, RB = 34;
  const camTxt = (n: number) => (n <= 0 ? '±0' : n >= SPLIT_STEPS ? String(SPLIT_STEPS) : `+${n}`);   // the camera's split readout
  const onScale = (v: number) => (split ? v - SPLIT_STEPS / 2 : v);                                 // the wheel's own −5..+5
  const svg = svgEl('svg', { viewBox: `0 0 ${SZ} ${SZ}`, class: 'hsl-wheel cam-screen', role: 'group', tabindex: 0,
    'aria-label': `${TAB_NAME[tab]}色轮：左右键选择颜色，上下键调节数值` });
  const pt = (a: number, r: number) => [C + r * Math.sin(a), C - r * Math.cos(a)];
  svg.append(svgEl('rect', { x: 0, y: 0, width: SZ, height: SZ, rx: 14, class: 'cs-bg' }));
  const wedges: SVGPathElement[] = [], dots: SVGCircleElement[] = [], nums: SVGTextElement[] = [];
  SPLIT_COLOURS.forEach(([nm, col], i) => {
    const a0 = (i - 0.5) * Math.PI / 6, a1 = (i + 0.5) * Math.PI / 6;
    const [x0, y0] = pt(a0, R1), [x1, y1] = pt(a1, R1), [x2, y2] = pt(a1, R0), [x3, y3] = pt(a0, R0);
    const w = svgEl('path', { d: `M${x0},${y0} A${R1},${R1} 0 0 1 ${x1},${y1} L${x2},${y2} A${R0},${R0} 0 0 0 ${x3},${y3} Z`, fill: col, class: 'hw-wedge' });
    const t = svgEl('title'); t.textContent = nm; w.append(t);
    w.addEventListener('dblclick', () => { S.sector = i; setValue(i, 0); draw(); checkpoint(); });
    const dot = svgEl('circle', { r: 4.5, fill: col, class: 'hw-dot' });
    const [nx, ny] = pt(i * Math.PI / 6, R1 + 11);
    const num = svgEl('text', { x: nx, y: ny, class: 'hw-num', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    svg.append(w); wedges.push(w); dots.push(dot); nums.push(num);
  });
  const spokes = svgEl('g', { class: 'hw-spokes' });
  for (let i = 0; i < 12; i++) { const [x, y] = pt(i * Math.PI / 6, R0 - 2); spokes.append(svgEl('line', { x1: C, y1: C, x2: x, y2: y })); }
  const poly = svgEl('path', { class: 'hw-poly' });
  svg.append(spokes, svgEl('circle', { cx: C, cy: C, r: RZ, class: 'hw-zero' }), poly, ...dots, ...nums);
  // the selected colour and its value in the screen's corner, where the camera shows its dial readouts
  const hubName = svgEl('text', { x: 14, y: 22, class: 'hw-hub-name' });
  const hubVal = svgEl('text', { x: 14, y: 44, class: 'hw-hub-val' });
  svg.append(hubName, hubVal);

  const { inp, out } = slider(split ? 0 : -lim, lim, valueOf(S.sector), (v) => { setValue(S.sector, v); draw(false); }, split ? camTxt : undefined, `${TAB_NAME[tab]} value`);
  const selName = h('span', { class: 'hw-sel' });
  const move = (d: number) => { S.sector = (S.sector + d + 12) % 12; if (split) setValue(S.sector, cur()); draw(); };
  function draw(syncSlider = true) {
    let d = '';
    for (let i = 0; i < 12; i++) {
      const v = valueOf(i), am = i * Math.PI / 6, [x, y] = pt(am, RZ + (onScale(v) / 5) * RB);
      d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      dots[i].setAttribute('cx', x.toFixed(1)); dots[i].setAttribute('cy', y.toFixed(1));
      dots[i].classList.toggle('sel', i === S.sector);
      nums[i].textContent = v ? (split ? camTxt(v) : signed(v)) : '';
      wedges[i].classList.toggle('sel', i === S.sector);
    }
    poly.setAttribute('d', d + 'Z');
    const v = valueOf(S.sector), nm = SPLIT_COLOURS[S.sector][0];
    hubName.textContent = split && !v ? TAB_NAME[tab] : nm;
    hubVal.textContent = split ? camTxt(v) : signed(v);
    selName.textContent = nm;
    selName.style.setProperty('--sw', SPLIT_COLOURS[S.sector][1]);
    if (syncSlider) { inp.value = String(v); out.textContent = split ? camTxt(v) : signed(v); }
  }
  svg.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'ArrowLeft') move(-1); else if (k === 'ArrowRight') move(1);
    else if (k === 'ArrowUp' || k === 'ArrowDown') { setValue(S.sector, valueOf(S.sector) + (k === 'ArrowUp' ? 1 : -1)); draw(); checkpoint(); }
    else if (k === '0' || k === 'Delete' || k === 'Backspace') { setValue(S.sector, 0); draw(); checkpoint(); }
    else return;
    e.preventDefault();
  });
  // Mouse / touch: press on a colour to pick it, drag out or in to set its value (the bar follows: out = +, in = −).
  // On Shadows / Highlights the colour follows the pointer too. A press without a drag only picks the colour.
  const polar = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * SZ - C, y = ((e.clientY - r.top) / r.height) * SZ - C;
    const a = (Math.atan2(x, -y) + 2 * Math.PI) % (2 * Math.PI);
    return { i: Math.round(a / (Math.PI / 6)) % 12, rad: Math.hypot(x, y) };
  };
  let drag: { id: number; x: number; y: number; moved: boolean } | null = null;
  svg.addEventListener('pointerdown', (e) => {
    const { i, rad } = polar(e);
    if (rad > R1 + 16 || e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    svg.setPointerCapture(e.pointerId);
    S.sector = i;
    if (split) setValue(i, cur() || 4);
    draw(); svg.focus({ preventScroll: true, focusVisible: false } as FocusOptions); e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
    drag.moved = true;
    const { i, rad } = polar(e);
    if (split && i !== S.sector) S.sector = i;
    const w = ((rad - RZ) / RB) * 5, v = Math.round(split ? w + SPLIT_STEPS / 2 : (w * lim) / 5);
    if (v !== valueOf(S.sector) || split) { setValue(S.sector, v); draw(); }
  });
  const endDrag = (e: PointerEvent) => { if (drag && e.pointerId === drag.id) { drag = null; checkpoint(); } };
  svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
  // owner 2026-11-13: the mouse wheel / trackpad never changes a value (it only scrolls the page)
  draw();

  const help = split
    ? `${tab === 'sh' ? 'Tints the shadows' : 'Tints the highlights'} toward one colour: pick it, then set the strength 0–10 (as the camera from v0.28; 10 = v0.26's +5). One colour at a time. Needs firmware v0.26; the odd steps (1, 3 … 9) need v0.28 and are rounded up for older firmware. Tone Balance (below) moves where the two tints meet.`
    : tab === 'hue' ? 'Turns a colour toward its clockwise neighbour (+: Yellow → Orange).'
      : tab === 'light' ? 'Darker or brighter, per colour.' : 'Saturation, per colour.';
  const hp = helpParts('Color wheel (HSL)', [
    'Changes the 12 colours of the wheel one at a time, as the camera\'s colour wheel: Sat (how strong a colour is), Hue (turns it toward its neighbour), Light (darker or brighter). Shadows and Highlights tint the dark or the light parts of the photo toward one colour (split toning).',
    `This page: ${help}`,
    'How to use: pick a tab, then drag a colour\'s corner out (+) or in (−), or pick a colour with ‹ › and use the slider or ↑ ↓ on the wheel. Double-click a colour on the ring to zero it; Reset page zeroes the whole tab.',
    'On the camera: Picture Mode › Color wheel; the front dial picks the colour, the rear dial sets it.']);
  return h('div', { class: 'group cam' },
    h('div', { class: 'cam-head' }, h('span', { class: 'lbl' }, pmIcon('wheel'), '十二色色轮（HSL）', hp.q),
      h('button', { class: 'link', onclick: () => { if (split) { if (l.split) { const s = { ...l.split, [tab]: 0 } as Split; if (s.sh || s.hl) l.split = s; else delete l.split; } } else l[tab as 'sat'].fill(0); renderEditor(); changed(); } }, '重置本页')),
    h('div', { class: 'tabs cam-tabs', role: 'tablist' }, ...(['sat', 'hue', 'light', 'sh', 'hl'] as Tab[]).map((t) => h('button', {
      role: 'tab', 'aria-selected': String(t === tab), class: t === tab ? 'on' : '',
      onclick: () => { S.tab = t; renderEditor(); },
    }, TAB_NAME[t], tabHas(t) ? h('span', { class: 'dot' }) : null))),
    hp.box,
    split && !om3Fw25() ? h('p', { class: 'warn' }, h('b', {}, 'Needs firmware v0.26: '), 'Export is set to an older firmware, so split toning is not previewed or saved. Choose "v0.26 or later" under Export › Firmware on the camera.') : null,
    split && om3Fw25() && !om3Fw28() && cur() % 2 ? h('p', { class: 'warn' }, h('b', {}, 'Half steps need firmware v0.28: '), `the export is set to an older firmware, so ${cur()} is saved and previewed as ${cur() + 1}. Choose "v0.28 or later" under Export › Firmware on the camera.`) : null,
    svg,
    h('div', { class: 'hw-ctl' },
      h('button', { class: 'icon', title: '上一个颜色（前拨轮）', 'aria-label': '上一个颜色', onclick: () => move(-1) }, '‹'),
      selName,
      h('button', { class: 'icon', title: '下一个颜色（前拨轮）', 'aria-label': '下一个颜色', onclick: () => move(1) }, '›'),
      steps(inp), out));
}

/** Highlight & Shadow: the curve with its sliders. Drag the handles on the curve up or down: S, M and H (Shadows,
 *  Midtones, Highlights). The two ends show Blacks / Whites (set on their own grid, bwPanel, as on the camera from v0.28). */
let toneRedraw: (() => void) | null = null;
function tonePanel(l: Look, changed: () => void): HTMLElement {
  const { svg, draw: drawCurve, X, Y } = toneCurve(l.tone);
  const syncs: (() => void)[] = [];
  const row = (k: keyof Tone, label: string) => {
    const lim = toneLimit(k);
    const { inp, out } = slider(-lim, lim, l.tone[k], (v) => { l.tone[k] = v; draw(); changed(); }, undefined, label);
    syncs.push(() => { inp.value = String(l.tone[k]); out.textContent = signed(l.tone[k]); });
    return h('div', { class: 'crow' }, h('span', { class: 'cname' }, label), steps(inp), out);
  };
  // handle: tone key, where it sits on the curve (x), its letter; the ends use the curve's first / last point
  const HANDLES: [keyof Tone, number, string][] = [['blacks', 0, 'Blk'], ['shadows', 0.25, 'Sh'], ['midtones', 0.5, '中间调'], ['highlights', 0.75, 'Hi'], ['whites', 1, 'Wht']];
  const STEP = 9;   // px of drag per step
  const knobs = HANDLES.map(([k, , t]) => {
    if (k === 'blacks' || k === 'whites') {      // v0.28: shown only (Blacks / Whites have their grid)
      const g = svgEl('g', { class: 'tc-knob end ro', 'aria-hidden': 'true' });
      g.append(svgEl('circle', { r: 3.5, class: 'pip' }));
      svg.append(g);
      return g;
    }
    const g = svgEl('g', { class: 'tc-knob', tabindex: 0, role: 'slider', 'aria-label': `${({ Sh: '阴影', Mid: '中间调', Hi: '高光' } as Record<string, string>)[t] ?? t}：上下拖动` });
    // the camera marks Sh / Hi (and Mid on its INFO page) with a small cross on the curve; the ends with a dot
    g.append(svgEl('circle', { r: 10, class: 'hit' }), svgEl('path', { d: 'M-6,0H6M0,-6V6', class: 'cross' }), svgEl('circle', { r: 3.5, class: 'pip' }));
    let d: { id: number; y: number; v0: number } | null = null;
    g.addEventListener('pointerdown', (e) => { if (e.button) return; d = { id: e.pointerId, y: e.clientY, v0: l.tone[k] }; g.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation(); });
    g.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      const scale = svg.viewBox.baseVal.height / svg.getBoundingClientRect().height;
      const lim = toneLimit(k), v = Math.max(-lim, Math.min(lim, d.v0 + Math.round(((d.y - e.clientY) * scale) / STEP)));
      if (v !== l.tone[k]) { l.tone[k] = v; draw(); changed(); }
    });
    const end = (e: PointerEvent) => { if (d && e.pointerId === d.id) { d = null; checkpoint(); } };
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
    g.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key, lim = toneLimit(k);
      if (key !== 'ArrowUp' && key !== 'ArrowDown') return;
      l.tone[k] = Math.max(-lim, Math.min(lim, l.tone[k] + (key === 'ArrowUp' ? 1 : -1))); draw(); changed(); checkpoint(); e.preventDefault();
    });
    g.addEventListener('dblclick', () => { l.tone[k] = 0; draw(); changed(); checkpoint(); });
    svg.append(g);
    return g;
  });
  function draw() {
    drawCurve();
    const t = previewToneLut(l.tone, 128);
    HANDLES.forEach(([k, x], j) => {
      const i = Math.round(x * 128);
      knobs[j].setAttribute('transform', `translate(${X(x).toFixed(1)},${Y(t[i]).toFixed(1)})`);
      knobs[j].classList.toggle('on', l.tone[k] !== 0);
      knobs[j].setAttribute('aria-valuenow', String(l.tone[k]));
    });
    syncs.forEach((f) => f());
    top.replaceChildren(...(['shadows', 'midtones', 'highlights'] as (keyof Tone)[]).map((k) =>
      h('span', { class: l.tone[k] ? 'on' : '' }, ({ shadows: 'Sh', midtones: '中间调', highlights: 'Hi' } as Record<string, string>)[k], ' ', l.tone[k] ? signed(l.tone[k]) : '±0')));
  }
  const top = h('div', { class: 'tc-top' });
  const rows = [row('shadows', '阴影'), row('midtones', '中间调'), row('highlights', '高光')];
  draw();
  toneRedraw = draw;
  const hsm = () => l.tone.shadows || l.tone.midtones || l.tone.highlights;
  const hp = helpParts('Highlight & Shadow', [
    'The camera\'s tone curve for this film: Shadows, Midtones and Highlights, −7 to +7 each. + brightens that part of the picture, − darkens it; Shadows − and Highlights + together give more contrast, the other way round a softer, flatter look.',
    'How to use: drag Sh, Mid or Hi on the curve up or down, or use the sliders; double-click a point to zero it. The curve shows the camera\'s normal (across) against this look (up); its two ends follow Blacks / Whites, which have their own grid below.',
    'On the camera: Picture Mode › Highlight & Shadow.']);
  return h('div', { class: 'group cam' },
    h('div', { class: 'cam-head' }, h('span', { class: 'lbl' }, 'Highlight & Shadow', hp.q),
      hsm() ? h('button', { class: 'link', onclick: () => { for (const k of ['shadows', 'midtones', 'highlights'] as const) l.tone[k] = 0; renderEditor(); changed(); } }, 'Reset') : null),
    hp.box,
    h('div', { class: 'cam-screen-wrap' }, top, svg), ...rows);
}

/** RGB curves (the camera's RGB row under Highlight & Shadow; feature/rgb-curves, camera-tested 2026-11-15): a curve
 *  each for red, green and blue with 5 points at 0 / 25 / 50 / 75 / 100 %, −7..+7 each (1.2 % of full scale a step).
 *  On the camera INFO picks the colour, the front dial the point, the rear dial up / down. Here: R / G / B, then drag
 *  a point up or down (or ↑ ↓; double-click = 0) or use its slider. Preview only: not in LOOKS.BIN yet. */
const RGB_NAME: Record<Channel, string> = { r: '红色', g: '绿色', b: '蓝色' };
const RGB_PT: [string, string][] = [['黑场', '0 %'], ['阴影', '25 %'], ['中间调', '50 %'], ['高光', '75 %'], ['白场', '100 %']];
function rgbPanel(l: Look, changed: () => void): HTMLElement {
  const S0 = 200, P = 8, W = S0 - 2 * P;
  const X = (v: number) => P + v * W, Y = (v: number) => P + (1 - v) * W;
  const ch = () => S.rgb;
  const get = (c: Channel, i: number) => l.rgb?.[c][i] ?? 0;
  const set = (c: Channel, i: number, v: number) => {
    v = Math.max(-CURVE_MAX, Math.min(CURVE_MAX, v));
    if (v === get(c, i)) return false;
    (l.rgb ??= flatCurves())[c][i] = v;
    if (!hasCurves(l)) delete l.rgb;
    return true;
  };
  const svg = svgEl('svg', { viewBox: `0 0 ${S0} ${S0}`, width: S0, height: S0, class: 'tone-curve rgb-curve cam-screen', role: 'img', 'aria-label': 'RGB curves: stock input to look output, per colour' });
  svg.append(svgEl('rect', { x: P, y: P, width: W, height: W, class: 'tc-frame' }));
  for (const q of [0.25, 0.5, 0.75]) {          // the camera page's quarter lines (the points sit on them)
    svg.append(svgEl('line', { x1: X(q), y1: Y(0), x2: X(q), y2: Y(1), class: 'tc-grid' }));
    svg.append(svgEl('line', { x1: X(0), y1: Y(q), x2: X(1), y2: Y(q), class: 'tc-grid' }));
  }
  svg.append(svgEl('line', { x1: X(0), y1: Y(0), x2: X(1), y2: Y(1), class: 'tc-ident' }));
  const paths = Object.fromEntries(CHANNELS.map((c) => [c, svgEl('path', { class: `rc-curve rc-${c}`, d: '' })])) as Record<Channel, SVGPathElement>;
  CHANNELS.forEach((c) => svg.append(paths[c]));
  const STEP = 9;   // px of drag per step
  const knobs = RGB_PT.map(([name, at], i) => {
    const g = svgEl('g', { class: 'tc-knob', tabindex: 0, role: 'slider', 'aria-valuemin': -CURVE_MAX, 'aria-valuemax': CURVE_MAX });
    g.append(svgEl('circle', { r: 10, class: 'hit' }), svgEl('circle', { r: 4, class: 'pip' }));
    let d: { id: number; y: number; v0: number } | null = null;
    g.addEventListener('pointerdown', (e) => { if (e.button) return; d = { id: e.pointerId, y: e.clientY, v0: get(ch(), i) }; g.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation(); });
    g.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      const scale = svg.viewBox.baseVal.height / svg.getBoundingClientRect().height;
      if (set(ch(), i, d.v0 + Math.round(((d.y - e.clientY) * scale) / STEP))) { draw(); changed(); }
    });
    const end = (e: PointerEvent) => { if (d && e.pointerId === d.id) { d = null; checkpoint(); } };
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
    g.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key !== 'ArrowUp' && key !== 'ArrowDown') return;
      if (set(ch(), i, get(ch(), i) + (key === 'ArrowUp' ? 1 : -1))) { draw(); changed(); checkpoint(); }
      e.preventDefault();
    });
    g.addEventListener('dblclick', () => { if (set(ch(), i, 0)) { draw(); changed(); checkpoint(); } });
    g.setAttribute('aria-label', `${name} (${at})：上下拖动`);
    svg.append(g);
    return g;
  });
  const top = h('div', { class: 'tc-top' });
  const chips = h('div', { class: 'seg rgb-ch', role: 'radiogroup', 'aria-label': 'Curve colour' });
  const rowsBox = h('div', {});
  // what the photo gets: t -> t + D(t), clamped, kept rising (as the camera's st_run)
  const out = (c: Channel) => {
    const D = curveDelta(l.rgb?.[c] ?? [0, 0, 0, 0, 0]), o: number[] = []; let mx = 0;
    for (let i = 0; i <= 128; i++) { const t = (i / 128) * 4095; mx = Math.max(mx, Math.min(4095, Math.max(0, t + D(t)))); o.push(mx / 4095); }
    return o;
  };
  const syncs: (() => void)[] = [];
  function draw() {
    for (const c of CHANNELS) {
      const o = out(c);
      paths[c].setAttribute('d', o.map((v, i) => `${i ? 'L' : 'M'}${X(i / 128).toFixed(1)},${Y(v).toFixed(1)}`).join(''));
      paths[c].classList.toggle('sel', c === ch());
    }
    svg.append(paths[ch()], ...knobs);         // the chosen colour on top, its points over it
    RGB_PT.forEach((_, i) => {
      const v = get(ch(), i), t = i * 1024 - (i === 4 ? 1 : 0);
      knobs[i].setAttribute('transform', `translate(${X(i / 4).toFixed(1)},${Y(Math.max(0, Math.min(4095, t + v * CURVE_STEP)) / 4095).toFixed(1)})`);
      knobs[i].setAttribute('class', `tc-knob rc-k-${ch()}${v ? ' on' : ''}`);
      knobs[i].setAttribute('aria-valuenow', String(v));
    });
    top.replaceChildren(h('span', { class: `on rgb-letter rc-${ch()}`, title: RGB_NAME[ch()] }, ch().toUpperCase()), ...RGB_PT.map((_, i) => h('span', { class: get(ch(), i) ? 'on' : '' }, get(ch(), i) ? signed(get(ch(), i)) : '±0')));
    chips.replaceChildren(...CHANNELS.map((c) => h('button', {
      role: 'radio', 'aria-checked': String(c === ch()), class: `rc-chip rc-${c}${c === ch() ? ' on' : ''}`, title: `${RGB_NAME[c]} curve${l.rgb && l.rgb[c].some((x) => x) ? '（已修改）' : ''}`,
      onclick: () => { S.rgb = c; buildRows(); draw(); },
    }, c.toUpperCase(), l.rgb && l.rgb[c].some((x) => x) ? '*' : '')));
    syncs.forEach((f) => f());
  }
  function buildRows() {
    syncs.length = 0;
    rowsBox.replaceChildren(...RGB_PT.map(([name, at], i) => {
      const { inp, out: o } = slider(-CURVE_MAX, CURVE_MAX, get(ch(), i), (v) => { if (set(ch(), i, v)) { draw(); changed(); } }, undefined, `${RGB_NAME[ch()]} ${name}`);
      syncs.push(() => { inp.value = String(get(ch(), i)); o.textContent = signed(get(ch(), i)); });
      return h('div', { class: 'crow', title: `控制点 ${i + 1}（机身前拨轮）：${RGB_NAME[ch()]}通道，亮度 ${at}` }, h('span', { class: 'cname' }, `${i + 1} · ${name}`), steps(inp), o);
    }));
  }
  buildRows(); draw();
  const hp = helpParts('RGB curves', [
    'A curve each for red, green and blue, with 5 points from black (0 %) to white (100 %), −7 to +7 each. Raise a colour\'s points to add that colour where those points are (in the shadows, mids or highlights); lower them to take it away. For example, blue up at the shadows and down at the highlights gives cool shadows and warm lights.',
    'How to use: pick R, G or B, then drag a point up or down on the curve, or use its slider or ↑ ↓; double-click a point to zero it. Reset clears all three curves.',
    fwLine('Firmware v0.30', 'saved with your looks as OM3MOD/CURVES.BIN (Export › Save to the SD card); the camera takes them at the next half-press, for each film that is still as you saved it.'),
    'On the camera: Picture Mode › RGB: INFO picks R / G / B, the front dial the point (1–5), the rear dial its level.']);
  return h('div', { class: 'group cam' },
    h('div', { class: 'cam-head' }, h('span', { class: 'lbl' }, pmIcon('rgb'), 'RGB curves', hp.q),
      hasCurves(l) ? h('button', { class: 'link', onclick: () => { delete l.rgb; renderEditor(); changed(); } }, 'Reset') : null),
    hp.box,
    chips,
    h('div', { class: 'cam-screen-wrap' }, top, svg), rowsBox);
}

/** Colour mix (the camera's Mix row; feature/rgb-curves, camera-tested test 6, 2026-11-15): for red, green and blue a
 *  strength (Sat) and a hue, −7..+7 each. On the camera INFO picks the colour (shared with the RGB row), the front dial
 *  the hue, the rear dial the strength; its page is a ring with the three colours as dots (angle = hue, distance =
 *  strength). Here the same ring, R / G / B and two sliders. Preview only: not in LOOKS.BIN yet. */
const MIX_TOWARD: Record<Channel, string> = { r: '黄色', g: '青色', b: '紫色' };
function mixPanel(l: Look, changed: () => void): HTMLElement {
  const ch = () => S.rgb, j = (c: Channel) => CHANNELS.indexOf(c);
  const get = (c: Channel, k: 0 | 1) => l.mix?.[2 * j(c) + k] ?? 0;          // k 0 = hue, 1 = strength
  const set = (c: Channel, k: 0 | 1, v: number) => {
    v = Math.max(-MIX_MAX, Math.min(MIX_MAX, v));
    if (v === get(c, k)) return false;
    (l.mix ??= flatMix())[2 * j(c) + k] = v;
    if (!hasMix(l)) delete l.mix;
    return true;
  };
  // the camera's page (firmware mx_pre / mx_line, rgbpics.py MX_ANG): a 300 x 300 box with its centre cross, a ring r 90,
  // red at the top, green lower right, blue lower left (screen y down: -90, 30, 150 deg); each colour's dot at its start
  // + 5 deg per Hue step (+ = clockwise, toward the next colour) and radius 90 + 4 per Sat step; start marks,
  // spokes from the centre; the chosen dot r 13 in its bright colour on a white r 16, the others r 8, dim.
  const S0 = 300, C = 150, R = 90, START = [-90, 30, 150];
  const BRIGHT: Record<Channel, string> = { r: '#ff6a2a', g: '#22e83a', b: '#4d7dff' }, DIM: Record<Channel, string> = { r: '#b3470f', g: '#1f8f2a', b: '#2e4f9f' };
  const svg = svgEl('svg', { viewBox: `0 0 ${S0} ${S0}`, width: 200, height: 200, class: 'mix-ring cam-screen', role: 'img', 'aria-label': 'Colour mix, as on the camera: each colour as a dot, turned by its hue, out or in by its saturation' });
  svg.append(svgEl('rect', { x: 0.5, y: 0.5, width: S0 - 1, height: S0 - 1, fill: '#1e1e1e', stroke: '#8a8a8a', 'stroke-width': 1.5 }),
    svgEl('line', { x1: C, y1: 0, x2: C, y2: S0, stroke: '#6a6a6a', 'stroke-width': 1 }),
    svgEl('line', { x1: 0, y1: C, x2: S0, y2: C, stroke: '#6a6a6a', 'stroke-width': 1 }),
    svgEl('circle', { cx: C, cy: C, r: R, fill: 'none', stroke: '#8a8a8a', 'stroke-width': 3 }));
  const at = (deg: number, r: number) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)];
  START.forEach((a) => { const [x1, y1] = at(a, R - 9), [x2, y2] = at(a, R + 9); svg.append(svgEl('line', { x1, y1, x2, y2, stroke: '#8a8a8a', 'stroke-width': 2 })); });
  const spokes = CHANNELS.map((c) => svgEl('line', { x1: C, y1: C, stroke: BRIGHT[c], 'stroke-width': 1.5, 'stroke-opacity': 0.8 }));
  spokes.forEach((sp) => svg.append(sp));
  svg.append(svgEl('circle', { cx: C, cy: C, r: 2.5, fill: '#8a8a8a' }));
  const dots = CHANNELS.map((c) => {
    const g = svgEl('g', { class: 'mx-dot' });
    const ring = svgEl('circle', { r: 16, fill: '#fff' }), pip = svgEl('circle', { r: 8, fill: DIM[c] });
    g.append(svgEl('circle', { r: 20, fill: 'transparent' }), ring, pip);
    g.addEventListener('click', () => { S.rgb = c; buildRows(); draw(); });
    return { g, ring, pip };
  });
  const top = h('div', { class: 'tc-top mx-top' });   // the letter centred over the ring, as the camera's header (test 11)
  const chips = h('div', { class: 'seg rgb-ch', role: 'radiogroup', 'aria-label': 'Mix colour' });
  const rowsBox = h('div', {});
  const syncs: (() => void)[] = [];
  function draw() {
    CHANNELS.forEach((c, i) => {
      const [x, y] = at(START[i] + 5 * get(c, 0), R + 4 * get(c, 1)), sel = c === ch();
      spokes[i].setAttribute('x2', x.toFixed(1)); spokes[i].setAttribute('y2', y.toFixed(1));
      spokes[i].setAttribute('stroke', sel ? BRIGHT[c] : DIM[c]);
      dots[i].g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      dots[i].ring.setAttribute('visibility', sel ? 'visible' : 'hidden');
      dots[i].pip.setAttribute('r', sel ? '13' : '8'); dots[i].pip.setAttribute('fill', sel ? BRIGHT[c] : DIM[c]);
    });
    svg.append(...dots.filter((_, i) => CHANNELS[i] !== ch()).map((d) => d.g), dots[j(ch())].g);
    const val = (v: number) => (v ? signed(v) : '±0');
    top.replaceChildren(h('span', { class: get(ch(), 1) ? 'on' : '' }, '饱和度 ', val(get(ch(), 1))),
      h('span', { class: 'on rgb-letter', style: `color:${BRIGHT[ch()]}`, title: RGB_NAME[ch()] }, ch().toUpperCase()),   // the camera's header: R / G / B (try/v0.30 7a92cd3)
      h('span', { class: get(ch(), 0) ? 'on' : '' }, '色相 ', val(get(ch(), 0))));
    const changedC = (c: Channel) => !!(get(c, 0) || get(c, 1));
    chips.replaceChildren(...CHANNELS.map((c) => h('button', {
      role: 'radio', 'aria-checked': String(c === ch()), class: `rc-chip rc-${c}${c === ch() ? ' on' : ''}`, title: `${RGB_NAME[c]}${changedC(c) ? '（已修改）' : ''}`,
      onclick: () => { S.rgb = c; buildRows(); draw(); },
    }, c.toUpperCase(), changedC(c) ? '*' : '')));
    syncs.forEach((f) => f());
  }
  function buildRows() {
    syncs.length = 0;
    const row = (k: 0 | 1, name: string, tip: string) => {
      const { inp, out: o } = slider(-MIX_MAX, MIX_MAX, get(ch(), k), (v) => { if (set(ch(), k, v)) { draw(); changed(); } }, undefined, `${RGB_NAME[ch()]} ${name}`);
      syncs.push(() => { inp.value = String(get(ch(), k)); o.textContent = signed(get(ch(), k)); });
      return h('div', { class: 'crow', title: tip }, h('span', { class: 'cname' }, name), steps(inp), o);
    };
    rowsBox.replaceChildren(
      row(1, '饱和度', `后拨轮调节饱和度，正值增强颜色，负值减弱`),
      row(0, '色相', `前拨轮调节色相：正值使 ${RGB_NAME[ch()].toLowerCase()}偏向 ${MIX_TOWARD[ch()]}，负值反向`));
  }
  buildRows(); draw();
  const hp = helpParts('Color Mix', [
    'Mixes the camera\'s red, green and blue into each other, before the curves and the colour wheel, so whole families of colours move together. Sat makes a colour stronger or weaker (its dot moves out or in); Hue turns it: red toward yellow, green toward cyan, blue toward purple (clockwise on the ring). Greys stay grey.',
    'How to use: pick R, G or B, then drag its dot on the ring, or use the Sat and Hue sliders (−7 to +7). Reset clears the mix.',
    fwLine('Firmware v0.30', 'saved with your looks as OM3MOD/CURVES.BIN (Export › Save to the SD card); the camera takes it at the next half-press, for each film that is still as you saved it.'),
    'On the camera: Picture Mode › Mix: INFO picks R / G / B, the front dial Hue, the rear dial Sat.']);
  return h('div', { class: 'group cam' },
    h('div', { class: 'cam-head' }, h('span', { class: 'lbl' }, pmIcon('mix'), 'Color Mix', hp.q),
      hasMix(l) ? h('button', { class: 'link', onclick: () => { delete l.mix; renderEditor(); changed(); } }, 'Reset') : null),
    hp.box,
    chips,
    h('div', { class: 'cam-screen-wrap' }, top, svg), rowsBox);
}

/** Blacks / Whites (v0.28, as the camera's grid row): Blacks across (− left, + right), Whites up (+) and down (−),
 *  −7..+7 each. Black boxes and edges for Blacks, white ones for Whites, as on the camera. */
function bwPanel(l: Look, changed: () => void): HTMLElement {
  const N = OM3.bw, CELL = 12, PAD = 34, BOX = CELL * (2 * N + 1), SZ = PAD * 2 + BOX;
  const svg = svgEl('svg', { viewBox: `0 0 ${SZ} ${SZ}`, class: 'wb-grid bw-grid cam-screen', role: 'slider', tabindex: 0, 'aria-label': 'Blacks and Whites: left and right for Blacks, up and down for Whites' });
  const X = (b: number) => PAD + (b + N + 0.5) * CELL, Y = (w: number) => PAD + (N - w + 0.5) * CELL;
  svg.append(svgEl('rect', { x: 0, y: 0, width: SZ, height: SZ, rx: 14, class: 'cs-bg' }),
    svgEl('rect', { x: PAD, y: PAD, width: BOX, height: BOX, class: 'wb-box' }));
  for (let i = -N; i <= N; i++) if (i) {
    svg.append(svgEl('line', { x1: X(i), y1: Y(0) - 2, x2: X(i), y2: Y(0) + 2, class: 'wb-tick' }), svgEl('line', { x1: X(0) - 2, y1: Y(i), x2: X(0) + 2, y2: Y(i), class: 'wb-tick' }));
  }
  if (!om3Fw28()) {                              // older firmware: ±5 only; the outer rings greyed
    const a = PAD + CELL * 2, b = CELL * (2 * 5 + 1);
    svg.append(svgEl('rect', { x: a, y: a, width: b, height: b, class: 'bw-limit' }));
  }
  const edge = (x1: number, y1: number, x2: number, y2: number, c: string) => svgEl('line', { x1, y1, x2, y2, class: `wb-edge ${c}` });
  svg.append(edge(PAD, PAD, PAD + BOX, PAD, 'wh'), edge(PAD, PAD + BOX, PAD + BOX, PAD + BOX, 'wh'), edge(PAD, PAD, PAD, PAD + BOX, 'bk'), edge(PAD + BOX, PAD, PAD + BOX, PAD + BOX, 'bk'));
  const tag = (t: string, x: number, y: number, c: string) => {
    const g = svgEl('g');
    g.append(svgEl('rect', { x: x - 10, y: y - 10, width: 20, height: 20, rx: 2, class: `bw-tag ${c}` }));
    const e = svgEl('text', { x, y, class: `bw-lab ${c}`, 'text-anchor': 'middle', 'dominant-baseline': 'central' }); e.textContent = t; g.append(e);
    return g;
  };
  svg.append(tag('+', SZ / 2, PAD / 2 - 1, 'wh'), tag('−', SZ / 2, SZ - PAD / 2 + 1, 'wh'), tag('−', PAD / 2 - 1, SZ / 2, 'bk'), tag('+', SZ - PAD / 2 + 1, SZ / 2, 'bk'));
  const dot = svgEl('g', { class: 'wb-dot' });
  dot.append(svgEl('path', { d: 'M-8,0H-3M3,0H8M0,-8V-3M0,3V8', class: 'wb-cross' }), svgEl('circle', { r: 3 }));
  svg.append(dot);
  const read = h('output', { class: 'wb-read' });
  const get = () => [l.tone.blacks, l.tone.whites];
  function set(b: number, w: number) {
    l.tone.blacks = Math.max(-N, Math.min(N, b)); l.tone.whites = Math.max(-N, Math.min(N, w));
    draw(); toneRedraw?.(); changed();
  }
  const sg = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');
  function draw() {
    const [b, w] = get();
    dot.setAttribute('transform', `translate(${X(b)},${Y(w)})`);
    read.textContent = `${sg(b)}/${sg(w)}`;           // as the camera's cell: Blacks / Whites, "+3/−2"
    svg.setAttribute('aria-valuetext', `Blacks ${sg(b)}, Whites ${sg(w)}`);
  }
  const cellAt = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * SZ, y = ((e.clientY - r.top) / r.height) * SZ;
    return [Math.round((x - PAD) / CELL - 0.5) - N, N - Math.round((y - PAD) / CELL - 0.5)];
  };
  let dragId: number | null = null;
  svg.addEventListener('pointerdown', (e) => { if (e.button) return; dragId = e.pointerId; svg.setPointerCapture(e.pointerId); const [b, w] = cellAt(e); set(b, w); svg.focus({ preventScroll: true, focusVisible: false } as FocusOptions); e.preventDefault(); });
  svg.addEventListener('pointermove', (e) => { if (dragId !== e.pointerId) return; const [b, w] = cellAt(e), [b0, w0] = get(); if (b !== b0 || w !== w0) set(b, w); });
  const bwEnd = (e: PointerEvent) => { if (dragId === e.pointerId) { dragId = null; checkpoint(); } };
  svg.addEventListener('pointerup', bwEnd); svg.addEventListener('pointercancel', bwEnd);
  svg.addEventListener('keydown', (e) => {
    const [b, w] = get(), k = (e as KeyboardEvent).key;
    const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] } as Record<string, number[]>)[k];
    if (d) { set(b + d[0], w + d[1]); checkpoint(); e.preventDefault(); }
    else if (k === '0' || k === 'Delete' || k === 'Backspace') { set(0, 0); checkpoint(); e.preventDefault(); }
  });
  draw();
  const big = Math.abs(l.tone.blacks) > 5 || Math.abs(l.tone.whites) > 5;
  const hp = helpParts('Blacks / Whites', [
    'The two ends of the tone curve. Blacks (left and right): + lifts the darkest tones for softer, faded blacks; − deepens them. Whites (up and down): + brightens the lightest tones; − tones them down for softer highlights.',
    'How to use: click or drag on the grid, or use the arrow keys; 0 or Delete sets both to 0. The read-out shows Blacks then Whites.',
    fwLine('Firmware v0.28', '−7 to +7 (±5 on older firmware).'),
    'On the camera: Picture Mode › Blacks / Whites grid.']);
  return h('div', { class: 'group cam' },
    h('div', { class: 'cam-head' }, h('span', { class: 'lbl' }, pmIcon('bw'), 'Blacks / Whites', hp.q), read,
      h('button', { class: 'link', onclick: () => { set(0, 0); checkpoint(); } }, 'Reset')),
    hp.box,
    svg,
    big ? needs28('Blacks / Whites past ±5') : null);
}

/** WB: the camera's fine-tune grid, A–B across and G–M up and down (−7..+7). Click a square, or use the arrow keys. */
function wbPanel(l: Look, changed: () => void): HTMLElement {
  // As the camera's WB fine-tune screen: a square with a coloured edge per direction (G up, M down, B left, A right),
  // the four letters in small boxes outside it, and a cross-hair marker; −7..+7 each way.
  const N = OM3.wb, CELL = 12, PAD = 34, BOX = CELL * (2 * N + 1), SZ = PAD * 2 + BOX;
  const svg = svgEl('svg', { viewBox: `0 0 ${SZ} ${SZ}`, class: 'wb-grid cam-screen', role: 'slider', tabindex: 0, 'aria-label': 'White balance shift: left and right for A–B, up and down for G–M' });
  const X = (ab: number) => PAD + (ab + N + 0.5) * CELL, Y = (gm: number) => PAD + (N - gm + 0.5) * CELL;
  svg.append(svgEl('rect', { x: 0, y: 0, width: SZ, height: SZ, rx: 14, class: 'cs-bg' }),
    svgEl('rect', { x: PAD, y: PAD, width: BOX, height: BOX, class: 'wb-box' }));
  for (let i = -N; i <= N; i++) if (i) {   // faint steps along the two centre lines
    svg.append(svgEl('line', { x1: X(i), y1: Y(0) - 2, x2: X(i), y2: Y(0) + 2, class: 'wb-tick' }), svgEl('line', { x1: X(0) - 2, y1: Y(i), x2: X(0) + 2, y2: Y(i), class: 'wb-tick' }));
  }
  const edge = (x1: number, y1: number, x2: number, y2: number, c: string) => svgEl('line', { x1, y1, x2, y2, class: `wb-edge ${c}` });
  svg.append(edge(PAD, PAD, PAD + BOX, PAD, 'g'), edge(PAD, PAD + BOX, PAD + BOX, PAD + BOX, 'm'), edge(PAD, PAD, PAD, PAD + BOX, 'b'), edge(PAD + BOX, PAD, PAD + BOX, PAD + BOX, 'a'));
  const tag = (t: string, x: number, y: number, w: number, hh: number) => {
    const g = svgEl('g');
    g.append(svgEl('rect', { x: x - w / 2, y: y - hh / 2, width: w, height: hh, rx: 2, class: 'wb-tag' }));
    const e = svgEl('text', { x, y, class: 'wb-lab', 'text-anchor': 'middle', 'dominant-baseline': 'central' }); e.textContent = t; g.append(e);
    return g;
  };
  svg.append(tag('G', SZ / 2, PAD / 2 - 1, 46, 18), tag('M', SZ / 2, SZ - PAD / 2 + 1, 46, 18), tag('B', PAD / 2 - 1, SZ / 2, 18, 46), tag('A', SZ - PAD / 2 + 1, SZ / 2, 18, 46));
  const dot = svgEl('g', { class: 'wb-dot' });
  dot.append(svgEl('path', { d: 'M-8,0H-3M3,0H8M0,-8V-3M0,3V8', class: 'wb-cross' }), svgEl('circle', { r: 3 }));
  svg.append(dot);
  const read = h('output', { class: 'wb-read' });
  const get = () => [l.wb?.a_b ?? 0, l.wb?.g_m ?? 0];
  function set(ab: number, gm: number) {
    ab = Math.max(-N, Math.min(N, ab)); gm = Math.max(-N, Math.min(N, gm));
    l.wb = ab || gm ? { a_b: ab, g_m: gm } : null; draw(); changed();
  }
  function draw() {
    const [ab, gm] = get();
    dot.setAttribute('transform', `translate(${X(ab)},${Y(gm)})`);
    read.textContent = `${ab ? `${ab < 0 ? 'B' : 'A'}${Math.abs(ab)}` : '0'}.${gm ? `${gm < 0 ? 'M' : 'G'}${Math.abs(gm)}` : '0'}`;   // as the camera writes it: A2.G1, B1.0, 0.M3
    svg.setAttribute('aria-valuetext', read.textContent);
  }
  // press anywhere on the grid and drag: the dot follows (like the camera's WB screen, by mouse)
  const cellAt = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * SZ, y = ((e.clientY - r.top) / r.height) * SZ;
    return [Math.round((x - PAD) / CELL - 0.5) - N, N - Math.round((y - PAD) / CELL - 0.5)];
  };
  let dragId: number | null = null;
  svg.addEventListener('pointerdown', (e) => { if (e.button) return; dragId = e.pointerId; svg.setPointerCapture(e.pointerId); const [ab, gm] = cellAt(e); set(ab, gm); svg.focus({ preventScroll: true, focusVisible: false } as FocusOptions); e.preventDefault(); });
  svg.addEventListener('pointermove', (e) => { if (dragId !== e.pointerId) return; const [ab, gm] = cellAt(e), [a0, g0] = get(); if (ab !== a0 || gm !== g0) set(ab, gm); });
  const wbEnd = (e: PointerEvent) => { if (dragId === e.pointerId) { dragId = null; checkpoint(); } };
  svg.addEventListener('pointerup', wbEnd); svg.addEventListener('pointercancel', wbEnd);
  svg.addEventListener('keydown', (e) => {
    const [ab, gm] = get(), k = (e as KeyboardEvent).key;
    const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] } as Record<string, number[]>)[k];
    if (d) { set(ab + d[0], gm + d[1]); checkpoint(); e.preventDefault(); }
    else if (k === '0' || k === 'Delete' || k === 'Backspace') { set(0, 0); checkpoint(); e.preventDefault(); }
  });
  draw();
  const hp = helpParts('WB Compensation', [
    'Shifts the colour of the whole photo: A (amber, warmer) or B (blue, cooler) across, G (green) or M (magenta) up and down. From v0.40.1 picking the film sets it as the camera\'s own WB compensation (for the film\'s WB mode), so the super control panel shows it; before, it was added on top of the camera\'s own.',
    'How to use: click or drag on the grid, or use the arrow keys; 0 or Delete centres it. The read-out shows the shift as the camera writes it (for example A2.G1).',
    fwLine('Firmware v0.26.1', 'past ±5 (up to ±7).'),
    'On the camera: Picture Mode › WB grid.']);
  return h('div', { class: 'group cam' },
    h('div', { class: 'cam-head' }, h('span', { class: 'lbl' }, 'WB Compensation', hp.q), read,
      h('button', { class: 'link', onclick: () => { set(0, 0); checkpoint(); } }, 'Reset')),
    hp.box,
    wbModeRow(l, changed),
    svg);
}

/** v0.28 film WB: the WB mode (and 自定义色温) the camera switches to when this film is picked; the camera then
 *  remembers changes made on it per film. Auto = none of its own. Previewed as if the photo was taken in daylight. */
const WB_MODE_NAMES: [FilmWb['mode'] | 'auto', string][] = [['auto', '自动'], ['sunny', '晴天（5300 K）'], ['shade', '背阴处（7500 K）'],
  ['cloudy', '多云（6000 K）'], ['incandescent', '白炽灯（3000 K）'], ['fluorescent', '荧光灯（4000 K）'], ['underwater', '水下'],
  ['flash', '闪光灯（5500 K）'], ['custom', '自定义色温']];
/** The camera's One-touch WB 1-4 (a measurement stored in the camera): not offered here (owner, 2026-11-12), shown only
 *  for a film that already has one (from a photo's code), so it is not lost. */
const WB_ONE_TOUCH: [FilmWb['mode'], string][] = [['one_touch_1', 'One-touch 1'], ['one_touch_2', 'One-touch 2'], ['one_touch_3', 'One-touch 3'], ['one_touch_4', 'One-touch 4']];
function wbModeRow(l: Look, changed: () => void): HTMLElement {
  const mode = l.film_wb?.mode ?? 'auto';
  const sel = h('select', { 'aria-label': '此款胶片的白平衡模式', onchange: (e: Event) => {
    const m = (e.target as HTMLSelectElement).value as FilmWb['mode'] | 'auto';
    if (m === 'auto') delete l.film_wb; else l.film_wb = m === 'custom' ? { mode: m, kelvin: l.film_wb?.kelvin ?? KELVIN.dflt } : { mode: m };
    renderEditor(); changed(); checkpoint();
  } }, ...[...WB_MODE_NAMES, ...WB_ONE_TOUCH.filter(([v]) => v === mode)].map(([v, t]) => h('option', { value: v, selected: v === mode }, t)));
  const kOut = h('output', {}, `${l.film_wb?.kelvin ?? KELVIN.dflt} K`);
  const kIn = l.film_wb?.mode === 'custom' ? h('input', {
    type: 'range', min: KELVIN.lo, max: KELVIN.hi, step: KELVIN.step, value: l.film_wb.kelvin ?? KELVIN.dflt, 'aria-label': '自定义色温',
    oninput: (e: Event) => { const k = Number((e.target as HTMLInputElement).value); kOut.textContent = `${k} K`; draft(() => { l.film_wb = { mode: 'custom', kelvin: k }; changed(); }); },
    onchange: checkpoint,
  }) : null;
  const odd = mode === 'underwater' || mode.startsWith('one_touch');
  return h('div', { class: 'wb-mode' },
    withHelp(h('div', { class: 'crow' }, h('span', { class: 'cname' }, '白平衡模式'), sel), '白平衡模式', [
      'The white balance the camera switches to when you pick this film, for example Sunny for a daylight film or 3200 K for a tungsten film. Auto: the film has none of its own and the camera keeps the WB you set.',
      'How to use: pick a mode; Custom WB adds a Kelvin slider. Changes you make on the camera afterwards are remembered for the film.',
      'In the preview: shown as if the photo was taken in daylight (5300 K); Underwater and the one-touch modes are not shown.',
      fwLine('Firmware v0.28', 'needed for a WB mode.')]),
    kIn ? h('div', { class: 'crow' }, h('span', { class: 'cname' }, '色温（K）'), kIn, kOut) : null,
    mode !== 'auto' ? needs28('the WB mode') : null,
    mode !== 'auto' && odd ? h('p', { class: 'help' }, '预览不模拟水下光照或自行测量的白平衡。') : null);
}

/** The firmware chosen under Export › Firmware on the camera (v0.28 or later by default, from the v0.28 release). Settings a firmware can't
 *  take are left out of the preview as they are left out of its LOOKS.BIN: split toning before v0.26; Halation, Tone
 *  Balance, the film's WB mode and Blacks / Whites past ±5 before v0.28 (split toning then in whole v0.26 steps). */
const FW_VALUES = ['20', '21', '22', '23', '24', '25', '26', '28'];
const fwSetting = (): Fw => { try { const s = localStorage.getItem('caduceus.om3.fw'); if (s !== null && FW_VALUES.includes(s)) return Number(s) as Fw; } catch { /* storage blocked */ } return 28; };
const om3Fw25 = () => fwSetting() >= 25;
const om3Fw28 = () => fwSetting() >= 28;
function splitPv(l: Look): Look {
  const fw = fwSetting();
  if (fw >= 28) return l;
  const c = (v: number) => Math.max(-5, Math.min(5, v));
  const r: Look = { ...l, tone: { ...l.tone, blacks: c(l.tone.blacks), whites: c(l.tone.whites) } };
  delete r.halation; delete r.tone_balance; delete r.film_wb; delete r.rgb; delete r.mix; delete r.border;
  if (r.split) r.split = fw >= 25 ? { ...r.split, sh: Math.round(r.split.sh), hl: Math.round(r.split.hl) } : undefined;
  if (!r.split) delete r.split;
  return r;
}
/** A note under a v0.28 setting while the export is for an older firmware. */
const needs28 = (what: string) => (om3Fw28() ? null : h('p', { class: 'warn' }, h('b', {}, 'Needs firmware v0.28: '),
  `the export is set to an older firmware, so ${what} is not previewed or saved. Choose "v0.28 or later" under Export › Firmware on the camera.`));

function refreshProblems() {
  const el = document.getElementById('problems');
  const probs = validateBank(O.bank), at = O.k * PER + O.v;
  if (el) { const mine = probs.filter((p) => p.look === at); el.replaceChildren(...(mine.length ? [h('ul', { class: 'problems' }, ...mine.map((p) => h('li', {}, p.message)))] : [])); }
  const bad = new Set(probs.map((p) => p.look));
  document.querySelectorAll('#list li.look').forEach((li) => li.classList.toggle('bad', bad.has(Number((li as HTMLElement).dataset.at))));
}

// ---------------------------------------------------------------- preview
let srcData: ImageData | null = null;
let userPhoto: ImageData | null = null;
let canvas: HTMLCanvasElement;
let beforeCv: HTMLCanvasElement;
let beforeOf: ImageData | null = null;
let previewQueued = false;

function buildPreview() {
  canvas = h('canvas', { class: 'pv', 'aria-label': '当前胶片的模拟预览' });
  const thumbs = h('div', { class: 'thumbs' },
    ...samples().map((s) => h('button', { class: `thumb${S.image === s.id ? ' on' : ''}`, 'data-id': s.id, onclick: () => pickImage(s.id), title: s.label },
      h('img', { src: `./samples/${s.id}.jpg?v=${SAMPLE_REV}`, alt: s.label, loading: 'lazy' }))),
    h('button', { class: `thumb own${S.image === 'user' ? ' on' : ''}`, 'data-id': 'user', onclick: () => (userPhoto ? pickImage('user') : $<HTMLInputElement>('#photo').click()), title: '自选照片（仅在本机处理）' },
      h('span', {}, '＋ 自选照片')));
  // before / after: the untouched photo on its own canvas, clipped at a line you drag on the photo (or arrow keys)
  beforeCv = h('canvas', { class: 'before', 'aria-hidden': 'true' }); beforeOf = null;
  const divider = h('div', { class: 'divider', role: 'slider', tabindex: '0', 'aria-label': '原图与调色预览分界线', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    h('span', { class: 'knob', 'aria-hidden': 'true' }, '‹ ›'));
  const frame = h('div', { class: 'pv-frame' }, canvas, beforeCv, divider);
  const setCut = (v: number) => {
    S.cut = Math.max(0, Math.min(100, v)); frame.style.setProperty('--cut', `${S.cut}%`);
    divider.setAttribute('aria-valuenow', String(Math.round(S.cut))); divider.setAttribute('aria-valuetext', `${Math.round(S.cut)}% before`);
  };
  let dragging = false;
  const at = (e: PointerEvent) => { const r = frame.getBoundingClientRect(); setCut(((e.clientX - r.left) / r.width) * 100); };
  frame.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; dragging = true; frame.setPointerCapture(e.pointerId); at(e); e.preventDefault(); });
  frame.addEventListener('pointermove', (e) => { if (dragging) at(e); });
  frame.addEventListener('pointerup', () => { dragging = false; }); frame.addEventListener('pointercancel', () => { dragging = false; });
  divider.addEventListener('keydown', (e) => {
    const step = ({ ArrowLeft: -2, ArrowRight: 2, PageDown: -10, PageUp: 10 } as Record<string, number>)[e.key];
    if (step) { setCut(S.cut + step); e.preventDefault(); }
    else if (e.key === 'Home') { setCut(0); e.preventDefault(); } else if (e.key === 'End') { setCut(100); e.preventDefault(); }
  });
  setCut(S.cut);
  const aspectHelp = helpParts('画幅比例', [
    '可预览 4:3 原画幅以及 3:2、16:9、1:1、3:4、5:4、XPan 和 21:9 裁幅。',
    '画幅由机身单独设置。预览先对全图调色，再裁切，边框位于裁切范围内。',
    '在机身的超级控制面板或图像比例菜单选择。']);
  $('#preview').replaceChildren(
    h('div', { class: 'pv-wrap' }, frame, h('span', { class: 'badge' }, '原图'), h('span', { class: 'badge r' }, '调色预览')),
    thumbs,
    h('div', { class: 'pv-opts' },
      h('label', { class: 'aspect' },
        '画幅比例 ',
        h('select', { onchange: (e: Event) => { S.aspect = (e.target as HTMLSelectElement).value; try { localStorage.setItem('caduceus.om3.aspect', S.aspect); } catch { /* storage blocked */ } schedulePreview(); } },
          ...ASPECTS.map((a) => h('option', { value: a.id, selected: a.id === S.aspect }, a.label))), aspectHelp.q),
      h('span', { class: 'help' }, 'Includes Contrast, Sharp, Shading, Film Grain, Border, Glow, Halation and the lens corners.'),
      h('button', { class: 'link', onclick: () => $<HTMLInputElement>('#photo').click() }, '选择自己的照片…')),
    aspectHelp.box,
    h('p', { class: 'help' }, 'Drag the line on the photo to compare before and after. Shading, grain, border, glow and the lens corners follow the camera\'s own maths, checked against photos from an OM-3; colours are close but not exact (strong blues and purples differ most), so check a new look on the camera. Your own photo never leaves this browser.'));
  pickImage(S.image);
}

async function pickImage(id: string) {
  S.image = id;
  document.querySelectorAll('.thumb').forEach((t) => t.classList.toggle('on', (t as HTMLElement).dataset.id === id));
  if (id === 'user') { srcData = userPhoto; schedulePreview(); return; }
  try {
    const img = new Image();
    img.src = `./samples/${id}.jpg?v=${SAMPLE_REV}`;
    await img.decode();
    srcData = toImageData(img, img.naturalWidth, img.naturalHeight);
    if (S.image === id) schedulePreview();
  } catch { toast('无法加载样片', 'err'); }
}

/** The preview's working size (long side, px): enough for the preview at this screen's pixel density (sharp on
 *  Retina), between 1024 and 2048 so the colour engine stays quick. */
function previewPx(): number {
  const pane = document.getElementById('preview');
  const css = Math.max(pane ? pane.clientWidth - 28 : 0, window.innerHeight * 0.7);
  return Math.max(1024, Math.min(2048, Math.ceil(css * (window.devicePixelRatio || 1))));
}

function toImageData(img: CanvasImageSource, w: number, h0: number, max = previewPx()): ImageData {
  const k = Math.min(1, max / Math.max(w, h0));
  const W = Math.round(w * k), H = Math.round(h0 * k);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, W, H);
  return ctx.getImageData(0, 0, W, H);
}

async function onPhoto(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!f) return;
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    userPhoto = toImageData(bmp, bmp.width, bmp.height);
    bmp.close();
    pickImage('user');
  } catch { toast('无法读取此图片', 'err'); }
}

/** The photo frame: the photo's shape, as wide as the pane allows but no taller than 70% of the window. */
function sizeFrame(w: number, h: number) {
  const frame = canvas.parentElement as HTMLElement | null;
  if (!frame) return;
  frame.style.aspectRatio = `${w} / ${h}`;
  frame.style.width = `min(100%, ${(70 * w / h).toFixed(2)}vh)`;
}

function schedulePreview() {
  if (previewQueued) return;
  previewQueued = true;
  requestAnimationFrame(() => {
    previewQueued = false;
    if (!srcData || !canvas) return;
    const cr = cropRect(srcData.width, srcData.height, S.aspect);   // Image Aspect: the part the camera keeps
    if (canvas.width !== cr.w || canvas.height !== cr.h) { canvas.width = cr.w; canvas.height = cr.h; }
    sizeFrame(cr.w, cr.h);
    const key = `${S.aspect}`;
    if (beforeOf !== srcData || beforeCv.dataset.aspect !== key) {   // the untouched photo, drawn once per photo and crop
      beforeCv.width = cr.w; beforeCv.height = cr.h; beforeCv.getContext('2d')!.putImageData(srcData, -cr.x, -cr.y, cr.x, cr.y, cr.w, cr.h);
      beforeOf = srcData; beforeCv.dataset.aspect = key;
    }
    const ctx = canvas.getContext('2d')!;
    const l = cur();
    if (!l) { ctx.putImageData(srcData, -cr.x, -cr.y, cr.x, cr.y, cr.w, cr.h); return; }
    const out = ctx.createImageData(srcData.width, srcData.height);
    renderLook(srcData, out, splitPv(l), { advice: true, camera: CAM, crop: cr });
    ctx.putImageData(out, -cr.x, -cr.y, cr.x, cr.y, cr.w, cr.h);
    afterPreview?.();
  });
}
/** The open editor's notes that depend on the preview (Halation: shown or not on this photo). */
let afterPreview: (() => void) | null = null;

// ---------------------------------------------------------------- import / export / share
function openFile() { $<HTMLInputElement>('#file').click(); }
function pasteDialog() {
  const ta = h('textarea', { rows: 3, placeholder: 'Paste a shared look or looks link (…#op1_… or …#ob1_…), or a photo\'s om3.1. code', spellcheck: 'false' });
  const msg = h('p', { class: 'help' });
  const go = h('button', { class: 'primary' }, '打开');
  const dlg = modal('粘贴链接', h('div', {}, ta, msg), [go]);
  go.addEventListener('click', async () => {
    const r = await om3ImportCode(ta.value, false);
    if (r) dlg.close(); else msg.className = 'help err';
  });
  ta.addEventListener('input', () => { msg.textContent = ''; });
  importCodeMsg = (m) => (msg.textContent = m);
  ta.focus();
}
let importCodeMsg: (m: string) => void = (m) => toast(m, 'err');

const rrName = (n: string) => n.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'look';
// ---------------------------------------------------------------- OM-3 (Caduceus for OM-3)
// The OM-3 has no look list: each of COLOR 1-4 holds five numbered looks (the camera's Film page, dial 1-5).
const OB_PREFIX = 'ob1_', OP_PREFIX = 'op1_';
const OM3_GH = 'https://github.com/androidfanman/caduceus-om3';
const at = (k: number, v: number) => `FILM ${k * PER + v + 1}`;   // owner 2026-11-08: one list, FILM 1-20 (COLOR k = (n - 1) / 5 on the card)

function newBank(kind: 'library' | 'empty') {
  if (!confirm(kind === 'library' ? '恢复默认的 20 款胶片及其顺序？当前胶片将被替换，可撤销。'
    : '清空所有 20 个位置？清空后可撤销。')) return;
  O.bank = kind === 'library' ? defaultBank(LIBRARY, fromLibrary) : emptyBank();
  O.k = 0; O.v = 0;
  save(); renderAll();
  toast(kind === 'library' ? 'Reset to the 20 films (FILM 1–20)' : 'All films emptied');
}

let bankDrag: [number, number] | null = null;
function swapSlots(a: [number, number], b: [number, number]) {
  if (a[0] === b[0] && a[1] === b[1]) return;
  const t = O.bank[a[0]][a[1]];
  O.bank[a[0]][a[1]] = O.bank[b[0]][b[1]];
  O.bank[b[0]][b[1]] = t;
  [O.k, O.v] = b;
  save(); renderAll(); focusSel();
}
function clearSlot(k: number, v: number) {
  const l = O.bank[k][v];
  if (!l) return;
  O.bank[k][v] = null;
  O.k = k; O.v = v;
  save(); renderAll();
  toast(`Removed "${l.name}" from ${at(k, v)} (Undo brings it back)`);
}
/** The saved-lists bar above the looks: pick a list to load it, save the current looks as a new list, rename or
 *  delete. */
function listsBar(): HTMLElement {
  const names = listNames();
  const sel = h('select', { 'aria-label': 'Saved list', onchange: (e: Event) => switchList((e.target as HTMLSelectElement).value) },
    ...names.map((n) => h('option', { value: n, selected: n === LISTS.current }, n)));
  return h('div', { class: 'lists-bar' },
    h('label', { class: 'field' }, h('span', { class: 'lbl' }, '胶片组'), sel),
    h('div', { class: 'lists-btns' },
      h('button', { onclick: () => nameDialog('另存为新胶片组', '', '保存', (n) => {
        flush(); LISTS.lists[n] = JSON.parse(JSON.stringify(O.bank)) as Bank; switchList(n, `Saved as "${n}". You're now on "${n}"; changes save into it.`);
      }), title: '将这 20 款胶片另存为一个新组' }, '另存为…'),
      h('button', { onclick: () => nameDialog(`重命名「${LISTS.current}」`, LISTS.current, '重命名', (n) => {
        const b = LISTS.lists[LISTS.current]; delete LISTS.lists[LISTS.current];
        LISTS.lists[n] = b; LISTS.current = n; O.name = n; flush(); renderList(); toast(`Renamed to "${n}"`);
      }) }, '重命名'),
      h('button', { class: 'danger', disabled: names.length < 2, title: names.length < 2 ? '至少需要保留一个胶片组' : undefined, onclick: () => {
        if (!confirm(`删除胶片组「${LISTS.current}」？这会移除浏览器中该组的配方，此操作无法撤销。`)) return;
        const gone = LISTS.current; delete LISTS.lists[gone];
        LISTS.current = listNames()[0]; O.bank = LISTS.lists[LISTS.current]; O.name = LISTS.current; O.k = 0; O.v = 0;
        hist = new History(snapshot(), 200); undoUi(); flush(); renderAll(); toast(`Deleted "${gone}"; now on "${LISTS.current}"`);
      } }, '删除')));
}
function switchList(n: string, msg?: string) {
  if (!LISTS.lists[n]) return;
  flush();
  LISTS.current = n; O.bank = LISTS.lists[n]; O.name = n; O.k = 0; O.v = 0;
  hist = new History(snapshot(), 200); undoUi();
  flush(); renderAll(); toast(msg ?? `Loaded "${n}"`);
}
function nameDialog(title: string, value: string, ok: string, done: (name: string) => void) {
  const help = h('p', { class: 'help' }, `最多 ${LIST_NAME_MAX} 个字符。`);
  const input = h('input', { type: 'text', value, maxlength: LIST_NAME_MAX, 'aria-label': 'List name', autocomplete: 'off' });
  const problem = (n: string) => (!n ? '请输入名称。' : n !== value && LISTS.lists[n] ? `已有名为「${n}」的胶片组。` : null);
  const submit = () => {
    const n = input.value.trim(), p = problem(n);
    if (p) { help.textContent = p; help.className = 'help err'; input.focus(); return; }
    dlg.close(); if (n !== value || !value) done(n);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  const dlg = modal(title, h('div', { class: 'name-dlg' }, input, help),
    [h('button', { onclick: () => dlg.close() }, '取消'), h('button', { class: 'primary', onclick: submit }, ok)]);
  input.focus(); input.select();
}

function newFilm() {
  const create = (k: number, v: number) => {
    O.k = k;
    O.v = v;
    O.bank[k][v] = blankProfile(`Look ${k * PER + v + 1}`);
    save();
    renderAll();
    const name = $<HTMLInputElement>('#editor .ed-head input');
    name.focus();
    name.select();
  };
  const empty = freeFilm();
  if (empty) return create(empty.k, empty.v);

  const slots = h('select', { 'aria-label': '要替换的胶片' },
    ...O.bank.flat().map((look, i) => h('option', { value: i, selected: i === O.k * PER + O.v },
      `FILM ${i + 1} · ${look!.name}`)));
  const dlg = modal('新建胶片', h('div', {},
    h('p', {}, '20 个位置已满。选择要替换的胶片，新配方将从中性参数开始。替换后可以撤销。'),
    slots), [
    h('button', { onclick: () => dlg.close() }, '取消'),
    h('button', { class: 'primary', onclick: () => {
      const i = Number(slots.value);
      dlg.close();
      create(Math.floor(i / PER), i % PER);
    } }, '替换并新建'),
  ]);
}

function renderBank() {
  const el = $('#list');
  const bad = new Set(validateBank(O.bank).map((p) => p.look));
  const used = O.bank.flat().filter(Boolean).length;
  // owner 2026-11-08: one list FILM 1-20, as on the camera (FILM n = COLOR (n - 1) / 5 + 1, look (n - 1) % 5 + 1 in LOOKS.BIN)
  const N = COLORS * PER, slot = (n: number): [number, number] => [Math.floor(n / PER), n % PER];
  const films = h('ol', { class: 'looks bank' }, ...O.bank.flatMap((row, k) => row.map((l, v) => {
      const n = k * PER + v;
      const sel = k === O.k && v === O.v;
      const li = h('li', {
        class: `look${sel ? ' sel' : ''}${l ? '' : ' empty-slot'}${bad.has(k * PER + v) ? ' bad' : ''}`, 'data-at': k * PER + v,
        draggable: l ? 'true' : 'false', tabindex: 0,
        onclick: () => { O.k = k; O.v = v; renderAll(); },
        onkeydown: (e: KeyboardEvent) => {
          const go = (m: number) => { if (m >= 0 && m < COLORS * PER) { O.k = Math.floor(m / PER); O.v = m % PER; renderAll(); focusSel(); } };
          if (e.key === 'ArrowUp' && e.altKey && n > 0) { swapSlots([k, v], slot(n - 1)); e.preventDefault(); }
          else if (e.key === 'ArrowDown' && e.altKey && n < N - 1) { swapSlots([k, v], slot(n + 1)); e.preventDefault(); }
          else if (e.key === 'ArrowUp') { go(n - 1); e.preventDefault(); }
          else if (e.key === 'ArrowDown') { go(n + 1); e.preventDefault(); }
          else if ((e.key === 'Delete' || e.key === 'Backspace') && l) { clearSlot(k, v); e.preventDefault(); }
        },
        ondragstart: (e: DragEvent) => { bankDrag = [k, v]; e.dataTransfer?.setData('text/plain', `${k},${v}`); li.classList.add('dragging'); },
        ondragend: () => li.classList.remove('dragging'),
        ondragover: (e: DragEvent) => { e.preventDefault(); li.classList.add('over'); },
        ondragleave: () => li.classList.remove('over'),
        ondrop: (e: DragEvent) => { e.preventDefault(); li.classList.remove('over'); if (bankDrag) swapSlots(bankDrag, [k, v]); bankDrag = null; },
      },
      h('span', { class: 'grip', 'aria-hidden': 'true' }, l ? '⋮⋮' : ''),
      h('span', { class: 'idx' }, String(n + 1)),
      h('span', { class: 'nm' }, l ? l.name || '（未命名）' : '空位'),
      h('span'),
      h('span', { class: 'row-btns' },
        h('button', { class: 'icon', title: '上移（Alt+↑）', 'aria-label': '上移', disabled: n === 0, onclick: (e: Event) => { e.stopPropagation(); swapSlots([k, v], slot(n - 1)); } }, '↑'),
        h('button', { class: 'icon', title: '下移（Alt+↓）', 'aria-label': '下移', disabled: n === N - 1, onclick: (e: Event) => { e.stopPropagation(); swapSlots([k, v], slot(n + 1)); } }, '↓'),
        h('button', { class: 'icon danger', title: '移除胶片，保留空位', 'aria-label': '移除', disabled: !l, onclick: (e: Event) => { e.stopPropagation(); clearSlot(k, v); } }, '×')));
      return li;
    })));
  el.replaceChildren(
    listsBar(),
    h('div', { class: 'list-head' }, h('span', {}, '胶片列表'),
      h('button', { onclick: newFilm }, '＋ 新建胶片'), h('span', { class: 'count' }, `${used} / ${N}`)),
    films,
    h('p', { class: 'help' }, '机身在图像模式的 COLOR 1–4 后按此顺序显示 FILM 1–20。拖动胶片或点击 ↑ ↓ 调整顺序；机身会跳过空位并依次编号。'));
}

/** The editor for a number with no look: make one. */
function emptySlotPanel(): HTMLElement {
  const k = O.k, v = O.v;
  return h('div', { class: 'empty-slot-panel' },
    h('h3', {}, `${at(k, v)}: Empty`),
    h('p', { class: 'help' }, 'On the camera this number shows "Empty" and loads neutral settings. Give it a look:'),
    h('div', { class: 'pick-row' },
      h('button', { class: 'primary', onclick: newFilm }, '空白配方'),
      h('button', { onclick: () => om3FilmPicker({ k, v }) }, '从胶片模拟中选择…'),
      h('button', { onclick: om3LibraryPicker }, '从内置配方库选择…'),
      h('button', { onclick: pasteDialog }, '粘贴链接…')),
    h('p', { class: 'help' }, 'Library looks are the starter looks of Caduceus for the E-P7 by cakelesscoder, converted for the OM-3: Hue, Light and WB shifts are limited to ±5, a halation glow becomes a plain glow (the OM-3 glow has no colour), and Blur is left out. NR, Glow / Clarity and Art Effects carry over (firmware v0.20).'));
}

function om3Changes(c: { changed: string[]; dropped: string[] }): string {
  const parts = [];
  if (c.changed.length) parts.push(`limited to the OM-3 range: ${c.changed.join(', ')}`);
  if (c.dropped.length) parts.push(`left out: ${c.dropped.join(', ')}`);
  return parts.length ? ` (${parts.join('; ')})` : '';
}

function om3LibraryPicker() {
  const k = O.k, v = O.v;
  const inBank = new Set(O.bank.flat().filter(Boolean).map((l) => l!.name.toLowerCase()));
  const list = h('div', { class: 'pick-list' }, ...LIBRARY.looks.filter((l) => l.kind === 'colour').map((l) => h('button', {
    class: 'pick', onclick: () => {
      const c = toOm3(fromLibrary(l));
      if (!c.look) return;
      O.bank[k][v] = c.look; save(); renderAll(); dlg.close();
      toast(`"${c.look.name}" is now ${at(k, v)}${om3Changes(c)}`);
    },
  }, h('b', {}, l.name), inBank.has(l.name.toLowerCase()) ? h('span', { class: 'tag' }, '已在胶片组中') : null, h('small', {}, l.notes))));
  const dlg = modal(`为此位置选择配方： ${at(k, v)}`, list);
}

/** Film sims: browse the fitted films, preview one on the current photo and add it to the looks. With `into`, the
 *  film goes into that (empty) FILM; otherwise into the selected FILM when it is empty, else the first empty FILM (or, when all 20 are used, it asks to replace
 *  the selected look). Removing works as for any look (× in the list). */
function om3FilmPicker(into?: { k: number; v: number }) {
  type Pick = FilmGroup | 'all' | 'camera' | 'matched' | 'tuned';
  let group: Pick = 'all' as Pick, query = '', sel: Film | null = null;
  const pv = h('canvas', { class: 'film-pv', 'aria-label': 'Preview of the selected film sim' });
  const pvNote = h('div', { class: 'film-desc' });
  const drawPv = () => {
    if (!srcData) { pvNote.replaceChildren(h('p', { class: 'help' }, '请先选择预览照片。')); return; }
    const sc = Math.min(1, 520 / srcData.width), W = Math.round(srcData.width * sc), H = Math.round(srcData.height * sc);
    const c = document.createElement('canvas'); c.width = srcData.width; c.height = srcData.height;
    const cx = c.getContext('2d')!;
    if (sel) { const out = cx.createImageData(srcData.width, srcData.height); renderLook(srcData, out, splitPv(filmLook(sel)), { advice: true, camera: CAM }); cx.putImageData(out, 0, 0); }
    else cx.putImageData(srcData, 0, 0);
    pv.width = W; pv.height = H; pv.getContext('2d')!.drawImage(c, 0, 0, W, H);
    pvNote.replaceChildren(...(sel ? [h('b', {}, sel.film), h('p', {}, sel.desc)] : [h('p', { class: 'help' }, '点击胶片名称，在照片上预览效果。')]));
  };
  const target = (): { k: number; v: number } | null => {
    if (into && !O.bank[into.k][into.v]) return into;
    if (!O.bank[O.k][O.v]) return { k: O.k, v: O.v };
    for (let k = 0; k < COLORS; k++) { const v = O.bank[k].findIndex((l) => !l); if (v >= 0) return { k, v }; }   // the first empty FILM
    return null;
  };
  const place = (f: Film, t: { k: number; v: number }) => {
    const old = O.bank[t.k][t.v];
    O.bank[t.k][t.v] = filmLook(f); O.k = t.k; O.v = t.v; into = undefined;
    save(); renderAll(); drawRows();
    toast(old ? `${f.name} replaced "${old.name}" as ${at(t.k, t.v)}` : `${f.name} added as ${at(t.k, t.v)}`);
  };
  // All 20 numbers in use: ask first, then let the user pick which COLOR and number to replace.
  const askReplace = (f: Film) => {
    const box = h('div', { class: 'replace-box' });
    const dlg = modal(`用 ${f.name} 替换现有胶片？`, box);
    const choose = () => {
      box.replaceChildren(
        h('p', { class: 'help' }, `选择要用 ${f.name} 替换的胶片。替换后可撤销。`),
        h('div', { class: 'replace-grid' }, ...O.bank.map((row, k) => h('div', { class: 'replace-col' },
          ...row.map((l, v) => h('button', { class: 'replace-slot', title: `Replace ${at(k, v)}: ${l?.name ?? '空位'}`, onclick: () => { dlg.close(); place(f, { k, v }); } },
            h('span', { class: 'num' }, String(k * PER + v + 1)), h('span', { class: 'nm' }, l?.name ?? '空位')))))),
        h('div', { class: 'modal-actions' }, h('button', { onclick: () => dlg.close() }, '取消')));
    };
    box.replaceChildren(
      h('p', {}, `20 个位置均已占用。要用 ${f.name} 替换其中一款吗？`),
      h('div', { class: 'modal-actions' },
        h('button', { onclick: () => dlg.close() }, '取消'),
        h('button', { class: 'primary', onclick: choose }, '选择要替换的胶片…')));
  };
  const add = (f: Film) => {
    const t = target();
    if (t) place(f, t); else askReplace(f);
  };
  // where each film sim already is in the current list (COLOR k, number v), by the look's film origin
  const where = () => {
    const m = new Map<string, string[]>();
    O.bank.forEach((row, k) => row.forEach((l, v) => { const f = l && filmOf(l); if (f) m.set(f.name, [...(m.get(f.name) ?? []), at(k, v)]); }));
    return m;
  };
  const list = h('div', { class: 'film-list', role: 'list' });
  const drawRows = () => {
    const have = where(), q = query.trim().toLowerCase();
    const hit = (f: Film) => !q || `${f.name} ${f.film}`.toLowerCase().includes(q);
    // owner 2026-11-08: the camera's 20 first, in their FILM 1-20 order; under All the other films follow by type
    const cam = group === 'all' || group === 'camera' ? CAMERA_FILMS.filter(hit) : [];
    const rows = group === 'camera' ? [] : FILMS.filter((f) => (group === 'all' ? !CAMERA_FILMS.includes(f) : group === 'matched' ? !!f.matched : group === 'tuned' ? !f.matched : f.group === group) && hit(f));
    const parts: [string, Film[]][] = [...(cam.length ? [['机内胶片（按 FILM 1–20 排列）', cam] as [string, Film[]]] : []),
      ...FILM_GROUPS.filter(([g]) => rows.some((f) => f.group === g)).map(([g, label]) => [group === 'all' ? `更多 · ${label}` : label, rows.filter((f) => f.group === g)] as [string, Film[]])];
    const sections = parts.map(([label, fs]) =>
      h('div', { class: 'film-group' }, h('h3', {}, label), ...fs.map((f) =>
        h('div', { class: `film-row${sel === f ? ' on' : ''}${have.has(f.name) ? ' in-list' : ''}`, role: 'listitem' },
          h('button', { class: 'film-pick', onclick: () => { sel = f; drawPv(); drawRows(); }, 'aria-pressed': String(sel === f) },
            h('b', {}, CAMERA_FILMS.includes(f) ? `${CAMERA_FILMS.indexOf(f) + 1}. ${f.name}` : f.name),
            h('small', {}, f.film, f.matched ? h('span', { class: 'matched-tag', title: 'Colour matched: graded against film scans of a colour chart' }, '色卡匹配') : null)),
          have.has(f.name) ? h('span', { class: 'in-list-tag', title: `已在「${LISTS.current}」中： ${have.get(f.name)!.join(', ')}` }, '✓ ', have.get(f.name)!.join(', ')) : null,
          h('button', { class: 'film-add', onclick: () => add(f), title: `将 ${f.name} 加入胶片组` }, '＋ 添加')))));
    list.replaceChildren(...(sections.length ? sections : [h('p', { class: 'empty' }, '没有找到匹配的胶片。')]));
  };
  const chips = h('div', { class: 'seg film-groups', role: 'radiogroup', 'aria-label': 'Film type' },
    ...([['all', '全部'], ['camera', '机内 20 款'], ['matched', '色卡匹配'], ['tuned', '手工调色']] as [Pick, string][]).concat(FILM_GROUPS.map(([g, l]) => [g, l] as [Pick, string])).map(([g, t]) =>
      h('button', { role: 'radio', 'aria-checked': String(g === group), class: g === group ? 'on' : '', onclick: (e: Event) => {
        group = g; (e.currentTarget as HTMLElement).parentElement!.querySelectorAll('button').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
        drawRows();
      } }, t)));
  const search = h('input', { type: 'search', placeholder: '搜索胶片…', 'aria-label': '搜索胶片', oninput: (e: Event) => { query = (e.target as HTMLInputElement).value; drawRows(); } });
  const body = h('div', { class: 'film-dlg' },
    h('div', { class: 'film-side' }, pvNote, pv),
    h('div', { class: 'film-main' }, h('div', { class: 'film-filters' }, search, chips), list));
  drawRows(); drawPv();
  modal(into ? `为 ${at(into.k, into.v)} 选择胶片` : '胶片模拟', body);
}

function renderOm3Editor(l: Look) {
  // v0.21: Grain with Glow / Clarity or an Art Effect takes the camera's slow route: say so next to the Grain setting
  const grainWarn = h('p', { class: 'warn', role: 'status' });
  const showWarn = () => {
    grainWarn.replaceChildren(
      ...(slowGrain(l) ? [h('b', {}, 'Slower saving: '), 'Glow / Clarity and Frame together with grain use a slower way (about 3 seconds more per photo, no fast burst). Grain with any one of them, or with Shading, is as fast as normal. '] : []),
      ...(monoGrain(l) ? [h('b', {}, 'Firmware v0.24.1 only: '), 'Shading with grain turned the photo black and white there, so looks saved for v0.24.1 get Shading 0.'] : []));
    grainWarn.hidden = !slowGrain(l) && !monoGrain(l);
  };
  const fxChanged = () => { changed(); showWarn(); };
  showWarn();
  const el = $('#editor');
  const k = O.k, v = O.v;
  const changed = () => { save(); schedulePreview(); refreshProblems(); };
  const np = om3NameProblem(l.name);
  const nameInput = h('input', {
    type: 'text', value: l.name, maxlength: OM3_NAME_MAX, spellcheck: 'false', autocomplete: 'off', 'aria-describedby': 'name-help',
    onchange: checkpoint, onkeydown: enterCommits,
    oninput: (e: Event) => draft(() => {
      l.name = (e.target as HTMLInputElement).value;
      const p = om3NameProblem(l.name);
      $('#name-help').textContent = p ?? `${l.name.length} / ${OM3_NAME_MAX} · 显示在机身胶片页色轮下方`;
      $('#name-help').className = p ? 'help err' : 'help';
      const row = document.querySelector(`#list li[data-at="${k * PER + v}"] .nm`);
      if (row) row.textContent = l.name || '（未命名）';
      changed();
    }),
  });
  const notesBytes = () => new TextEncoder().encode(l.notes).length;
  const film = filmOf(l), orig = film ? undefined : libraryOrigin(l, LIBRARY);
  el.replaceChildren(
    h('div', { class: 'ed-head' },
      h('label', { class: 'field grow' }, h('span', { class: 'lbl' }, `名称 · ${at(k, v)}`), nameInput,
        h('span', { id: 'name-help', class: np ? 'help err' : 'help' }, np ?? `${l.name.length} / ${OM3_NAME_MAX} · 显示在机身胶片页色轮下方`)),
      h('div', { class: 'ed-btns' },
        h('button', { class: 'primary', title: '修改会自动保存在此浏览器中；点击可立即保存当前胶片组。', onclick: () => {
          if (flush()) toast(`已保存到本机胶片组「${LISTS.current}」`);
          else toast('浏览器未能保存。请从「导出」下载胶片配方文件（.json）备份。', 'err');
        } }, '保存到本机'),
        h('button', {
          class: 'share-btn', title: film ? `恢复 ${film.name} 的默认参数` : orig ? `Restore the built-in "${orig.name}" values (OM-3 version)` : '将所有参数恢复为中性值',
          onclick: () => {
            const r = film ? Object.assign(filmLook(film), { name: l.name }) : toOm3(resetLook(l, LIBRARY, [])).look ?? blankProfile(l.name);
            O.bank[k][v] = r; save(); renderAll();
            toast(film ? `"${r.name}" restored to the ${film.name} film sim` : orig ? `"${r.name}" restored to the built-in values` : `"${l.name}" reset to neutral`);
          },
        }, '重置此配方'),
        h('button', { class: 'share-btn', onclick: () => om3ShareProfile(l), title: '生成这款胶片的分享链接' }, '分享'))),
    h('label', { class: 'field' }, h('span', { class: 'lbl' }, '备注'),
      h('textarea', {
        rows: 3, maxlength: 400, placeholder: '记下适合的场景或调色思路…', onchange: checkpoint,
        oninput: (e: Event) => draft(() => {
          l.notes = (e.target as HTMLTextAreaElement).value;
          const b = notesBytes();
          $('#notes-help').textContent = `${b} / ${NOTE_MAX} 字节 · 备注仅保存在配方文件中`;
          $('#notes-help').className = b > NOTE_MAX ? 'help err' : 'help';
          changed();
        }),
      }, l.notes),
      h('span', { id: 'notes-help', class: notesBytes() > NOTE_MAX ? 'help err' : 'help' }, `${notesBytes()} / ${NOTE_MAX} 字节 · 备注仅保存在配方文件中`)),
    mixPanel(l, changed),
    rgbPanel(l, changed),
    hslPanel(l, changed),
    h('div', { class: 'group cam' },
      ...(() => {
        const note = h('p', {});
        const show = () => {
          const v = l.tone_balance ?? 0;
          note.hidden = !v || (om3Fw28() && !!l.split);
          if (!om3Fw28()) { note.className = 'warn'; note.replaceChildren(h('b', {}, 'Needs firmware v0.28: '), 'the export is set to an older firmware, so Split Tone Balance is not previewed or saved. Choose "v0.28 or later" under Export › Firmware on the camera.'); }
          else { note.className = 'help'; note.textContent = 'This film has no split tone yet: add one on the Color wheel\'s Shadows or Highlights tab.'; }
        };
        const { inp, out } = slider(-5, 5, l.tone_balance ?? 0, (x) => { if (x) l.tone_balance = x; else delete l.tone_balance; show(); changed(); }, undefined, '分离色调平衡');
        show();
        return [withHelp(h('div', { class: 'crow' }, h('span', { class: 'cname' }, pmIcon('tb'), 'Split Tone Balance'), steps(inp), out), 'Split Tone Balance', [
          'Moves where the two split-tone tints (Color wheel › Shadows and Highlights) meet: − lets the shadow colour reach further up into the mid-tones, + lets the highlight colour reach further down. It does nothing until the film has a split tone.',
          'How to use: drag the slider or use − / +, −5 to +5; double-click to zero.',
          fwLine('Firmware v0.28', 'needed for Tone Balance.')], note)];
      })()),
    wbPanel(l, changed),
    tonePanel(l, changed),
    bwPanel(l, changed),
    h('div', { class: 'group cam rows' },
      crow('Contrast', OM3.contrast, () => l.advice.contrast ?? 0, (x) => { l.advice.contrast = x; }, [
        'The camera\'s Contrast for this film, −2 to +2. + makes the picture punchier: on the OM-3 mostly brighter highlights, with slightly deeper shadows; − makes it flatter and softer.',
        'How to use: drag the slider or use − / +; double-click to zero. For finer control of the tones, use Highlight & Shadow and Blacks / Whites.']),
      (() => {
        const { inp, out } = slider(SHARP.lo, SHARP.hi, l.advice.sharpness ?? 0, (x) => { l.advice.sharpness = x; changed(); }, sharpLabel, 'Sharpness');
        return withHelp(h('div', { class: 'crow' }, h('span', { class: 'cname' }, 'Sharpness'), steps(inp), out), 'Sharpness', [
          'The camera\'s sharpening for photos with this film: 0 is its normal, +1 and +2 crisper, −1 to −4 softer, −5 Off (no sharpening, the most film-like).',
          'How to use: drag the slider or use − / +; double-click for 0. The preview shows the change at this size; up close the camera\'s effect is finer.',
          fwLine('Firmware v0.22', 'needed below −2.')]);
      })()),
    h('div', { class: 'group cam rows' },
      cseg('Noise Filter', [['off', 'Menu'], ['film', 'Off'], ['fine', 'Low'], ['standard', 'Std'], ['high', 'High']], l.grain,
        (x) => { l.grain = x as Look['grain']; renderEditor(); changed(); }, [
          'The camera\'s noise reduction for photos with this film. Menu keeps whatever the camera\'s menu is set to; Off, Low, Std (Standard) and High override it for this film. Lower settings keep more fine detail and a little noise (more film-like); High smooths more, which helps at high ISO.',
          'How to use: pick one. Not shown in the preview.']),
      cseg('Vignette Correction', [['off', 'Off'], ['on', 'On']], l.lens_correction ? 'on' : 'off', (x) => {
        if (x === 'on') l.lens_correction = true; else delete l.lens_correction;
        renderEditor(); changed();
      }, [
        'Off leaves the lens\'s own darker corners, as many film cameras did; On lets the camera brighten them as it normally does.',
        'How to use: pick Off or On. The preview shows Off as a typical prime at f/4 (corners about 15 % darker); wide-open apertures and wide lenses darken the corners more.',
        fwLine('Firmware v0.21', 'needed for the choice; before it every film keeps the camera\'s correction.')]),
      crow('Shading Effect', OM3.shading, () => l.vignette, (x) => { l.vignette = x; }, [
        'The camera\'s own Shading, −5 to +5: − darkens the edges and corners toward black, + lightens them toward white; the middle of the picture is left alone.',
        'Every level is strong: even 1 takes the corners most of the way, and each step adds a little more (measured on an OM-3).',
        'How to use: drag the slider or use − / +; double-click to zero.']),
      (() => {
        const e = l.effect, v = !e ? 0 : e.type === 'clarity' ? -e.strength : e.strength;
        const { inp, out } = slider(-OM3.fx, OM3.fx, v, (x) => {
          l.effect = x === 0 ? null : x > 0 ? { type: 'bloom', strength: x } : { type: 'clarity', strength: -x };
          fxChanged();
        }, (x) => (x === 0 ? '0' : x > 0 ? `+${x}` : String(x)), 'Glow Effect');
        return withHelp(h('div', { class: 'crow' }, h('span', { class: 'cname' }, pmIcon('glow'), 'Glow Effect'), steps(inp), out), 'Glow Effect', [
          '+ Glow: a soft, dreamy glow mixed into the photo (the camera\'s Soft Focus), 1 to 5. − Clarity: more local contrast, so textures and mid-tones look crisper, 1 to 5. A film has one or the other.',
          'How to use: drag right for Glow, left for Clarity; double-click to zero.',
          fwLine('Firmware v0.20', 'needed.')]);
      })(),
      ...(() => {
        const note = h('p', {});
        const show = () => {                     // after each preview: is the glow on this photo?
          const v = l.halation ?? 0, r = lastHalation;
          note.hidden = !v || (om3Fw28() && r !== 'off' && r !== 'none');
          if (!om3Fw28()) { note.className = 'warn'; note.replaceChildren(h('b', {}, 'Needs firmware v0.28: '), 'the export is set to an older firmware, so Halation is not previewed or saved. Choose "v0.28 or later" under Export › Firmware on the camera.'); }
          else if (r === 'off') { note.className = 'help'; note.replaceChildren(h('b', {}, '当前照片未显示光晕：'), '日光下光晕会减弱。可选择「夜间街道」或「蓝调时刻」观察灯光边缘。'); }
          else { note.className = 'help'; note.replaceChildren(h('b', {}, '当前照片未显示光晕：'), '画面中没有能形成光晕的明亮光源。'); }
        };
        afterPreview = show;
        const { inp, out } = slider(0, OM3.halation, l.halation ?? 0, (x) => { if (x) l.halation = x; else delete l.halation; changed(); }, (x) => (x ? `+${x}` : '0'), '胶片光晕');
        show();
        return [withHelp(h('div', { class: 'crow' }, h('span', { class: 'cname' }, pmIcon('halo'), 'Halation Effect'), steps(inp), out), 'Halation Effect', [
          'A red-orange glow around bright lights in darker scenes, as on cinema film, 1 to 5. Like the camera, it fades out in bright daylight photos; pick a night photo with lights (Night street, Blue hour) to see it. Works with or without Glow.',
          'How to use: drag the slider or use − / +; double-click to zero.',
          fwLine('Firmware v0.28', 'needed; saving a photo with Halation takes a little longer.')], note)];
      })()),
    h('div', { class: 'group cam rows' },
      ...(() => {                                // v0.40: Film Grain Off, 1..5 and Grain Size, as the camera's rows
        const note = h('p', { class: 'help' });
        const show = () => {
          const st = grainStrength(l), sz = l.grain_size ?? 2;
          note.hidden = !st || ((st === 2 || st === 3 || st === 5) && sz === 2);
          const saved = [0, 2, 2, 3, 5, 5][st];
          note.replaceChildren(h('b', {}, '导入后在机身设置。'), `胶片文件可保存强度 2、3、5，颗粒大小默认为中。本次导出的强度为 ${saved}，要还原预览，请在机身选择强度 ${st}、大小「${['', '细', '中', '粗'][sz]}」。`);
        };
        const { inp, out } = slider(0, 5, grainStrength(l), (x) => { setGrainStrength(l, x); show(); changed(); if (!x !== !sizeRow.isConnected) renderEditor(); }, (x) => (x ? String(x) : '关'), '胶片颗粒');
        const sizeRow = cseg('颗粒大小', [['1', '细'], ['2', '中'], ['3', '粗']], String(l.grain_size ?? 2), (x) => {
          if (x === '2') delete l.grain_size; else l.grain_size = Number(x);
          renderEditor(); changed();
        }, [
          'How big the grain is: Fine, Medium or Coarse.',
          'How to use: pick one. The looks file has no place for the size, so films start at Medium on the camera: set Fine or Coarse on the camera\'s Grain Size row after loading the looks.',
          fwLine('Firmware v0.40', 'needed.')]);
        show();
        return [withHelp(h('div', { class: 'crow' }, h('span', { class: 'cname' }, '胶片颗粒'), steps(inp), out), '胶片颗粒', [
          'Colour film grain the camera adds as the photo develops: Off, or 1 (light) to 5 (strong). It is the same in the shadows and the highlights, with a little colour speckle, as on colour film. The preview shows it as the photo looks at this size.',
          'How to use: drag the slider or use − / +; then pick its size on Grain Size.',
          'The looks file holds 2, 3 or 5 (Low / Med / High on firmware before v0.40); for 1 or 4, set Film Grain on the camera after loading the looks.',
          fwLine('Firmware v0.40', 'needed for 1 to 5 and the size.')]),
          ...(l.film_grain ? [sizeRow] : []), note];
      })(),
      ...(() => {
        const note = h('p', {});
        const show = () => {
          note.hidden = !l.border;
          if (!om3Fw28()) { note.className = 'warn'; note.replaceChildren(h('b', {}, 'Needs firmware v0.40: '), 'the export is set to an older firmware, so the Border is not previewed or saved. Choose "v0.28 or later" under Export › Firmware on the camera.'); }
          else note.hidden = true;
        };
        const { inp, out } = slider(-OM3.border, OM3.border, l.border ?? 0, (x) => { if (x) l.border = x; else delete l.border; show(); changed(); }, (x) => (x > 0 ? `+${x} 白` : x < 0 ? `${x} 黑` : '0'), '边框');
        show();
        return [withHelp(h('div', { class: 'crow' }, h('span', { class: 'cname' }, '边框'), steps(inp), out), '边框', [
          'A plain border around the photo, the same width on every side: + white, − black, from 1.5 % (1) to 7.5 % (5) of the photo\'s short side. JPEGs only: the photo keeps its size and the border covers its outer edge; at a crop (Image Aspect) it sits inside the crop.',
          'How to use: drag right for white, left for black; double-click for none.',
          fwLine('Firmware v0.40', 'needed (black from v0.40-beta); older firmware ignores it.')], note)];
      })(),
      grainWarn),
    h('div', { id: 'problems' }));
  refreshProblems();
}

// ---- OM-3 links: a whole bank (ob1_) or one look (op1_), deflated JSON. Unlike look codes they keep Contrast and Sharp.
async function zpipe(data: Uint8Array, s: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(s));
  return new Uint8Array(await out.arrayBuffer());
}
const toB64u = (b: Uint8Array) => { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
/** A whole bank as it leaves the tool: the newest firmware any of its looks needs, and each look with its own. */
const exportBank = () => ({ schema: BANK_SCHEMA, min_fw: FW_NAME[bankMinFw(O.bank)], name: O.name, bank: O.bank.map((r) => r.map((l) => (l ? exportLook(l) : null))) });
/** "Needs Caduceus v0.26 or later on the camera." when more than the oldest the tool exports for. */
const fwNote = (fw: Fw) => (fw > 20 ? `机身需要 Caduceus v${FW_NAME[fw]} 或更高版本。` : '');
async function encodeOm3(prefix: string, v: unknown) { return prefix + toB64u(await zpipe(new TextEncoder().encode(JSON.stringify(v)), new CompressionStream('deflate'))); }
async function decodeOm3(prefix: string, t: string): Promise<unknown> {
  const s = t.trim().replace(/^.*#/, '').replace(/\s+/g, '');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await zpipe(fromB64u(s.slice(prefix.length)), new DecompressionStream('deflate')))); }
  catch { throw new Error('This link is damaged or incomplete: copy it again.'); }
}
const isOm3Code = (t: string, p: string) => new RegExp(`(^|#)\\s*${p}`).test(t.trim());

function replaceBank(bank: Bank, msg: string, name?: string) {
  O.bank = bank; if (name) O.name = name; O.k = 0; O.v = 0;
  save(); renderAll();
  const probs = validateBank(bank);
  toast(probs.length ? `${msg}. ${probs.length} problem(s) to fix before export.` : msg, probs.length ? 'err' : 'ok');
}
async function om3OnFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!f) return;
  if (/\.(cube|xmp|lrtemplate)$/i.test(f.name)) { await gradeDialog(f); return; }
  const bytes = new Uint8Array(await f.arrayBuffer());
  const magic = bytes.length >= 4 ? String.fromCharCode(...bytes.subarray(0, 4)) : '';
  try {
    if (magic === 'OM3P') { const bk = readProfiles(bytes, om3Fw28()); replaceBank(bk, `Opened ${f.name} (${bk.flat().filter(Boolean).length} looks)`); return; }
    if (magic === 'OM3N') { toast('That is NAMES.BIN (the name pictures). Open LOOKS.BIN instead: it holds the names too.', 'err'); return; }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {                                  // v0.27: a JPEG from the camera: its om3.1. code
      const txt = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 262144)));
      const m = /Caduceus [^\0]*?om3\.1\.[A-Za-z0-9_-]{43}/.exec(txt) ?? PHOTO_RE.exec(txt);
      if (!m) { toast('This photo has no Caduceus film code (taken without a film, or before v0.27).', 'err'); return; }
      await om3ImportCode(m[0], false); return;
    }
    const j = JSON.parse(new TextDecoder().decode(bytes));
    if (j && j.schema === BANK_SCHEMA) { const b = parseBank(j, parseLook); replaceBank(b.bank, `Opened "${b.name}"`, b.name); return; }
    throw new Error('not an OM-3 file');
  } catch (err) { toast(`Not an OM-3 LOOKS.BIN or looks file: ${(err as Error).message}`, 'err'); }
}

async function om3OnGradeFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (f) await gradeDialog(f);
}

/** The first free FILM (the selected one when empty), or null when all 20 are in use. */
function freeFilm(): { k: number; v: number } | null {
  if (!O.bank[O.k][O.v]) return { k: O.k, v: O.v };
  const any = O.bank.flat().findIndex((x) => !x);
  return any >= 0 ? { k: Math.floor(any / PER), v: any % PER } : null;
}

/** A film from the user's own .cube LUT or Lightroom preset: the camera settings that come closest (src/convert.ts),
 *  previewed next to the grade itself on the current photo. The file stays in the browser. */
async function gradeDialog(f: File) {
  const text = await f.text();
  let tf: Transform, kind: string, title: string;
  const warn: Node[] = [];
  let extras: ReturnType<typeof lightroomExtras> | null = null;
  try {
    if (/\.cube$/i.test(f.name)) {
      const cube = parseCube(text);
      tf = (c) => cubeApply(cube, c); kind = 'LUT'; title = cube.title || f.name.replace(/\.cube$/i, '');
      if (looksLikeLog(`${cube.title} ${f.name}`, tf)) warn.push(h('p', { class: 'warn' }, h('b', {}, 'This LUT looks made for Log video. '),
        'It expects flat Log footage, not a finished photo, so on a camera JPEG it is far too strong. The film below follows it anyway: use a LUT made for normal (Rec.709 / sRGB) pictures for a good result.'));
    } else {
      const p = parseLightroom(text, f.name);
      tf = lightroomTransform(p); kind = 'Lightroom preset'; title = p.name;
      extras = lightroomExtras(p);
      if (Object.keys(p.s).length === 0 && Object.keys(p.curves).length === 0) throw new Error('This preset has no develop settings.');
    }
  } catch (err) { toast(`Can't read ${f.name}: ${(err as Error).message}`, 'err'); return; }
  const full = title.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = full.length <= OM3_NAME_MAX ? full : (full.slice(0, OM3_NAME_MAX + 1).replace(/\s+\S*$/, '') || full.slice(0, OM3_NAME_MAX));
  const name = cut.trim() || 'My grade';
  const status = h('p', { class: 'help' }, '正在匹配机身调色参数… 0 %');
  const body = h('div', { class: 'grade' }, status);
  const dlg = modal(`从 ${f.name} 创建胶片`, body);
  const res = await fitLook(tf, name, (x) => new Promise<void>((r) => { status.textContent = `正在匹配机身调色参数… ${Math.round(x * 100)} %`; setTimeout(r, 0); }));
  if (!dlg.open) return;
  const look = res.look;
  look.notes = `Made from the ${kind} "${title}" (an approximation with the camera's own settings).`.slice(0, 200);
  if (extras) {
    const x = extras.look;
    if (x.film_grain) look.film_grain = x.film_grain;
    if (x.vignette) look.vignette = x.vignette;
    if (x.effect) look.effect = x.effect;
    if (x.advice?.sharpness) look.advice.sharpness = x.advice.sharpness;
  }
  // previews: the grade itself and the film, on the current photo
  const pvs: Node[] = [];
  if (srcData) {
    const sc = Math.min(1, 480 / srcData.width), W = Math.max(1, Math.round(srcData.width * sc)), H = Math.max(1, Math.round(srcData.height * sc));
    const small = document.createElement('canvas'); small.width = W; small.height = H;
    const full = document.createElement('canvas'); full.width = srcData.width; full.height = srcData.height;
    full.getContext('2d')!.putImageData(srcData, 0, 0);
    small.getContext('2d')!.drawImage(full, 0, 0, W, H);
    const base = small.getContext('2d')!.getImageData(0, 0, W, H);
    const graded = new ImageData(W, H), film = new ImageData(W, H), memo = new Map<number, RGB>();
    for (let i = 0; i < W * H * 4; i += 4) {
      const key = (base.data[i] >> 2) << 12 | (base.data[i + 1] >> 2) << 6 | (base.data[i + 2] >> 2);
      let o = memo.get(key);
      if (!o) { o = tf([base.data[i] / 255, base.data[i + 1] / 255, base.data[i + 2] / 255]); memo.set(key, o); }
      graded.data[i] = o[0] * 255 + 0.5; graded.data[i + 1] = o[1] * 255 + 0.5; graded.data[i + 2] = o[2] * 255 + 0.5; graded.data[i + 3] = 255;
    }
    renderLook(base, film, splitPv(look), { advice: true, camera: CAM });
    const cv = (d: ImageData, label: string) => { const c = h('canvas', { class: 'film-pv', 'aria-label': label }); c.width = W; c.height = H; c.getContext('2d')!.putImageData(d, 0, 0); return h('figure', {}, c, h('figcaption', {}, label)); };
    pvs.push(h('div', { class: 'grade-pv' }, cv(graded, `原始 ${kind}`), cv(film, 'OM-3 胶片预览')));
  } else pvs.push(h('p', { class: 'help' }, '请选择预览照片，对比两种效果。'));
  const words = { close: '匹配度高', fair: '匹配度中等', rough: '仅近似匹配' }[res.quality];
  const more = { close: '机身配方与原调色非常接近。', fair: '整体风格接近，部分颜色有差异。',
    rough: 'This grade does things the camera\'s settings can\'t (for example moving one shade differently from its neighbours): the film keeps its general direction.' }[res.quality];
  const nameIn = h('input', { type: 'text', id: 'grade-name', value: name, maxlength: String(OM3_NAME_MAX), 'aria-label': '胶片名称' });
  const notes: Node[] = [];
  if (extras?.mapped.length) notes.push(h('p', { class: 'help' }, h('b', {}, '同时保留：'), extras.mapped.join(' · ')));
  if (extras?.dropped.length) notes.push(h('p', { class: 'help' }, h('b', {}, '机身无对应参数，已略过：'), extras.dropped.join(', ')));
  const add = h('button', { class: 'primary', onclick: () => {
    const t = freeFilm();
    look.name = (nameIn.value.trim() || name).slice(0, OM3_NAME_MAX);
    const np = om3NameProblem(look.name); if (np) { toast(np, 'err'); return; }
    let k: number, v: number;
    if (t) ({ k, v } = t);
    else { if (!confirm(`All 20 looks are in use. Replace ${at(O.k, O.v)} ("${O.bank[O.k][O.v]!.name}") with "${look.name}"?`)) return; k = O.k; v = O.v; }
    O.bank[k][v] = look; O.k = k; O.v = v;
    save(); renderAll(); dlg.close();
    toast(`Added "${look.name}" as ${at(k, v)}`);
  } }, '添加为胶片');
  body.replaceChildren(
    ...warn,
    ...pvs,
    h('p', { class: 'grade-score' }, h('b', {}, words), ` · 色差 ${res.after.toFixed(1)}（机身默认值 ${res.before.toFixed(1)}，越低越接近）。`, more),
    ...notes,
    h('label', { class: 'grade-name' }, '胶片名称 ', nameIn),
    h('p', { class: 'help' }, `The film uses only the camera's own settings, so you can change it like any other. 原始 ${kind} stays on your computer: it isn't stored here or uploaded.`),
    h('div', { class: 'modal-actions' }, h('button', { onclick: () => dlg.close() }, '取消'), add));
}

async function om3ImportCode(t: string, fromLink: boolean): Promise<boolean> {
  try {
    if (isOm3Code(t, OB_PREFIX)) {
      const b = parseBank(await decodeOm3(OB_PREFIX, t), parseLook);
      const n = b.bank.flat().filter(Boolean).length;
      if (!confirm(`Open the shared looks "${b.name}" (${n} looks)? They replace your current looks (Undo brings them back).`)) return fromLink;
      replaceBank(b.bank, `Opened "${b.name}"${bankMinFw(b.bank) > 20 ? ` · needs Caduceus v${FW_NAME[bankMinFw(b.bank)]} or later` : ''}`, b.name);
      return true;
    }
    const fromPhoto = PHOTO_RE.test(t) && !isOm3Code(t, OP_PREFIX);
    if (!fromPhoto && !isOm3Code(t, OP_PREFIX)) throw new Error('This is not an OM-3 look link (it starts with op1_ or ob1_) or a photo\'s om3.1. code.');
    const c: { look: Look | null; changed: string[]; dropped: string[] } = { look: fromPhoto ? lookFromPhotoCode(t) : parseLook(await decodeOm3(OP_PREFIX, t), 'look'), changed: [], dropped: [] };
    if (!c.look) throw new Error('That link holds no look.');
    let k = O.k, v = O.v;
    if (O.bank[k][v]) {
      const free = O.bank[k].findIndex((x) => !x);
      if (free >= 0) v = free;
      else {
        const any = O.bank.flat().findIndex((x) => !x);
        if (any >= 0) { k = Math.floor(any / PER); v = any % PER; }
        else if (!confirm(`All 20 looks are in use. Replace ${at(O.k, O.v)} ("${O.bank[k][v]!.name}") with "${c.look.name}"?`)) return false;
      }
    }
    O.bank[k][v] = c.look; O.k = k; O.v = v;
    save(); renderAll();
    toast(`Added "${c.look.name}" as ${at(k, v)}${om3Changes(c)}${minFw(c.look) > 20 ? ` · needs Caduceus v${FW_NAME[minFw(c.look)]} or later` : ''}`);
    return true;
  } catch (e) {
    importCodeMsg((e as Error).message);
    return false;
  }
}

async function om3Share() {
  const code = await encodeOm3(OB_PREFIX, exportBank());
  const link = `${shareBase()}?camera=om3#${code}`;
  modal('分享胶片组', h('div', { class: 'share' },
    h('p', {}, `A link to all ${O.bank.flat().filter(Boolean).length} OM-3 looks (names, notes, Contrast / Sharp / Shading). Opening it loads them here. Everything is inside the link itself: nothing is stored on a server.`),
    h('div', { class: 'code-box link' }, h('input', { type: 'text', readonly: true, value: link, onfocus: (e: Event) => (e.target as HTMLInputElement).select() }),
      h('button', { onclick: () => copy(link, '已复制链接') }, '复制链接')),
    h('p', { class: 'help' }, `${link.length} characters. ${fwNote(bankMinFw(O.bank))} For one look, use the Share button next to its name.`),
    ...recipeCodes()));
}
/** v0.28: the recipe codes (as the camera writes them into photos), one per film, to post anywhere. */
function recipeCodes(only?: Look): HTMLElement[] {
  const lines = O.bank.flat().map((l, i) => (l && (!only || l === only) ? recipeText(l, i + 1) : null)).filter((x): x is string => !!x);
  if (!lines.length) return [];
  const text = lines.join('\n');
  const box = lines.length === 1
    ? h('input', { type: 'text', readonly: true, value: text, onfocus: (e: Event) => (e.target as HTMLInputElement).select() })
    : h('textarea', { readonly: true, rows: Math.min(8, lines.length), onfocus: (e: Event) => (e.target as HTMLTextAreaElement).select() }, text);
  return [
    h('h4', { class: 'share-sub' }, lines.length === 1 ? '配方码' : '配方码'),
    h('p', { class: 'help' }, `The short code the camera writes into each photo, ${lines.length === 1 ? 'for this film' : 'one line per film'}: post it anywhere. Paste it into LookLab (Paste link) to get the film back, with every camera setting (not the notes).`),
    h('div', { class: 'code-box link' }, box, h('button', { onclick: () => copy(text, lines.length === 1 ? '已复制配方码' : '已复制配方码') }, lines.length === 1 ? '复制配方码' : '全部复制')),
  ];
}

async function om3ShareProfile(l: Look) {
  const code = await encodeOm3(OP_PREFIX, exportLook(l));
  const link = `${shareBase()}?camera=om3#${code}`;
  modal(`分享「${l.name}」`, h('div', { class: 'share' },
    h('p', {}, '链接包含此款胶片的完整配方，包括对比度、锐度和暗角。'),
    fwNote(minFw(l)) ? h('p', { class: 'help' }, fwNote(minFw(l))) : null,
    h('div', { class: 'code-box link' }, h('input', { type: 'text', readonly: true, value: link, onfocus: (e: Event) => (e.target as HTMLInputElement).select() }),
      h('button', { onclick: () => copy(link, '已复制链接') }, '复制链接')),
    ...recipeCodes(l),
    h('div', { class: 'ex-row' },
      h('div', {}, h('b', {}, 'RapidRAW preset'), h('p', { class: 'help' }, 'This look as a .rrpreset for RapidRAW (Presets › Import), for ORF files. An approximation of the camera look.')),
      h('button', { onclick: () => download(`${rrName(l.name)}.rrpreset`, rrpreset(bankPack([l]), 0), 'application/json') }, '下载'))));
}
const bankPack = (looks: Look[]): Pack => ({ schema: PACK_SCHEMA, name: O.name, looks, slots: {} });

function om3InstallDialog() {
  const link = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
  const code = (t: string) => h('code', {}, t);
  const step = (title: string, ...body: (Node | string | null)[]) => h('li', { class: 'step' }, h('b', {}, title), h('div', { class: 'step-body' }, ...body));
  const exportBtn = h('button', { onclick: () => { dlg.close(); om3ExportDialog(); } }, '打开导出面板');
  const body = h('div', { class: 'install' },
    h('p', { class: 'warn' }, '这是非官方实验固件。刷写失败可能导致相机无法启动，风险由使用者承担。恢复文件可用于还原官方固件。'),
    h('ol', { class: 'steps' },
      step('检查机身',
        h('p', {}, '在「设置 → 固件版本」中确认机身是 ', h('b', {}, 'OM SYSTEM OM-3'), '，官方固件版本为 ', h('b', {}, '1.1'), '。请将电池充足电，并准备一张已在机内格式化的 SD 卡。')),
      step('安装 Python 3.10 或更高版本（仅首次）',
        h('p', {}, '从 ', link('https://www.python.org/downloads/', 'Python 官网'), ' 下载安装。macOS 用户安装后，还需在 Python 文件夹中运行 ', code('Install Certificates.command'), '。')),
      step('下载 OM-3 版 Caduceus',
        h('p', {}, '打开', link(`${OM3_GH}/releases/latest`, '最新发布页'), '，下载 ', h('b', {}, 'Source code (zip)'), ' 并解压。受 OM 固件许可限制，项目以源码发布；下一步将在本机用官方固件生成更新文件。')),
      step('构建固件',
        h('p', {}, '按完整说明运行 ', code('firmware/patch.py'), '。脚本会获取官方固件、应用补丁、校验文件，并生成 ', code('SD card files'), ' 文件夹。将其中的 ', code('DCOLYMP'), ' 复制到 SD 卡根目录。v0.29 以前还需复制 ', code('OM3MOD'), '；从 v0.29 起，其余安装资源已内置。请将 ', code('restore/'), ' 恢复文件夹留存在电脑上。')),
      step('导入自定义配方（可选）',
        h('p', {}, '可以直接在机身的胶片页创建配方。要使用 LookLab 编辑的配方，请按以下步骤操作。'),
        h('ol', { class: 'substeps' },
          h('li', {}, 'v0.28 及以前：如需保留机内调好的配方，先点「打开…」，读取卡上的 ', code('OM3MOD/LOOKS.BIN'), '（v0.19 以前为 ', code('PROFILES.BIN'), '）。从 v0.29 起，机身会自行保存配方和机内修改，只有遇到新胶片组时才读取 ', code('LOOKS.BIN'), '。在 LookLab 中未更改的胶片会保留其机内调整。'),
          h('li', {}, '编辑完成后，选择「导出 → 写入 SD 卡」，也可以下载 SD 卡文件包并解压到卡的根目录。'),
          h('li', {}, '把卡插回已安装 Caduceus 的相机，开机后半按一次快门即可加载配方。')),
        exportBtn),
      step('刷入固件',
        h('p', {}, '关机插入 SD 卡，按住 ', h('b', {}, 'OK'), ' 键开机。更新期间请保持开机。等待指示灯从常亮变为闪烁，表示更新完成，此时再关机。随后从卡中删除 ', code('DCOLYMP/E1479999.BIN'), '。')),
      step('选择胶片并拍摄',
        h('p', {}, '在「图像模式」中，COLOR 1–4 之后会按 LookLab 中的顺序列出 ', h('b', {}, 'FILM 1–20'), '。选中胶片后，可在旁边的参数行继续微调；机身会将修改保存到这款胶片。')))
  );
  const dlg = modal('安装 OM-3 Caduceus 固件', body, [
    h('a', { class: 'btn', href: `${OM3_GH}/blob/main/docs/INSTALL.md`, target: '_blank', rel: 'noopener' }, '在 GitHub 查看完整说明'),
    h('a', { class: 'btn primary', href: `${OM3_GH}/releases/latest`, target: '_blank', rel: 'noopener' }, '最新版本'),
  ]);
}

type DirHandle = { name: string; getDirectoryHandle(n: string, o?: { create?: boolean }): Promise<DirHandle>; getFileHandle(n: string, o?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(d: BlobPart): Promise<void>; close(): Promise<void> }> }>; values(): AsyncIterable<{ name: string }> };
async function om3ToCard(files: { name: string; data: Uint8Array }[]) {
  const pick = (window as unknown as { showDirectoryPicker?: (o?: object) => Promise<DirHandle> }).showDirectoryPicker;
  if (!pick) { toast('当前浏览器无法直接写入文件夹，请下载 SD 卡文件包并解压。', 'err'); return; }
  let dir: DirHandle;
  try { dir = await pick({ mode: 'readwrite', id: 'om3card' }); } catch { return; }
  try {
    let om3 = dir;
    if (dir.name.toUpperCase() !== 'OM3MOD') om3 = await dir.getDirectoryHandle('OM3MOD', { create: true });
    for (const f of files) {
      const w = await (await om3.getFileHandle(f.name, { create: true })).createWritable();
      await w.write(f.data as BlobPart); await w.close();
    }
    toast(`Saved ${files.map((f) => f.name).join(', ')} to ${dir.name === om3.name ? dir.name : `${dir.name}/OM3MOD`}. Put the card in the camera and half-press.`);
  } catch (e) { toast(`写入 SD 卡失败： ${(e as Error).message}`, 'err'); }
}

function om3ExportDialog() {
  const probs = validateBank(O.bank);
  const fname = (O.name || 'om3-looks').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'om3-looks';
  const n = O.bank.flat().filter(Boolean).length;
  const bankJson = () => JSON.stringify(exportBank(), null, 1) + '\n';
  let fw: Fw = fwSetting();
  const looksBin = () => profilesBin(O.bank, fw);
  const fwSel = h('select', { onchange: (e: Event) => {
    fw = Number((e.target as HTMLSelectElement).value) as Fw;
    try { localStorage.setItem('caduceus.om3.fw', String(fw)); } catch { /* storage blocked */ }
    renderEditor(); schedulePreview(); wbNote();   // v0.26: split toning shows only with the v0.26 export; v0.28 its settings
  } }, h('option', { value: '28', selected: fw === 28 }, 'v0.28 或更高'), h('option', { value: '26', selected: fw === 26 }, 'v0.26.1 – v0.27.1'), h('option', { value: '25', selected: fw === 25 }, 'v0.26（分离色调）'), h('option', { value: '24', selected: fw === 24 }, 'v0.25'), h('option', { value: '23', selected: fw === 23 }, 'v0.24.1'), h('option', { value: '22', selected: fw === 22 }, 'v0.22'), h('option', { value: '21', selected: fw === 21 }, 'v0.21'), h('option', { value: '20', selected: fw === 20 }, 'v0.20 或更早'));
  const wbBig = O.bank.flat().filter((l) => l?.wb && Math.max(Math.abs(l.wb.a_b), Math.abs(l.wb.g_m)) > 5).map((l) => l!.name);
  const wbBox = h('p', { class: 'warn' });
  const v28 = O.bank.flat().filter((l) => l && v28Parts(l).length).map((l) => `${l!.name} (${v28Parts(l!).join(', ')})`);
  const wbNote = () => {
    const big = wbBig.length && fw < 26, new28 = v28.length && fw < 28;
    wbBox.hidden = !big && !new28;
    wbBox.replaceChildren(
      ...(big ? [h('b', {}, 'WB beyond ±5: '), `${wbBig.join(', ')}. Firmware v0.26 and older refuse a LOOKS.BIN with a WB shift past ±5, so this export saves it as ±5. Choose "v0.26.1 – v0.27.1" or "v0.28 or later" for the full ±7. `] : []),
      ...(new28 ? [h('b', {}, 'v0.28 settings left out: '), `${v28.join('; ')}. Older firmware refuses a LOOKS.BIN with them, so this export saves these looks without them (Blacks / Whites as ±5, split toning in whole v0.26 steps). Choose "v0.28 or later" if the camera has v0.28.`] : []));
  };
  wbNote();
  // v0.30: CURVES.BIN (the films' RGB curves and colour mix) goes with LOOKS.BIN, made from the same bytes; older firmware never reads it
  const cardFiles = async () => {
    const lb = looksBin();
    return [{ name: 'LOOKS.BIN', data: lb }, { name: 'NAMES.BIN', data: await namesBin(O.bank) as Uint8Array },
      ...(fw >= 28 ? [{ name: 'CURVES.BIN', data: curvesBin(lb, O.bank) }] : [])];
  };
  const busy = async (b: HTMLButtonElement, f: () => Promise<void>) => { b.disabled = true; try { await f(); } catch (e) { toast((e as Error).message, 'err'); } finally { b.disabled = probs.length > 0; } };
  const looks = O.bank.flat().filter(Boolean) as Look[];
  const rrAll = () => makeZip(looks.map((l, i) => ({ name: `${String(i + 1).padStart(2, '0')}-${rrName(l.name)}.rrpreset`, data: new TextEncoder().encode(rrpreset(bankPack(looks), i)) })));
  const fmt = (p: Problem) => (p.look !== undefined ? `${at(Math.floor(p.look / PER), p.look % PER)} (${O.bank[Math.floor(p.look / PER)][p.look % PER]?.name || 'no name'}): ` : '') + p.message;
  const toCard: HTMLButtonElement = h('button', { class: 'primary', disabled: probs.length > 0, onclick: () => busy(toCard, async () => om3ToCard(await cardFiles())) }, '写入 SD 卡…');
  const zip: HTMLButtonElement = h('button', {
    disabled: probs.length > 0, onclick: () => busy(zip, async () => {
      const files = (await cardFiles()).map((f) => ({ name: `OM3MOD/${f.name}`, data: f.data }));
      files.push({ name: `${fname}.om3.json`, data: new TextEncoder().encode(bankJson()) });
      download(`${fname}-card.zip`, makeZip(files), 'application/zip');
    }),
  }, '下载');
  const names: HTMLButtonElement = h('button', { disabled: probs.length > 0, onclick: () => busy(names, async () => download('NAMES.BIN', await namesBin(O.bank) as Uint8Array)) }, 'NAMES.BIN');
  modal('导出到 OM-3', h('div', { class: 'export' },
    probs.length
      ? h('div', { class: 'problems-box' }, h('b', {}, `${probs.length} problem(s) to fix first:`), h('ul', { class: 'problems' }, ...probs.slice(0, 12).map((p) => h('li', {}, fmt(p)))))
      : h('p', { class: 'ok' }, `✓ ${n} 款胶片通过格式检查。导出时会按所选固件版本保留支持的设置。v0.17–v0.18 请下载 PROFILES.BIN。`),
    h('div', { class: 'ex-row' },
      h('div', {}, h('b', {}, '机身固件版本'), h('p', { class: 'help' }, '按实际机身固件选择。v0.28 加入光晕、色调平衡、胶片白平衡、半级分离色调及 ±7 黑白位。旧版本会略过不支持的设置：v0.26 起支持分离色调，v0.22 起支持扩展锐度，v0.21 起支持颗粒和镜头校正。')),
      fwSel),
    wbBox,
    h('div', { class: 'ex-row' },
      h('div', {}, h('b', {}, '写入 SD 卡'), h('p', { class: 'help' }, '在 Chrome 或 Edge 中选择 SD 卡根目录或 OM3MOD 文件夹。会写入 LOOKS.BIN、NAMES.BIN；选择 v0.28 或更高时也会写入 CURVES.BIN，供 v0.30 起读取曲线和混色。v0.28 及以前会替换卡上配方，请先打开原文件以保留修改。v0.29 起机身保存自己的配方，仅载入新的胶片组。')),
      toCard),
    h('div', { class: 'ex-row' },
      h('div', {}, h('b', {}, 'SD 卡文件包（.zip）'), h('p', { class: 'help' }, '将压缩包解压到 SD 卡根目录。配方、名称和受支持的曲线文件位于 OM3MOD 文件夹，另附配方备份。')),
      zip),
    h('div', { class: 'ex-row' },
      h('div', {}, h('b', {}, '单独下载文件'), h('p', { class: 'help' }, 'LOOKS.BIN 保存 20 个配方，NAMES.BIN 保存显示名称。v0.30 起使用 CURVES.BIN 保存通道曲线和混色，请与同批 LOOKS.BIN 配套使用。文件放在 OM3MOD 中，v0.17–v0.18 使用 PROFILES.BIN。')),
      h('div', { class: 'ex-btns' },
        h('button', { disabled: probs.length > 0, onclick: () => download('LOOKS.BIN', looksBin()) }, 'LOOKS.BIN'),
        h('button', { disabled: probs.length > 0 || fw < 28, title: 'Firmware v0.30: the films\' RGB curves and colour mix, for the LOOKS.BIN above', onclick: () => download('CURVES.BIN', curvesBin(looksBin(), O.bank)) }, 'CURVES.BIN'),
        h('button', { disabled: probs.length > 0, title: 'For firmware v0.17–v0.18', onclick: () => download('PROFILES.BIN', profilesBin(O.bank, 20)) }, 'PROFILES.BIN'),
        names)),
    h('div', { class: 'ex-row' },
      h('div', {}, h('b', {}, '胶片配方文件（.json）'), h('p', { class: 'help' }, '包含所有配方和备注，可重新打开编辑或分享。')),
      h('button', { onclick: () => download(`${fname}.om3.json`, bankJson(), 'application/json') }, '下载')),
    h('div', { class: 'ex-row' },
      h('div', {}, h('b', {}, 'RapidRAW 预设（.rrpreset）'), h('p', { class: 'help' }, '每款胶片导出一个用于 ORF 的近似预设，打包为 ZIP。')),
      h('button', { disabled: !looks.length, onclick: () => download(`${fname}-rapidraw.zip`, rrAll(), 'application/zip') }, `下载全部 ${looks.length} 款（.zip）`)),
    h('p', { class: 'help' }, '机身自动检查文件。载入新配方后，选择一款胶片即可使用。v0.29 起机身会忽略已经载入过的胶片组，修改配方后可重新导出。')));
}

// ---------------------------------------------------------------- start
async function handleHash() {
  const code = decodeURIComponent(location.hash.slice(1));
  if (!code) return;
  history.replaceState(null, '', location.pathname + location.search);
  importCodeMsg = (m) => toast(`Link: ${m}`, 'err');
  await om3ImportCode(code, true);
  importCodeMsg = (m) => toast(m, 'err');
}

shell();
renderAll();
if (libNotice) toast(libNotice);
undoUi();
handleHash();
window.addEventListener('hashchange', handleHash);
