# Sending a debug log

If something goes wrong with Caduceus for OM-3 (v0.27 or later), a debug log tells us what the camera loaded and what
it was doing.

1. **Download [`DEBUG.TXT`](https://github.com/androidfanman/caduceus-om3/releases/latest/download/DEBUG.TXT)**
   (or the [`DEBUG.TXT`](DEBUG.TXT) in this folder: open it, then *Download raw file*).
2. Put it in the card's **`OM3MOD`** folder (at the top of the card; make the folder if it isn't there).
3. Put the card in the camera, switch on, and use it until the problem happens. Half-press the shutter a few times.
4. Put the card back in your computer: there is now an **`OM3MOD/CADLOG.TXT`**. Attach it to your report in
   [Issues](https://github.com/androidfanman/caduceus-om3/issues), and say what you did and what went wrong.
5. **Delete `DEBUG.TXT` from the card** afterwards, so the camera stops writing the log.

The contents of `DEBUG.TXT` don't matter: the camera only checks that it's there. The log is plain text you can read
yourself. It holds no photos and nothing personal.

**No `CADLOG.TXT` after switching on and half-pressing?** Then the camera isn't running Caduceus v0.27 or later: the
update didn't install. See [Install, step 4](https://androidfanman.github.io/caduceus-om3/pages/install/#step-4-update-the-camera).

## What's in the log

The camera notes every half-press and every release of the shutter button (each counts as one event) and rewrites
`CADLOG.TXT` in the background a moment after you let go of the button, so the log shows the last release and saving
it never holds up a shot (#85). It only reads the camera's settings: it never changes them. Since v0.30 it has these parts:

| Part | What it says |
|---|---|
| **SUMMARY** | The mode, exposure, WB and film now, where the films came from, whether the card files match, how many saves and photos, and anything that looks wrong. |
| **START-UP** | The firmware build, what loaded when the camera switched on, whether each card file matches this firmware, and CURVES.BIN (each film's built-in curves and mix). |
| **NOW** | The shooting mode (P, A, S, M, B, C1–C5, video or S&Q) and a custom mode's Save Settings. The picture mode and film, the film on each COLOR, and which films have changes (the `*` in the camera). The curves and colour mix on each COLOR, with the values of the one in use. |
| **CAMERA** | The camera's own settings: exposure (shutter, aperture, ISO, exposure and flash compensation), white balance, drive, AF mode and target, metering, flash, stabiliser, aspect, image and video quality, the Fn lever and the screen it was on. |
| **SAVES** | Whether edits are waiting and the last save result. How often the films, the custom modes and the per-mode settings were saved since switching on, and anything held back. |
| **CUSTOM MODES** | For P / A / S / M / B and each custom mode: its Save Settings, its films, its picture mode, and whether it keeps its own copy of the settings. Then the last 8 shooting-mode changes. |
| **BUTTONS AND DIALS** | What each button (photo and video), the front and rear dials (both Fn lever positions) and our Creative Dial rows are set to. |
| **LAST 32 SHUTTER BUTTON EVENTS** | Newest first: the mode, the screen, shutter, aperture, ISO, exposure compensation, WB, film, drive / AF mode / quality, edits waiting, the save result and the photos taken so far. |

Some settings show as the camera's own code number in `[ ]`, and a few as `-` until the camera has read them (within
16 half-presses). Older versions (v0.27 to v0.29.5) write a shorter log about Caduceus's own state only.
