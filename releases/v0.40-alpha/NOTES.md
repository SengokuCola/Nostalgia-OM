# Caduceus for OM-3 v0.40-alpha (test version)

**Crop modes (XPan, 21:9 and 5:4), white photo borders, our own film grain, and safer start-up.**
A test version (a GitHub pre-release): v0.30.3 stays the current version. Firmware camera-tested (2026-11-17, v0.40
alpha test 1; only its name was changed to v0.40-alpha).

**New**
- **Crop modes: XPan, 21:9 and 5:4.** Three new Image Aspect choices, on the super control panel and in the Image
  Aspect menus. JPEGs are saved at that shape (XPan 5184 × 1920, 21:9 5184 × 2224, 5:4 4864 × 3888); RAW keeps the
  whole sensor with the crop marked, as for the camera's own ratios. Live view shows the crop, and the grid lines,
  the focus target and the histogram fit inside it. Image review and playback show XPan, 21:9 or 5:4 with the
  quality (e.g. LSF+RAW). Idea from Caduceus for the E-P7 (cakelesscoder). Photos only.
- **A white Border, per film.** A new Border row at the end of Picture Mode: 0 (off) to 5, the same width on every
  side. JPEG only; the photo keeps its size and the border covers its outer edge; RAW is untouched. In live view a
  thin frame line shows where the border's inner edge will be (from the first half-press; not in video).
- **Our own film grain, with strength and size.** Film Grain now goes Off and 1 to 5, with a new **Grain Size** row
  under it (Fine, Medium or Coarse). It's our own colour grain, added with no extra wait after the photo; highlights
  stay white and Halation keeps its glow with grain on. A film's old Low / Med / High become 2 / 3 / 5.
- **Picture Mode stays open 30 s** ([#75](https://github.com/androidfanman/caduceus-om3/issues/75),
  [#76](https://github.com/androidfanman/caduceus-om3/pull/76), by crombach): with no key, dial or tap it used to
  close after 8 s. Other screens (white balance, the super control panel) still close after 8 s.

**Changed**
- **Safer start-up:** while the camera starts it copies its firmware into memory piece by piece. Live view's first
  set-up, and putting a crop back, could reach parts of our code before their piece was in. That was never seen to
  cause a problem, but now our code checks the camera's own "ready" signal first, and until then the camera does what
  it always did.

**Differences to know**
- **A crop comes back at the first half-press.** At switch-on the camera starts on 16:9 (for XPan and 21:9) or 4:3
  (for 5:4) and shows that ratio until you half-press. Nothing of ours runs while the camera starts.
- **The playback label goes by the photo's shape,** so a photo of those shapes trimmed in the camera is also labelled
  XPan, 21:9 or 5:4.
- **LookLab** doesn't know the Border, the grain strength and size, or the crops yet.

Everything else is as in [v0.30.4-alpha](../v0.30.4-alpha/NOTES.md).

**Make it and copy it:** run the launcher and press Return (or `python3 firmware/patch.py --release v0.40-alpha`). Copy
`DCOLYMP` and flash it (hold OK, then switch the camera on). Your films, changes, custom modes and button settings stay
in the camera. **Coming from v0.29.x or older?** Also put `CURVES.BIN` in the `OM3MOD` folder for the regraded films.

Going back: make v0.30.3 and copy its `DCOLYMP`.

The files here are the patch (only the bytes Caduceus for OM-3 adds; no OM firmware), the optional extras
(`LOOKS.BIN`, `DEBUG.TXT`, the photo code kit, as in v0.30; `CURVES.BIN` is in [v0.30](../v0.30/)) and the expected
checksums. Full list of changes: [CHANGELOG](../../CHANGELOG.md#v040-alpha-test-version).
