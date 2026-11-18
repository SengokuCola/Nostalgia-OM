# Caduceus for OM-3 v0.30.2

**v0.30.1 plus one fix.** Firmware camera-tested (2026-11-17, test 1; only its name was changed to v0.30.2).

**Fixed**
- **Black review picture, then a frozen live view** ([#65](https://github.com/androidfanman/caduceus-om3/issues/65),
  probably also [#27](https://github.com/androidfanman/caduceus-om3/issues/27)): with **Image Review** on, a photo
  with **Glow**, **Clarity** or **Halation** showed a black review picture, and turning the Creative Dial to a
  standard picture mode (Vivid and the others) then froze live view; a shutter press while frozen could hang the
  camera until the battery came out. Every shot also makes a few small extra pictures, such as the review picture.
  The camera keeps its own effects off those, but our Glow / Halation reached them. Now they don't. Thanks to
  **flrvr** for tracking down the Image Review trigger, and to **cakelesscoder**, whose Caduceus for the E-P7 found the
  same cause first (its "Rec View fix").

**Good to know:** the photo keeps its Glow, Clarity and Halation. The review picture and the camera's playback screen
show the film **without** them, because they come from those small extra pictures; zoom in on the photo in playback,
or open it on your computer, to see the glow and halo.

Everything else is as in [v0.30](../v0.30/NOTES.md) and [v0.30.1](../v0.30.1/NOTES.md).

**Make it and copy it:** run the launcher and press Return (or `python3 firmware/patch.py --release v0.30.2`). Copy
`DCOLYMP` and flash it (hold OK, then switch the camera on). Your films, changes, custom modes and button settings stay
in the camera. **Coming from v0.29.x or older?** Also put `CURVES.BIN` in the `OM3MOD` folder for the regraded films.

Going back: make v0.30.1 and copy its `DCOLYMP`.

The files here are the patch (only the bytes Caduceus for OM-3 adds; no OM firmware), the optional extras
(`CURVES.BIN`, `LOOKS.BIN`, `DEBUG.TXT`, the photo code kit, all as in v0.30) and the expected checksums. Full list
of changes: [CHANGELOG](../../CHANGELOG.md#v0302).
