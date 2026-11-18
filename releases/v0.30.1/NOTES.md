# Caduceus for OM-3 v0.30.1

**v0.30 plus one fix.** Firmware camera-tested (2026-11-17, test 1; only its name was changed to v0.30.1).

**Fixed**
- **The menu flash in Picture Mode** ([#66](https://github.com/androidfanman/caduceus-om3/issues/66);
  [#67](https://github.com/androidfanman/caduceus-om3/pull/67) by crombach): leaving the **B/W** row or the **WB
  Compensation** row showed the old row's title and a box with its icon for one frame. Now the next row appears
  straight away.

Everything else is as in [v0.30](../v0.30/NOTES.md): Color Mix and RGB curves on the camera, the 20 films regraded
with them (`CURVES.BIN`), the new Picture Mode order, films ready at switch-on.

**Make it and copy it:** run the launcher and press Return (or `python3 firmware/patch.py --release v0.30.1`). Copy
`DCOLYMP` and flash it (hold OK, then switch the camera on). Your films, changes, custom modes and button settings stay
in the camera. **Coming from v0.29.x or older?** Also put `CURVES.BIN` in the `OM3MOD` folder for the regraded films
(already taken if you had v0.30).

Going back: make v0.30 and copy its `DCOLYMP`.

The files here are the patch (only the bytes Caduceus for OM-3 adds; no OM firmware), the optional extras
(`CURVES.BIN`, `LOOKS.BIN`, `DEBUG.TXT`, the photo code kit, all as in v0.30) and the expected checksums. Full list
of changes: [CHANGELOG](../../CHANGELOG.md#v0301).
