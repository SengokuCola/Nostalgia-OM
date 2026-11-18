# Caduceus for OM-3 v0.29.5

**v0.29.4 plus custom modes that keep their own copy of everything.** Firmware camera-tested (2026-11-15, builds p1
and p2; only its name was changed to v0.29.5).

**New**
- **Assign › Set copies everything into that custom mode:** which film each COLOR holds, every change made to those
  films (HSL, WB, Blacks / Whites, Noise, Vignette, Grain, Sharp, Glow, Halation, Tone Balance, split toning, film WB)
  and the camera's own picture settings (Contrast, Saturation and the rest).
- **Nothing you do in another mode changes it:** edit a film, reset it or pick another in P, and C1 still has what you
  assigned. P / A / S / M share one set of their own.
- **Assign › Reset** puts a custom mode back to the films as built, with no changes.

**Changed**
- **Changes made inside a custom mode follow its Save Settings**, as the camera's own settings do. On **Reset** (the
  camera's default) they are forgotten when you turn the dial away or switch off, and the mode comes back as you
  assigned it. On **Hold** they stay in that mode. Until now our settings kept every change in every mode.

**Fixed**
- A Contrast (or other picture setting) change made in P could be lost after a trip through a custom mode.

**After updating:** Assign your custom modes once (Shooting menu 1 › Custom Mode › Cn › Assign › Set), so each gets its
full copy. Until then a custom mode shows the films it had, and changes made in it are not kept.

**Make it and copy it:** run the launcher and press Return (or `python3 firmware/patch.py --release v0.29.5`). Copy only
`DCOLYMP` and flash it (hold OK, then switch the camera on). Your films, custom modes and button settings stay in the
camera.

Everything else, including the optional extras (`LOOKS.BIN` with the colour-matched standard 20, `DEBUG.TXT`, the photo
code kit), is as in v0.29.4. Going back: make v0.29.4 and copy its `DCOLYMP`; it ignores the custom modes' copies and
carries on with the films and changes of the mode you were last in.

The files here are the patch (only the bytes Caduceus for OM-3 adds; no OM firmware), the optional extras and the
expected checksums. Full list of changes: [CHANGELOG](../../CHANGELOG.md#v0295).
