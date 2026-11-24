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

.section .fb_runtime,"ax"
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
 bls 8f
 mov (FB_PAGES),d2
 cmp d2,a0
 beq 8f
 mov (FB_PAGE2),d2
 cmp d2,a0
 bne cap_bad
8:
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
 mov (FS_LV_CARD),d0
 cmp 0,d0
 beq 1f
 mov (4,sp),d1
 cmp FS_SRC,d1
 beq cap_geometry_only
 mov (FB_PAGES),d2
 cmp d2,d1
 beq 1f
 mov (FB_PAGE2),d2
 cmp d2,d1
 bne cap_bad
1:
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
cap_geometry_only:
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
  * and position at 宸︿笅 / 灞呬腑 / 鍙充笅 flush with the bottom edge of IMG1! */
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
 mov 38,d2
 cmp 2,d0
 bne cap_size_percent
 /* VIDEOAREA contains the panel porch and active span. IMG1 may already
  * be inset by the selected stills aspect. Fit that entire image in the well. */
 mov (12,sp),a0
 mov (0x420,a0),d2
 exthu d2
 cmp 320,d2
 bcs cap_bad
 cmp 2048,d2
 bhi cap_bad
 mov d2,(FS_LV_W)
 mov (0x424,a0),d3
 exthu d3
 mov (136,sp),d0
 asl d0,d3
 cmp 240,d3
 bcs cap_bad
 cmp 2048,d3
 bhi cap_bad
 /* Keep the native artwork square-pixel on the larger EVF. */
 mov (8,sp),d0
 cmp 1,d0
 bne 6f
 cmp FB_WIDTH,d2
 bcs 6f
 cmp FB_ROWS,d3
 bcs 6f
 mov FB_WIDTH,d2
 mov FB_ROWS,d3
 mov d2,(FS_LV_W)
6:
 mov d3,(FS_LV_H)
 mov a2,d0
 mulu d3,d0
 clr d1
 mov d1,mdr
 divu d2,d0
 mov 3,d1
 mulu d1,d0
 clr d1
 mov d1,mdr
 mov 2,d1
 divu d1,d0
 cmp 0,d0
 beq cap_bad
 mov d0,d2                         /* logical width at IMG1 height */
 mov 430,d1
 mulu d1,d0
 clr d1
 mov d1,mdr
 mov a3,d1
 divu d1,d0
 mov 430,d3
 cmp 574,d0
 bls 1f
 mov 574,d0
 mov d0,d3
 mulu d1,d3
 clr d1
 mov d1,mdr
 divu d2,d3
1:
 and -2,d0
 cmp 2,d0
 bcs cap_bad
 cmp 2,d3
 bcs cap_bad
 mov d0,(FB_VIEW_W)
 mov d3,(FB_VIEW_H)
 clr d1
 mov d1,(24,sp)
 mov d1,(28,sp)
 mov d1,(116,sp)
 mov (4,sp),d1
 cmp FS_SRC,d1
 bne cap_sample_source
 mov (136,sp),d0
 jmp cap_return_geometry
cap_size_percent:
 mov a3,d0
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
cap_position:
 /* Compute X using dst_w (d2) and img1_w (a2). */
 mov a2,d0                        /* img1_w */
 mov (FS_LV_CARD),d1
 cmp 0,d1
 beq cap_x_center
 cmp 2,d1
 beq cap_x_left
 mov (MF_CFG_POS),d1
 cmp 0,d1
 beq cap_x_left
 cmp 1,d1
 beq cap_x_center
 /* 鍙充笅: img1_w - dst_w - img1_w / 20 */
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
 /* 宸︿笅: img1_w / 20 (clamped <= img1_w - dst_w) */
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
 mov (FS_LV_H),d2
 sub d2,d0
 mov (FS_LV_CARD),d1
 cmp 1,d1
 beq cap_y_bottom                 /* flush with bottom edge for Cyber Card preview! */
 lsr 1,d0
cap_y_bottom:
 mov d0,(28,sp)
 asl 16,d0
 mov (116,sp),d1
 or d0,d1
 mov d1,(116,sp)
 mov (FS_LV_CARD),d0
 cmp 0,d0
 beq cap_sample_source
 /* The transparent card needs only the image geometry. */
 mov (136,sp),d0
 bra cap_return_geometry
cap_sample_source:
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
 mov (FS_LV_CARD),d2
 cmp 2,d2
 bne 1f
 mov (88,sp),d1
 exthu d1
1:
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
 mov (FS_LV_CARD),d2
 cmp 2,d2
 bne 1f
 mov (92,sp),d1
 exthu d1
 mov (136,sp),d2
 asl d2,d1
1:
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
 clr d0
 mov d0,(140,sp)
 mov (FS_LV_CARD),d0
 cmp 2,d0
 beq cap_start_rows               /* picker uses slot 140 as a ring reuse flag */
 mov (136,sp),d0
 cmp 1,d0
 bne cap_start_rows
 mov sp,a0
 call cap_match_latched,[d2,d3,a2,a3],20
 mov d0,(140,sp)
cap_start_rows:
 clr d0
 mov d0,(124,sp)                 /* extra output row produced by this pass */
 mov (FS_LV_CARD),d0
 cmp 2,d0
 bne 3f
 /* Endpoint-aligned taps: the last requested pair/row stays inside the
  * stride, burst and physical bank bounds checked above. */
 mov (88,sp),d0
 exthu d0
 add -2,d0
 mov (32,sp),d1
 mulu d1,d0
 mov (FB_VIEW_W),d1
 add -2,d1
 cmp 0,d1
 beq cap_bad
 clr d2
 mov d2,mdr
 divu d1,d0
 mov d0,(32,sp)
 mov (92,sp),d0
 exthu d0
 mov (136,sp),d1
 asl d1,d0
 add -1,d0
 mov (36,sp),d1
 mulu d1,d0
 mov (FB_VIEW_H),d1
 add -1,d1
 mov d2,mdr
 divu d1,d0
 mov d0,(36,sp)
 mov 618,d0                       /* 2 * viewport center Y */
 mov (FB_VIEW_H),d1
 sub d1,d0
 lsr 1,d0
 mov FB_PITCH,d1
 mulu d1,d0
 mov 1172,d1                       /* 2 * viewport center X */
 mov (FB_VIEW_W),d2
 sub d2,d1
 and -4,d1                        /* byte offset, even YC pair */
 add d1,d0
 mov (4,sp),a1
 add d0,a1
 mov a1,(4,sp)
3:
 clr d0
 mov d0,(48,sp)
cap_row:
 /* This check is outside the per-CPU bus-window lock. At most one
  * sampled row is in flight when the shooting task queues a detent. */
 mov (FS_LV_CARD),d0
 cmp 2,d0
 bne 8f
 mov (FB_PAINTED),d0
 cmp 0,d0
 beq 8f
 mov (FB_NEXT_KEY),d0
 lsr 6,d0
 bne 8f
 mov (FB_Q_READ),d0
 mov (FB_Q_WRITE),d1
 cmp d0,d1
 beq 8f
 mov 3,d0
 ret [d2,d3,a2,a3],160
8:
 clr d0
 call cap_lock,[d2],8
 mov d0,(60,sp)
 mov (0x8050),d0
 cmp 3,d0
 bhi cap_cpu_bad
 mov d0,(128,sp)
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
 mov (44,sp),d0
 mov (40,sp),d1
 lsr d1,d0
 mov (20,sp),d1
 mul d1,d0
 mov (16,sp),d1
 add d1,d0
 mov d0,d3
 mov (FS_LV_CARD),d2
 cmp 2,d2
 bne cap_row_mapped
 /* Pin the source chosen at cap_snapshot for the entire back page.
  * If the ring returns to this slot it may already contain a new frame. */
 mov (FB_SLOT),d0
 cmp 0,d0
 beq cap_row_changed
 mov (12,sp),a0
 mov (0x390,a0),d0
 mov (68,sp),d1
 cmp d1,d0
 bne 7f
 mov (140,sp),d0
 cmp 0,d0
 bne cap_row_changed
 bra cap_row_mapped
7:
 call cap_bank_delta,[],0
 cmp 1,d0
 beq cap_row_changed
 mov 1,d0
 mov d0,(140,sp)
cap_row_mapped:
 mov d3,d0
 lsr 27,d0
 asl 24,d0
 mov (a2),d1
 mov d1,(56,sp)
 and 0x00ffffff,d1
 or d0,d1
 mov d1,(a2)
 mov d3,d0
 and 0x07ffffff,d0
 or 0xb8000000,d0
 mov d0,a3
 mov (24,sp),d2
 mov (32,sp),d0
 mul d0,d2
 asl 1,d0
 mov (4,sp),a1
 mov 64,d3
 mov (FS_LV_CARD),d1
 cmp 2,d1
 beq cap_picker_pairs
 mov d0,(128,sp)
 bra cap_pair
cap_picker_pairs:
 /* The bus window is CPU-specific and the row is pinned by cap_lock.
  * Keep its horizontal taps on private cache lines on that same CPU.
  * Hardware DMA only consumes the output page. */
 mov (128,sp),d1
 mov 640,d2
 mulu d2,d1
 mov fb_x_offsets,a2
 add d1,a2
 mov (a2),d1
 cmp d0,d1
 beq 2f
 mov d0,(a2)
 mov a2,a0
 inc4 a0
 clr d1
 mov 287,d3
1:
 mov d1,d2
 lsr 13,d2
 asl2 d2
 movhu d2,(a0)
 add 2,a0
 add d0,d1
 add -1,d3
 bne 1b
2:
 inc4 a2
 mov (FB_VIEW_W),d3
 lsr 1,d3
 /* Keep both vertical endpoints. Reduce uncached sensor reads in the
  * preview independently of the native-resolution artwork. */
 mov (48,sp),d0
 cmp 0,d0
 beq cap_picker_full_row
 mov (FB_VIEW_H),d1
 sub d0,d1
 cmp 3,d1
 bcs cap_picker_full_row
 mov (FB_NEXT_KEY),d0
 lsr 6,d0
 bne 8f
 mov (FB_FINE),d0
 cmp 0,d0
 beq cap_picker_double_row
 bra cap_picker_full_row
8:
 cmp 5,d1
 bcs cap_picker_double_row
 mov 3,d0
 mov d0,(124,sp)
 mov a1,a0
 add FB_PITCH,a0
cap_picker_four_rows:
 /* Moving preview only: reuse a YC pair across four pixels. Leave the
  * final pairs at their exact horizontal positions. */
 cmp 9,d3
 bcs cap_four_tail
 .irp i,0,2,4,6
 movhu (2*\i,a2),d0
 mov (d0,a3),d1
 .irp off,0,4
 mov d1,(4*\i+\off,a1)
 mov d1,(4*\i+\off,a0)
 mov d1,(2*FB_PITCH+4*\i+\off,a1)
 mov d1,(2*FB_PITCH+4*\i+\off,a0)
 .endr
 .endr
 add 16,a2
 add 32,a0
 add 32,a1
 add -8,d3
 bra cap_picker_four_rows
cap_four_tail:
 movhu (a2),d0
 mov (d0,a3),d1
 mov d1,(a1)
 mov d1,(a0)
 mov d1,(2*FB_PITCH,a1)
 mov d1,(2*FB_PITCH,a0)
 add 2,a2
 inc4 a0
 inc4 a1
 add -1,d3
 bne cap_four_tail
 bra cap_pair_done
cap_picker_double_row:
 mov 1,d0
 mov d0,(124,sp)
 mov a1,a0
 add FB_PITCH,a0
 cmp 8,d3
 bcs cap_double_tail
cap_double_eight:
 .irp i,0,1,2,3,4,5,6,7
 movhu (2*\i,a2),d0
 mov (d0,a3),d1
 mov d1,(4*\i,a1)
 mov d1,(4*\i,a0)
 .endr
 add 16,a2
 add 32,a1
 add 32,a0
 add -8,d3
 cmp 8,d3
 bcc cap_double_eight
cap_double_tail:
 cmp 0,d3
 beq cap_pair_done
1:
 movhu (a2),d0
 mov (d0,a3),d1
 mov d1,(a1)
 mov d1,(a0)
 inc4 a0
 inc4 a1
 add 2,a2
 add -1,d3
 bne 1b
 bra cap_pair_done
cap_picker_full_row:
 clr d0
 mov d0,(124,sp)
 cmp 8,d3
 bcs cap_pair_tail
cap_pair_eight:
 .irp i,0,1,2,3,4,5,6,7
 movhu (2*\i,a2),d0
 mov (d0,a3),d1
 mov d1,(4*\i,a1)
 .endr
 add 16,a2
 add 32,a1
 add -8,d3
 cmp 8,d3
 bcc cap_pair_eight
cap_pair_tail:
 cmp 0,d3
 beq cap_pair_done
1:
 movhu (a2),d0
 mov (d0,a3),d1
 mov d1,(a1)
 inc4 a1
 add 2,a2
 add -1,d3
 bne 1b
 bra cap_pair_done
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
cap_pair_done:
 mov (FS_LV_CARD),d0
 cmp 2,d0
 bne 1f
 mov (4,sp),a1
 add FB_PITCH,a1
 mov (124,sp),d0
 mov FB_PITCH,d1
 mulu d1,d0
 add d0,a1
1:
 mov a1,(4,sp)
 mov (52,sp),a2
 mov (56,sp),d0
 mov d0,(a2)
 mov (60,sp),d0
 call cap_unlock,[d2],8
 mov (44,sp),d0
 mov (36,sp),d1
 add d1,d0
 mov (124,sp),d2
 mul d2,d1
 add d1,d0
 mov d0,(44,sp)
 mov (48,sp),d0
 add d2,d0
 add 1,d0
 mov d0,(48,sp)
 mov 128,d1
 mov (FS_LV_CARD),d2
 cmp 2,d2
 bne 1f
 mov (FB_VIEW_H),d1
1:
 cmp d1,d0
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
 mov (FS_LV_CARD),d1
 cmp 2,d1
 bne cap_return_geometry
 mov (140,sp),d1
 cmp 0,d1
 bne cap_rejected_rotation
 cap_return_geometry:
 mov (116,sp),d1
 cmp 1,d0
 bne cap_success
 or 0x8000,d1                     /* y is panel-relative */
 bra cap_success
cap_rotated:
 mov (FS_LV_CARD),d0
 cmp 2,d0
 bne cap_focus_rotated
 mov (12,sp),a0
 mov (0x390,a0),d0
 mov (68,sp),d1
 call cap_bank_delta,[],0
 cmp 1,d0
 beq cap_rejected_rotation
 mov (136,sp),d0
 bra cap_return_geometry
cap_focus_rotated:
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
cap_row_changed:
 mov (60,sp),d0
 call cap_unlock,[d2],8
 bra cap_rejected_rotation
/* DMA addresses use 16-byte units. Return a signed byte delta, or 1
 * when the new address is outside the ring or has a different offset. */
cap_bank_delta:
 cmp 0x095f6c80,d0
 bcs 3f
 cmp 0x0a000000,d0
 bcc 3f
 sub d1,d0
 mov d0,d1
 cmp 0,d1
 bge 1f
 clr d1
 sub d0,d1
1:
 cmp 0,d1
 beq 2f
 cmp 0x16f080,d1
 bcs 3f
 sub 0x16f080,d1
 bra 1b
3:
 mov 1,d0
 ret [],0
2:
 asl 4,d0
 ret [],0
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

.balign 4
fb_view: .long 0,0
.balign 64
fb_x_offsets: .space 4*640
.balign 4
.set FB_VIEW_W,fb_view+0x40000000
.set FB_VIEW_H,FB_VIEW_W+4
/* Each private page records its paint key and fitted image geometry. */
fb_page_cache: .space 24
.set FB_CACHE,fb_page_cache+0x40000000
fb_sample_misses: .long 0,0
.set FB_MISSES,fb_sample_misses+0x40000000
.set FB_MISS_REASON,FB_MISSES+4
/* A still scene can afford full vertical detail; panning uses the fast
 * sampler. Five by five luma taps ignore small noise or a single outlier. */
fb_scene_stable:
 cmp 0,a0
 beq 9f
 mov (FB_VIEW_H),d0
 lsr 3,d0
 and -2,d0
 mov FB_PITCH,d1
 mulu d1,d0
 mov d0,d2                       /* grid row spacing */
 mov (FB_VIEW_W),d0
 lsr 3,d0
 and -2,d0
 asl 1,d0
 mov d0,d3                       /* grid column spacing, bytes */
 mov 309*FB_PITCH+586*2,d1
 sub d2,d1
 sub d2,d1
 sub d3,d1
 sub d3,d1
 add d1,a0
 add d1,a1
 mov 5,d0
 mov d0,(4,sp)
 clr d1
 mov d1,(8,sp)
1:
 mov a0,a2
 mov a1,a3
 .rept 5
 movbu (a2),d0
 movbu (a3),d1
 sub d1,d0
 add 8,d0
 cmp 16,d0
 bls 2f
 mov (8,sp),d0
 inc d0
 cmp 3,d0
 bcc 9f
 mov d0,(8,sp)
2:
 add d3,a2
 add d3,a3
 .endr
 add d2,a0
 add d2,a1
 mov (4,sp),d0
 add -1,d0
 mov d0,(4,sp)
 bne 1b
 mov 1,d0
 ret [d2,d3,a2,a3],28
9:
 clr d0
 ret [d2,d3,a2,a3],28

/* a1 = private back page, a0 = current front page or NULL. Same placement
 * and YC-pair alignment as cap_start_rows. Never read a stale session. */
fb_restore_view:
 mov (FB_VIEW_W),d2
 mov (FB_VIEW_H),d3
 cmp 0,a0
 beq 1f
 mov FB_CACHE,a2
 mov (FB_PAGES),d0
 cmp d0,a0
 beq 2f
 add 12,a2
2:
 mov (4,a2),d0
 cmp d0,d2
 bne 3f
 mov (8,a2),d0
 cmp d0,d3
 beq 1f
3:
 mov 0,a0
1:
 mov 618,d0
 sub d3,d0
 lsr 1,d0
 mov FB_PITCH,d1
 mulu d1,d0
 mov 1172,d1
 sub d2,d1
 and -4,d1
 add d1,d0
 add d0,a1
 lsr 1,d2
 cmp 0,a0
 beq 5f
 add d0,a0
4:
 mov d2,d1
 mov a0,a2
 mov a1,a3
 cmp 8,d1
 bcs 7f
8:
 .irp off,0,4,8,12,16,20,24,28
 mov (\off,a2),d0
 mov d0,(\off,a3)
 .endr
 add 32,a2
 add 32,a3
 add -8,d1
 cmp 8,d1
 bcc 8b
 cmp 0,d1
 beq 9f
7:
 mov (a2),d0
 mov d0,(a3)
 inc4 a2
 inc4 a3
 sub 1,d1
 bne 7b
9:
 add FB_PITCH,a0
 add FB_PITCH,a1
 sub 1,d3
 bne 4b
 ret [d2,d3,a2,a3],20
5:
 mov 0x80108010,d0
6:
 mov d2,d1
 mov a1,a3
8:
 mov d0,(a3)
 inc4 a3
 sub 1,d1
 bne 8b
 add FB_PITCH,a1
 sub 1,d3
 bne 6b
 ret [d2,d3,a2,a3],20
.section .ext13,"ax"
