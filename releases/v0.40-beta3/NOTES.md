# Caduceus for OM-3 v0.40-beta3 (test version)

**Quick single shots, and new film sets in custom modes.** A test version (a GitHub pre-release): v0.30.3 stays the
current version. This is v0.40-beta2 with three fixes, camera-tested together (2026-11-19); this package is that build
under its release name.

**Fixed since v0.40-beta2**
- **Quick single shots with the debug log on (#85):** in Single and Silent Single, a quick second press waited for the
  card to finish the last photo when `DEBUG.TXT` was on the card. The log now saves in the background, so every press
  takes a shot.
- **Quick single shots with Halation:** Halation is back to the shorter fade from before v0.30.3 (about a third faster
  on photos with a glow), and it pauses its work while the shutter is half-pressed, so the next shot can focus and
  fire. Photos look as they did with that fade.
- **A new film set in custom modes (#86):** after copying a new `LOOKS.BIN`, P / A / S / M and the custom modes
  (C1–C5) showed the new film names with a "*" but still shot the old films' colours. Now a new set replaces the
  films cleanly in every mode. Each mode keeps its film numbers, picture mode and Save Settings, and your changes to
  films the new set left alone are kept. Want different films in different custom modes? Put them all in one 20-film
  set and give each custom mode its own (see the FAQ).
- **Debug log:** shows how long the camera waited for us at each press and how long Halation took on the last photo.
- **Firmware Version screen:** shows "Caduceus : 0.40-b3".

Everything else is as in [v0.40-beta2](../v0.40-beta2/NOTES.md) and [v0.40-beta](../v0.40-beta/NOTES.md).

**Make it and copy it:** run the launcher and press Return (or `python3 firmware/patch.py --release v0.40-beta3`).
Copy `DCOLYMP` and flash it (hold OK, then switch the camera on). Your films, changes, custom modes, button settings
and screen-info choices stay in the camera. **Coming from v0.29.x or older?** Also put `CURVES.BIN` in the `OM3MOD`
folder for the regraded films.
