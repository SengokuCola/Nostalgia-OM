# The tour's pictures (`pages/showcase/img/`)

`make.sh` makes every picture of [the tour](../../index.html) (the site's front page) from scratch (about three minutes) and writes them
to `pages/showcase/img/`. It needs the workspace (`research/setup.sh`, then `. ~/om3-work/env.sh`) and
`cd webapp && npm install`. Run it again when the films, the firmware's screens or the preview change.

```
IMG=$OM3_WORK/out-NAME/main.bin research/showcase/make.sh     # IMG defaults to the latest release's build
```

v0.40 (2026-11-18): IMG = a v0.40 build (the Firmware Version page shows its VERSION's first word), WHEEL_IMG = a
v0.30.3 build for the five wheel pages (on v0.40 om-emu leaves the wheel's dial label blank). From v0.40 Glow, Halation,
Split Tone Balance and Film Grain step the same way as Contrast, so `main+1` is plus on every bar row.

| Folder | What | How it's made | Status |
|---|---|---|---|
| `img/screens/` | The camera's screens | om-emu runs the firmware (`shoot.sh`, driving `tools/emulator/session_ed1.mjs`) on a blank card with the standard 20 `LOOKS.BIN` and `CURVES.BIN`; v0.29 needs nothing else on the card. v0.30's screens: `IMG=` a v0.30 build | Emulator, the firmware's own drawing |
| `img/screens/hsl-*.png` | The five colour-wheel pages | As above, then `wheel.py` draws the wheel (om-emu doesn't) from the values on the screen, in LookLab's style (`webapp/src/main.ts` `hslPanel`), and puts our own guide picture (`card/mkguides.py`) in the box om-emu leaves blank | Approximation: the page says so |
| `img/films/` | The standard 20 films on four samples (`-00` = original) | `mklooks.ts` (LookLab's standard 20 with their curves + mix grades, also the card's `LOOKS.BIN` and `CURVES.BIN`), `films.ts` (`webapp/src/preview.ts`) | LookLab preview |
| `img/demos/` | A before / after photo per setting | `demos.ts`: a neutral look with only that setting changed, at the value the screen shows | LookLab preview; Noise Filter and Vignette Correction are illustrations (`illus.py`), the preview doesn't model them; so are v0.40's Film Grain, Grain Size, Border and the crop picture (`illus40.py`: the border's own widths, the grain tile's recipe, the sensor's 4:3) |
| `img/halation/` | CineStill 800T, Halation 0 and 5 | `films.ts` | LookLab preview |

Samples: `webapp/public/samples/` (public domain / CC0, credited on the page and in `CREDITS.md`).

**Emulator keys** (`shoot.sh NAME 'tokens'`): `s1 ok ok` opens Picture Mode on COLOR 1; `right` steps COLOR 1–4, then
FILM 1–20; `down` steps the rows (v0.30's order: Color Mix, RGB, Color wheel (HSL), Split Tone Balance, WB, Highlight &
Shadow, Blacks / Whites, Contrast, Sharpness, Noise Filter, Vignette Correction, Shading, Glow, Halation, Film Grain);
`main±1` / `sub±1` change a value (which way is + differs per row; on the wheel one token is one step, whatever its
number). On Color Mix and RGB, `info` picks the colour (shared by the two pages, from Red); Mix: `main` = Sat, `sub-1` =
Hue +1; RGB: `sub-1` = the next point, `main` = its level; `ok` on B/W or WB opens the grid, arrows move it. On the
wheel `info` steps Color → Color All → Hue → Luminance → Shadows → Highlights, `sub-1` moves to the next colour
clockwise from Yellow (`sub+1` from Yellow goes to ALL first). After leaving Picture Mode, `ok` opens the super
control panel. om-emu's raw shots hold Y / Cb / Cr bytes: `ycc2rgb.py` converts them as om-emu's PNG writer does.

**Button Function** (`btn-*.png`): `s1 menu` then `left` ×5 reaches the Custom menu's Operations page, `ok` opens Button
Settings, `ok` Button Function with the cursor on Fn; rows Fn, REC, |o|, CP, AF-ON, ✥, ▲, ◀, ▶, ▼, L-Fn, CRT, ART, COLOR, MONO
(▲ ◀ ▶ ▼ are grey until ✥ is Direct Function); `ok` opens a row's options, `right` moves through them,
`ok` sets, `menu` goes back. `left` / `right` on the menu list itself change pages.
