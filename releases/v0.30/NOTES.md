# Caduceus for OM-3 v0.30

**Color Mix and RGB curves on the camera, and the 20 film sims regraded with them.** Firmware camera-tested
(2026-11-16, test 13; only its name was changed to v0.30).

**New**
- **Color Mix:** a new Picture Mode row for every film and COLOR. Make red, green or blue stronger or weaker, or turn it
  toward its neighbour. Each colour is a dot on a ring: the front dial turns it (Hue), the rear dial moves it out or in
  (Sat), INFO picks the colour. Greys stay grey.
- **RGB curves:** a tone curve for each of red, green and blue, with five points from black to white (−7 to +7 each).
  Add a colour to the shadows, take it out of the highlights, cross-process. INFO picks the channel.
- **The 20 film sims regraded** with Color Mix and RGB curves, against scans of the real film stocks. They come in a
  small new card file, `CURVES.BIN` (see below). Curves or a mix you changed yourself on a film stay as you set them.
- **A new Picture Mode layout:** the rows follow the order the camera works on a photo, five a page, each with its own
  picture: Picture Mode, Color Mix, RGB, the colour wheel, Split Tone Balance · WB Compensation, Highlight & Shadow,
  B/W, Contrast, Sharpness · Noise Filter, Vignette Correction, Shading, Glow Effect, Halation Effect · Film Grain
  Effect.
- **Films ready at switch-on** ([#56](https://github.com/androidfanman/caduceus-om3/pull/56), by crombach): your films
  and changes load from the camera's memory as it starts, in every mode, so the right film is there before the first
  half-press. Card files (a new `LOOKS.BIN` or `CURVES.BIN`) are still read at the first half-press.
- **A fuller debug log:** `CADLOG.TXT` is now a clear report of what the camera loaded, each COLOR's film, each custom
  mode, the camera's own settings and the last 32 shutter presses.

**Fixed**
- **Turning the mode dial with the camera on** ([#54](https://github.com/androidfanman/caduceus-om3/issues/54);
  [#59](https://github.com/androidfanman/caduceus-om3/pull/59) by crombach): turning between a custom mode and
  P / A / S / M no longer changes your COLOR profiles or puts a "*" on them, and each mode comes back on its own film.
  B counts as a mode, and the film name on the shooting screen no longer flashes "COLOR1*" during a turn.
- **Video freeze** ([#53](https://github.com/androidfanman/caduceus-om3/issues/53);
  [#55](https://github.com/androidfanman/caduceus-om3/pull/55) by crombach): a half-press soon after switching on in
  video could freeze the live image. Films are photos only, so video and S&Q now do no film work.
- **Noise Filter's "*":** with the camera's own Noise Filter set to something other than Standard, the row and the COLOR
  disagreed about which setting was changed. Both now compare with the camera's own Noise Filter.

Color Mix and RGB curves work on photos only. Video is unchanged.

**Make it and copy it:** run the launcher and press Return (or `python3 firmware/patch.py --release v0.30`). Copy
`DCOLYMP` and flash it (hold OK, then switch the camera on). **For the regraded films, also put `CURVES.BIN` in the
`OM3MOD` folder** on the card: the camera takes it at the next half-press and keeps it, so you can delete it afterwards.
Your films, changes, custom modes and button settings stay in the camera.

**LookLab** has Color Mix and RGB curves too (with a before / after preview, in the camera's new order) and saves
`CURVES.BIN` along with your films. The **tour** shows everything on the camera's own screens.

**For developers:** an emulator test suite that every pull request runs first
([#57](https://github.com/androidfanman/caduceus-om3/pull/57), [#58](https://github.com/androidfanman/caduceus-om3/pull/58),
[#63](https://github.com/androidfanman/caduceus-om3/pull/63), by crombach).

Going back: make v0.29.5 and copy its `DCOLYMP`. Your films and settings stay; v0.29.5 has no Color Mix or RGB curves.

The files here are the patch (only the bytes Caduceus for OM-3 adds; no OM firmware), the optional extras
(`CURVES.BIN`, `LOOKS.BIN` with the standard 20 as in v0.29, `DEBUG.TXT`, the photo code kit) and the expected
checksums. Full list of changes: [CHANGELOG](../../CHANGELOG.md#v030).
