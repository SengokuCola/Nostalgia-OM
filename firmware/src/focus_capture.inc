/* E147 experimental screen: read centre 128x128 from IMG1 into owned DRAM.
 * call capture_native,[d2,d3,a2,a3],160; d0 channel 1/2, a0 destination.
 * Returns d0=0 valid tile, 1 rejected configuration, 2 display changed;
 * d1 = x | (y << 16) on success. Bit 15 marks the measured EVF field mode;
 * bit 14 marks a source rotation with the copied frame still latched.
 * Output is disposable unless d0 == 0.
 * Whole YC pairs, nearest sampling: intentionally not the hardware scaler.
 * Each row holds the stock CPU lock, borrows only the uncached bus window,
 * restores its exact value before unlock. No writes to source or display.
 * Supports the verified 0e/0a/18 live-view bank range only.
 */

.global capture_native
capture_native:
 mov 1,d1
 mov d1,(132,sp)                  /* rejection stage, returned in d1 */
 mov a0,(4,sp)
 mov d0,(8,sp)
 cmp 1,d0
 bcs cap_bad
 cmp 2,d0
 bhi cap_bad
 mov a0,d1
 and 3,d1
 bne cap_bad
 cmp 0xa0000000,a0
 bcs cap_bad
 cmp 0xb1ff8000,a0
 bhi cap_bad
 asl 15,d0
 add 0x9bb80000,d0
 mov d0,(12,sp)
 mov (8,sp),d0
 call cap_scan,[],0
 mov d0,(136,sp)
 cmp 2,d0
 beq cap_bad
 mov cap_regs,a2
 mov sp,a3
 add 64,a3
 mov 13,d3
cap_snapshot:
 mov (12,sp),a0
 mov (a2),d1
 add d1,a0
 mov (a0),d1
 mov d1,(a3)
 add 4,a3
 add 4,a2
 add -1,d3
 bne cap_snapshot
 mov 2,d0
 mov d0,(132,sp)
 mov (64,sp),d0
 and 0x20,d0
 beq cap_bad
 mov (84,sp),d0
 cmp 0,d0
 bne cap_bad
 mov 3,d0
 mov d0,(132,sp)
 mov (72,sp),d0
 mov d0,d1
 and 7,d1
 bne cap_bad
 cmp 16,d0
 bcs cap_bad
 cmp 1024,d0
 bhi cap_bad
 lsr 3,d0
 asl 7,d0
 mov d0,(20,sp)
 mov 4,d0
 mov d0,(132,sp)
 mov (68,sp),d0
 cmp 0x0fffffff,d0
 bhi cap_bad
 asl 4,d0
 mov (80,sp),d1
 and 255,d1
 cmp 62,d1
 bhi cap_bad
 mov d1,d2
 and 1,d2
 bne cap_bad
 asl 1,d1
 mov d0,d2
 and 0x70,d2
 /* Native camera also supplies an aligned base with independent SPOS. */
 beq cap_base_ok
 mov d1,d3
 and 0x70,d3
 cmp d2,d3
 bne cap_bad
cap_base_ok:
 and 0xffffff80,d0
 add d1,d0
 cmp 0x95f6c800,d0
 bcs cap_bad
 cmp 0xa0000000,d0
 bcc cap_bad
 mov d0,(16,sp)
 /* Panel-relative centre, no porch in the source coordinate. */
 mov 5,d0
 mov d0,(132,sp)
 mov (88,sp),d0
 and 65535,d0
 cmp 128,d0
 bcs cap_bad
 cmp 2048,d0
 bhi cap_bad
 /* Test 33: when FS_LV_CARD == 1, compute exact 38% height square dst_w = dst_h matching cc_run,
  * and position at 左下 / 居中 / 右下 flush with the bottom edge of IMG1! */
 mov d0,a2                        /* save img1_w */
 mov (92,sp),d1
 and 65535,d1
 mov (136,sp),d2
 cmp 1,d2
 bne 1f
 asl 1,d1                         /* physical panel height */
1:
 cmp 128,d1
 bcs cap_bad
 cmp 2048,d1
 bhi cap_bad
 mov d1,a3                        /* save img1_h */
 mov 128,d2                       /* default tile size = 128 (Split-Image) */
 mov (FS_LV_CARD),d0
 cmp 0,d0
 beq cap_sz_done
 /* dst_h = (img1_h * 38 / 100) & ~1, clamped [128 .. min(img1_w, img1_h)]. */
 mov a3,d0
 mov 38,d2
 mulu d2,d0
 clr d2
 mov d2,mdr
 mov 100,d2
 divu d2,d0
 and 0xfffffffe,d0
 cmp 128,d0
 bcc 2f
 mov 128,d0
2:
 mov a2,d2                        /* img1_w */
 cmp d2,d0
 bls 3f
 mov d2,d0
3:
 mov a3,d2                        /* img1_h */
 cmp d2,d0
 bls 4f
 mov d2,d0
4:
 and 0xfffffffe,d0
 mov d0,d2                        /* dst_w = dst_h */
cap_sz_done:
 mov d2,(FS_LV_W)
 mov d2,(FS_LV_H)
 /* Compute X using dst_w (d2) and img1_w (a2). */
 mov a2,d0                        /* img1_w */
 mov (FS_LV_CARD),d1
 cmp 0,d1
 beq cap_x_center
 cmp 2,d1
 beq cap_x_center
 mov (MF_CFG_POS),d1
 cmp 0,d1
 beq cap_x_left
 cmp 1,d1
 beq cap_x_center
 /* 右下: img1_w - dst_w - img1_w / 20 */
 mov d0,d3
 clr d1
 mov d1,mdr
 mov 20,d1
 divu d1,d3                       /* margin = img1_w / 20 */
 sub d2,d0
 sub d3,d0
 cmp 0,d0
 bge cap_x_ok
 clr d0
 bra cap_x_ok
cap_x_left:
 /* 左下: img1_w / 20 (clamped <= img1_w - dst_w) */
 mov d0,d3
 sub d2,d3
 clr d1
 mov d1,mdr
 mov 20,d1
 divu d1,d0
 cmp d3,d0
 bls cap_x_ok
 mov d3,d0
 bra cap_x_ok
cap_x_center:
 sub d2,d0
 lsr 1,d0
cap_x_ok:
 and 0xfffffffe,d0
 mov d0,(24,sp)
 mov d0,(116,sp)
 /* Compute Y using dst_h (d2) and img1_h (a3). */
 mov a3,d0                        /* img1_h */
 sub d2,d0
 mov (FS_LV_CARD),d1
 cmp 0,d1
 bne cap_y_bottom                 /* flush with bottom edge for Cyber Card preview! */
 lsr 1,d0
cap_y_bottom:
 mov d0,(28,sp)
 asl 16,d0
 mov (116,sp),d1
 or d0,d1
 mov d1,(116,sp)
 mov 6,d0
 mov d0,(132,sp)
 mov (96,sp),d0
 and 0xffffffee,d0
 bne cap_bad
 mov (104,sp),d0
 mov (112,sp),d1
 or d1,d0
 bne cap_bad
 mov 4096,d1
 mov (96,sp),d0
 and 1,d0
 beq cap_hstep
 mov (100,sp),d1
cap_hstep:
 mov 7,d0
 mov d0,(132,sp)
 cmp 1,d1
 bcs cap_bad
 cmp 16384,d1
 bhi cap_bad
 mov d1,(32,sp)
 mov 12,d2
 mov 4096,d1
 mov (8,sp),d0
 cmp 2,d0
 bne cap_vunit
 mov 13,d2
 mov 8192,d1
cap_vunit:
 mov (136,sp),d0
 add d0,d2                        /* field rows have twice the line period */
 mov d2,(40,sp)
 mov (96,sp),d0
 and 0x10,d0
 beq cap_vstep
 mov (108,sp),d1
cap_vstep:
 mov 8,d0
 mov d0,(132,sp)
 cmp 1,d1
 bcs cap_bad
 cmp 32768,d1
 bhi cap_bad
 mov d1,(36,sp)
 mov (28,sp),d0
 mul d1,d0
 mov d0,(44,sp)
 /* Last sampled pair must fit stride and programmed burst. */
 mov 9,d0
 mov d0,(132,sp)
 mov (24,sp),d0
 mov (FS_LV_W),d1
 add -2,d1
 add d1,d0
 mov (32,sp),d1
 mul d1,d0
 lsr 12,d0
 and 0xfffffffe,d0
 asl 1,d0
 add 4,d0
 mov (20,sp),d1
 cmp d1,d0
 bhi cap_bad
 mov d0,(120,sp)
 mov (80,sp),d1
 and 255,d1
 asl 1,d1
 add d0,d1
 mov (76,sp),d0
 mov d0,d2
 and 7,d2
 bne cap_bad
 cmp 1024,d0
 bhi cap_bad
 lsr 3,d0
 asl 7,d0
 cmp d0,d1
 bhi cap_bad
 /* Bound the entire read to one verified allocated-size bank slot. */
 mov 10,d0
 mov d0,(132,sp)
 mov (28,sp),d0
 mov (FS_LV_H),d1
 add -1,d1
 add d1,d0
 mov (36,sp),d1
 mul d1,d0
 mov (40,sp),d1
 lsr d1,d0
 mov (20,sp),d1
 mul d1,d0
 mov (16,sp),d1
 add d1,d0
 mov (120,sp),d2
 add d2,d0
 mov 0x9765d000,d2
cap_bank:
 cmp d2,d1
 bcs cap_bound
 add 0x16f0800,d2
 bra cap_bank
cap_bound:
 cmp d2,d0
 bhi cap_bad
 /* Never let a row cross the temporary 128MB window. */
 mov 11,d2
 mov d2,(132,sp)
 add -1,d0
 lsr 27,d0
 mov d0,(124,sp)
 mov (44,sp),d0
 mov (40,sp),d2
 lsr d2,d0
 mov (20,sp),d2
 mul d2,d0
 add d1,d0
 lsr 27,d0
 mov (124,sp),d1
 cmp d1,d0
 bne cap_bad
 /* Test 33: when FS_LV_CARD == 1, scale row step (36,sp) by dst_h / 128 so 128 rows cover dst_h! */
 mov (FS_LV_CARD),d0
 cmp 0,d0
 beq 1f
 mov (36,sp),d0
 mov (FS_LV_H),d1
 mulu d1,d0
 lsr 7,d0
 mov d0,(36,sp)
1:
 clr d0
 mov d0,(140,sp)
 mov (136,sp),d0
 cmp 1,d0
 bne cap_start_rows
 mov sp,a0
 call cap_match_latched,[d2,d3,a2,a3],20
 mov d0,(140,sp)
cap_start_rows:
 clr d0
 mov d0,(48,sp)
cap_row:
 clr d0
 call cap_lock,[d2],8
 mov d0,(60,sp)
 mov (0x8050),d0
 cmp 3,d0
 bhi cap_cpu_bad
 mov 0x98100058,a2
 cmp 0,d0
 beq cap_window
 add 0x400,a2
 cmp 1,d0
 beq cap_window
 add 0x400,a2
 cmp 2,d0
 beq cap_window
 add 0x800,a2
cap_window:
 mov a2,(52,sp)
 mov (a2),d0
 mov d0,(56,sp)
 and 0x00ffffff,d0
 mov (124,sp),d1
 asl 24,d1
 or d1,d0
 mov d0,(a2)
 mov (44,sp),d0
 mov (40,sp),d1
 lsr d1,d0
 mov (20,sp),d1
 mul d1,d0
 mov (16,sp),d1
 add d1,d0
 and 0x07ffffff,d0
 or 0xb8000000,d0
 mov d0,a3
 mov (24,sp),d2
 mov (32,sp),d0
 mul d0,d2
 mov (FS_LV_CARD),d1
 cmp 0,d1
 beq 1f
 mov (FS_LV_W),d1
 mulu d1,d0
 lsr 7,d0                         /* scaled horizontal step = hstep * dst_w / 128 */
1:
 asl 1,d0
 mov d0,(128,sp)
 mov (4,sp),a1
 mov 64,d3
cap_pair:
 mov d2,d0
 lsr 12,d0
 and 0xfffffffe,d0
 asl 1,d0
 mov a3,a0
 add d0,a0
 mov (a0),d0
 mov d0,(a1)
 add 4,a1
 mov (128,sp),d0
 add d0,d2
 add -1,d3
 bne cap_pair
 mov a1,(4,sp)
 mov (52,sp),a2
 mov (56,sp),d0
 mov d0,(a2)
 mov (60,sp),d0
 call cap_unlock,[d2],8
 mov (44,sp),d0
 mov (36,sp),d1
 add d1,d0
 mov d0,(44,sp)
 mov (48,sp),d0
 add 1,d0
 mov d0,(48,sp)
 cmp 128,d0
 bcs cap_row
 /* A changed source/display invalidates this private output. */
 clr d0
 mov d0,(132,sp)                 /* source address changed, other fields stable */
 mov cap_regs,a2
 mov sp,a3
 add 64,a3
 mov 13,d3
cap_recheck:
 mov (12,sp),a0
 mov (a2),d1
 add d1,a0
 mov (a0),d1
 mov (a3),d2
 cmp 13,d3                        /* Only the IMG1 bit affects the source. */
 bne 1f
 and 32,d1
 and 32,d2
1:
 cmp 9,d3                         /* Ignore IMG2/IMG3 SPOS above IMG1. */
 bne 2f
 and 255,d1
 and 255,d2
2:
 cmp d2,d1
 beq cap_recheck_next
 cmp 12,d3                       /* second of thirteen registers: IMG1DMASADR */
 bne cap_changed
 mov 14,d0
 mov d0,(132,sp)
cap_recheck_next:
 add 4,a3
 add 4,a2
 add -1,d3
 bne cap_recheck
 mov (8,sp),d0
 call cap_scan,[],0
 mov (136,sp),d1
 cmp d1,d0
 bne cap_changed
 mov (132,sp),d1
 cmp 14,d1
 beq cap_rotated
 mov (116,sp),d1
 cmp 1,d0
 bne cap_success
 or 0x8000,d1                     /* y is panel-relative */
 bra cap_success
cap_rotated:
 /* The next programmed address can arrive before this panel is done
  * displaying the copied frame. Require the old frame and its geometry
  * to agree with the physical latch on both sides of the copy. */
 mov (140,sp),d0
 cmp 1,d0
 bne cap_rejected_rotation
 mov sp,a0
 call cap_match_latched,[d2,d3,a2,a3],20
 cmp 1,d0
 bne cap_rejected_rotation
 mov (116,sp),d1
 or 0xc000,d1
cap_success:
 clr d0
 ret [d2,d3,a2,a3],160
cap_cpu_bad:
 mov 12,d0
 mov d0,(132,sp)
 mov (60,sp),d0
 call cap_unlock,[d2],8
cap_bad:
 mov (132,sp),d1
 mov 1,d0
 ret [d2,d3,a2,a3],160
cap_changed:
 mov 13,d1
 bra cap_transient
cap_rejected_rotation:
 mov 14,d1
cap_transient:
 mov 2,d0
 ret [d2,d3,a2,a3],160

/* a0 = capture frame. Compare its validated IMG1 input with the latch,
 * ignoring DMA enable bits and start positions belonging to other planes. */
cap_match_latched:
 mov (12,a0),a3
 add 0x2000,a3
 add 64,a0
 mov cap_regs,a2
 mov 13,d3
1:
 mov (a2),d2
 mov a3,a1
 add d2,a1
 mov (a1),d0
 mov (a0),d1
 cmp 0x60,d2
 bne 2f
 and 32,d0
 and 32,d1
2:
 cmp 0x3d8,d2
 bne 3f
 and 255,d0
 and 255,d1
3:
 cmp d0,d1
 bne 4f
 inc4 a0
 inc4 a2
 sub 1,d3
 bne 1b
 mov 1,d0
 ret [d2,d3,a2,a3],20
4:
 clr d0
 ret [d2,d3,a2,a3],20

/* Channel in d0. The OM-3 fixture records 410 timing lines per second
 * field. Leave other unverified EVF field timings to the stock driver. */
cap_scan:
 cmp 1,d0
 bne cap_progressive
 mov (0x9bb88720),d0
 and 0x01000000,d0
 bne cap_progressive
 mov (0x9bb88730),d0
 and 0x7fff,d0
 cmp 410,d0
 bne cap_unknown_scan
 mov 1,d0
 ret [],0
cap_unknown_scan:
 mov 2,d0
 ret [],0
cap_progressive:
 clr d0
 ret [],0
.balign 4
cap_regs:
 .long 0x60,0x390,0x3a8,0x3c0,0x3d8,0x400,0x42c,0x430
 .long 0x4f0,0x4f4,0x4f8,0x4fc,0x500
