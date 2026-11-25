// Modified by SengokuCola for the Caduceus for OM-3 fork.
// The film sims for the OM-3: our own looks, designed by hand from public descriptions of each film and tuned by eye
// (scripts/films.py makes src/data/om3films.json from short recipes). Each becomes an ordinary OM-3 look: Hue / Light
// / Saturation per sector, tone, contrast, sharpness and optional stock-specific capture settings.
import { localizeDescription } from './descriptions';
import filmsJson from './data/om3films.json';
import { blankLook, type Look } from './pack';
import type { RgbCurves } from './curves';

export interface Film {
  name: string; group: FilmGroup; film: string; desc: string;
  hue: number[]; light: number[]; sat: number[];
  tone: Look['tone']; contrast: number; wb: { a_b: number; g_m: number } | null;
  sharp: number;   // firmware v0.22 Sharp, the camera's numbers (0 = its normal)
  split?: { sh_color: number; sh: number; hl_color: number; hl: number };   // v0.26 split toning
  matched?: boolean;   // colour matched: graded against film scans of a colour chart (else hand-tuned from descriptions)
  rgb?: RgbCurves;     // the camera's 20 (2026-11-15): RGB curves and colour mix of the regrade (test firmware; not in LOOKS.BIN)
  mix?: number[];
  film_grain?: number;
  halation?: number;
  film_wb?: Look['film_wb'];
  filmEffects?: Look['filmEffects'];
}
export type FilmGroup = 'fuji' | 'slide' | 'neg' | 'instant' | 'print' | 'effect';
export const FILM_GROUPS: [FilmGroup, string][] = [
  ['fuji', '富士胶片模拟'], ['slide', '反转片'], ['neg', '彩色负片'], ['instant', '即时成像'], ['print', '电影印片'],
  ['effect', '特殊效果'],
];
const DATA = filmsJson as { films: Film[]; aliases: Record<string, string>; camera: string[] };
export const FILMS = DATA.films.map((film) => ({ ...film, desc: localizeDescription(film.desc) }));
/** The 20 films for the camera, FILM 1-20 in the owner's order (scripts/films.py CAMERA). */
export const CAMERA_FILMS: Film[] = DATA.camera.map((n) => FILMS.find((f) => f.name === n)!);

/** A look's film sim, from its origin (`film:<name>`, set when it was added) or, for looks added before origins, its
 *  unchanged name. Renamed or edited looks keep their origin. Names from earlier versions of the list map to the film
 *  that replaced them. */
export const FILM_ORIGIN = 'film:';
export const filmByName = (name: string) => FILMS.find((f) => f.name === (DATA.aliases[name] ?? name));
/** Starter (library) looks that a film sim replaced: a look taken from one keeps working as that film (Reset look). */
const LIBRARY_TO_FILM: Record<string, string> = { 'Cuban Neg': 'Cuban Negative' };

export function filmOf(l: Look): Film | undefined {
  if (l.origin?.startsWith(FILM_ORIGIN)) return filmByName(l.origin.slice(FILM_ORIGIN.length));
  if (l.origin !== undefined && LIBRARY_TO_FILM[l.origin]) return filmByName(LIBRARY_TO_FILM[l.origin]);
  return l.origin === undefined ? filmByName(l.name) : undefined;
}

/** The standard recipe used by the film library, starter bank and per-film reset. */
const previousPackaging: Partial<Record<string, NonNullable<Look['boxLabel']>>> = {
  'CineStill 800T': { style: 6, paper: '#d5e4ea', ink: '#192e48', accent: '#db693b', title: 'CINE800T', caption: '' },
  'Gold 200': { style: 4, paper: '#f7c331', ink: '#392813', accent: '#bc3229', title: 'GOLD 200', caption: '' },
  'Portra 400': { style: 3, paper: '#f3dfa1', ink: '#453427', accent: '#b87b42', title: 'PTRA 400', caption: '' },
  'Velvia 50': { style: 5, paper: '#e9ead7', ink: '#183a31', accent: '#297652', title: 'VELVIA50', caption: '' },
  'Ektachrome E100': { style: 5, paper: '#e8edef', ink: '#193552', accent: '#275a95', title: 'EKTA100', caption: '' },
  'Polaroid 600': { style: 4, paper: '#eeeae0', ink: '#252834', accent: '#c15358', title: 'POLAR600', caption: '' },
};

const packaging: Partial<Record<string, NonNullable<Look['boxLabel']>>> = {
  'Provia 100F': { style: 13, paper: '#28853a', ink: '#17191c', accent: '#24288a', title: 'PROVIA', caption: '' },
  'Pro 400H': { style: 14, paper: '#219345', ink: '#17171a', accent: '#aa9051', title: '400H', caption: '' },
  'Pro 160S': { style: 15, paper: '#666666', ink: '#202020', accent: '#aaaaaa', title: 'PRO 160', caption: '' },
  'NHG II 800': { style: 16, paper: '#13bd34', ink: '#493c31', accent: '#e6c36c', title: 'NHG II', caption: '' },
  'Superia 400': { style: 17, paper: '#129744', ink: '#193742', accent: '#f1d97e', title: 'X-TRA', caption: '' },
  'Fuji C200': { style: 18, paper: '#069741', ink: '#191b19', accent: '#951968', title: 'C200', caption: '' },
  'Fujifilm 200': { style: 19, paper: '#008d50', ink: '#171c19', accent: '#95457c', title: '200', caption: '' },
  'Natura 1600': { style: 20, paper: '#f1ebe1', ink: '#413832', accent: '#998753', title: 'NATURA', caption: '' },
  'CineStill 800T': { style: 7, paper: '#171719', ink: '#fff5e9', accent: '#b93227', title: 'Cine', caption: '' },
  'Gold 200': { style: 8, paper: '#ffbd14', ink: '#c72b1f', accent: '#a30993', title: 'Gold', caption: '' },
  'Portra 400': { style: 9, paper: '#ffbf18', ink: '#372735', accent: '#674177', title: 'PORTRA', caption: '' },
  'Velvia 50': { style: 10, paper: '#178345', ink: '#343e42', accent: '#eceadc', title: 'Velvia50', caption: '' },
  'Ektachrome E100': { style: 11, paper: '#ffc62b', ink: '#bc3620', accent: '#173c90', title: 'E100', caption: '' },
  'Polaroid 600': { style: 12, paper: '#f2efe9', ink: '#19191b', accent: '#387bb8', title: '600', caption: '' },
};

export function applyStockLabel(look: Look, firstStyle = 0) {
  const label = packaging[look.name];
  if (look.origin !== FILM_ORIGIN + look.name || !label || label.style < firstStyle) return false;
  if (look.boxLabel) {
    const old = previousPackaging[look.name];
    if (!old || !(Object.keys(old) as (keyof typeof old)[]).every(k => look.boxLabel![k] === old[k])) return false;
  }
  look.boxLabel = { ...label };
  return true;
}

export function filmLook(f: Film): Look {
  const l = blankLook('colour', f.name);
  l.origin = FILM_ORIGIN + f.name;
  applyStockLabel(l);
  l.hue = [...f.hue]; l.light = [...f.light]; l.sat = [...f.sat];
  l.tone = { ...f.tone };
  l.advice = { contrast: f.contrast, sharpness: f.sharp ?? 0 };
  l.wb = f.wb ? { ...f.wb } : null;
  if (f.film_wb) l.film_wb = { ...f.film_wb };
  if (f.film_grain) l.film_grain = f.film_grain;
  if (f.halation) l.halation = f.halation;
  if (f.filmEffects) l.filmEffects = [...f.filmEffects];
  if (f.split) l.split = { ...f.split };
  if (f.rgb) l.rgb = { r: [...f.rgb.r], g: [...f.rgb.g], b: [...f.rgb.b] };
  if (f.mix) l.mix = [...f.mix];
  l.notes = f.desc;
  return l;
}
