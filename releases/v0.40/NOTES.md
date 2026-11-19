# Caduceus for OM-3 v0.40

**Crop modes (XPan, 21:9, 5:4), black and white photo borders, our own film grain, looks that show in live view as you
adjust them, and your own choice of shooting-screen info.** Everything from the v0.40 test versions (alpha, beta,
beta2, beta3), camera-tested in each of them; this package is v0.40-beta3's firmware under its release name (2026-11-19).

**New since v0.30.3**
- **Crop modes: XPan (65:24), 21:9 and 5:4** as Image Aspect choices on the super control panel and in the menus.
  JPEGs are saved at that shape (5184 × 1920, 5184 × 2224, 4864 × 3888); RAW keeps the whole sensor with the crop
  marked. Live view, the grid, the focus target and the histogram fit the crop, the camera's frame lines sit at its
  edges (rear screen and viewfinder), and image review and playback label it. The crop is there as soon as the camera
  has started ([#83](https://github.com/androidfanman/caduceus-om3/issues/83)). Idea from Caduceus for the E-P7
  (cakelesscoder).
- **Photo borders:** a Border row for every film, −5 (black) to +5 (white), the same width on every side at every
  aspect ratio, JPEG only. A frame line in live view shows it from the first half-press (not in video).
- **Our own film grain:** Film Grain Off and 1 to 5 (a film's old Low / Med / High become 2 / 3 / 5) and a Grain Size
  row (Fine, Medium, Coarse). Highlights stay white and Halation keeps its glow with grain on.
- **Looks in live view as you adjust them:** split toning, Split Tone Balance, the RGB curves and B/W follow each dial
  click, without a half-press.
- **Choose what the shooting screen shows:** Custom menu → 4. Information → Camera Info Settings → Information 1, 2 and
  3 get 17 tick rows (Shooting Mode, Shutter Speed, Aperture, Exposure Comp., Exposure Level Meter, ISO, WB, Picture
  Mode, Image Stabilizer, AF Mode, Subject Detection, Drive Mode, Metering, Record Mode, Image Aspect, Remaining Files,
  Touch screen). Untick a row and that item leaves that display. Rear screen only.
- **Faster:** film switching and dial clicks on the colour wheel, Mix and RGB pages do less work
  ([#82](https://github.com/androidfanman/caduceus-om3/pull/82), by crombach); Halation is about a third faster on
  photos with a glow (back to the shorter fade from before v0.30.3) and pauses while the shutter is half-pressed, so
  quick single shots fire; the grain picture is made faster.
- **Picture Mode stays open 30 s** ([#75](https://github.com/androidfanman/caduceus-om3/issues/75),
  [#76](https://github.com/androidfanman/caduceus-om3/pull/76), by crombach): it closed after 8 s with no key, dial or
  tap; other screens keep 8 s.
- **Focus stacking with more lenses** ([#79](https://github.com/androidfanman/caduceus-om3/pull/79), by Bensonson):
  lenses the camera otherwise refuses for focus stacking (for example the M.Zuiko 17mm F1.8 II) can be used.
- **Our version on the camera:** MENU → wrench tab, page 6 → Firmware Version shows "Caduceus : 0.40" under OM's
  version.
- **The color wheel's label names the page** ([#64](https://github.com/androidfanman/caduceus-om3/issues/64),
  [#70](https://github.com/androidfanman/caduceus-om3/pull/70), by crombach): Sat, Hue, Lum or Tint.

**Fixed since v0.30.3**
- **Switching films fast rebooted the camera** ([#72](https://github.com/androidfanman/caduceus-om3/issues/72)): the
  films' record is now written once, as the list closes.
- **Quick single shots with the debug log on** ([#85](https://github.com/androidfanman/caduceus-om3/issues/85),
  reported by crombach): the log saves in the background, so every press takes a shot.
- **A new film set in custom modes** ([#86](https://github.com/androidfanman/caduceus-om3/issues/86), reported by
  Cloud-01): a new `LOOKS.BIN` now replaces the films cleanly in every mode, custom modes included.
- **Our looks stay out of video and S&Q** ([#68](https://github.com/androidfanman/caduceus-om3/issues/68),
  [#73](https://github.com/androidfanman/caduceus-om3/pull/73), by crombach).
- No more one-frame flash between the WB table and Highlight & Shadow (#82); Border, Glow, Halation, Tone Balance and
  Film Grain step the same way as Contrast on the dial (#82).
- **Safer start-up:** live view's first set-up and the crop's return wait for the camera's own "ready" signal.

**Differences to know**
- **One film set for all modes:** a new film set replaces the films in every mode. Each mode keeps its film numbers,
  picture mode and Save Settings, and your changes to films the new set leaves alone are kept. For different films in
  different custom modes, put them all in one 20-film set and give each custom mode its own COLORs (see the
  [FAQ](../../docs/FAQ.md)).
- **Shading** is the camera's own. **Screen info** is for the rear screen; the viewfinder is unchanged.
- **LookLab** knows all of it: crop previews, the black and white Border, Film Grain 1–5 with Grain Size, the new
  Halation fade, a preview matched more closely to the camera, and a "?" help box beside every setting.

**Make it and copy it:** run the launcher and press Return (or `python3 firmware/patch.py --release v0.40`). Copy
`DCOLYMP` and flash it (hold OK, then switch the camera on). Your films, changes, custom modes, button settings and
screen-info choices stay in the camera. **Coming from v0.29.x or older?** Also put `CURVES.BIN` in the `OM3MOD` folder
for the regraded films.

Going back: make v0.30.3 and copy its `DCOLYMP`.

The files here are the patch (only the bytes Caduceus for OM-3 adds; no OM firmware), the optional extras
(`CURVES.BIN` as in v0.30, `LOOKS.BIN`, `DEBUG.TXT`, the photo code kit as in v0.40-beta2) and the expected checksums.
Full list of changes: [CHANGELOG](../../CHANGELOG.md#v040).
