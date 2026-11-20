# Camera-evidence overlay for OM-Emu

Upstream: flatpanda/om-emu, MIT, pinned by om-emu.pin. This local overlay does not
change the upstream revision or publish anything. camera-fidelity.patch and its
SHA256 manifest are part of this firmware checkout. research/setup.sh applies it;
tools/test/emu_test.py refuses a missing or changed overlay before any tests.
Manual install/check: `python3 tools/emulator/camera_fidelity.py EMU_ROOT --apply`.
Repeated application is a no-op; unexpected edits/base revisions are refused.
Hashes normalize CRLF to LF for Windows checkouts. Review/regenerate the overlay
when upgrading upstream; do not silently bypass the check.

## Evidence and limits

| Camera evidence | Test/model consequence | Not established |
| --- | --- | --- |
| Focus probe1: lens positions 713,958,690,242; owner identified 690 as clearest | Keep position distinct from a focus-quality measurement | Lens distance mapping, AF metric, or manual-lens focus data |
| First screen test: ordinary shooting interface, no stage counters | Missing stage data must not be treated as successful rendering | Exact blocked stage from that log alone |
| Screen test2: TFT IMG1 base09e90f80 and current098d4d80; SPOS50, stride11136, 800x600, porch148/8 | YC422 IMG accepts aligned DMA base plus independent even start position; known synthetic pixels checked end to end | Actual sensor pixels or optical focus |
| 608 updates,882 TH calls,2 stops; no publications | Deterministic count-matched stress with two observed buffers, repeated native TH/display commit,608 captures and2 stops | Actual event ordering, FPS, concurrent task timing |

No full camera logs, pictures, firmware dumps or user presets are included. The
fixture contains selected hardware registers and counters only. Synthetic pixel
rows and chosen event order are explicitly labelled. Earlier logs do not justify
inventing autofocus/peaking or manual-lens models.

## Model changes

VSC compositor and independent reference accept a 128-byte-aligned IMG YC422 base
with an independent even SPOS under128 bytes. Existing matching-low-bits form stays
valid. OSD and face formats keep their old rules; odd offsets, inconsistent nonzero
address bits, short bursts and unsupported formats still fail. This interprets
observed E147 register values; it is not a measured bus trace. Known-pixel checks
cover both observed addresses and compare all480000 image pixels to an independent
expected image and the reference compositor, with source rows unchanged.

The existing native TH/display-commit model already disables IMG2. It was not
necessary to invent new scheduling behavior: the new firmware test repeatedly
exercises that path, verifies publication, then simulates native layer takeover
and verifies refusal to overwrite it. Tests call capture ticks explicitly; native
queue coverage remains in the separate existing cadence test.

## Running/checking

`OM_EMU_MODEL=E147 node EMU_ROOT/emu/checks/check_camera_layout.mjs` runs14 display
cases with the private stock firmware already unpacked by setup.
`python3 tools/test/emu_test.py BUILD --only camera-log-layout-and-refresh-replay`
runs the compositor and608/882 stress, storing logs and camera-replay-results.json.
It is included in the full suite (32 tests). Use the tested screen-test3 firmware
or later; this work changes emulator/tests, not the SD firmware.

Original upstream compositor fails the aligned source case with SPOS_UNMODELLED;
the overlay passes. Upstream check_liveview --only G5 also has an unrelated E147
bank-table expectation mismatch (3993531648 vs3993531392), reproduced on an untouched
base checkout. Do not claim that upstream group passed or weaken it to hide that
failure. Our dedicated camera-layout test and firmware regression suite are separate.

Physical DMA tearing/cache coherence, EVF-specific aligned layouts, HDMI, sensor
noise/peaking and real-time scheduling remain unvalidated. The overlay must not be
used to label emulator output as an actual camera result.