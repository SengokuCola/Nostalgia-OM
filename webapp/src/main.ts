import { loadGallery, storePhotos, storeRemoval, type ImportedPhoto } from './gallery-store';
import { drawRollLabel, parseLabel, styles, type BoxLabel } from './boxlabel';
import { filmEffects, effectNames } from './film-effects';
// Modified by SengokuCola for the Caduceus for OM-3 fork.
import './style.css';
import './theme.css';
import libraryJson from './data/library.json';
import { type Problem } from './format';
import {
  KELVIN, NOTE_MAX, PACK_SCHEMA,
  parsePack, toneLimit, type FilmWb, type Look, type Pack, type Tone,
} from './pack';
import { History } from './history';
import { RollCabinet } from './cabinet';
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
import { CAMERA_FILMS, FILMS, FILM_GROUPS, applyStockLabel, filmLook, filmOf, type Film, type FilmGroup } from './om3films';
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
interface LookLabView {
  sampleUrl?: (id: string) => string;
  labelFont?: string;
  sync?: () => void;
  photoChanged?: (name: string) => void;
}
let view: LookLabView = {};
const sampleUrl = (id: string) => view.sampleUrl?.(id) ?? `${import.meta.env.BASE_URL}samples/${id}.jpg?v=${SAMPLE_REV}`;
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
      const lists: Record<string, Bank> = Object.create(null);
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
  return { current: 'Default', lists: Object.assign(Object.create(null), { Default: O.bank }) };
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
const STORE_CABINET = 'caduceus.om3.cabinet.v1';
const STORE_SEEDED_FILMS = 'caduceus.om3.seeded-films.v1';
let cabinet = new RollCabinet();
let looseRoll: Look | undefined;
function restoreCabinet(raw: string) {
  const restored = RollCabinet.decode(raw);
  cabinet = restored.cabinet;
  LISTS.lists = restored.lists;
  LISTS.current = restored.current;
}
try {
  const stored = localStorage.getItem(STORE_CABINET);
  if (stored) restoreCabinet(stored);
} catch { /* keep legacy lists available when storage is unavailable */ }
function seedBuiltinFilms() {
  for (const bank of Object.values(LISTS.lists)) {
    for (const row of bank) for (const look of row) if (look) cabinet.register(look);
  }
  let seeded = false;
  try {
    const key = 'caduceus.om3.stock-labels.v3';
    if (!localStorage.getItem(key)) {
      let changed = false;
      const firstStyle = localStorage.getItem('caduceus.om3.stock-labels.v2') ? 13 : 0;
      for (const look of cabinet.rolls.keys()) if (applyStockLabel(look, firstStyle)) changed = true;
      if (changed) localStorage.setItem(STORE_CABINET, cabinet.encode(LISTS.current, LISTS.lists));
      localStorage.setItem(key, '1');
    }
  } catch { /* local storage may be unavailable */ }
  try { seeded = localStorage.getItem(STORE_SEEDED_FILMS) === '1'; } catch { /* private mode */ }
  if (seeded) return;
  const existing = new Set<Film>();
  for (const look of cabinet.rolls.keys()) {
    const f = filmOf(look);
    if (f) existing.add(f);
  }
  let added = 0;
  for (const f of FILMS) {
    if (!existing.has(f)) { cabinet.register(filmLook(f)); added++; }
  }
  try {
    localStorage.setItem(STORE_SEEDED_FILMS, '1');
    if (added) localStorage.setItem(STORE_CABINET, cabinet.encode(LISTS.current, LISTS.lists));
  } catch { /* private mode */ }
}
seedBuiltinFilms();
O.bank = LISTS.lists[LISTS.current]; O.name = LISTS.current;
function snapshot() {
  LISTS.lists[LISTS.current] = O.bank;
  return cabinet.encode(LISTS.current, LISTS.lists);
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
let pendingSave = false;
function flush() {
  if (!pendingSave) return true;
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORE_CABINET, snapshot());
  } catch {
    return false;
  }
  // Keep a single-box backup for older builds.
  try { localStorage.setItem(STORE_OM3, bankSnapshot()); } catch { /* best effort */ }
  pendingSave = false;
  return true;
}
function persist() { pendingSave = true; clearTimeout(saveTimer); saveTimer = window.setTimeout(flush, 250); }
window.addEventListener('pagehide', flush);

// ---------------------------------------------------------------- undo / redo
// Every edit calls save(). Continuous edits (slider drags, typing) run inside draft(): they are saved but only become
// an undo step at the end of the gesture (the input's change event: pointer-up, blur or Enter) via checkpoint().
let hist = new History(snapshot(), 200);
let drafting = false;
function save() { persist(); if (!drafting) checkpoint(); view.sync?.(); }
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
  const selectedId = looseRoll && cabinet.rolls.get(looseRoll);
  restoreCabinet(s);
  looseRoll = selectedId ? [...cabinet.rolls].find(([, id]) => id === selectedId)?.[0] : undefined;
  O.name = LISTS.current; O.bank = LISTS.lists[O.name];
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
const cur = (): Look | undefined => looseRoll ?? O.bank[O.k][O.v] ?? undefined;
function selectSlot(k: number, v: number) {
  looseRoll = undefined;
  O.k = k; O.v = v;
}

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

const shareBase = () => location.protocol === 'file:' || location.hostname === 'tauri.localhost' || location.protocol === 'tauri:'
  ? 'https://androidfanman.github.io/caduceus-om3/looklab/' : location.origin + location.pathname;

function renderAll() {
  renderList();
  renderEditor();
  schedulePreview();
}

// ---------------------------------------------------------------- look list
function renderList() {
  renderBank();
  renderBoxSelector();
  view.sync?.();
}

function focusSel() { ($('#list li.sel') as HTMLElement | null)?.focus(); }

// ---------------------------------------------------------------- editor
function renderEditor() {
  const el = $('#editor');
  const l = cur();
  afterPreview = null;
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
    h('button', { class: 'cam-step', 'aria-label': '减少', tabindex: -1, onclick: () => bump(-1) }, '−'), inp,
    h('button', { class: 'cam-step', 'aria-label': '增加', tabindex: -1, onclick: () => bump(1) }, '+'));
}
/** A Picture Mode row: the camera's name, a slider and the value. */
function crow(label: string, lim: number, get: () => number, set: (x: number) => void, changed: () => void, help: HelpBody): HTMLElement {
  const { inp, out } = slider(-lim, lim, get(), (x) => { set(x); changed(); }, undefined, label);
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
  const q = h('button', { type: 'button', class: open ? 'help-q on' : 'help-q', 'aria-expanded': String(open), 'aria-controls': id, 'aria-label': `关于${key}`, title: '参数说明' }, '?');
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

  const { inp, out } = slider(split ? 0 : -lim, lim, valueOf(S.sector), (v) => { setValue(S.sector, v); draw(false); }, split ? camTxt : undefined, `${TAB_NAME[tab]}数值`);
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
    ? '为阴影或高光染上一种颜色，强度 0 至 10。旧固件仅支持偶数档。'
    : tab === 'hue' ? '正值让颜色沿色轮顺时针偏移。'
      : tab === 'light' ? '单独提亮或压暗所选颜色。' : '调整所选颜色的鲜艳程度。';
  const hp = helpParts('十二色色轮', [
    '独立调整 12 种颜色的饱和度、色相和明度。阴影和高光页用于分离色调。',
    help,
    '拖动色点调节，双击归零。也可用滑杆或方向键。',
    '机身前拨轮选颜色，后拨轮改数值。']);
  return h('div', { class: 'group cam' },
    h('div', { class: 'cam-head' }, h('span', { class: 'lbl' }, pmIcon('wheel'), '十二色色轮（HSL）', hp.q),
      h('button', { class: 'link', onclick: () => { if (split) { if (l.split) { const s = { ...l.split, [tab]: 0 } as Split; if (s.sh || s.hl) l.split = s; else delete l.split; } } else l[tab as 'sat'].fill(0); renderEditor(); changed(); } }, '重置本页')),
    h('div', { class: 'tabs cam-tabs', role: 'tablist' }, ...(['sat', 'hue', 'light', 'sh', 'hl'] as Tab[]).map((t) => h('button', {
      role: 'tab', 'aria-selected': String(t === tab), class: t === tab ? 'on' : '',
      onclick: () => { S.tab = t; renderEditor(); },
    }, TAB_NAME[t], tabHas(t) ? h('span', { class: 'dot' }) : null))),
    hp.box,
    split && !om3Fw25() ? h('p', { class: 'warn' }, h('b', {}, '分离色调需要固件 v0.26 或更高版本。')) : null,
    split && om3Fw25() && !om3Fw28() && cur() % 2 ? h('p', { class: 'warn' }, h('b', {}, '所选固件仅支持偶数档。'), `${cur()} 档将按 ${cur() + 1} 档预览和导出。`) : null,
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
  const hp = helpParts('高光与阴影', [
    '高光、中间调、阴影均可在 −7 至 +7 调节。正值提亮对应区域。',
    '上下拖动控制点，双击归零。曲线两端跟随黑白位。',
    '对应机身的高光与阴影控制。']);
  return h('div', { class: 'group cam' },
    h('div', { class: 'cam-head' }, h('span', { class: 'lbl' }, '高光与阴影', hp.q),
      hsm() ? h('button', { class: 'link', onclick: () => { for (const k of ['shadows', 'midtones', 'highlights'] as const) l.tone[k] = 0; renderEditor(); changed(); } }, '重置') : null),
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
  const svg = svgEl('svg', { viewBox: `0 0 ${S0} ${S0}`, width: S0, height: S0, class: 'tone-curve rgb-curve cam-screen', role: 'img', 'aria-label': '红绿蓝三通道曲线' });
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
  const chips = h('div', { class: 'seg rgb-ch', role: 'radiogroup', 'aria-label': '曲线颜色' });
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
      role: 'radio', 'aria-checked': String(c === ch()), class: `rc-chip rc-${c}${c === ch() ? ' on' : ''}`, title: `${RGB_NAME[c]}曲线${l.rgb && l.rgb[c].some((x) => x) ? '（已修改）' : ''}`,
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
  const hp = helpParts('RGB 曲线', [
    '红、绿、蓝各有五个控制点。提高数值会在对应的亮度范围加入该颜色。',
    '选通道后拖动控制点或滑杆，双击单点归零。',
    fwLine('固件 v0.30', '随 CURVES.BIN 导入机身。'),
    '机身用 INFO 换通道，前拨轮选点，后拨轮调数值。']);
  return h('div', { class: 'group cam' },
    h('div', { class: 'cam-head' }, h('span', { class: 'lbl' }, pmIcon('rgb'), 'RGB 曲线', hp.q),
      hasCurves(l) ? h('button', { class: 'link', onclick: () => { delete l.rgb; renderEditor(); changed(); } }, '重置') : null),
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
  const svg = svgEl('svg', { viewBox: `0 0 ${S0} ${S0}`, width: 200, height: 200, class: 'mix-ring cam-screen', role: 'img', 'aria-label': '色彩混合示意图' });
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
  const chips = h('div', { class: 'seg rgb-ch', role: 'radiogroup', 'aria-label': '混色通道' });
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
  const hp = helpParts('色彩混合', [
    '调整红、绿、蓝原色的色相与饱和度。灰色保持中性。',
    '选通道后拖动色点，或用两个滑杆调节。',
    fwLine('固件 v0.30', '随 CURVES.BIN 导入机身。'),
    '机身用 INFO 换通道，前拨轮调色相，后拨轮调饱和度。']);
  return h('div', { class: 'group cam' },
    h('div', { class: 'cam-head' }, h('span', { class: 'lbl' }, pmIcon('mix'), '色彩混合', hp.q),
      hasMix(l) ? h('button', { class: 'link', onclick: () => { delete l.mix; renderEditor(); changed(); } }, '重置') : null),
    hp.box,
    chips,
    h('div', { class: 'cam-screen-wrap' }, top, svg), rowsBox);
}

/** Blacks / Whites (v0.28, as the camera's grid row): Blacks across (− left, + right), Whites up (+) and down (−),
 *  −7..+7 each. Black boxes and edges for Blacks, white ones for Whites, as on the camera. */
function bwPanel(l: Look, changed: () => void): HTMLElement {
  const N = OM3.bw, CELL = 12, PAD = 34, BOX = CELL * (2 * N + 1), SZ = PAD * 2 + BOX;
  const svg = svgEl('svg', { viewBox: `0 0 ${SZ} ${SZ}`, class: 'wb-grid bw-grid cam-screen', role: 'slider', tabindex: 0, 'aria-label': '左右调黑位，上下调白位' });
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
    svg.setAttribute('aria-valuetext', `黑位 ${sg(b)}，白位 ${sg(w)}`);
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
  const hp = helpParts('黑白位', [
    '黑位控制最暗区域，白位控制最亮区域。正值提亮，负值压暗。',
    '拖动十字或用方向键。按 0 或删除键归零。',
    fwLine('固件 v0.28', '该版本起支持。'),
    '对应机身的黑白位网格。']);
  return h('div', { class: 'group cam' },
    h('div', { class: 'cam-head' }, h('span', { class: 'lbl' }, pmIcon('bw'), '黑白位', hp.q), read,
      h('button', { class: 'link', onclick: () => { set(0, 0); checkpoint(); } }, '重置')),
    hp.box,
    svg,
    big ? needs28('超出 ±5 的黑白位') : null);
}

/** WB: the camera's fine-tune grid, A–B across and G–M up and down (−7..+7). Click a square, or use the arrow keys. */
function wbPanel(l: Look, changed: () => void): HTMLElement {
  // As the camera's WB fine-tune screen: a square with a coloured edge per direction (G up, M down, B left, A right),
  // the four letters in small boxes outside it, and a cross-hair marker; −7..+7 each way.
  const N = OM3.wb, CELL = 12, PAD = 34, BOX = CELL * (2 * N + 1), SZ = PAD * 2 + BOX;
  const svg = svgEl('svg', { viewBox: `0 0 ${SZ} ${SZ}`, class: 'wb-grid cam-screen', role: 'slider', tabindex: 0, 'aria-label': '左右调琥珀蓝轴，上下调绿品红轴' });
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
  const hp = helpParts('白平衡偏移', [
    '横向调暖黄与蓝，纵向调绿与品红。',
    '拖动十字或用方向键。按 0 或删除键归零。',
    fwLine('固件 v0.26.1', '该版本起支持。'),
    '对应机身的白平衡偏移网格。']);
  return h('div', { class: 'group cam' },
    h('div', { class: 'cam-head' }, h('span', { class: 'lbl' }, '白平衡偏移', hp.q), read,
      h('button', { class: 'link', onclick: () => { set(0, 0); checkpoint(); } }, '重置')),
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
const WB_ONE_TOUCH: [FilmWb['mode'], string][] = [['one_touch_1', '一键白平衡 1'], ['one_touch_2', '一键白平衡 2'], ['one_touch_3', '一键白平衡 3'], ['one_touch_4', '一键白平衡 4']];
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
      '选用此胶卷时，机身会应用设定的白平衡模式。',
      '选择「自定义色温」后可调整色温。',
      '预览以日光 5300 K 为基准。',
      fwLine('固件 v0.28', '该版本起支持。')]),
    kIn ? h('div', { class: 'crow' }, h('span', { class: 'cname' }, '色温（K）'), kIn, kOut) : null,
    mode !== 'auto' ? needs28('白平衡模式') : null,
    mode !== 'auto' && odd ? h('p', { class: 'help' }, '预览不模拟水下光照或自行测量的白平衡。') : null);
}

/** The firmware chosen under Export › Firmware on the camera (v0.28 or later by default, from the v0.28 release). Settings a firmware can't
 *  take are left out of the preview as they are left out of its LOOKS.BIN: split toning before v0.26; Halation, Tone
 *  Balance, the film's WB mode and Blacks / Whites past ±5 before v0.28 (split toning then in whole v0.26 steps). */
// Export targets describe actual firmware families. The numeric format level
// still drives the compatible LOOKS.BIN fields and the preview.
const exportTargets = [
  { id: 'nostalgia-sunlit', name: 'Nostalgia-OM · 按卷 Sunlit', fw: 28, labels: true, curves: true },
  { id: 'nostalgia-effects', name: 'Nostalgia-OM · 胶卷效果实验版', fw: 28, labels: true, curves: true },
  { id: 'nostalgia', name: 'Nostalgia-OM v0.1.1', fw: 28, labels: true, curves: true },
  { id: 'caduceus-40', name: 'v0.40.2 / v0.40 系列', fw: 28, curves: true },
  { id: 'caduceus-30', name: 'v0.30–v0.39', fw: 28, curves: true },
  { id: '28', name: 'v0.28–v0.29', fw: 28 },
  { id: '26', name: 'v0.26.1–v0.27.1', fw: 26 },
  { id: '25', name: 'v0.26', fw: 25 },
  { id: '24', name: 'v0.25', fw: 24 },
  { id: '23', name: 'v0.24.1', fw: 23 },
  { id: '22', name: 'v0.22–v0.24', fw: 22 },
  { id: '21', name: 'v0.21', fw: 21 },
  { id: '20', name: 'v0.19–v0.20', fw: 20 },
  { id: 'profiles', name: 'v0.17–v0.18（PROFILES.BIN）', fw: 20 },
] satisfies { id: string; name: string; fw: Fw; labels?: boolean; curves?: boolean }[];
function savedExportTarget() {
  try {
    const selected = localStorage.getItem('caduceus.om3.export-target');
    const old = localStorage.getItem('caduceus.om3.fw');
    return exportTargets.find(t => t.id === selected || (!selected && old !== '28' && t.id === old)) ?? exportTargets[0];
  } catch { return exportTargets[0]; }
}
let exportTarget = savedExportTarget();
const fwSetting = (): Fw => exportTarget.fw;
const om3Fw25 = () => fwSetting() >= 25;
const om3Fw28 = () => fwSetting() >= 28;
function supportedEffects(look: Look): Look['filmEffects'] {
  if (exportTarget.id === 'nostalgia-sunlit') return look.filmEffects;
  if (exportTarget.id === 'nostalgia-effects') return look.filmEffects?.filter(effect => effect !== 'sunlit');
  return undefined;
}
function splitPv(l: Look): Look {
  if (l.filmEffects) l = { ...l, filmEffects: supportedEffects(l) };
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
const needs28 = (what: string) => (om3Fw28() ? null : h('p', { class: 'warn' }, h('b', {}, '所选固件版本较早。'), `${what}需要 v0.28 或更高版本。`));

function refreshProblems() {
  const el = document.getElementById('problems');
  const probs = validateBank(O.bank), at = looseRoll ? -1 : O.k * PER + O.v;
  if (el) { const mine = probs.filter((p) => p.look === at); el.replaceChildren(...(mine.length ? [h('ul', { class: 'problems' }, ...mine.map((p) => h('li', {}, p.message)))] : [])); }
  const bad = new Set(probs.map((p) => p.look));
  document.querySelectorAll('#list li.look').forEach((li) => li.classList.toggle('bad', bad.has(Number((li as HTMLElement).dataset.at))));
}

// ---------------------------------------------------------------- preview
let srcData: ImageData | null = null;
type PreviewPhoto = HTMLImageElement | HTMLCanvasElement;
interface GalleryPhoto { id: string; label: string; key?: number; url?: string; thumbnail?: string }
const gallery: GalleryPhoto[] = [...OM3_SAMPLES];
let importSerial = 0;
const GALLERY_SELECTION = 'caduceus.om3.preview-selection';
function importedItem(photo: ImportedPhoto, key: number): GalleryPhoto {
  return { id: `import-${key}`, key, label: photo.file.name, url: URL.createObjectURL(photo.file), thumbnail: photo.thumbnail };
}

async function restoreGallery() {
  try {
    const stored = await loadGallery();
    gallery.splice(0, gallery.length, ...OM3_SAMPLES.filter(item => !stored.hidden.has(item.id)),
      ...stored.imports.map(photo => importedItem(photo, photo.key)));
  } catch { toast('无法读取本地预览图库', 'err'); }
  let last: string | null = null;
  try { last = localStorage.getItem(GALLERY_SELECTION); } catch { /* selection storage unavailable */ }
  const selected = gallery.find(item => item.id === last) ?? gallery.find(item => item.id === S.image) ?? gallery[0];
  renderGallery();
  pickImage(selected?.id ?? '');
  $<HTMLButtonElement>('#import-photos').disabled = false;
}

function renderGallery() {
  $('#preview .thumbs').replaceChildren(...gallery.map(photo => {
    const selected = photo.id === S.image;
    return h('button', { class: `thumb${selected ? ' on' : ''}`, 'data-id': photo.id,
      'aria-pressed': String(selected), title: photo.label, onclick: () => pickImage(photo.id) },
      h('img', { src: photo.thumbnail ?? sampleUrl(photo.id), alt: photo.label, loading: 'lazy' }));
  }));
  $<HTMLButtonElement>('#remove-photo').disabled = !gallery.length;
}

async function removeSelectedPhoto() {
  const target = gallery.find(photo => photo.id === S.image);
  if (!target) return;
  try { await storeRemoval(target.id, target.key); }
  catch { toast('移除失败，本地图库未更新', 'err'); return; }
  const index = gallery.indexOf(target);
  if (index < 0) return;
  const [removed] = gallery.splice(index, 1);
  if (removed.url) URL.revokeObjectURL(removed.url);
  if (removed.id === S.image) {
    photoSource = renderedSource = srcData = beforeOf = null;
    canvas.width = beforeCv.width = 0;
    const next = gallery[Math.min(index, gallery.length - 1)];
    pickImage(next?.id ?? '');
  }
  renderGallery();
}

let photoSource: PreviewPhoto | null = null;
let detailPreview = false;
let renderedSource: PreviewPhoto | null = null;
let renderedSize = 0;
let canvas: HTMLCanvasElement;
let beforeCv: HTMLCanvasElement;
let beforeOf: ImageData | null = null;
let previewQueued = false;

function buildPreview() {
  canvas = h('canvas', { class: 'pv', 'aria-label': '当前胶片的模拟预览' });
  const thumbs = h('div', { class: 'thumbs' });
  // before / after: the untouched photo on its own canvas, clipped at a line you drag on the photo (or arrow keys)
  beforeCv = h('canvas', { class: 'before', 'aria-hidden': 'true' }); beforeOf = null;
  const divider = h('div', { class: 'divider', role: 'slider', tabindex: '0', 'aria-label': '原图与调色预览分界线', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    h('span', { class: 'knob', 'aria-hidden': 'true' }, '‹ ›'));
  const frame = h('div', { class: 'pv-frame' }, canvas, beforeCv, divider);
  const setCut = (v: number) => {
    S.cut = Math.max(0, Math.min(100, v)); frame.style.setProperty('--cut', `${S.cut}%`);
    divider.setAttribute('aria-valuenow', String(Math.round(S.cut))); divider.setAttribute('aria-valuetext', `原图 ${Math.round(S.cut)}%`);
  };
  let dragging = false;
  const at = (e: PointerEvent) => { const r = frame.getBoundingClientRect(); setCut(((e.clientX - r.left) / r.width) * 100); };
  frame.addEventListener('pointerdown', (e) => {
    const preview = $('#preview');
    if (e.button !== 0 || (preview.dataset.view && preview.dataset.view !== 'split') ||
        (preview.dataset.zoom === 'true' && !divider.contains(e.target as Node))) return;
    dragging = true; frame.setPointerCapture(e.pointerId); at(e); e.preventDefault();
  });
  frame.addEventListener('pointermove', (e) => { if (dragging) at(e); });
  frame.addEventListener('pointerup', () => { dragging = false; }); frame.addEventListener('pointercancel', () => { dragging = false; });
  frame.addEventListener('lostpointercapture', () => { dragging = false; });
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
    h('div', { class: 'pv-wrap' }, h('div', {class: 'pv-viewport', 'aria-label': '照片预览'}, frame), h('span', { class: 'badge' }, '原图'), h('span', { class: 'badge r' }, '调色预览')),
    thumbs,
    h('div', { class: 'pv-opts' },
      h('label', { class: 'aspect' },
        '画幅比例 ',
        h('select', { onchange: (e: Event) => { S.aspect = (e.target as HTMLSelectElement).value; try { localStorage.setItem('caduceus.om3.aspect', S.aspect); } catch { /* storage blocked */ } schedulePreview(); } },
          ...ASPECTS.map((a) => h('option', { value: a.id, selected: a.id === S.aspect }, a.label))), aspectHelp.q),
      h('div', { class: 'photo-actions' },
        h('button', { class: 'link', id: 'import-photos', disabled: true, onclick: () => $<HTMLInputElement>('#photo').click() }, '＋ 导入图片'),
        h('button', { class: 'link', id: 'remove-photo', disabled: true, onclick: removeSelectedPhoto }, '移除当前照片'))),
    aspectHelp.box);
  void restoreGallery();
}

let photoRequest = 0;
async function pickImage(id: string) {
  const request = ++photoRequest;
  S.image = id;
  try { localStorage.setItem(GALLERY_SELECTION, id); } catch { /* selection storage unavailable */ }
  document.querySelectorAll<HTMLElement>('.thumb').forEach(t => {
    t.classList.toggle('on', t.dataset.id === id);
    t.setAttribute('aria-pressed', String(t.dataset.id === id));
  });
  const photo = gallery.find(item => item.id === id);
  if (!photo) {
    view.photoChanged?.('暂无预览照片');
    return;
  }
  try {
    const img = new Image();
    img.src = photo.url ?? sampleUrl(id);
    await img.decode();
    if (request !== photoRequest) return;
    showPreviewPhoto(img, photo.url ? photo.label : id + '.jpg');
  } catch { if (request === photoRequest) toast('无法加载样片', 'err'); }
}

function updatePreviewResolution() {
  if (!photoSource) return;
  const max = detailPreview ? 2048 : previewPx();
  if (photoSource !== renderedSource || max !== renderedSize) {
    const width = photoSource instanceof HTMLImageElement ? photoSource.naturalWidth : photoSource.width;
    const height = photoSource instanceof HTMLImageElement ? photoSource.naturalHeight : photoSource.height;
    srcData = toImageData(photoSource, width, height, max);
    renderedSource = photoSource;
    renderedSize = max;
  }
  schedulePreview();
}

function showPreviewPhoto(photo: PreviewPhoto, name: string) {
  photoSource = photo;
  detailPreview = false;
  updatePreviewResolution();
  if (srcData) view.photoChanged?.(name);
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
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (!files.length) return;
  const serial = ++importSerial;
  const selection = photoRequest;
  const decoded: ImportedPhoto[] = [];
  const failed: string[] = [];
  for (const file of files) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const scale = Math.min(1, 180 / Math.max(image.naturalWidth, image.naturalHeight));
      const thumb = h('canvas', { width: Math.max(1, Math.round(image.naturalWidth * scale)),
        height: Math.max(1, Math.round(image.naturalHeight * scale)) });
      thumb.getContext('2d')!.drawImage(image, 0, 0, thumb.width, thumb.height);
      decoded.push({ file, thumbnail: thumb.toDataURL() });
    } catch {
      failed.push(file.name);
    } finally { URL.revokeObjectURL(url); }
  }
  if (decoded.length) {
    let keys: number[];
    try { keys = await storePhotos(decoded); }
    catch { toast('照片未导入：无法写入本地图库，请检查浏览器存储空间和权限', 'err'); return; }
    const added = decoded.map((photo, index) => importedItem(photo, keys[index]));
    gallery.push(...added);
    if (!S.image || (serial === importSerial && selection === photoRequest)) pickImage(added[0].id);
    renderGallery();
    $('#preview .thumb.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  if (failed.length) toast(`无法读取：${failed.join('、')}`, 'err');
}

/** The photo frame: the photo's shape, as wide as the pane allows but no taller than 70% of the window. */
function sizeFrame(w: number, h: number) {
  const frame = canvas.parentElement as HTMLElement | null;
  if (!frame) return;
  frame.style.aspectRatio = `${w} / ${h}`;
  frame.style.setProperty('--ratio', String(w / h));
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

const rrName = (n: string) => n.replace(/[^\p{L}\p{N}_.-]+/gu, '-').replace(/^-+|-+$/g, '') || 'look';
// ---------------------------------------------------------------- OM-3 (Caduceus for OM-3)
// The OM-3 has no look list: each of COLOR 1-4 holds five numbered looks (the camera's Film page, dial 1-5).
const OB_PREFIX = 'ob1_', OP_PREFIX = 'op1_';
const at = (k: number, v: number) => `FILM ${k * PER + v + 1}`;   // owner 2026-11-08: one list, FILM 1-20 (COLOR k = (n - 1) / 5 on the card)

function newBank(kind: 'library' | 'empty') {
  if (!confirm(kind === 'library' ? '恢复默认的 20 款胶片及其顺序？当前胶片将被替换，可撤销。'
    : '清空所有 20 个位置？清空后可撤销。')) return;
  O.bank = kind === 'library' ? defaultBank(LIBRARY, fromLibrary) : emptyBank();
  selectSlot(0, 0);
  save(); renderAll();
  toast(kind === 'library' ? 'Reset to the 20 films (FILM 1–20)' : 'All films emptied');
}

let bankDrag: [number, number] | null = null;
function swapSlots(a: [number, number], b: [number, number]) {
  if (a[0] === b[0] && a[1] === b[1]) return;
  const t = O.bank[a[0]][a[1]];
  O.bank[a[0]][a[1]] = O.bank[b[0]][b[1]];
  O.bank[b[0]][b[1]] = t;
  selectSlot(...b);
  save(); renderAll(); focusSel();
}
function clearSlot(k: number, v: number) {
  const l = O.bank[k][v];
  if (!l) return;
  O.bank[k][v] = null;
  selectSlot(k, v);
  save(); renderAll();
  toast(`Removed "${l.name}" from ${at(k, v)} (Undo brings it back)`);
}
function openBox(name: string) {
  LISTS.current = O.name = name;
  O.bank = LISTS.lists[name];
  selectSlot(0, 0);
}
function boxActions(): HTMLElement {
  function create(copy: boolean) {
    nameDialog(copy ? '另存为胶片盒预设' : '创建空胶片盒', '', '创建', name => {
      LISTS.lists[name] = copy ? O.bank.map(row => row.slice()) : emptyBank();
      openBox(name); save(); renderAll();
    });
  }
  const icon = (glyph: string, label: string, onclick: () => void, disabled = false) =>
    h('button', { class: 'symbol-button', 'aria-label': label, title: label, onclick, disabled }, glyph);
  return h('div', { class: 'box-actions' },
    icon('＋', '创建空胶片盒', () => create(false)),
    icon('⧉', '另存为胶片盒预设', () => create(true)),
    icon('✎', '重命名胶片盒', () => nameDialog('重命名胶片盒', LISTS.current, '保存', name => {
      delete LISTS.lists[LISTS.current]; LISTS.current = O.name = name;
      save(); renderAll();
    })),
    icon('⌫', '删除胶片盒', () => {
      if (!confirm('删除胶片盒「' + LISTS.current + '」？其中的胶卷会保留在库中。')) return;
      delete LISTS.lists[LISTS.current]; openBox(listNames()[0]); save(); renderAll();
    }, listNames().length < 2));
}
function switchList(name: string) {
  openBox(name);
  hist.reset(snapshot()); undoUi(); persist(); renderAll();
}
function renderBoxSelector() {
  const select = document.querySelector<HTMLSelectElement>('#box-select');
  if (!select) return;
  select.replaceChildren(...listNames().map(name => h('option', {value: name, selected: name === LISTS.current}, name)));
  select.onchange = () => switchList(select.value);
  $('#box-count').textContent = O.bank.flat().filter(Boolean).length + ' / ' + COLORS * PER;
  $('#bank-title').textContent = LISTS.current;
}

function selectRoll(look: Look) {
  const slot = O.bank.flat().indexOf(look);
  if (slot < 0) looseRoll = look;
  else selectSlot(Math.floor(slot / PER), slot % PER);
  renderAll();
}

function newRoll() {
  const input = h('input', { maxlength: OM3_NAME_MAX, 'aria-label': '胶卷名称', value: 'My Film' });
  const help = h('p', {class: 'help'}, '机身名称最多 15 个英文字符。创建后可在右侧编辑中文盒签和描述。');
  const submit = () => {
    const name = input.value.trim();
    const issue = om3NameProblem(name);
    if (!name || issue) { help.textContent = issue || '请输入胶卷名称。'; return; }
    const look = blankProfile(name);
    cabinet.register(look); looseRoll = look;
    dlg.close(); save(); renderAll();
  };
  const dlg = modal('新增胶卷', h('div', {class: 'name-dlg'}, input, help),
    [h('button', {onclick: () => dlg.close()}, '取消'), h('button', {class: 'primary', onclick: submit}, '创建')]);
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  input.select();
}

function togglePlacement(look: Look) {
  const slots = O.bank.flat();
  const slot = slots.indexOf(null);
  if (slot < 0) { toast('胶片盒的 20 个位置已满，请先取出一卷。', 'err'); return; }
  const keepSelected = cur() === look || !cur();
  O.bank[Math.floor(slot / PER)][slot % PER] = look;
  if (keepSelected) selectSlot(Math.floor(slot / PER), slot % PER);
  save(); renderAll();
}

function takeOutRoll(look: Look, slot: number) {
  O.bank[Math.floor(slot / PER)][slot % PER] = null;
  if (cur() === look && O.k * PER + O.v === slot) looseRoll = look;
  save(); renderAll();
}

function deleteRoll() {
  const look = cur();
  if (!look) return;
  const used = Object.values(LISTS.lists).filter(box => box.some(row => row.includes(look))).length;
  if (!confirm('从胶卷库删除「' + look.name + '」？' + (used ? '同时从 ' + used + ' 个胶片盒中取出。' : '') + '可以撤销。')) return;
  for (const box of Object.values(LISTS.lists)) for (const row of box) {
    row.forEach((item, i) => { if (item === look) row[i] = null; });
  }
  cabinet.rolls.delete(look);
  looseRoll = undefined;
  save(); renderAll();
}

let shelfSignature = '';
function renderShelf() {
  const shelf = document.getElementById('roll-shelf');
  if (!shelf) return;
  const slots = O.bank.flat();
  const selected = cur();
  const rows = [...cabinet.rolls].map(([look, id]) => ({look, id, slot: slots.indexOf(look)}));
  const selectedSlot = looseRoll ? -1 : O.k * PER + O.v;
  const signature = JSON.stringify([
    rows.map(({look, id}) => [id, look.name, look.boxLabel, look === selected]),
    slots.map(look => look && cabinet.rolls.get(look)), selectedSlot,
  ]);
  if (signature === shelfSignature) return;
  shelfSignature = signature;
  $('#roll-count').textContent = String(rows.length).padStart(2, '0');
  ($<HTMLButtonElement>('#delete-roll')).disabled = !selected;
  const used = slots.filter(Boolean).length;
  $('#current-roll-count').textContent = `${used} / ${slots.length}`;
  const pick = (look: Look, detail: string, active: boolean, onclick: () => void) => {
    const mark = drawRollLabel(look, 96);
    mark.setAttribute('aria-hidden', 'true');
    return h('button', {class: 'roll-pick', 'aria-pressed': String(active), onclick}, mark,
      h('span', {class: 'roll-copy'}, h('b', {}, look.name || '未命名'), detail ? h('small', {}, detail) : null));
  };
  shelf.replaceChildren(...rows.map(({look, slot}) =>
    h('div', {class: 'roll-row'},
      pick(look, slot >= 0 ? '已装入当前盒' : look.boxLabel?.caption || '', look === selected, () => selectRoll(look)),
      h('button', {class: 'roll-place', disabled: slot >= 0 || used === slots.length,
        'aria-label': '装入 ' + look.name, title: slot >= 0 ? '已装入当前盒' : used === slots.length ? '当前盒已满' : '装入当前盒',
        onclick: () => togglePlacement(look)}, '＋'))));
  if (!rows.length) shelf.append(h('p', {class: 'help'}, '胶卷库为空，点击「新增」创建第一卷。'));
  $('#current-rolls').replaceChildren(...slots.flatMap((look, slot) => look ?
    [h('div', {class: 'roll-row'},
      pick(look, look.boxLabel?.caption || '', slot === selectedSlot, () => {
        selectSlot(Math.floor(slot / PER), slot % PER); renderAll();
      }),
      h('button', {class: 'roll-place', 'aria-label': '取出 ' + look.name, title: '从当前盒取出',
        onclick: () => takeOutRoll(look, slot)}, '−'))] : []));
}

function nameDialog(title: string, value: string, ok: string, done: (name: string) => void) {
  const help = h('p', { class: 'help' }, `最多 ${LIST_NAME_MAX} 个字符。`);
  const input = h('input', { type: 'text', value, maxlength: LIST_NAME_MAX, 'aria-label': 'List name', autocomplete: 'off' });
  const problem = (n: string) => (!n ? '请输入名称。' : n !== value && Object.hasOwn(LISTS.lists, n) ? `已有名为「${n}」的胶片盒。` : null);
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
    selectSlot(k, v);
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
  const scrollTop = el.closest('dialog')?.scrollTop;
  const bad = new Set(validateBank(O.bank).map((p) => p.look));
  const used = O.bank.flat().filter(Boolean).length;
  // owner 2026-11-08: one list FILM 1-20, as on the camera (FILM n = COLOR (n - 1) / 5 + 1, look (n - 1) % 5 + 1 in LOOKS.BIN)
  const N = COLORS * PER, slot = (n: number): [number, number] => [Math.floor(n / PER), n % PER];
  const films = h('ol', { class: 'looks bank' }, ...O.bank.flatMap((row, k) => row.map((l, v) => {
      const n = k * PER + v;
      const sel = !looseRoll && k === O.k && v === O.v;
      const li = h('li', {
        class: `look${sel ? ' sel' : ''}${l ? '' : ' empty-slot'}${bad.has(k * PER + v) ? ' bad' : ''}`, 'data-at': k * PER + v,
        draggable: l ? 'true' : 'false', tabindex: 0,
        onclick: () => { selectSlot(k, v); renderAll(); },
        onkeydown: (e: KeyboardEvent) => {
          const go = (m: number) => { if (m >= 0 && m < COLORS * PER) { selectSlot(Math.floor(m / PER), m % PER); renderAll(); focusSel(); } };
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
      l ? drawRollLabel(l, 72) : h('span'),
      h('span', { class: 'idx' }, String(n + 1)),
      h('span', { class: 'nm' }, l ? l.name || '（未命名）' : '空位'),
      h('span', { class: 'row-btns' },
        h('button', { class: 'icon', title: '上移（Alt+↑）', 'aria-label': '上移', disabled: n === 0, onclick: (e: Event) => { e.stopPropagation(); swapSlots([k, v], slot(n - 1)); } }, '↑'),
        h('button', { class: 'icon', title: '下移（Alt+↓）', 'aria-label': '下移', disabled: n === N - 1, onclick: (e: Event) => { e.stopPropagation(); swapSlots([k, v], slot(n + 1)); } }, '↓'),
        h('button', { class: 'icon danger', title: '移除胶片，保留空位', 'aria-label': '移除', disabled: !l, onclick: (e: Event) => { e.stopPropagation(); clearSlot(k, v); } }, '×')));
      return li;
    })));
  el.replaceChildren(
    boxActions(),
    h('div', { class: 'list-head' }, h('span', {}, '装盒顺序'), h('span', { class: 'count' }, `${used} / ${N}`)),
    films);
  const dialog = el.closest('dialog');
  if (dialog && scrollTop) dialog.scrollTop = scrollTop;
}

/** The editor for a number with no look: make one. */
function emptySlotPanel(): HTMLElement {
  const k = O.k, v = O.v;
  return h('div', { class: 'empty-slot-panel' },
    h('h3', {}, `${at(k, v)} · 空位`),
    h('div', { class: 'pick-row' },
      h('button', { class: 'primary', onclick: newFilm }, '空白配方'),
      h('button', { onclick: () => om3FilmPicker({ k, v }) }, '从胶片模拟中选择…'),
      h('button', { onclick: om3LibraryPicker }, '从内置配方库选择…'),
      h('button', { onclick: pasteDialog }, '粘贴链接…')));
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
    O.bank[t.k][t.v] = filmLook(f); selectSlot(t.k, t.v); into = undefined;
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

const boxPalettes = [
  { name: '琥珀', paper: '#edb64c', accent: '#403b39', ink: '#332b26' },
  { name: '金黄红', paper: '#f7c331', accent: '#bd3032', ink: '#332a1f' },
  { name: '银灰黑', paper: '#dedfd9', accent: '#353c37', ink: '#18201c' },
  { name: '钨丝蓝', paper: '#d5e4ea', accent: '#eb7643', ink: '#192e48' },
  { name: '森林', paper: '#e3e6c7', accent: '#315b46', ink: '#233d31' },
  { name: '夜蓝', paper: '#c0d1dc', accent: '#254766', ink: '#152b3f' },
  { name: '朱砂', paper: '#f4d9b0', accent: '#a8372e', ink: '#6b2922' },
] as const;
const boxColorFields = [['paper', '底色'], ['accent', '色带'], ['ink', '上方字色与线条']] as const;

function defaultLabelTitle(name: string) {
  const speed = name.match(/^(.*?)\s+(\d{2,4}[A-Za-z]?)$/);
  if (name.length > 8 && speed) {
    return speed[1].replace(/\s+/g, '').slice(0, 8 - speed[2].length) + speed[2];
  }
  return [...name].slice(0, 8).join('');
}

function editStockLabel() {
  const look = cur();
  if (!look) return;

  const { paper, accent, ink } = boxPalettes[0];
  const label: BoxLabel = look.boxLabel ? { ...look.boxLabel } : {
    style: 0, paper, accent, ink, title: defaultLabelTitle(look.name), caption: '',
  };
  let custom = Boolean(look.boxLabel);
  let cameraPreview = false;
  const name = h('input', { type: 'text', value: look.name, maxlength: OM3_NAME_MAX, spellcheck: 'false', autocomplete: 'off' });
  const notes = h('textarea', { rows: 3, maxlength: 400, placeholder: '记录适合的场景或调色思路' }, look.notes);
  const field = (title: string, input: HTMLElement, detail?: HTMLElement) =>
    h('label', { class: 'box-field' }, h('span', { class: 'box-field-title' }, title, detail), input);
  const title = h('input', { type: 'text', value: label.title, maxlength: 8, spellcheck: 'false' });
  const caption = h('input', { type: 'text', value: label.caption, maxlength: 10 });
  const titleLength = h('small', { class: 'box-length' });
  const captionLength = h('small', { class: 'box-length' });
  const notesLength = h('small', { class: 'box-length' });
  const previewArt = h('canvas', { 'aria-hidden': 'true' });
  const preview = h('div', { class: 'box-preview-art' }, previewArt);
  const previewName = h('p', { class: 'box-preview-name' });
  const previewCaption = h('p', { class: 'box-preview-caption' });
  const previewModes = ['画稿', '机内效果'].map((mode, index) =>
    h('button', { type: 'button', onclick: () => { cameraPreview = index === 1; redrawPreview(); } }, mode));
  const previewSwitch = h('div', { class: 'box-preview-switch', role: 'group', 'aria-label': '盒签预览模式' }, ...previewModes);
  const error = h('p', { class: 'err box-error', role: 'alert', hidden: true });

  const colors = boxColorFields.map(([key, text]) => {
    const picker = h('input', { type: 'color', value: label[key], oninput: () => {
      label[key] = picker.value; redraw();
    }});
    const hit = h('button', {
      class: 'box-hit box-hit-' + key, type: 'button', title: '调整' + text, 'aria-label': '从预览调整' + text,
      onclick: () => picker.click(),
    });
    return { key, text, picker, hit };
  });
  preview.append(...colors.map(({hit}) => hit));
  const choice = [-1, ...styles.keys()].map(i => {
    const tile = h('span', { class: 'box-choice-art', 'aria-hidden': 'true' });
    const button = h('button', {
      class: 'box-choice', type: 'button', onclick: () => {
        custom = i >= 0;
        if (custom) label.style = i;
        redraw();
      },
    }, tile, h('span', {}, i < 0 ? '机身默认' : styles[i]));
    return { i, tile, button };
  });
  const swatches = boxPalettes.map(palette => {
    const selected = () => boxColorFields.every(([key]) => label[key] === palette[key]);
    const button = h('button', {
      class: 'box-palette', type: 'button', title: palette.name, 'aria-label': palette.name, onclick: () => {
        for (const {key, picker} of colors) { label[key] = palette[key]; picker.value = palette[key]; }
        redraw();
      },
    }, h('span', { style: 'background:' + palette.paper }), h('span', { style: 'background:' + palette.accent }));
    return { button, selected };
  });
  const customFields = h('fieldset', { class: 'box-custom', 'aria-label': '自定义盒签' },
    h('div', { class: 'box-colors', role: 'group', 'aria-label': '逐项选色' },
      ...colors.map(({text, picker}) => field(text, picker))),
    h('div', { class: 'box-palettes', role: 'group', 'aria-label': '预设配色' },
      ...swatches.map(({button}) => button)),
    h('div', { class: 'box-label-copy' },
      field('盒签字标', title, titleLength), field('机身短句', caption, captionLength)));
  const body = h('div', { class: 'box-editor' },
    h('aside', { class: 'box-preview', 'aria-label': '盒签预览' },
      previewSwitch, preview, previewName, previewCaption),
    h('div', { class: 'box-fields' },
      h('div', { class: 'box-choices', role: 'group', 'aria-label': '盒签版式' }, ...choice.map(({button}) => button)),
      customFields,
      h('div', { class: 'box-metadata' }, field('胶卷名称', name), field('配方备注', notes, notesLength)),
      error));

  function redrawPreview() {
    const art = drawRollLabel({ name: name.value, boxLabel: custom ? label : undefined }, cameraPreview ? undefined : 480);
    previewArt.width = art.width;
    previewArt.height = art.height;
    previewArt.classList.toggle('native-label', art.classList.contains('native-label'));
    previewArt.getContext('2d')!.drawImage(art, 0, 0);
    for (const {hit} of colors) hit.hidden = !custom;
    previewName.textContent = name.value;
    previewCaption.textContent = custom ? label.caption : '';
    previewSwitch.hidden = !custom;
    previewModes.forEach((button, index) => button.setAttribute('aria-pressed', String(cameraPreview === (index === 1))));
  }
  function redraw() {
    redrawPreview();
    for (const {i, tile, button} of choice) {
      tile.replaceChildren(drawRollLabel({
        name: name.value,
        boxLabel: i < 0 ? undefined : { ...label, style: i },
      }, 120));
      button.setAttribute('aria-pressed', String(i === (custom ? label.style : -1)));
    }
    for (const {button, selected} of swatches) button.setAttribute('aria-pressed', String(selected()));
    customFields.disabled = !custom;
    titleLength.textContent = [...label.title].length + ' / 8';
    captionLength.textContent = [...label.caption].length + ' / 10';
  }
  function countNotes() {
    notesLength.textContent = new TextEncoder().encode(notes.value).length + ' / ' + NOTE_MAX + ' 字节';
  }
  name.oninput = redraw;
  title.oninput = () => { label.title = title.value; redraw(); };
  caption.oninput = () => { label.caption = caption.value; redraw(); };
  notes.oninput = countNotes;

  const apply = h('button', { class: 'primary', onclick: () => {
    const issue = om3NameProblem(name.value) ? '胶卷名称需为 1 至 15 个英文字符，首尾不能有空格。'
      : notes.value !== look.notes && new TextEncoder().encode(notes.value).length > NOTE_MAX ? '配方备注超过 ' + NOTE_MAX + ' 字节。' : '';
    if (issue) { error.textContent = issue; error.hidden = false; return; }
    try {
      if (custom) look.boxLabel = parseLabel(label); else delete look.boxLabel;
      look.name = name.value;
      look.notes = notes.value;
    } catch {
      error.textContent = '盒签字标或机身短句含有无效字符。';
      error.hidden = false;
      return;
    }
    dialog.close();
    save(); renderAll();
  }}, '应用盒签');
  redraw(); countNotes();
  const dialog = modal('盒签与描述', body, [h('button', { onclick: () => dialog.close() }, '取消'), apply]);
  dialog.setAttribute('aria-label', '盒签与描述');
}

const editGroups = new Set<string>();
function renderOm3Editor(l: Look) {
  // v0.21: Grain with Glow / Clarity or an Art Effect takes the camera's slow route: say so next to the Grain setting
  const grainWarn = h('p', { class: 'warn', role: 'status' });
  const showWarn = () => {
    grainWarn.replaceChildren(
      ...(slowGrain(l) ? [h('b', {}, '保存用时增加。'), '同时启用颗粒、柔光或清晰度以及边框时，机身每张约多用 3 秒，且无法高速连拍。'] : []),
      ...(monoGrain(l) ? [h('b', {}, '固件 v0.24.1。'), '导出到此版本会清零暗角效果，避免与颗粒同时使用时变成黑白照片。'] : []));
    grainWarn.hidden = !slowGrain(l) && !monoGrain(l);
  };
  const fxChanged = () => { changed(); showWarn(); };
  showWarn();
  const el = $('#editor');
  const summaries: (() => void)[] = [];
  function editGroup(title: string, describe: () => string, ...content: HTMLElement[]) {
    const value = h('span', { class: 'edit-summary-value' });
    const refresh = () => { value.textContent = describe(); };
    refresh();
    summaries.push(refresh);
    const heading = h('summary', {}, h('span', {}, title), value);
    const group = h('details', { class: 'edit-group', open: editGroups.has(title) }, heading, ...content);
    heading.addEventListener('click', () => {
      if (group.open) editGroups.delete(title); else editGroups.add(title);
    });
    return group;
  }
  const changed = () => { summaries.forEach(refresh => refresh()); save(); schedulePreview(); refreshProblems(); };
  const join = (...values: (string | undefined | false)[]) => values.filter(Boolean).join(' · ');
  const channels = ['r', 'g', 'b'] as const;
  const film = filmOf(l), orig = film ? undefined : libraryOrigin(l, LIBRARY);
  el.replaceChildren(
      h('div', { class: 'ed-btns recipe-actions' },
        h('button', {
          class: 'share-btn', title: film ? `恢复 ${film.name} 的默认参数` : orig ? `恢复 ${orig.name} 的默认参数` : '将所有参数恢复为中性值',
          onclick: () => {
            const { boxLabel, notes } = l;
            const r = film ? Object.assign(filmLook(film), { name: l.name }) : toOm3(resetLook(l, LIBRARY, [])).look ?? blankProfile(l.name);
            for (const key of Object.keys(l) as (keyof Look)[]) Reflect.deleteProperty(l, key);
            Object.assign(l, r, { boxLabel, notes }); save(); renderAll();
            toast(film ? `"${r.name}" 已恢复为 ${film.name} 默认参数` : orig ? `"${r.name}" 已恢复默认参数` : `"${l.name}" 已恢复中性参数`);
          },
        }, '重置此配方'),
        h('button', { class: 'share-btn', onclick: () => om3ShareProfile(l), title: '生成这款胶片的分享链接' }, '分享')),
    h('div', { id: 'problems' }),
    h('section', { class: 'quick-adjust' }, h('h3', {}, '常用调整'), h('div', { class: 'group cam rows' },
      crow('对比度', OM3.contrast, () => l.advice.contrast ?? 0, (x) => { l.advice.contrast = x; }, changed, [
        '正值增强对比，负值让影调更柔和。范围 −2 至 +2。',
        '可用高光、阴影和黑白位进一步微调。']),
      (() => {
        const { inp, out } = slider(SHARP.lo, SHARP.hi, l.advice.sharpness ?? 0, (x) => { l.advice.sharpness = x; changed(); }, v => v <= SHARP.lo ? '关' : sharpLabel(v), '锐度');
        return withHelp(h('div', { class: 'crow' }, h('span', { class: 'cname' }, '锐度'), steps(inp), out), '锐度', [
          '正值增强细节，负值减弱锐化。调到 −5 关闭。',
          '双击归零。可放大照片查看锐化效果。',
          fwLine('固件 v0.22', '该版本起支持。')]);
      })(),
      (() => {
        const note = h('p', {});
        const show = () => {                     // after each preview: is the glow on this photo?
          const v = l.halation ?? 0, r = lastHalation;
          note.hidden = !v || (om3Fw28() && r !== 'off' && r !== 'none');
          if (!om3Fw28()) { note.className = 'warn'; note.replaceChildren(h('b', {}, '胶片光晕需要较新固件。')); }
          else if (r === 'off') { note.className = 'help'; note.replaceChildren(h('b', {}, '当前照片未显示光晕：'), '日光下光晕会减弱。可选择「夜间街道」或「蓝调时刻」观察灯光边缘。'); }
          else { note.className = 'help'; note.replaceChildren(h('b', {}, '当前照片未显示光晕：'), '画面中没有能形成光晕的明亮光源。'); }
        };
        afterPreview = show;
        const { inp, out } = slider(0, OM3.halation, l.halation ?? 0, (x) => { if (x) l.halation = x; else delete l.halation; changed(); }, (x) => (x ? `+${x}` : '0'), '胶片光晕');
        show();
        return withHelp(h('div', { class: 'crow' }, h('span', { class: 'cname' }, pmIcon('halo'), '胶片光晕'), steps(inp), out), '胶片光晕', [
          '在低光场景为明亮光源添加红橙色光晕，可用夜景样片观察。',
          '拖动滑杆或用加减按钮，双击归零。',
          fwLine('固件 v0.28', '该版本起支持。')], note);
      })())),
    editGroup('胶卷成片效果', () => l.filmEffects?.map(effect => effectNames[effect]).join(' · ') || '关闭', h('div', { class: 'group cam' }, ...filmEffects.map(effect =>
      h('label', {}, h('input', { type: 'checkbox', checked: l.filmEffects?.includes(effect),
        onchange: (event: Event) => {
          const selected = new Set(l.filmEffects);
          if ((event.target as HTMLInputElement).checked) selected.add(effect); else selected.delete(effect);
          if (selected.size) l.filmEffects = filmEffects.filter(k => selected.has(k)); else delete l.filmEffects;
          changed();
        } }), effectNames[effect] + (effect === 'trichrome' ? '（仅保存设置，机内三帧拍摄尚未接通）' : ''))))),
    editGroup('色轮与分离色调', () => {
      const sectors = l.hue.filter((v, i) => v || l.sat[i] || l.light[i]).length;
      return join(!!sectors && `${sectors} 个色区`, !!l.split?.sh && `阴影染色 ${l.split.sh}`,
        !!l.split?.hl && `高光染色 ${l.split.hl}`, !!l.tone_balance && `平衡 ${signed(l.tone_balance)}`) || '中性';
    }, hslPanel(l, changed), h('div', { class: 'group cam' },
      ...(() => {
        const note = h('p', {});
        const show = () => {
          const v = l.tone_balance ?? 0;
          note.hidden = !v || (om3Fw28() && !!l.split);
          if (!om3Fw28()) { note.className = 'warn'; note.replaceChildren(h('b', {}, '分离色调平衡需要较新固件。')); }
          else { note.className = 'help'; note.textContent = '请先在色轮的阴影或高光页设置染色。'; }
        };
        const { inp, out } = slider(-5, 5, l.tone_balance ?? 0, (x) => { if (x) l.tone_balance = x; else delete l.tone_balance; show(); changed(); }, undefined, '分离色调平衡');
        show();
        return [withHelp(h('div', { class: 'crow' }, h('span', { class: 'cname' }, pmIcon('tb'), '分离色调平衡'), steps(inp), out), '分离色调平衡', [
          '调整阴影和高光染色的交界。先在色轮中设定染色。',
          '范围 −5 至 +5，双击归零。',
          fwLine('固件 v0.28', '该版本起支持。')], note)];
      })())),
    editGroup('白平衡', () => {
      const wb = l.film_wb;
      const mode = wb?.mode === 'custom' ? `${wb.kelvin ?? KELVIN.dflt} K` :
        [...WB_MODE_NAMES, ...WB_ONE_TOUCH].find(([key]) => key === (wb?.mode ?? 'auto'))?.[1];
      return join(mode, !!l.wb?.a_b && `A/B ${signed(l.wb.a_b)}`, !!l.wb?.g_m && `G/M ${signed(l.wb.g_m)}`);
    }, wbPanel(l, changed)),
    editGroup('色调曲线与黑白位', () => {
      const { highlights, midtones, shadows, blacks, whites } = l.tone;
      return join(!!highlights && `高光 ${signed(highlights)}`, !!midtones && `中间调 ${signed(midtones)}`,
        !!shadows && `阴影 ${signed(shadows)}`, !!blacks && `黑位 ${signed(blacks)}`, !!whites && `白位 ${signed(whites)}`) || '线性';
    }, tonePanel(l, changed), bwPanel(l, changed)),
    editGroup('色彩混合', () => channels.filter((_, i) => l.mix?.[2*i] || l.mix?.[2*i+1]).map(c => RGB_NAME[c]).join(' · ') || '中性', mixPanel(l, changed)),
    editGroup('RGB 通道曲线', () => channels.filter(c => l.rgb?.[c].some(Boolean)).map(c => RGB_NAME[c]).join(' · ') || '线性', rgbPanel(l, changed)),
    editGroup('降噪与镜头效果', () => join(
      l.effect && `${l.effect.type === 'bloom' ? '柔光' : '清晰度'} ${l.effect.strength}` || undefined,
      !!l.vignette && `暗角 ${signed(l.vignette)}`, l.lens_correction && '暗角校正',
      `降噪 ${({ off: '跟随机身', film: '关', fine: '低', standard: '标准', high: '高' })[l.grain]}`), h('div', { class: 'group cam rows' },
      cseg('降噪', [['off', '跟随机身'], ['film', '关'], ['fine', '低'], ['standard', '标准'], ['high', '高']], l.grain,
        (x) => { l.grain = x as Look['grain']; renderEditor(); changed(); }, [
          '为胶卷设定机身降噪强度。高档更平滑，低档保留更多纹理。',
          '降噪在机身处理。']),
      cseg('镜头暗角校正', [['off', '关'], ['on', '开']], l.lens_correction ? 'on' : 'off', (x) => {
        if (x === 'on') l.lens_correction = true; else delete l.lens_correction;
        renderEditor(); changed();
      }, [
        '开启后，机身会补偿镜头边角的亮度下降。',
        '预览以 f/4 定焦镜头的典型暗角作示意。',
        fwLine('固件 v0.21', '该版本起支持。')]),
      crow('暗角效果', OM3.shading, () => l.vignette, (x) => { l.vignette = x; }, changed, [
        '负值压暗边缘，正值提亮边缘，中心亮度保持原样。',
        '一档即可看到明显变化。',
        '拖动滑杆或用加减按钮，双击归零。']),
      (() => {
        const e = l.effect, v = !e ? 0 : e.type === 'clarity' ? -e.strength : e.strength;
        const { inp, out } = slider(-OM3.fx, OM3.fx, v, (x) => {
          l.effect = x === 0 ? null : x > 0 ? { type: 'bloom', strength: x } : { type: 'clarity', strength: -x };
          fxChanged();
        }, (x) => (x === 0 ? '0' : x > 0 ? `+${x}` : String(x)), '柔光／清晰度');
        return withHelp(h('div', { class: 'crow' }, h('span', { class: 'cname' }, pmIcon('glow'), '柔光／清晰度'), steps(inp), out), '柔光／清晰度', [
          '正值加入柔光，负值提升局部对比度。',
          '右拉增加柔光，左拉增加清晰度，双击归零。',
          fwLine('固件 v0.20', '该版本起支持。')]);
      })())),
    editGroup('颗粒与边框', () => join(`颗粒 ${grainStrength(l) || '关'}`,
      l.border ? `${l.border > 0 ? '白边' : '黑边'} ${Math.abs(l.border)}` : '无边框'), h('div', { class: 'group cam rows' },
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
          '选择胶片颗粒的尺寸。',
          '配方导入后，细或粗颗粒需在机身上设置。',
          fwLine('固件 v0.40', '该版本起支持。')]);
        show();
        return [withHelp(h('div', { class: 'crow' }, h('span', { class: 'cname' }, '胶片颗粒'), steps(inp), out), '胶片颗粒', [
          '模拟彩色胶片颗粒，可关闭或设为强度 1 至 5。',
          '先调整强度，再选颗粒大小。',
          '文件可保存强度 2、3、5。强度 1 或 4 需在机身上设置。',
          fwLine('固件 v0.40', '该版本起支持。')]),
          ...(l.film_grain ? [sizeRow] : []), note];
      })(),
      ...(() => {
        const note = h('p', {});
        const show = () => {
          note.hidden = !l.border;
          if (!om3Fw28()) { note.className = 'warn'; note.replaceChildren(h('b', {}, '边框需要较新固件。')); }
          else note.hidden = true;
        };
        const { inp, out } = slider(-OM3.border, OM3.border, l.border ?? 0, (x) => { if (x) l.border = x; else delete l.border; show(); changed(); }, (x) => (x > 0 ? `+${x} 白` : x < 0 ? `${x} 黑` : '0'), '边框');
        show();
        return [withHelp(h('div', { class: 'crow' }, h('span', { class: 'cname' }, '边框'), steps(inp), out), '边框', [
          '给照片四周加同宽边框，宽度为照片短边的 1.5% 至 7.5%。',
          '右拉加白边，左拉加黑边，双击清除。',
          fwLine('固件 v0.40', '该版本起支持。')], note)];
      })(),
      grainWarn)));
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
  const base = name?.trim().slice(0, LIST_NAME_MAX) || '导入的胶片盒';
  let box = base;
  for (let i = 2; Object.hasOwn(LISTS.lists, box); i++) box = base + ' (' + i + ')';
  LISTS.lists[box] = bank; openBox(box);
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
    O.bank[k][v] = look; selectSlot(k, v);
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
      if (!confirm(`将「${b.name}」的 ${n} 卷胶卷导入新胶片盒？`)) return fromLink;
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
    O.bank[k][v] = c.look; selectSlot(k, v);
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

function workbenchHelp() {
  modal('使用说明', h('div', { class: 'install' },
    h('h3', {}, '浏览与编辑'),
    h('p', {}, '从左侧胶卷库选一卷，用中间样片对照原图和调色效果。右侧可以调整色调、配方和盒签。'),
    h('h3', {}, '常见问题'),
    h('p', {}, '胶卷库保存你的配方。只有装进当前胶片盒的胶卷才会随盒导出。若胶片盒有空位，可以从库中装入一卷。'),
    h('p', {}, '要在另一台电脑继续编辑，请从「导出到…」下载配方备份，再用「配方工具」打开。'),
    h('a', { href: 'https://github.com/SengokuCola/Nostalgia-OM/blob/main/docs/FAQ.md', target: '_blank', rel: 'noopener' }, '更多常见问题')));
}

function om3InstallDialog() {
  const project = 'https://github.com/SengokuCola/Nostalgia-OM';
  modal('固件与安装', h('div', { class: 'install' },
    h('p', {}, 'Nostalgia 适用于运行原厂固件 1.1 的 OM SYSTEM OM-3。首次安装和恢复原厂固件请按安装指南操作。'),
    h('p', {}, '已安装 Nostalgia 时，可直接用「写入 SD 卡」更新胶片。把卡插回机身，开机后半按一次快门载入。')),
    [h('a', { class: 'btn', href: project + '/blob/main/docs/INSTALL.md', target: '_blank', rel: 'noopener' }, '安装与恢复指南'),
     h('a', { class: 'btn primary', href: project + '/releases', target: '_blank', rel: 'noopener' }, '固件下载')]);
}

type DirHandle = { name: string; getDirectoryHandle(n: string, o?: { create?: boolean }): Promise<DirHandle>; getFileHandle(n: string, o?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(d: BlobPart): Promise<void>; close(): Promise<void> }> }>; values(): AsyncIterable<{ name: string }> };
async function om3ToCard(status: HTMLElement) {
  const pick = (window as unknown as { showDirectoryPicker?: (o?: object) => Promise<DirHandle> }).showDirectoryPicker;
  if (!pick) return;
  status.textContent = '';
  let dir: DirHandle;
  try { dir = await pick.call(window, { mode: 'readwrite', id: 'om3card' }); } catch (e) {
    if ((e as Error).name !== 'AbortError') status.textContent = '无法打开目录。可下载 SD 卡包后解压。';
    return;
  }
  const destination = dir.name.toUpperCase() === 'OM3MOD' ? dir.name : dir.name + '/OM3MOD';
  if (!confirm(`将「${O.name}」写入 ${destination}，并替换其中同名的配方文件？`)) return;
  try {
    status.textContent = `正在写入 ${destination}…`;
    const files = await cardFiles();
    let om3 = dir;
    if (dir.name.toUpperCase() !== 'OM3MOD') om3 = await dir.getDirectoryHandle('OM3MOD', { create: true });
    for (const f of files) {
      const w = await (await om3.getFileHandle(f.name, { create: true })).createWritable();
      await w.write(f.data as BlobPart); await w.close();
    }
    status.textContent = `已写入 ${destination}。现在可以将卡插回相机。`;
  } catch (e) { status.textContent = `写入失败，${(e as Error).message}`; }
}

const profileName = () => exportTarget.id === 'profiles' ? 'PROFILES.BIN' : 'LOOKS.BIN';
const looksBin = () => profilesBin(
  O.bank.map(row => row.map(look => look && { ...look, filmEffects: supportedEffects(look) })),
  exportTarget.fw, Boolean(exportTarget.labels));
async function cardFiles() {
  const lb = looksBin();
  const profile = { name: profileName(), data: lb };
  if (exportTarget.id === 'profiles') return [profile];
  const files: {name: string; data: Uint8Array}[] = [];
  if (exportTarget.curves) files.push({name: 'CURVES.BIN', data: curvesBin(lb, O.bank)});
  files.push({name: 'NAMES.BIN', data: await namesBin(O.bank, view.labelFont)});
  files.push(profile);
  return files;
}
function om3ExportDialog(cardOnly = false) {
  const probs = validateBank(O.bank);
  const fname = (O.name || 'om3-looks').replace(/[^\p{L}\p{N}_.-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'om3-looks';
  const n = O.bank.flat().filter(Boolean).length;
  const bankJson = () => JSON.stringify(exportBank(), null, 1) + '\n';
  const targetOptions = exportTargets.map(t => h('option', { value: t.id, selected: t === exportTarget }, t.name));
  const fwSel = h('select', { 'aria-label': '机身固件', onchange: (e: Event) => {
    const id = (e.target as HTMLSelectElement).value;
    exportTarget = exportTargets.find(t => t.id === id) ?? exportTargets[0];
    try { localStorage.setItem('caduceus.om3.export-target', id); } catch { /* storage blocked */ }
    renderEditor(); schedulePreview(); wbNote(); updateFiles();
  } }, h('optgroup', { label: '本项目' }, ...targetOptions.slice(0, 3)),
      h('optgroup', { label: '上游 Caduceus for OM-3' }, ...targetOptions.slice(3)));
  const wbBig = O.bank.flat().filter((l) => l?.wb && Math.max(Math.abs(l.wb.a_b), Math.abs(l.wb.g_m)) > 5).map((l) => l!.name);
  const wbBox = h('p', { class: 'warn' });
  const v28 = O.bank.flat().filter((l) => l && v28Parts(l).length).map((l) => `${l!.name} (${v28Parts(l!).join(', ')})`);
  const wbNote = () => {
    const big = wbBig.length && exportTarget.fw < 26;
    const limited = v28.length && exportTarget.fw < 28;
    const labels = O.bank.flat().some(l => l?.boxLabel) && !exportTarget.labels;
    const effects = O.bank.flat().some(l => l?.filmEffects?.some(effect => !supportedEffects(l)?.includes(effect)));
    const curves = O.bank.flat().some(l => l && (hasCurves(l) || hasMix(l))) && !exportTarget.curves;
    wbBox.hidden = !big && !limited && !labels && !curves && !effects;
    wbBox.replaceChildren(
      ...(big ? [h('div', {}, '白平衡偏移将限制在 ±5：', wbBig.join('、'))] : []),
      ...(limited ? [h('div', {}, '所选固件会略过 v0.28 新增参数，并使用旧版色调范围。')] : []),
      ...(labels ? [h('div', {}, '自定义盒签与机身短句会保留在 JSON 配方中。')] : []),
      ...(effects ? [h('div', {}, '当前目标固件会略过部分成片效果。导出 Sunlit 请选择「按卷 Sunlit」。')] : []),
      ...(curves ? [h('div', {}, '通道曲线与色彩混合会保留在 JSON 配方中。')] : []));
  };
  const busy = async (b: HTMLButtonElement, f: () => Promise<void>) => { b.disabled = true; try { await f(); } catch (e) { toast((e as Error).message, 'err'); } finally { b.disabled = probs.length > 0; } };
  const looks = O.bank.flat().filter(Boolean) as Look[];
  const rrAll = () => makeZip(looks.map((l, i) => ({ name: `${String(i + 1).padStart(2, '0')}-${rrName(l.name)}.rrpreset`, data: new TextEncoder().encode(rrpreset(bankPack(looks), i)) })));
  const fmt = (p: Problem) => (p.look !== undefined ? `${at(Math.floor(p.look / PER), p.look % PER)} (${O.bank[Math.floor(p.look / PER)][p.look % PER]?.name || 'no name'}): ` : '') + p.message;
  const cardStatus = h('div', { class: 'card-status', role: 'status' });
  const toCard: HTMLButtonElement = h('button', { class: 'primary', disabled: probs.length > 0, onclick: () => busy(toCard, () => om3ToCard(cardStatus)) }, '选择 SD 卡…');
  const zip: HTMLButtonElement = h('button', {
    disabled: probs.length > 0, onclick: () => busy(zip, async () => {
      const files = (await cardFiles()).map((f) => ({ name: `OM3MOD/${f.name}`, data: f.data }));
      files.push({ name: `${fname}.om3.json`, data: new TextEncoder().encode(bankJson()) });
      download(`${fname}-card.zip`, makeZip(files), 'application/zip');
    }),
  }, '下载');
  const names: HTMLButtonElement = h('button', { disabled: probs.length > 0, onclick: () => busy(names, async () => download('NAMES.BIN', await namesBin(O.bank, view.labelFont) as Uint8Array)) }, 'NAMES.BIN');
  const profileDownload = h('button', { disabled: probs.length > 0, onclick: () => download(profileName(), looksBin()) });
  const curveDownload = h('button', { disabled: probs.length > 0, onclick: () => download('CURVES.BIN', curvesBin(looksBin(), O.bank)) }, 'CURVES.BIN');
  const filesNote = h('p', { class: 'help' });
  function updateFiles() {
    profileDownload.textContent = profileName();
    names.hidden = exportTarget.id === 'profiles';
    curveDownload.hidden = !exportTarget.curves;
    filesNote.textContent = exportTarget.labels ? '包含自定义盒签与机身短句。' : '使用所选固件支持的文件格式。';
  }
  wbNote(); updateFiles();
  const canWrite = typeof (window as unknown as {showDirectoryPicker?: unknown}).showDirectoryPicker === 'function';
  toCard.hidden = !canWrite;
  zip.textContent = '下载 SD 卡包';
  const compatibility = h('details', { class: 'export-options' },
    h('summary', {}, cardOnly ? '目标固件' : '固件兼容与单独文件'),
    h('div', { class: 'ex-row' }, h('div', {}, h('b', {}, '目标固件'), filesNote), fwSel),
    cardOnly ? null : h('div', { class: 'ex-row' }, h('b', {}, '单独下载'), h('div', { class: 'ex-btns' }, profileDownload, curveDownload, names)));
  const other = h('details', { class: 'export-options' },
    h('summary', {}, '其他格式'),
    h('div', { class: 'ex-row' },
      h('div', {}, h('b', {}, 'RapidRAW 预设'), h('p', { class: 'help' }, '用于 ORF 的近似配方。')),
      h('button', { disabled: !looks.length, onclick: () => download(`${fname}-rapidraw.zip`, rrAll(), 'application/zip') }, '下载 ZIP')));
  modal((cardOnly ? '写入 SD 卡' : '导出胶片盒') + ' · ' + O.name, h('div', { class: 'export' },
    h('p', { class: 'export-count' }, `${n} / ${COLORS * PER} 卷`),
    probs.length
      ? h('div', { class: 'problems-box' }, h('b', {}, `请先修正 ${probs.length} 处配方问题`), h('ul', { class: 'problems' }, ...probs.slice(0, 12).map(p => h('li', {}, fmt(p)))))
      : null,
    cardOnly
      ? h('section', { class: 'card-export' },
          h('p', {}, canWrite ? '选 SD 卡根目录，配方将写入 OM3MOD。也可以直接选 OM3MOD 文件夹。' : '当前浏览器不支持直接写入文件夹，请下载 SD 卡包并解压到 SD 卡根目录。'),
          h('p', { class: 'help' }, '插回机身后，开机半按快门载入胶片。'),
          h('div', { class: 'ex-btns' }, canWrite ? toCard : zip), cardStatus)
      : h('div', { class: 'ex-row' },
          h('div', {}, h('b', {}, 'SD 卡包'), h('p', { class: 'help' }, '包含 OM3MOD 配方文件与 JSON 备份，解压到 SD 卡根目录即可。')),
          zip),
    wbBox,
    cardOnly ? null : h('div', { class: 'ex-row' },
      h('div', {}, h('b', {}, '配方备份'), h('p', { class: 'help' }, '保存当前盒的配方，之后可重新导入编辑。')),
      h('button', { onclick: () => download(`${fname}.om3.json`, bankJson(), 'application/json') }, '下载 JSON')),
    compatibility, cardOnly ? null : other));
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

export function startLookLab(options: LookLabView, mount: () => void) {
  view = options;
  mount();
  renderAll();
  if (libNotice) toast(libNotice);
  undoUi();
  handleHash();
  window.addEventListener('hashchange', handleHash);
}

/** Compact workbench controls operate on the same selected slot as the full editor. */
export const workbench = {
  renderShelf, newRoll, deleteRoll, editStockLabel,
  selected: cur,
  slot: () => looseRoll ? -1 : O.k * PER + O.v,
  setTone(key: keyof Tone, value: number, continuous: boolean) {
    const l = cur();
    if (!l) return;
    l.tone[key] = Math.max(-toneLimit(key), Math.min(toneLimit(key), Math.round(value)));
    if (continuous) draft(save); else save();
    schedulePreview();
    refreshProblems();
  },
  finishTone() { checkpoint(); renderEditor(); },
  resetTone() {
    const l = cur();
    if (!l) return;
    const f = filmOf(l);
    l.tone = { ...(f ? f.tone : resetLook(l, LIBRARY, []).tone) };
    save(); renderAll();
  },
  buildPreview(image: string) { S.image = image; buildPreview(); },
  showPreviewDetail(enabled: boolean) { detailPreview = enabled; updatePreviewResolution(); },
  undo: () => step('undo'), redo: () => step('redo'),
  openFile, onFile: om3OnFile, onPhoto, onGrade: om3OnGradeFile,
  newEmpty: () => newBank('empty'), newDefaults: () => newBank('library'),
  films: () => om3FilmPicker(), paste: pasteDialog, share: om3Share,
  install: om3InstallDialog, help: workbenchHelp,
  exportBank: () => om3ExportDialog(), quickToCard: () => om3ExportDialog(true),
};
