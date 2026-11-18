# Caduceus for OM-3 v0.29.4

**v0.29.3 plus fixes from two contributors.** Firmware camera-tested (2026-11-15, build t1: v0.29.3 with pull requests
[#45](https://github.com/androidfanman/caduceus-om3/pull/45), [#46](https://github.com/androidfanman/caduceus-om3/pull/46)
and [#48](https://github.com/androidfanman/caduceus-om3/pull/48); only its name was changed to v0.29.4).

**Fixed**
- **Picture Mode stars:** a row gets a "*" only when it differs from its profile's or film's default. A WB change no
  longer stars the HSL row, the Blacks / Whites and WB rows get their own, and Noise set back to Std clears it.
- **"FILM n*" on the shooting screen** for a changed film, as a changed COLOR shows "COLOR n*".
- **Saved on leaving Picture Mode:** a change is kept even if you switch off right after leaving with MENU.
- **Display:** Halation's bar has no stray center dot; a negative Whites shows "-" (it showed "M").
- **Film Custom WB:** on a film with Custom WB, pressing OK on CWB in the WB screen keeps the film's Kelvin. It used to
  jump to an old value and put a "*" on the film, so photos were taken at the wrong Kelvin.
- The card save code that v0.29.1 replaced is removed (no change you can see).

**Thanks:** [crombach](https://github.com/crombach) (#45, #46) and [buburun](https://github.com/buburun) (#48), who
also tested their changes on their own OM-3s.

**Make it and copy it:** run the launcher and press Return (or `python3 firmware/patch.py --release v0.29.4`). Copy only
`DCOLYMP` and flash it (hold OK, then switch the camera on). Your films, custom modes and button settings stay in the
camera.

Everything else, including the optional extras (`LOOKS.BIN` with the colour-matched standard 20, `DEBUG.TXT`, the photo
code kit), is as in v0.29.3. Going back: make v0.29.3 and copy its `DCOLYMP`.

The files here are the patch (only the bytes Caduceus for OM-3 adds; no OM firmware), the optional extras and the
expected checksums. Full list of changes: [CHANGELOG](../../CHANGELOG.md#v0294).
