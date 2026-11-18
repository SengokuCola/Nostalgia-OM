# Every setting of ours kept per custom mode: research and plan (phase 1, 2026-11-14)

Branch `feature/per-mode-settings`, cut from `review/pr45-46` at 6736c6a (the r4 build: v0.29.3 + #45 + #46 + review
fixes). **No firmware changes in this phase.** Status words: *manual* (OM-3 instruction manual), *camera-tested* (seen
on a real OM-3), *emulator* (om-emu, E147, firmware 1.1), *code* (read from our source), *guess*.

## 1. What the owner asked

Camera test of r4: with C1 and P both on FILM 1, changing that film's Noise in C1 also changed it in P / A.
Owner (2026-11-14): "Every setting in each custom mode should be independant of the other custom modes and the apsm
modes." Said simply: **a change made in C1 shows only in C1; a change made in P / A / S / M shows in P / A / S / M,
never in C1..C5; each custom mode starts from what it was saved with.**

## 2. How the stock OM-3 treats its own settings

| Fact | Source / status |
|---|---|
| Custom modes are registered per position C1..C5 and recalled by turning the mode dial to Cn; "Custom modes can be registered separately for photos (K mode) and movies (n/0 mode)." | *manual*, word for word, [Custom modes page](https://learning.omsystem.com/OM-3/zz_html_manual/en/taking_pictures_using_c_27.html) (checked 2026-11-14) |
| Assign > Set: "Any existing settings will be overwritten." Assign > Reset: "To restore default settings for the selected custom mode, highlight [Reset] ..." (Reset is under **Assign**; it also offers to delete a changed custom-mode name). Recall: menu > Cn > [Recall] > [Yes]; the camera's dialog reads "Apply C2 settings? Current camera settings will be overwritten." | *manual*, word for word (same page); the dialog text *emulator* (k6) |
| Changes made in a custom mode: "By default, changes made after recall will not be applied to the stored settings." "The saved settings will be restored when next you select the custom mode with the mode dial." With Save Settings > [Hold]: "The changed settings remain even if you rotate the mode dial." The manual names only [Hold]; the camera's menu offers **Hold \| Reset** side by side, Reset (the default) with "While shooting in custom mode, changed settings are not saved"; camera settings 1880..1884 (C1..C5): 0 Reset, 1 Hold. | *manual*, word for word; the Reset choice, its text and the setting ids *emulator* (k6). Correction to the summary read earlier: nothing is wrong in the meaning, but the manual itself never shows a "Reset" choice under Save Settings |
| What happens to unsaved changes at a **power-off** or a turn of the photo / movie switch: **not stated** in the manual (its power-off sentence is about recall by a button). | *manual*: not stated |
| Under Reset a change made in Cn is also gone after a power-off (C1 on Reset, Contrast 0 -> +2, power-off, power-on in C1: 0 again; our code wrote nothing, so this was the camera itself). | *emulator* (this phase, r4) |
| Which settings a custom mode stores: the manual's Default Settings tables mark each item that "can be registered in Custom Mode": Picture Mode, WB, Noise Filter, Shading Comp., Button Function, Dial Function, shooting mode and most shooting settings are; Fn lever, menu cursor, press-and-hold times, Wi-Fi and a few others are not. | *manual*, [Default Settings](https://learning.omsystem.com/OM-3/zz_html_manual/en/default_settings_311.html) and its tab pages (read through page summaries; check before quoting any single row) |
| "Adjustments to individual parameters are stored separately for each picture mode and art filter." Color / Monochrome Profile: "The settings are stored in the selected profile ([MONO1] to [MONO4] and [COLOR1] to [COLOR4])." The manual does **not** say whether a custom mode keeps its own copy of them. | *manual*, word for word, [Picture Mode](https://learning.omsystem.com/OM-3/zz_html_manual/en/picture_mode_130.html); the custom-mode part *not stated* |
| **The camera does keep COLOR 1..4's 18 settings per shooting mode** (Saturation x12, Contrast, Sharpness, Shading, Shadows / Midtones / Highlights): turning the dial swaps the whole block for the new mode's. | *emulator* (k1, `research/NOTES.md` "Custom modes and films"); the swap's effect on the camera indirectly *camera-tested* (#41's report) |
| Whether P / A / S / M / B share one set: not stated in the pages read. Emulator: after Contrast +1 in P, a turn to A made our code write 52 COLOR settings, which suggests the camera keeps a separate COLOR block for P and A, but our own write-back hides the answer. | *manual*: not stated; *emulator*: inconclusive (to be settled by the first test build's log) |

So the stock rule, as far as it is known: **each custom mode is a saved snapshot (from Assign); by default (Reset) the
snapshot comes back at every entry with the mode dial (manual) and after a power-off (emulator only); Hold lets
changes made in it stay in it (manual).** The camera already does this for its own 18 COLOR settings (emulator).

## 3. What we do today (r4 = v0.29.3 for this question)

Where each of our settings lives (*code* unless marked):

| Setting | Where it is kept | Per mode? |
|---|---|---|
| Which film each COLOR holds (`P+LIDX`) and which COLOR / film the picture mode is on (the 901 choice) | custom-mode record `OM3C` in the camera's settings memory M (+0x3B000, 48 B): one set for P / A / S / M / B, one per C1..C5; Reset / Hold / Assign / Recall followed | **yes** (v0.29.2, *camera-tested*) |
| COLOR 1..4's 18 camera settings (Saturation x12, Contrast, Sharpness, Shading, Shadows, Midtones, Highlights) | the camera's own per-mode block; **but after every dial turn `rc_put` writes the film's shared record back over them** for each COLOR on a film | **no** for a COLOR on a film (shared through the film's record); yes for a COLOR on its own settings |
| Our rows in COLOR k's slot (`P+32+64k`): Hue / Light (HSL), WB shift, Blacks / Whites, Glow / Clarity, Art, **Noise** (+51), Vignette (+52), Grain (+53), Sharp (+54), split toning (+55..+58), Halation (+30), Tone Balance (+33), film WB (+34..+37) | one RAM slot per COLOR, saved as the `BUNDLES` image in the `OM3U` block (M + 0x3A000) | **no**: the camera does not swap it, nothing of ours does |
| Each film's saved changes (`EDITS` records 0..19) and COLOR 1..4's own settings (records 20..23) | `EDITS` image in the `OM3U` block; written into a film's record only when a film is left by a film pick (`fl_sw`'s capture) | **no**: one per film, for all modes |
| The films as built (`LOOKS`) | `OM3U` block (from the card's `LOOKS.BIN`) | shared on purpose (the film library) |
| Creative Dial: what each of the 4 positions does (rows 571 / 54 / 55 / 1966) | camera settings (borrowed movie-button ids) | **unknown**: depends on whether the camera registers those ids in custom modes |
| Creative Dial memory: each position's last COLOR choice (1958 / 1277 / 1275 / 1284) | camera settings | **no** (*emulator*, k2: same values in P, C2, C3) |
| Delete button function (570 stills / 1276 movie) | camera settings (another body's button ids) | **unknown** (stock Button Function is per custom mode, *manual*) |
| Picture modes other than COLOR 1..4 (Natural, Vivid, MONO, ...) | the camera's own | the camera's rule (we do not touch them) |

Confirmed in the emulator this phase (r4 build, film memory with COLOR 3 = FILM 15, C1 assigned from P, C1 on Reset):

1. **Our rows are shared (the owner's report reproduced):** Halation 0 -> +2 on FILM 15 in C1; turn to P: P's FILM 15
   shows +2; back in C1: +2. (Same in v0.29.3.)
2. **A camera row changed in C1 stays in C1 only and goes under Reset, as stock:** Contrast +2 in C1; P reads 0; back
   in C1 (Reset) it is 0 again (our write-back wrote nothing: the camera's own swap).
3. **A loss in P (existing, also in v0.29.3):** Contrast +1 on FILM 15 in P; turn to C1 and back to P: Contrast is 0
   again. The camera had brought P's +1 back; `rc_put` then wrote the film's saved record (0) over it, because a
   change is written into a film's record only when a film is left by a film pick. So today a change to one of the 18
   camera rows made in P is lost at the next trip through another mode unless a film was picked in between.
4. Under r4, a camera-row change in a custom mode on Reset is forgotten after a power-off (stock); our rows are not
   (they stay, and follow into every mode).

Reasons for (1) and (3), in short: our rows have one copy only, and `rc_put` (v0.29.2, added so the camera's per-mode
values could not mix with a film) overrides the camera's own per-mode memory with the shared film record.

## 4. Target behaviour (the owner's words, matched to the stock rules)

- Six sets: **P / A / S / M / B** share one (as today's custom-mode record; see question Q1), **C1..C5** one each.
  Every setting of ours in Picture Mode (all rows of COLOR 1..4: film choice, HSL, WB rows, tone, Noise, Vignette,
  Grain, Sharp, Glow, Halation, Tone Balance, split toning, film WB) and the camera's own 18 COLOR rows belong to the set
  of the mode they were changed in.
- **Assign > Set to Cn:** Cn's set becomes a copy of the mode now (films, choice and every row).
- **Assign > Reset:** Cn goes back to the camera's defaults (the camera's part) and our rows to neutral / the films as
  built (ours; see Q4).
- **Save Settings: Reset** (default): changes made in Cn last until the dial leaves Cn or the camera is switched off;
  then Cn is its saved set again. **Hold:** changes made in Cn stay in Cn.
- **Recall Cn:** the mode now takes Cn's set (and keeps it if the mode now holds its changes).
- **A film's saved changes** (the '*' and what comes back when a film is picked again) belong to the set too: editing
  FILM 1 in C1 never changes FILM 1 in P (option A below; option B limits this).
- Video and S&Q: keep today's single set (see Q5); nothing new is written at a photo <-> movie switch.
- No card: works the same (all of it lives in the camera's memory). No films: the same, for COLOR 1..4's own settings
  and our rows. Before the first half-press: nothing of this runs (start-up rule); a dial moved before then is handled
  at the first look after the films load, as v0.29.2 does.

## 5. Ways to build it

Common to every option: **stop `rc_put` writing a film's shared record over the camera's per-mode values at every dial
turn.** The camera already keeps its 18 COLOR rows per mode with Reset / Hold. `rc_put` would then run only for a COLOR
whose film the dial turn actually switched (`cm_load`), which is what it is for. This alone fixes finding 3 and makes
the 18 camera rows per mode. It also means fewer settings writes at dial turns (good for the video freeze question).

**Option A: each set has its own film changes (full independence).** Per set: our 4 COLOR slots (4 x 64 B) and its own
copy of the `EDITS` image (24 records x 68 B: a change per film and per COLOR's own settings). P / A / S / M / B's set
*is* today's `EDITS` + slot (no change for them); C1..C5 get theirs in a new record. A film pick inside Cn takes and
keeps that film's changes in Cn's copy.
- Storage: 5 x (256 + 1,648) = 9,520 B in M's free tail (about 20 KB free after `OM3C`; nothing else uses it today:
  other branches must be checked before use). RAM: none extra; the sets are read and written in M's RAM image in place,
  as `OM3C` is.
- Card files / LookLab: unchanged. LookLab writes `LOOKS.BIN` / `BUNDLES.BIN`; the camera reads them only for new films
  or a first start; the per-mode copies never reach the card. A new film set from the card resets C1..C5's film
  changes (they belong to the old films), as `EDITS` does today. The photo code in EXIF records what was shot (the
  active set): unchanged format.
- Migration: no new record -> every Cn's set starts as a copy of today's (shared) one, so nothing changes or is lost at
  the update; independence starts from there. A downgrade to v0.29.x ignores the new record and sees P's set.
- Code: about 1.5-2.5 KB in ext12 (about 30 KB free at v0.29.3). Risk: medium (capture / load points, see the test build).

**Option B: each custom mode keeps only what is on its four COLORs (lighter).** Per Cn: the 4 COLOR records as they
stand (the film with Cn's changes, 4 x 68 B). P / A / S / M / B = today's library. A film picked inside Cn comes from
the library as P has it; Cn's changes to a film it leaves by a film pick are dropped (never written to the library).
- Storage 5 x 4 x 68 = 1,360 B. Code smaller (~1 KB). Same card / LookLab / migration story as A.
- Limit the owner would notice: in C1 (even on Hold), edit FILM 15, pick FILM 2, pick FILM 15 again: the edit is gone
  (the library's FILM 15 comes back).

**Option C (not recommended): only our slot rows per mode**, film changes still shared. Smallest, but a film's '*' and
its saved changes would still cross modes (finding 1 again as soon as a film is picked), so it does not meet the
owner's "every setting".

**Recommendation: A.** It is the only one that meets "every setting ... independent" without exceptions, it matches the
stock snapshot / Reset / Hold rule, its storage fits easily, card files and LookLab stay as they are, and P / A / S / M /
B behave exactly as today apart from the fixed loss (finding 3). B is the fallback if the owner prefers less code.

## 6. Where the risk is, and the first test build

Riskiest parts: (1) dropping `rc_put`'s blanket write-back: it was added (k1) because the camera's per-mode values
mixed with films; with v0.29.2's per-mode film choice the camera's values for a mode should now always belong to that
mode's film, but that must be proven on the camera; (2) moving our 4 slots in and out at the dial turn (task 165,
inside the camera's mode-change step), and keeping the camera settings our rows drive (Noise Filter, Shading,
Sharpness through `s_nr`) right after the turn; (3) Reset vs Hold of our rows across a power-off.

**Test build p1 (photo modes only):**
- `rc_put` only for a COLOR whose film the turn switched (CADLOG: writes per turn).
- Our 4 slots per set (6 x 256 B, record `OM3S` in M after `OM3C`), swapped in RAM at the dial turn by `cm_go` (no
  settings-manager writes for it), saved with the set's rule (Hold / Reset, P always), copied at Assign, taken at
  Recall; first run: all sets = today's slot.
- Not in p1: the per-set film changes of option A (p2), movie modes.
- Emulator before packaging: the four checks above, plus Hold, Recall, power-off in each kind of mode, the before-load
  screens identical to r4, a photo <-> movie switch in P and C1 with zero new writes, and no new '*' after a long dial
  run.
- What p1 asks of the owner's camera: C1 and P on the same film, Noise / Halation / Contrast in C1 then P (each its
  own); Contrast in P survives a trip to C1; C1 on Reset forgets after the dial and after power-off, on Hold keeps;
  start-up and video unchanged; CADLOG's write counts answer the P vs A question (Q1).

## 7a. Decisions (2026-11-14, through cad)

| Question | Answer | Status |
|---|---|---|
| Q1 P / A / S / M / B one set | yes, one set (as today) | cad's default, told to the owner, no objection |
| Q2 a film edit inside a custom mode survives switching film and back | yes: **option A** | **owner decided** |
| Q3 Save Settings: Reset applies to our rows too (forgotten on leaving the mode or at power-off); Hold keeps them | yes | **owner decided** |
| Q4 Assign > Reset: our settings in that custom mode back to the films as built, neutral rows | yes | **owner decided** |
| Q5 video and S&Q exactly as today, zero new writes at a photo / movie switch | yes | cad's default, no objection |
| Q6 Creative Dial and Delete button left as the camera handles them; check in the emulator and report | yes | cad's default, no objection |
| Q7 fix the Contrast loss in P as part of this work | yes | **owner decided** |

Consequence to tell the owner plainly (TEST-STEPS, release notes): Save Settings is **Reset** unless changed, so with
Q3 most custom modes will now forget changes to our rows (and to film edits) when you leave the mode or switch off;
until now our rows kept every change. Set a custom mode to Hold to keep them.

## 7. Questions only the owner can answer (recommendation first)

- **Q1. Should P, A, S, M and B share one set of settings, as now?** Recommended: yes (your words "the apsm modes" read
  as one group; the manual does not say otherwise; p1 will show what the camera itself does).
- **Q2. Inside a custom mode, if you edit a film, switch to another film and come back, should your edit still be
  there?** Recommended: yes (option A). "No" allows the lighter option B.
- **Q3. A custom mode on "Save Settings: Reset": should our settings be forgotten when you leave it or switch off, like
  the camera's own (Contrast etc.)?** Recommended: yes, the same rule for every row. (Today our rows ignore Reset.)
- **Q4. Assign > Reset of a custom mode: what should our settings go back to?** Recommended: the films as built and
  neutral rows, the way a new camera starts.
- **Q5. Video and S&Q: leave them as today (one shared set, nothing new written at a photo / video switch)?**
  Recommended: yes for now; video freezes were caused by settings writes at that moment, so movie custom modes would be
  a separate, later step.
- **Q6. Creative Dial positions and the Delete button: should these also be per custom mode?** Recommended: leave them
  as the camera handles them for now (unknown; to be checked in the emulator during p1 and reported).
- **Q7. The fix for the Contrast loss in P (finding 3) changes behaviour from v0.29.3 (a change made in P now stays
  after a trip to C1). OK as part of this work?** Recommended: yes.

## 8. Not known yet

- Whether the camera keeps a separate COLOR block for P and A (p1's log).
- What the camera's Recall copies on the real camera (k6: nothing visible in om-emu).
- Movie custom modes' mode codes and what the camera swaps there.
- Whether the custom-mode record or the Creative Dial rows are kept by the camera per custom mode.
