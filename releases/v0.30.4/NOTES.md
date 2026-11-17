# Caduceus for OM-3 v0.30.4

**No more reboot when you switch films fast, clearer labels on the color wheel, and our looks kept out of video.**
Firmware camera-tested (2026-11-17, test 5; only its name was changed to v0.30.4).

**Fixed**
- **Switching films fast rebooted the camera**
  ([#72](https://github.com/androidfanman/caduceus-om3/issues/72)): holding the arrow, or switching quickly between
  two films in the Picture Mode list, could restart the camera within seconds. After every step the firmware wrote
  which film each COLOR holds into the camera's memory, many times a second. It now writes it once, when you leave the
  list (OK, MENU or a half-press). The same goes for turning the dial through the films on the super control panel.
  Thanks to **crombach** for the report.

**Changed**
- **The color wheel's label names the page**
  ([#64](https://github.com/androidfanman/caduceus-om3/issues/64), [#70](https://github.com/androidfanman/caduceus-om3/pull/70),
  by crombach): under the wheel it reads Sat, Hue, Lum or Tint instead of "Vivid", and the guide reads
  "Saturation [INFO]" or "Sat. All [INFO]". On Hue, Luminance, Shadows and Highlights the front dial goes round the
  12 colours without stopping on Color All (Saturation still stops there).
- **Our looks are for photos only**
  ([#68](https://github.com/androidfanman/caduceus-om3/issues/68), [#73](https://github.com/androidfanman/caduceus-om3/pull/73),
  by crombach): video and S&Q no longer get split toning, Tone Balance, RGB curves, Glow or Art Effects, in live view
  or in the recording. Photos are unchanged. A film's basic picture settings can still show in video.

**One small difference:** if you switch the camera off while the Picture Mode list is still open, it comes back on the
film you had before. Press OK, MENU or half-press first and the new film is kept.

Everything else is as in [v0.30.3](../v0.30.3/NOTES.md).

**Make it and copy it:** run the launcher and press Return (or `python3 firmware/patch.py --release v0.30.4`). Copy
`DCOLYMP` and flash it (hold OK, then switch the camera on). Your films, changes, custom modes and button settings stay
in the camera. **Coming from v0.29.x or older?** Also put `CURVES.BIN` in the `OM3MOD` folder for the regraded films.

Going back: make v0.30.3 and copy its `DCOLYMP`.

The files here are the patch (only the bytes Caduceus for OM-3 adds; no OM firmware), the optional extras
(`CURVES.BIN`, `LOOKS.BIN`, `DEBUG.TXT`, the photo code kit, all as in v0.30) and the expected checksums. Full list
of changes: [CHANGELOG](../../CHANGELOG.md#v0304).
