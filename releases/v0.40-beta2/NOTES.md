# Caduceus for OM-3 v0.40-beta2 (test version)

**More rows to choose from on the shooting screen.** A test version (a GitHub pre-release): v0.30.3 stays the current
version. This is v0.40-beta with one addition. The new rows were camera-tested on their own (2026-11-18); this package
is that build under its release name.

**New since v0.40-beta**
- **Three more screen-info rows:** Custom menu → 4. Information → Camera Info Settings → Information 1, 2 and 3 now
  have 17 tick rows. **Subject Detection**, **Exposure Level Meter** and **Image Aspect** each get their own row, so
  they can be hidden on their own: AF Mode now hides only S-AF / C-AF, Exposure Comp. only the number, and Record Mode
  only the picture quality. Rear screen only, as before.
- **Your choices are kept.** One thing to know: if you had unticked AF Mode, Exposure Comp. or Record Mode, the item
  that now has its own row (the subject detection icon, the meter, the aspect) shows again until you untick that row.
- **Firmware Version screen:** shows "Caduceus : 0.40-b2" (the full name is one letter too long beside a Lens line).
- **For developers:** the photo code kit reads a black Border as black (it read −3 as 13).

Everything else is as in [v0.40-beta](../v0.40-beta/NOTES.md).

**Make it and copy it:** run the launcher and press Return (or `python3 firmware/patch.py --release v0.40-beta2`).
Copy `DCOLYMP` and flash it (hold OK, then switch the camera on). Your films, changes, custom modes, button settings
and screen-info choices stay in the camera. **Coming from v0.29.x or older?** Also put `CURVES.BIN` in the `OM3MOD`
folder for the regraded films.
