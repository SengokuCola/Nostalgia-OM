/* Experimental visual screen, opt-in FOCUS.TXT, first half-press only.
 * DISPLAY histogram updates provide a conditional cadence, NOT a new timer.
 * Histogram stop and changed TH geometry release our layer before stock.
 * Only ordinary shooting GUI 0x0801 + physical stills mode. No AF claims.
 */
.section .hook_fs_image,"ax"
 jmp fs_commit_image_entry
 nop
 nop
 nop
.section .hook_fs_level,"ax"
 jmp fs_commit_level_entry
.section .hook_fs_tick,"ax"
 call fs_update_entry,[d2,d3,a2],48
.section .hook_fs_stop,"ax"
 call fs_stop_entry,[],4
.section .hook_fs_th,"ax"
 jmp fs_th_entry
 nop
 nop
 nop
/* The switch is initialized by section one. Only a card-ready shutter event
 * may arm it, after all ten native sections have been copied.
 * The early paths reproduce the original calls / displaced instructions. */
.section .ext1,"ax"
 .macro FS_ARMED dst, tmp
 mov (FS_ON),\tmp
 cmp 1,\tmp
 bne 1f
 mov (SEC_READY),\tmp
 and 32,\tmp
 beq 1f
 jmp \dst
1:
 .endm
fs_update_entry:
 FS_ARMED fs_update,d2
 jmp fs_stock_update
fs_stop_entry:
 /* Stock stop immediately clears d1. The unarmed path retains the native
  * frame, return address and original caller's arguments. */
 FS_ARMED fs_stop_armed,d1
 jmp fs_stock_stop
fs_th_entry:
 FS_ARMED fs_th,d0
 mov a0,a3
 mov 2,d0
 call fs_th_check,[d2,a2,a3],16
 jmp fs_th_resume
fs_commit_image_entry:
 FS_ARMED fs_commit_image,d2
 mov (4,sp),a0
 inc4 a0
 mov (a0),d2
 cmp 0,d2
 beq 1f
 jmp fs_native_image
1:
 jmp fs_native_skip
fs_commit_level_entry:
 FS_ARMED fs_commit_level,d3
 mov (4,a3),a0
 and d0,d2
 jmp fs_native_level
.balign 4
fs_on: .long 0                    /* reset with section one; fs_arm is the only writer */
.section .ext13,"ax"
 .macro FS_INC off
 mov (FS_D+\off),d0
 add 1,d0
 mov d0,(FS_D+\off)
 .endm
fs_update:
 mov d0,(4,sp)
 call fs_stock_update,[d2,d3,a2],48
 mov d0,(20,sp)
 mov d1,(24,sp)
 mov a0,(28,sp)
 mov a1,(32,sp)
 mov (FS_ON),d0
 cmp 1,d0
 bne 1f
 FS_INC 0
1:
 mov (4,sp),d0
 call fs_tick,[d2,d3,a2,a3],48
 mov (20,sp),d0
 mov (24,sp),d1
 mov (28,sp),a0
 mov (32,sp),a1
 ret [d2,d3,a2],48
fs_stop_armed:
 call fs_stop,[d2,d3,a2,a3],64
 ret [],4
fs_stop:
 mov d0,(4,sp)
 mov d1,(8,sp)
 mov a0,(12,sp)
 mov a1,(16,sp)
 mov (FS_ON),d0
 cmp 1,d0
 bne 1f
 FS_INC 8
1:
 call fs_clear,[d2,d3,a2,a3],24
 mov (4,sp),d0
 mov (8,sp),d1
 mov (12,sp),a0
 mov (16,sp),a1
 call fs_stock_stop,[],4
 ret [d2,d3,a2,a3],64
fs_th: /* original TH frame [d2,d3,a2,a3],76 */
 mov (FS_ON),d0
 cmp 1,d0
 bne fs_th_original
 FS_INC 12
 mov a0,(4,sp)
 mov a1,(8,sp)
 mov d1,(12,sp)
 call fs_th_geometry,[d2,d3,a2,a3],32
 mov (4,sp),a0
 mov (8,sp),a1
 mov (12,sp),d1
fs_th_original:
 mov a0,a3
 mov 2,d0
 call fs_th_check,[d2,a2,a3],16
 jmp fs_th_resume

/* Changes to the displayed channel invalidate its overlay and in-flight
 * capture. Other requests still update their own diagnostic snapshot.
 * Same pixels sent to a different set of outputs are not a geometry change.
 * LOCK covers both the samples and the overlay owner. */
fs_th_geometry:
 mov a0,a2
 clr d0
 call LOCK,[d2],8
 mov d0,(8,sp)
 mov (a2),d2
 clr d3
 btst 1,d2
 beq fs_th_evf
 mov a2,a0
 mov FS_TH_SAMPLES,a1
 call fs_th_record,[d2,d3,a2,a3],20
 mov d0,d3
fs_th_evf:
 btst 2,d2
 beq fs_th_check_active
 mov a2,a0
 mov FS_TH_SAMPLES+44,a1
 call fs_th_record,[d2,d3,a2,a3],20
 asl 1,d0
 or d0,d3
fs_th_check_active:
 mov (FS_DEVICE),d0
 and d3,d0
 beq fs_th_unlock
 mov (FS_EPOCH),d0
 inc d0
 mov d0,(FS_EPOCH)
 call fs_release,[d2,d3,a2,a3],20
fs_th_unlock:
 mov (8,sp),d0
 call UNLOCK,[d2],8
 ret [d2,d3,a2,a3],32

fs_th_record: /* a0 = native request, a1 = per-device sample */
 mov a0,a2
 mov a1,a3
 mov 1,d3
 mov (a3),d0
 cmp 0,d0
 beq 1f
 clr d3
1:
 mov (a2),d0
 mov d0,(a3)
 inc4 a3
 mov fs_th_offsets,a0
 mov 10,d2
fs_th_compare:
 mov (a0),d0
 mov a2,a1
 add d0,a1
 mov (a1),d1
 cmp 68,d0
 bne 2f
 and 0xffff,d1
2:
 mov (a3),d0
 cmp d0,d1
 beq 3f
 mov 1,d3
3:
 mov d1,(a3)
 inc4 a0
 inc4 a3
 sub 1,d2
 bne fs_th_compare
 mov d3,d0
 ret [d2,d3,a2,a3],20
.balign 4
fs_th_offsets: .long 12,16,40,44,48,52,56,60,64,68

fs_arm: /* first card-ready half press; no DEBUG.TXT dependency */
 mov (FS_CHECKED),d0
 cmp 0,d0
 bne fs_arm_out
 call hl_ok,[a2],16
 cmp 0,d0
 bne fs_arm_out
 mov 1,d0
 mov d0,(FS_CHECKED)
 mov fs_path,a0
 mov lg_mr,a1
 call fopen,[],4
 cmp 0,a0
 beq fs_arm_out
 mov a0,a2
 clr d0
 movbu d0,(4,sp)
 mov sp,a0
 inc4 a0
 mov a2,a1
 mov 1,d0
 mov 1,d1
 call fread,[d2,d3,a2,a3],24
 mov a2,a0
 call fclose,[d2,a2,a3],16
 clr d0
 movbu (4,sp),d1
 cmp 82,d1                         /* 'R' -> start in Rangefinder Yellow Patch */
 beq 10f
 cmp 114,d1                        /* 'r' */
 beq 10f
 cmp 89,d1                         /* 'Y' */
 beq 10f
 cmp 121,d1                        /* 'y' */
 beq 10f
 cmp 50,d1                         /* '2' */
 bne 11f
10:
 mov 1,d0
11:
 mov d0,(FS_VISUAL_MODE)
 mov fs_phase_path,a0
 mov lg_mr,a1
 call fopen,[],4
 cmp 0,a0
 beq fs_arm_ready
 mov a0,a2
 clr d0
 movbu d0,(4,sp)
 mov sp,a0
 inc4 a0
 mov a2,a1
 mov 1,d0
 mov 1,d1
 call fread,[d2,d3,a2,a3],24
 mov a2,a0
 call fclose,[d2,a2,a3],16
 mov 1,d0
 movbu (4,sp),d1
 cmp 50,d1
 bne 1f
 mov 2,d0
1:
 mov d0,(PH_MODE)
fs_arm_ready:
 mov 1,d0
 mov d0,(FS_ON)
fs_arm_out:
 ret [d2,d3,a2,a3],24

fs_gate: /* leaf, no settings/getter calls from DISPLAY */
 mov (FS_ON),d0
 cmp 1,d0
 bne fs_gate_no
 movhu (LG_GUI),d1
 mov d1,(FS_D+56)
 movbu (UI_PSW),d0
 mov d0,(FS_D+60)
 cmp 2,d0
 bne fs_gate_mode
 movhu (LG_GUI),d0
 cmp 0x0801,d0
 bne fs_gate_gui
 clr d0
 mov d0,(FS_D+16)
 mov 1,d0
 ret [],0
fs_gate_mode:
 mov 2,d0
 bra fs_gate_record
fs_gate_gui:
 mov 3,d0
fs_gate_record:
 mov d0,(FS_D+16)
fs_gate_no:
 clr d0
 ret [],0

fs_clear: /* epoch invalidates a tile being captured by another context */
 mov (FS_ON),d0
 cmp 1,d0
 bne fs_clear_out
 clr d0
 call LOCK,[d2],8
 mov d0,(4,sp)
 mov (FS_EPOCH),d0
 add 1,d0
 mov d0,(FS_EPOCH)
 call fs_release,[d2,d3,a2,a3],20
 mov (4,sp),d0
 call UNLOCK,[d2],8
fs_clear_out:
 ret [d2,d3,a2,a3],24
fs_release: /* caller holds LOCK; no source reads */
 mov (FS_OWNER),d0
 cmp 0,d0
 beq fs_release_out
 mov (FS_OWNER+4),d0
 mov FS_OWNER,a0
 mov 0,a1
 call overlay_native,[d2,d3,a2,a3],40
fs_release_out:
 ret [d2,d3,a2,a3],20

fs_tick:
 mov d0,(4,sp)
 mov (FS_ON),d0
 cmp 1,d0
 bne fs_tick_out
 FS_INC 4
 mov (4,sp),d0
 mov d0,(FS_D+20)
 call fs_gate,[],0
 cmp 1,d0
 bne fs_tick_clear
 mov (4,sp),d0
 cmp 1,d0
 beq fs_tft
 cmp 2,d0
 bne fs_tick_clear
 mov 1,d0
 bra fs_channel
fs_tft:
 mov 2,d0
fs_channel:
 mov d0,(4,sp)
 mov d0,(FS_D+24)
 clr d0
 call LOCK,[d2],8
 mov d0,(20,sp)
 mov (FS_BUSY),d0
 cmp 0,d0
 bne fs_busy_skip
 mov 1,d0
 mov d0,(FS_BUSY)
 mov (4,sp),d0
 xor 3,d0
 mov d0,(FS_DEVICE)
 mov (FS_EPOCH),d0
 mov d0,(8,sp)
 mov (FS_OWNER),d0
 cmp 0,d0
 beq fs_claimed
 mov (FS_OWNER+4),d0
 mov (4,sp),d1
 cmp d1,d0
 beq fs_claimed
 call fs_release,[d2,d3,a2,a3],20
fs_claimed:
 clr d0
 mov d0,(PH_SEEN)
 movbu d0,(FS_MEASURED)
 mov 1,d0                         /* default trace outcome: rejected/held EVF frame */
 mov d0,(28,sp)
 mov (4,sp),d0
 clr d1
 call fs_diag_active,[d2,d3,a2,a3],20
 mov (20,sp),d0
 call UNLOCK,[d2],8
 FS_INC 40
 mov (4,sp),d0
 call fs_diag_capture,[d2,d3,a2,a3],20
 mov (4,sp),d0
 mov FS_SRC,a0
 call capture_native,[d2,d3,a2,a3],160
 mov (FS_D+28),d2
 mov d0,(FS_LAST)
 mov d0,(FS_D+28)
 mov d1,(FS_D+32)
 cmp 0,d0
 beq fs_captured
 mov (4,sp),d0
 cmp 1,d0
 bne fs_failed
 /* Discard a torn tile. One isolated EVF source swap can leave the preceding
  * tile in place. Repeated misses and mode/geometry changes release it. */
 cmp 14,d1
 beq fs_address_miss
 cmp 13,d1
 bne fs_failed
 mov (FS_EV_MISS+4),d0
 inc d0
 mov d0,(FS_EV_MISS+4)
 bra fs_failed
fs_address_miss:
 mov (FS_EV_MISS),d0
 inc d0
 mov d0,(FS_EV_MISS)
 cmp 0,d2
 bne fs_failed
 clr d0
 call LOCK,[d2],8
 mov d0,(20,sp)
 mov (FS_OWNER),d0
 cmp 1,d0
 bne fs_publish_skip
 mov (FS_OWNER+8),d0
 and 1,d0
 beq fs_release_miss
 mov (8,sp),d1
 mov (FS_EPOCH),d0
 cmp d1,d0
 bne fs_release_miss
 call fs_gate,[],0
 cmp 1,d0
 bne fs_release_miss
 mov (FS_EV_MISS+8),d0
 inc d0
 mov d0,(FS_EV_MISS+8)
 bra fs_publish_skip
fs_release_miss:
 call fs_release,[d2,d3,a2,a3],20
 bra fs_publish_skip
fs_captured:
 mov d0,(FS_D+32)                 /* success d1 is centre, not a rejection reason */
 mov d1,(12,sp)
 btst 0x4000,d1
 beq fs_captured_tile
 and 0xffffbfff,d1
 mov d1,(12,sp)
 mov (FS_EV_LATCHED),d0
 inc d0
 mov d0,(FS_EV_LATCHED)
fs_captured_tile:
 mov (FS_FLIP),d0
 cmp 0,d0
 beq fs_try_one
 clr d0
 bra fs_try_buffer
fs_try_one:
 mov 1,d0
fs_try_buffer:
 mov d0,(16,sp)
 call fs_tile_in_use,[],0
 cmp 0,d0
 beq fs_buffer_ok
 mov (16,sp),d0
 xor 1,d0
 mov d0,(16,sp)
 call fs_tile_in_use,[],0
 cmp 0,d0
 beq fs_buffer_ok
 mov (FS_HELD),d0
 inc d0
 mov d0,(FS_HELD)
 clr d0
 call LOCK,[d2],8
 mov d0,(20,sp)
 mov (FS_OWNER),d0
 cmp 1,d0
 bne fs_hold_done
 mov (FS_OWNER+4),d0
 asl 15,d0
 add 0x9bb80000,d0
 mov d0,a3
 mov ov_offsets,a2
 mov FS_OWNER+68,a1
 mov 13,d3
fs_hold_owner:
 mov (a2),d0
 mov a3,a0
 add d0,a0
 mov (a0),d0
 mov (a1),d1
 cmp d0,d1
 bne fs_hold_lost
 inc4 a1
 inc4 a2
 add -1,d3
 bne fs_hold_owner
 bra fs_hold_done
fs_hold_lost:
 clr d0
 mov d0,(FS_OWNER)
fs_hold_done:
 mov 2,d0
 mov d0,(28,sp)
 jmp fs_publish_skip
fs_buffer_ok:
 mov (PH_MODE),d0
 cmp 2,d0
 bne fs_check_manual_pdaf
 call fs_phase_read,[d2,d3,a2,a3],24
 cmp 99,d0
 bne fs_apply_shift
 mov 7,d0
 mov d0,(28,sp)
 jmp fs_failed
fs_check_manual_pdaf:
 cmp 1,d0
 bne fs_use_contrast
 movbu (0xa32d3d32),d0
 cmp 0,d0
 bne fs_use_contrast
 /* Dumb manual lens + ZAF.TXT: run contrast stats for comparison + real Layer 0 PDAF! */
 call fs_measure,[d2,d3,a2,a3],48
 mov 1,d1
 movbu d1,(FS_MEASURED)
 call fs_pdaf_live,[d2,d3,a2,a3],28
 mov (FS_VISUAL_MODE),d1
 cmp 2,d1
 bne fs_visual_active
 /* Mode 2: user toggled overlay off via Delete key -> release IMG2 cleanly. */
 mov 7,d0
 mov d0,(28,sp)
 jmp fs_failed
fs_visual_active:
 cmp 1,d1
 beq fs_render_rf
 /* Mode 0: Split-Image + Microprism driven by signed optical PDAF (-6..+6). */
 cmp 0,d0
 beq fs_pdaf_contrast_fb
 mov (PD_SPLIT_S),d0
 bra fs_apply_shift
fs_pdaf_contrast_fb:
 mov (fs_focus_stats+8+0x40000000),d0
 mov (4,sp),d1
 call fs_filter_band,[d2,d3,a2,a3],20
 bra fs_apply_shift
fs_render_rf:
 /* Mode 1: Leica Rangefinder Yellow Patch driven by signed optical PDAF (-10..+10). */
 mov (16,sp),d1
 asl 15,d1
 add FS_DST,d1
 mov d1,(24,sp)
 mov d1,a1
 mov FS_SRC,a0
 mov (PD_RF_S),d0
 mov (PD_VALID),d2
 clr d1
 cmp 0,d2
 beq fs_rf_call
 mov 1,d1
 cmp 0,d0
 bne fs_rf_call
 mov 2,d1                            /* in-focus locked: crisp white frame */
fs_rf_call:
 call screen_rangefinder,[d2,d3,a2,a3],48
 cmp 0,d0
 beq fs_mapped
 mov 6,d0
 mov d0,(28,sp)
 jmp fs_failed
fs_use_contrast:
 call fs_measure,[d2,d3,a2,a3],48
 mov 1,d1
 movbu d1,(FS_MEASURED)
 mov (4,sp),d1
 call fs_filter_band,[d2,d3,a2,a3],20
fs_apply_shift:
 call fs_set_strength,[d2,d3,a2,a3],32
 mov (16,sp),d0
 asl 15,d0
 add FS_DST,d0
 mov d0,(24,sp)
 mov d0,a1
 mov FS_SRC,a0
 mov FS_MAP,d0
 mov 8192,d1
 call screen_map,[d2,d3,a2,a3],40
 cmp 0,d0
 beq fs_mapped
 mov 6,d0
 mov d0,(28,sp)
 jmp fs_failed
fs_mapped:
 /* Construct fully bounded unscaled 128-square IMG2 request. */
 mov fs_template,a0
 mov FS_REQ,a1
 mov 13,d2
fs_request_copy:
 mov (a0),d0
 mov d0,(a1)
 add 4,a0
 add 4,a1
 add -1,d2
 bne fs_request_copy
 mov (24,sp),d0
 lsr 4,d0
 mov d0,(FS_REQ)
 mov (4,sp),d0
 asl 15,d0
 add 0x9bb80000,d0
 mov d0,a0
 mov (12,sp),d1
 and 0x7fff,d1
 asl 16,d1
 mov (0x42c,a0),d0
 and 0xffff0000,d0
 add d1,d0
 or 128,d0
 mov d0,(FS_REQ+16)
 mov (12,sp),d1
 mov d1,d2
 and 0x8000,d2
 and 0xffff0000,d1
 mov 128,d3
 cmp 0,d2
 beq fs_tile_area
 lsr 1,d1
 and 0xffff0000,d1
 mov 64,d3
 /* Whole-frame pitch stays at 256 bytes. Field scanning steps alternate rows. */
fs_tile_area:
 mov (0x430,a0),d0
 and 0xffff0000,d0
 add d1,d0
 or d3,d0
 mov d0,(FS_REQ+20)
 clr d0
 call LOCK,[d2],8
 mov d0,(20,sp)
 mov (FS_EPOCH),d0
 mov (8,sp),d1
 cmp d1,d0
 bne fs_cancel
 call fs_gate,[],0
 cmp 1,d0
 bne fs_cancel
 mov (4,sp),d0
 call cap_scan,[],0
 mov (12,sp),d1
 lsr 15,d1
 and 1,d1
 cmp d1,d0
 bne fs_cancel
 FS_INC 44
 mov (4,sp),d0
 mov FS_OWNER,a0
 mov FS_REQ,a1
 call overlay_native,[d2,d3,a2,a3],40
 cmp 2,d0
 bne fs_publish_result
 /* Stock TH/update may disable IMG2. Retry idle acquisition under this same
  * lock; an enabled layer belonging to stock is still refused. */
 mov (4,sp),d0
 mov FS_OWNER,a0
 mov FS_REQ,a1
 call overlay_native,[d2,d3,a2,a3],40
fs_publish_result:
 mov d0,(FS_LAST)
 mov d0,(FS_D+36)
 cmp 0,d0
 beq fs_published
 mov 5,d0
 mov d0,(28,sp)
 bra fs_publish_skip
fs_published:
 clr d0
 mov d0,(28,sp)
 mov (16,sp),d0
 mov d0,(FS_FLIP)
 mov (FS_FRAMES),d0
 add 1,d0
 mov d0,(FS_FRAMES)
 mov (4,sp),d0
 mov 1,d1
 call fs_diag_active,[d2,d3,a2,a3],20
 bra fs_publish_skip
fs_cancel:
 FS_INC 48
 mov 3,d0
 mov d0,(28,sp)
fs_publish_skip:
 mov (28,sp),d0
 mov (4,sp),d1
 call fs_trace_record,[d2,d3,a2,a3],20
 clr d0
 mov d0,(FS_BUSY)
 mov (20,sp),d0
 call UNLOCK,[d2],8
 mov (PH_MODE),d0
 cmp 0,d0
 beq fs_tick_out
 call zr_sample,[d2,d3,a2,a3],32
 ret [d2,d3,a2,a3],48
fs_unlock_out:
 mov (20,sp),d0
 call UNLOCK,[d2],8
 ret [d2,d3,a2,a3],48
fs_busy_skip:
 FS_INC 52
 bra fs_unlock_out
fs_failed:
 call fs_clear,[d2,d3,a2,a3],24
 clr d0
 call LOCK,[d2],8
 mov d0,(20,sp)
 mov (28,sp),d0
 cmp 6,d0
 bcc fs_failure_traced
 mov 4,d0
 mov d0,(28,sp)
fs_failure_traced:
 jmp fs_publish_skip
fs_tick_clear:
 call fs_clear,[d2,d3,a2,a3],24
fs_tick_out:
 ret [d2,d3,a2,a3],48

/* A panel can still scan the previous address after a new descriptor was
 * submitted. Avoid writing either a pending or a latched active tile. */
fs_tile_in_use:
 asl 15,d0
 add FS_DST,d0
 lsr 4,d0
 mov 0x9bb88000,a0
 mov 0x9bb90000,a1
fs_tile_panel:
 mov (0x60,a0),d1
 and 16,d1
 beq fs_tile_latched
 mov (0x394,a0),d1
 cmp d1,d0
 beq fs_tile_busy
fs_tile_latched:
 mov (0x2060,a0),d1
 and 16,d1
 beq fs_tile_next
 mov (0x2394,a0),d1
 cmp d1,d0
 beq fs_tile_busy
fs_tile_next:
 cmp a1,a0
 beq fs_tile_free
 mov a1,a0
 bra fs_tile_panel
fs_tile_busy:
 mov 1,d0
 ret [],0
fs_tile_free:
 clr d0
 ret [],0

 .include "focus_contrast.inc"
 .include "focus_phase.inc"
 .include "focus_pdaf_live.inc"
 .include "focus_trace.inc"
 .include "focus_commit.inc"
 .include "focus_capture.inc"
 .include "focus_render.inc"
 .include "focus_overlay.inc"
 .include "focus_screen_diag.inc"
.balign 4
fs_path: .asciz "C:\\OM3MOD\\FOCUS.TXT"
.balign 4
fs_template:
 .long 0,16,16,0,128,128,0,4096,0,4096,0,0,0x100
fs_checked: .long 0
fs_busy: .long 0
fs_epoch: .long 0
fs_flip: .long 0
fs_frames: .long 0
fs_last: .long 0
fs_diag: .space 64,0
fs_diag_raw: .space 52,0
fs_ev_miss: .space 12,0
fs_held: .long 0
fs_device: .long 0
fs_ev_latched: .long 0
fs_measured: .long 0
fs_th_samples: .space 88,0
.set FS_TH_SAMPLES,fs_th_samples+0x40000000
.set FS_MEASURED,fs_measured+0x40000000
fs_owner: .space 120,0
fs_req: .space 52,0
.balign 128
fs_src: .space 32768,0
fs_dst: .space 65536,0
fs_shape: .space 8192
fs_strength: .long 4
fs_map:
 .include "focus_screen_map.inc"
.set FS_ON,fs_on+0x40000000
.set FS_CHECKED,fs_checked+0x40000000
.set FS_BUSY,fs_busy+0x40000000
.set FS_EPOCH,fs_epoch+0x40000000
.set FS_FLIP,fs_flip+0x40000000
.set FS_FRAMES,fs_frames+0x40000000
.set FS_LAST,fs_last+0x40000000
.set FS_D,fs_diag+0x40000000
.set FS_D_RAW,fs_diag_raw+0x40000000
.set FS_EV_MISS,fs_ev_miss+0x40000000
.set FS_HELD,fs_held+0x40000000
.set FS_DEVICE,fs_device+0x40000000
.set FS_EV_LATCHED,fs_ev_latched+0x40000000
.set FS_OWNER,fs_owner+0x40000000
.set FS_REQ,fs_req+0x40000000
.set FS_SRC,fs_src+0x40000000
.set FS_DST,fs_dst+0x40000000
.set FS_MAP,fs_map+0x40000000
