# Experimental focus stacking lens unlock (fs1)

This fork of Caduceus for **OM-3 firmware 1.1** removes the stacking-capability rejection for otherwise eligible autofocus lenses. The initial camera test target is the **M.Zuiko Digital 17mm f/1.8 II**. The change is general, not a special case for that lens, and does not add lens IDs to a list.

**Status: emulator only; no camera test yet.** Enabling the eligibility result does not prove that every lens can focus-step reliably or that the camera will finish a composite. The existing exclusion check, focus bracketing, focus stepping, capture and merge code are unchanged. The firmware's normal restrictions on shooting modes still apply. This does not enable stacking with manual lenses, stacking plus High Res, or change the number of frames.

## Build

The upstream release downloads do not contain this patch. Build this branch from source using the normal developer workflow (`research/setup.sh`, with your own official OM-3 1.1 file):

```sh
. "$OM3_WORK/env.sh"
python3 firmware/build.py --stock "$OM3_STOCK" --toolchain "$OM3_TOOLCHAIN" --out "$OM3_WORK/out-fs1"
OM_EMU_MODEL=E147 python3 tools/test/emu_test.py "$OM3_WORK/out-fs1" --stock "$OM3_STOCK"
```

The build identifies itself in `CADLOG.TXT` as `v0.30.3-fs1 (focus stacking; not camera-tested)`. `firmware/patch.py` still makes the upstream release; it does not build this branch's change.

## Camera test (pending)

Use a full battery. Keep an official 1.1 restore file and follow [the installation guide](INSTALL.md). Only flash an OM-3 on 1.1. An interrupted firmware write can stop the camera starting.

Copy the experimental build's `E1479999.BIN` to `DCOLYMP/E1479999.BIN` on the SD card. Use the `GUIDES.BIN` built with it if using an external copy, never one from a different build. Do not replace your saved films or settings. Hold OK while switching on to update.

- [ ] With the 17mm f/1.8 II attached, normal startup, autofocus and a single photo work.
- [ ] In an ordinary photo mode, enable Focus BKT and Focus Stacking. Record the starting focus, frame count, focus differential and image quality.
- [ ] On a tripod, photograph a static subject with near and far detail. Start with a short stack and a moderate focus differential.
- [ ] The camera takes the expected frames, changes focus between them, saves the source photos and finishes a composite. Check the composite in playback and on a computer; a selectable menu alone is not a pass.
- [ ] Repeat, then test another frame count and RAW+JPEG. The camera still responds after each stack.
- [ ] Test focus bracketing without stacking, normal photography, films, and video.
- [ ] With a previously supported PRO/Macro lens, stacking still works. With no lens or a manual lens, the original restrictions remain. Switch the camera off before changing lenses.
- [ ] Record the firmware build name, lens model/firmware, settings and results before considering an upstream PR.

If it freezes, fails to move focus or produces no composite, stop the test and restore official 1.1 using `DCOLYMP/E1479999.BIN`. Do not treat this experimental build as a release until the camera test passes.

## Implementation and credit

The decision routine is `fcs_check_focus_stacking_enable`, at `0x60901988` in the decoded OM-3 1.1 main block (base `0x60021020`). It first calls `0x602f3671`; a nonzero result branches to the disabled result at `0x609019a2`. It then calls `0x602fdc68`, which reads the stacking-capability byte at lens-record offset 119091, with a null-record check. Only the latter result's rejection branch at **`0x6090199e`** changes: `bne 0x609019a2` becomes two NOPs, allowing `mov 1,d2`. The first exclusion remains intact.

This follows the approach in [emudojo's E-M1 II focus stacking patch](https://github.com/emudojo/caduceus/tree/omdem12-implement-colors-more/patches/omdem1mk2/focus_stacking), independently located in OM-3 1.1 through its diagnostic string and disassembly. No E-M1 II addresses or firmware bytes were reused. No new runtime hook, code allocation, startup task or setting is added. The builder checks the stock firmware SHA-256 and the original bytes before applying the edit.

`focus-stacking-allows-unlisted-lenses-keeps-exclusions` executes the actual decision routine in om-emu with controlled results for its two lens queries. It checks unlisted/eligible → enabled, listed/eligible → enabled, and excluded → disabled with either capability result, plus return, stack and callee-saved registers. These are synthetic query results, not simulated lens hardware or a capture test. The test must fail on the unmodified build.
