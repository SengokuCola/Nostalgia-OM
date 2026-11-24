# LookLab: the Caduceus for OM-3 web app

Modified by SengokuCola for the Caduceus for OM-3 fork.

The darkroom workbench is the default LookLab page in both the local web app and the static `looklab/` build.

A static web app for making, previewing and sharing the films of
[Caduceus for OM-3](https://github.com/androidfanman/caduceus-om3) (the creative profiles the camera lists as FILM
1–20). Everything runs in the browser: there is no backend, and no photo or look is ever uploaded. The live site is
`looklab/` in the repo root (GitHub Pages).

It started as the Caduceus Control Panel of [Caduceus for the E-P7](https://github.com/cakelesscoder/caduceus-ep7)
by cakelesscoder (Apache-2.0), which also gave it its tone model, preview and starter looks. Since 2026-11-09 it is
OM-3 only: the E-P7 side (its packs, `EP7MOD/LOOKS.BIN`, look codes and export targets) was removed. Use
cakelesscoder's own tool for the E-P7.

- **The list**: FILM 1–20 in camera order (positions in a bank of 4 × 5, `src/om3.ts`). Drag, ↑ ↓ or Alt+↑/↓ move a
  film; × empties a place. An empty place offers a blank look, a film sim, a library look or a pasted link.
- **Editor**: Hue / Lightness / Saturation ±5 per colour, Tone (Highlights / Shadows / Midtones ±7, Blacks / Whites
  ±5), the camera's Contrast, Sharpness and Shading, a WB shift (±5), split toning (v0.26, `src/split.ts`) and the
  Extras: Noise Filter, Glow / Clarity, lens vignette correction and Grain. Names are up to 15 characters.
- **Roll library and film boxes**: the left shelf holds reusable rolls and their labels. The top bar selects a box
  of up to 20 rolls for the camera. A box preset keeps its own slot order and shares its rolls with the library.
  Edits to a roll appear in every box using it. Saved lists migrate to `caduceus.om3.cabinet.v1` when opened.
- **Film sims**: our own film looks (`src/data/om3films.json`, made by `scripts/films.py` from hand-written recipes),
  the 20 defaults first.
- **Preview**: turns hue the OM-3 way (+ toward the clockwise neighbour) and includes Contrast, Sharpness, Shading,
  split toning and the grain (`research/grain/model.py`). Drag the line on the photo to compare before and after.
- **Open**: the card's `OM3MOD/LOOKS.BIN` (to keep looks made on the camera) or a looks file (`*.om3.json`).
- **Export**: `LOOKS.BIN` + `NAMES.BIN` (the names as pictures in the camera's label style) straight to the card
  (Chrome / Edge), as a card zip, or singly; a looks file; RapidRAW presets. "Firmware on the camera" picks the file
  layout (v0.26 adds split toning at record +53..+56).
- **Share**: a link to all films (`ob1_…`) or one (`op1_…`): base64url of the deflated JSON, in the URL fragment
  (never sent to the server). Opening such a link imports it.
- **Look format** (2026-11-09): every look in a link or a looks file starts with `"schema": "caduceus-om3-look/1"` and
  `"min_fw"` (the oldest Caduceus firmware that carries all its settings, e.g. `"0.26"` for split toning, `"0.26.1"`
  for a WB shift past ±5; the bank / file gets the newest of its looks'). `min_fw` is worked out from the settings when
  written and ignored when read (worked out again), so a hand-edited value can't mislead. Looks without the fields
  (older links and files) read as format 1. The number goes up only if a setting's meaning changes; a new setting is
  a new field, read as off / 0 from older looks. A higher format is refused with "reload the page to update".

| File | What |
|---|---|
| `src/main.ts`, `src/style.css` | UI |
| `src/om3.ts` | The bank, `LOOKS.BIN` read / write, converting looks, checks |
| `src/om3names.ts` | `NAMES.BIN` |
| `src/om3films.ts` | Film sims |
| `src/split.ts` | Split toning (same table as the firmware) |
| `src/pack.ts` | The look model and parsing |
| `src/preview.ts`, `src/tone.ts` | Approximate preview and its tone LUT |
| `src/reset.ts` | Reset a look to its library or film values |
| `src/rapidraw.ts`, `src/zip.ts`, `src/format.ts` | RapidRAW presets, zip, CRC-32 |
| `tests/` | `om3.test.ts` checks `LOOKS.BIN` byte for byte against `card/mkprofiles.py` of this repo |
| `public/samples/` | Sample photos ([CREDITS.md](public/samples/CREDITS.md)) |

## Run it locally

Node 20+:

```bash
cd webapp
npm ci
npm run dev        # http://localhost:5173
npm test
VITE_DEFAULT_CAMERA=om3 npx vite build   # static site in dist/; copy it to ../looklab/ for the live site
```

Before publishing LookLab, sync
`public/LICENSE` and `public/NOTICE` from the repository root. Vite includes these files in the static
build alongside the existing font licences and sample-photo credits.

## Windows app

The Windows app uses Tauri 2 and the system WebView2 Runtime. Photos, fonts,
help, and the editor are bundled locally. Export a LookLab `.om3.json`
backup from the browser or the earlier Edge app and open it in the Tauri app
to transfer film banks. Subsequent launches use the Tauri app's own saved data.

On Windows, install the Rust MSVC toolchain and Visual Studio C++ Build Tools
with the Windows SDK, then run the following from `webapp/`.

```powershell
npm ci
npm run package:win
```

The standalone executable is `src-tauri/target/release/looklab.exe`. The
current-user NSIS installer is under `src-tauri/target/release/bundle/nsis/`.
To run a development window with Vite, use `npx tauri dev`.

On Nostalgia-OM, a published GitHub Release gets the LookLab Windows x64 NSIS
installer and `LookLab-windows-x64.exe`. For a `fork-v*` tag, the release
workflow builds LookLab after publishing the firmware kit. The executables are
also available in the workflow's `looklab-windows-x64` artifact.
The earlier C# Edge launcher can still be built with `npm run package:edge`.

## Self-host on a NAS (Docker)

The image is a two-stage build: Node builds the site, then plain `nginx:alpine` serves it on port **8080** as the
unprivileged `nginx` user. The same files are served at `/` and at `/caduceus/`. A health check is at `/healthz`.

```bash
cd webapp
docker compose up -d --build          # or: docker build -t caduceus-looks . && docker run -d -p 8080:8080 caduceus-looks
curl -fsS http://localhost:8080/healthz
```

`docker-compose.yml` runs the container read-only, with a tmpfs `/tmp`, all capabilities dropped and
`no-new-privileges`.

### Behind a tunnel at your own domain (e.g. Cloudflare Tunnel)

You don't need to open any port on the NAS:

1. In Cloudflare Zero Trust → Networks → Tunnels, create a tunnel and copy its token.
2. Add a public hostname for it. For the app on its own subdomain: `looks.example.com` → `http://caduceus-looks:8080`.
   For a sub-path: hostname `example.com`, path `caduceus*` → `http://caduceus-looks:8080`. The tunnel forwards
   `/caduceus/...` unchanged and the container serves the app there, so no rewrite is needed.
3. Uncomment the `cloudflared` service in `docker-compose.yml`, put `TUNNEL_TOKEN=...` in a `.env` file next to it,
   then run `docker compose up -d`. You can then remove the `ports:` mapping if only the tunnel should reach the app.

Any other reverse proxy (Caddy, Traefik, nginx, Tailscale Funnel) works the same way. Proxy to port 8080, and either
keep the `/caduceus/` prefix or strip it: both paths serve the app. The build uses relative URLs, so it also works
under any other sub-path if you serve `dist/` yourself. Share links are made from the page's own address
(`https://example.com/caduceus/#...`).

## Limits of the preview

The preview is a rough port of the desktop simulator, applied to finished JPEGs instead of RAW files. Use it for
the direction and relative strength of a look. Exact colours will differ from the camera. The grain is drawn a
little stronger than the full-size grain would look when scaled down, so you can still see it. Vignette and Art
Effects are not previewed. The tone is applied to luminance only, as a display-domain LUT after the base curve:
each display value goes through the camera's contrast-0 LUT -> the same LUT with the look's tone, which is a
bit-exact port of the firmware model from Caduceus for the E-P7 (`tools/ep7_tone_model.py` for H/S/M, `tools/ep7_tone.py` for Blacks/Whites;
`npm run gen-library` copies its data to `src/data/tone_hsm.json`).
