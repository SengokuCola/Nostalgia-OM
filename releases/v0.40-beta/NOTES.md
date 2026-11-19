# Caduceus for OM-3 v0.40-beta (test version)

**Crops back at switch-on, looks that show in live view as you adjust them, black borders, and your own choice of
shooting-screen info.** A test version (a GitHub pre-release): v0.30.3 stays the current version. Every part was
camera-tested on its own (2026-11-18); this package is being tested as a whole.

**New since v0.40-alpha**
- **Crops come back at switch-on** ([#83](https://github.com/androidfanman/caduceus-om3/issues/83), reported by
  crombach): XPan, 21:9 and 5:4 are there as soon as the camera has started, with no half-press. The camera still
  saves the plain ratio with a note of the crop, so it never starts in a shape it doesn't know.
- **The frame lines follow the crop:** the camera's green frame lines sit at the edges of XPan, 21:9 and 5:4, on the
  rear screen and in the viewfinder.
- **Looks show in live view as you adjust them:** split toning (HSL Shadows / Highlights), Split Tone Balance, the RGB
  curves and B/W now follow each dial click, without a half-press.
- **Black borders:** the Border row now runs from −5 to +5: minus is black, plus is white, at the same widths.
- **The Border at every ratio:** at 3:2, 16:9, 1:1 and 3:4 the border is now inside the photo on all four sides (it was
  cut off), and it reaches the edge of the small preview the camera keeps in each JPEG.
- **Choose what the shooting screen shows:** Custom menu → 4. Information → Camera Info Settings → Information 1, 2 and
  3 each get 14 more tick rows (Shooting Mode, Shutter Speed, Aperture, Exposure Comp., ISO, WB, Picture Mode,
  Image Stabilizer, AF Mode, Drive Mode, Metering, Record Mode, Remaining Files, Touch screen). Untick a row and that
  item leaves that display. Rear screen only; from the first half-press after switch-on.
- **Faster film grain:** the grain picture is made about a third faster.
- **Our version on the camera:** MENU → wrench tab, page 6 → Firmware Version shows "Caduceus : v0.40-beta" under
  OM's version.
- **Faster looks and two fixes** ([#82](https://github.com/androidfanman/caduceus-om3/pull/82), by crombach): film
  switching and dial clicks on the colour wheel, Mix and RGB pages do less work; no more one-frame flash between the
  WB table and the Highlight & Shadow page; Border, Glow, Halation, Tone Balance and Film Grain step the same way as
  Contrast on the dial.
- **Focus stacking with more lenses** ([#79](https://github.com/androidfanman/caduceus-om3/pull/79), by Bensonson):
  lenses the camera otherwise refuses for focus stacking (for example the M.Zuiko 17mm F1.8 II) can be used.

**Differences to know**
- **Shading** is the camera's own, as before.
- **Screen info** is for the rear screen; the viewfinder is unchanged.
- **LookLab** doesn't know the black Border, the grain strength and size, or the crops yet; its update comes with
  v0.40.

Everything else is as in [v0.40-alpha](../v0.40-alpha/NOTES.md).

**Make it and copy it:** run the launcher and press Return (or `python3 firmware/patch.py --release v0.40-beta`). Copy
`DCOLYMP` and flash it (hold OK, then switch the camera on). Your films, changes, custom modes and button settings stay
in the camera. **Coming from v0.29.x or older?** Also put `CURVES.BIN` in the `OM3MOD` folder for the regraded films.
