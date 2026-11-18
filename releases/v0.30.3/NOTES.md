# Caduceus for OM-3 v0.30.3

**Faster halation with a smoother fade, every dial click counted, and a debug log that doesn't slow the shutter.**
Firmware camera-tested (2026-11-17, test 3; only its name was changed to v0.30.3).

**Changed**
- **Faster halation:** a Halation photo saves much quicker, about half the work it took before. The idea comes from
  Caduceus for the E-P7 (cakelesscoder), whose halation got faster the same way.
- **A smoother halo:** at higher strengths the halo used to stop abruptly; it now fades out gradually over about twice
  the distance. Near the light it looks as before. LookLab's halation preview follows the new fade.
- **Every dial click counts on the RGB and Mix pages**
  ([#69](https://github.com/androidfanman/caduceus-om3/pull/69), by crombach): a fast dial turn used to skip values;
  now each click moves one step, and the curve picture redraws about three times faster.
- **Faster looks and saves** (#69): photos with split toning or RGB curves are processed faster, and films and curves
  save faster, with exactly the same colours and saved data.

**Fixed**
- **The debug log slowed the shutter:** with `DEBUG.TXT` on the card, the shutter fired late and bursts went on after
  you let go, because the log was written at every press. It now notes every press in memory and writes the file when
  you let go of the shutter (and not right after a burst). Thanks to **flrvr** for spotting it.

Everything else is as in [v0.30.2](../v0.30.2/NOTES.md) (the Image Review fix) and [v0.30](../v0.30/NOTES.md).

**Make it and copy it:** run the launcher and press Return (or `python3 firmware/patch.py --release v0.30.3`). Copy
`DCOLYMP` and flash it (hold OK, then switch the camera on). Your films, changes, custom modes and button settings stay
in the camera. **Coming from v0.29.x or older?** Also put `CURVES.BIN` in the `OM3MOD` folder for the regraded films.

Going back: make v0.30.2 and copy its `DCOLYMP`. (Photos with Halation will save slower again, with the old fade.)

The files here are the patch (only the bytes Caduceus for OM-3 adds; no OM firmware), the optional extras
(`CURVES.BIN`, `LOOKS.BIN`, `DEBUG.TXT`, the photo code kit, all as in v0.30) and the expected checksums. Full list
of changes: [CHANGELOG](../../CHANGELOG.md#v0303).
