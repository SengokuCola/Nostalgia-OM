/* ---- Cyber Card ("赛博透卡 / 图卡", Test 31) ----
 * Post-development still JPEG alpha-blended transparent anime card overlay.
 *
 * Two-stage architecture (zero disk I/O during shutter release):
 *   1. cc_sync (runs on HLS_EVENT via ed_trig on every half-press s1):
 *      Checks MF_CFG_CARD (0..5) vs CC_SLOT_UC. If unchanged, returns in 4 instructions.
 *      If changed, frees any previous buffer; if 1..5, opens C:\OM3MOD\CARD<n>.BIN,
 *      validates the 16-byte 'OM3P' v1 header, mallocs 16 + src_w*src_h*4 bytes, reads
 *      the entire card into RAM, and publishes CC_BUF_UC + CC_SLOT_UC.
 *      When MF_CFG_CARD == 0 (default: 关), allocates 0 bytes.
 *   2. cc_run (runs on image-processing task via xb_gs after all look/border passes):
 *      Reads directly from CC_BUF_UC in RAM (zero fopen/fread, zero SD contention),
 *      computes integer scale S (~38% of crop height), skips 100% transparent rows,
 *      and alpha-blends into the YCbYCr 4:2:2 buffer (0x1000) before JPEG encoding.
 *      RAW is untouched; crop-aware via cr_bdc.
 */

.section .ext13,"ax"
 .set CC_MAX_PIX, 98304           /* 96 KiB static RAM buffer (camera malloc caps at 16 KiB) */

/* cc_sync: `call cc_sync,[d2,d3,a2,a3],36` from ed_trig (HLS_EVENT).
 * Locals (36 B): (4) want_slot, (8) fp, (12) pixel_bytes. */
.global cc_sync
cc_sync:
 call mf_ld,[d2,d3,a2,a3],20      /* ensure OM3M loaded before checking MF_CFG_CARD */
 mov (MF_CFG_CARD),d0
 mov (CC_SLOT_UC),d1
 cmp d1,d0
 beq cc_sync_ret                  /* already up to date (fast path: 4 instructions) */
 mov d0,(4,sp)                    /* want_slot */

 /* Must be on HLS_EVENT with SD card mounted. */
 call hl_ok,[a2],16
 cmp 0,d0
 bne cc_sync_ret

 /* Mark unloaded before reading new slot. */
 clr d0
 mov d0,(CC_BUF_UC)
 mov d0,(CC_PAINTED)
 mov d0,(CC_SLOT_UC)

 mov (4,sp),d0                    /* want_slot */
 cmp 1,d0
 bcs cc_sync_ret                  /* 0 = 关: stay unloaded */
 cmp 5,d0
 bhi cc_sync_ret

 /* Mark slot attempted so a missing file doesn't retry on every half-press. */
 mov d0,(CC_SLOT_UC)
 add '0',d0
 mov cc_path,a1
 movbu d0,(14,a1)

 mov cc_path,a0
 mov lg_mr,a1
 call fopen,[],4
 cmp 0,a0
 beq cc_sync_ret
 mov a0,(8,sp)                    /* fp */

 /* Read & validate 16-byte 'OM3P' v1 header. */
 mov cc_hdr,a0
 mov (8,sp),a1
 mov 1,d0
 mov 16,d1
 call fread,[d2,d3,a2,a3],24
 cmp 16,d0
 bne cc_sync_close
 mov cc_hdr,a0
 mov (a0),d0
 cmp 0x50334d4f,d0                /* "OM3P" */
 bne cc_sync_close
 movhu (4,a0),d0
 cmp 1,d0                         /* ver == 1 */
 bne cc_sync_close
 movhu (6,a0),d0                  /* src_w: 16..512, even */
 cmp 16,d0
 bcs cc_sync_close
 cmp 512,d0
 bhi cc_sync_close
 btst 1,d0
 bne cc_sync_close
 movhu (8,a0),d1                  /* src_h: 16..512 */
 cmp 16,d1
 bcs cc_sync_close
 cmp 512,d1
 bhi cc_sync_close
 mulu d1,d0                       /* src_w * src_h */
 asl2 d0                          /* pixel_bytes */
 mov CC_MAX_PIX,d1
 cmp d1,d0
 bhi cc_sync_close                /* exceeds 96 KiB static buffer */
 mov d0,(12,sp)

 /* Copy 16-byte header to cc_buf[0..15] and read pixel_bytes into cc_buf[16..]. */
 mov cc_buf,a0
 mov cc_hdr,a1
 mov (0,a1),d0
 mov d0,(0,a0)
 mov (4,a1),d0
 mov d0,(4,a0)
 mov (8,a1),d0
 mov d0,(8,a0)
 mov (12,a1),d0
 mov d0,(12,a0)

 add 16,a0
 mov (8,sp),a1
 mov 1,d0
 mov (12,sp),d1
 call fread,[d2,d3,a2,a3],24
 mov (12,sp),d1
 cmp d1,d0
 bne cc_sync_close

 /* Close file & publish static cc_buf to image-processing + live-view tasks. */
 mov (8,sp),a0
 call fclose,[d2,a2,a3],16
 mov cc_buf,a0
 mov a0,(CC_BUF_UC)
 /* Ensure live-view IMG2 hook is armed when Cyber Card preview is enabled (without needing FOCUS.TXT). */
 mov (MF_CFG_PREV),d0
 cmp 0,d0
 beq cc_sync_ret
 mov 1,d0
 mov d0,(FS_ON)
 bra cc_sync_ret

cc_sync_close:
 mov (8,sp),a0
 call fclose,[d2,a2,a3],16
cc_sync_ret:
 ret [d2,d3,a2,a3],36

/* cc_run: `call cc_run,[d2,d3,a2,a3],104` from xb_gs (image-processing task).
 * a0 = buf_rec (0x1000), d0 = card slot (1..5).
 * Frame (104 B):
 *   (0)  call slot
 *   (4)  row_ptr (pointer to current source row in cached RAM buffer)
 *   (8)  P = W / 2 (updated by cr_bdc)
 *   (12) H (updated by cr_bdc)
 *   (16) pitch (bytes/row)
 *   (20) bus (top-left of crop, updated by cr_bdc)
 *   (24) W (crop width in pixels)
 *   (28) cc_buf (cached OM3P buffer in RAM)
 *   (32) src_w (16..512, even)
 *   (36) src_h (16..512)
 *   (40) scale S (>= 1)
 *   (44) dst_x0 (even pixel offset within crop)
 *   (48) dst_y0 (row offset within crop)
 *   (52) sy (current source row 0..src_h-1)
 *   (56) sx_min (first non-transparent src pixel in row)
 *   (60) sx_max (last non-transparent src pixel in row)
 *   (64) dy_cur (current dst row)
 *   (68) dy_end (exclusive end dst row for current src row)
 *   (72) dx_pair0 (first dst pair index in row)
 *   (76) dx_npairs (number of dst pairs in span)
 *   (80) token (LOCK)
 *   (84) cached (hl_open)
 */
.global cc_run
cc_run:
 /* Verify slot matches cached buffer in RAM. */
 cmp 1,d0
 bcs cc_ret
 cmp 5,d0
 bhi cc_ret
 mov (CC_SLOT_UC),d1
 cmp d1,d0
 bne cc_ret
 mov (CC_BUF_UC),a3
 cmp 0,a3
 beq cc_ret
 mov a3,(28,sp)                   /* cc_buf */

 /* Validate buffer record (format 0x0c02, W >= 1024, skip thumbnails). */
 movhu (16,a0),d0
 cmp 0x0c02,d0
 bne cc_ret
 mov (4,a0),d0
 cmp 0,d0
 bne cc_ret
 movhu (20,a0),d0
 cmp 1024,d0
 bcs cc_ret
 cmp 8193,d0
 bcc cc_ret
 btst 3,d0
 bne cc_ret
 mov d0,a2
 lsr 1,d0
 mov d0,(8,sp)                    /* P */
 movhu (18,a0),d1
 cmp a2,d1
 bcs cc_ret
 add d1,d1
 mov d1,(16,sp)                   /* pitch */
 movhu (22,a0),d1
 cmp 64,d1
 bcs cc_ret
 mov d1,(12,sp)                   /* H */
 mov (a0),d0
 mov d0,(20,sp)                   /* bus */
 /* Apply crop window (XPan / 21:9 / 5:4) so card sits inside the cropped photo. */
 mov a2,d0
 mov sp,a0
 call cr_bdc,[d2,d3,a2,a3],28
 mov d0,(24,sp)                   /* crop W */

 /* Read src_w / src_h from cached OM3P header. */
 mov (28,sp),a0
 movhu (6,a0),d0
 mov d0,(32,sp)                   /* src_w */
 movhu (8,a0),d1
 mov d1,(36,sp)                   /* src_h */

 /* Compute integer scale S = max(1, (H * 38 / 100) / src_h), clamped so dst_w <= W & dst_h <= H. */
 mov (12,sp),d0                   /* H */
 mov 38,d1
 mulu d1,d0
 clr d1
 mov d1,mdr
 mov 100,d1
 divu d1,d0                       /* target_h = H * 38 / 100 */
 clr d1
 mov d1,mdr
 mov (36,sp),d1                   /* src_h */
 divu d1,d0                       /* S */
 cmp 1,d0
 bcc 1f
 mov 1,d0
1:
 mov d0,d2                        /* S */
2:
 mov (32,sp),d0
 mulu d2,d0                       /* dst_w */
 mov (24,sp),d1                   /* W */
 cmp d1,d0
 bhi 3f
 mov (36,sp),d0
 mulu d2,d0                       /* dst_h */
 mov (12,sp),d1                   /* H */
 cmp d1,d0
 bls 4f
3:
 cmp 1,d2
 bls cc_ret
 add -1,d2
 bra 2b
4:
 mov d2,(40,sp)                   /* S */
 /* dst_y0 = H - src_h * S (flush with bottom edge). */
 mov (36,sp),d0
 mulu d2,d0
 mov (12,sp),d1
 sub d0,d1
 mov d1,(48,sp)                   /* dst_y0 */

 /* dst_x0 based on MF_CFG_POS: 0 = 左下, 1 = 居中, 2 = 右下. */
 mov (32,sp),d0
 mulu d2,d0                       /* dst_w */
 mov (24,sp),d1                   /* W */
 mov (MF_CFG_POS),d3
 cmp 0,d3
 beq cc_pos_l
 cmp 1,d3
 beq cc_pos_c
 /* 2 = 右下: W - dst_w - W/20 */
 mov d1,d2
 clr d3
 mov d3,mdr
 mov 20,d3
 divu d3,d2                       /* margin = W / 20 */
 sub d0,d1
 sub d2,d1
 cmp 0,d1
 bge cc_pos_ok
 clr d1
 bra cc_pos_ok
cc_pos_l:
 /* 0 = 左下: W / 20 */
 mov d1,d2
 clr d3
 mov d3,mdr
 mov 20,d3
 divu d3,d2
 mov d2,d1
 add d0,d2
 mov (24,sp),d3
 cmp d3,d2
 bls cc_pos_ok
 clr d1
 bra cc_pos_ok
cc_pos_c:
 /* 1 = 居中: (W - dst_w) / 2 */
 sub d0,d1
 lsr 1,d1
cc_pos_ok:
 and 0xfffffffe,d1                /* align dst_x0 to even pixel (YCbYCr pair boundary) */
 mov d1,(44,sp)

 /* Row loop: sy = 0 .. src_h - 1. */
 clr d0
 mov d0,(52,sp)
cc_src_row:
 mov (52,sp),d0
 mov (36,sp),d1
 cmp d1,d0
 bcc cc_ret

 /* row_ptr = cc_buf + 16 + sy * (src_w * 4). */
 mov (32,sp),d1
 asl2 d1
 mulu d1,d0
 add 16,d0
 mov (28,sp),a0
 add d0,a0
 mov a0,(4,sp)                    /* row_ptr */

 /* Find tight non-transparent horizontal span [sx_min .. sx_max] in row_ptr. */
 mov (32,sp),d1                   /* src_w */
 clr d0                           /* sx = 0 */
 mov -1,d2                        /* sx_min = -1 */
 mov -1,d3                        /* sx_max = -1 */
cc_scan:
 mov d0,a1
 movbu (3,a0),d0                  /* alpha */
 cmp 0,d0
 beq 1f
 cmp -1,d2
 bne 2f
 mov a1,d2                        /* first non-zero alpha */
2:
 mov a1,d3                        /* last non-zero alpha */
1:
 mov a1,d0
 add 4,a0
 inc d0
 cmp d1,d0
 bcs cc_scan
 cmp -1,d2
 beq cc_next_src_row              /* 100% transparent row -> skip completely! */
 mov d2,(56,sp)                   /* sx_min */
 mov d3,(60,sp)                   /* sx_max */

 /* Compute dst pair span [dx_pair0 .. dx_pair0 + dx_npairs - 1]. */
 mov (40,sp),d0                   /* S */
 mulu d0,d2                       /* sx_min * S */
 mov (44,sp),d1                   /* dst_x0 */
 add d1,d2                        /* dx_start */
 and 0xfffffffe,d2                /* even */
 lsr 1,d2
 mov d2,(72,sp)                   /* dx_pair0 */

 mov (60,sp),d3                   /* sx_max */
 inc d3                           /* sx_max + 1 */
 mulu d0,d3                       /* (sx_max + 1) * S */
 add d1,d3                        /* dx_end_excl */
 inc d3
 lsr 1,d3                         /* dx_pair_end_excl */
 sub d2,d3
 cmp 0,d3
 ble cc_next_src_row
 mov d3,(76,sp)                   /* dx_npairs */

 /* Compute dst row range [dy_cur .. dy_end - 1]. */
 mov (52,sp),d0                   /* sy */
 mov (40,sp),d1                   /* S */
 mulu d1,d0
 mov (48,sp),d2                   /* dst_y0 */
 add d2,d0
 mov d0,(64,sp)                   /* dy_cur */
 add d1,d0
 mov d0,(68,sp)                   /* dy_end */

 /* Blend S consecutive dst rows for this source row. */
cc_dst_row:
 mov (64,sp),d0
 mov (68,sp),d1
 cmp d1,d0
 bcc cc_next_src_row

 /* Compute bus address of (dy_cur, dx_pair0): bus + dy_cur * pitch + dx_pair0 * 4. */
 mov (16,sp),d1                   /* pitch */
 mulu d1,d0
 mov (72,sp),d1                   /* dx_pair0 */
 asl2 d1
 add d1,d0
 mov (20,sp),d1                   /* bus */
 add d1,d0
 mov d0,a2                        /* row_span_bus */

 /* Check if entire span fits within one 128 MiB bus window (almost always true). */
 mov d0,d1
 and 0x07ffffff,d1
 mov 0x08000000,d2
 sub d1,d2
 mov (76,sp),d1                   /* dx_npairs */
 asl2 d1                          /* span_bytes */
 cmp d2,d1
 bhi cc_next_dst_row              /* crosses 128 MiB boundary: skip this single row safely */

 /* hl_open (acquires LOCK internally, returns d0 = token, a0 = uncached/window ptr) + blend + FLUSH + UNLOCK. */
 mov a2,d0                        /* row_span_bus */
 mov (76,sp),d1
 asl2 d1                          /* span_bytes */
 call hl_open,[d2,d3,a2,a3],28
 mov d0,(80,sp)                   /* token */
 cmp 0,a0
 beq cc_row_unlock
 mov a0,(84,sp)                   /* CPU ptr */
 mov sp,a1                        /* pass parent frame */
 call cc_blend_span,[d2,d3,a2,a3],64
 mov (84,sp),a0
 mov (76,sp),d1
 asl2 d1
 call FLUSH,[d2,d3],16
cc_row_unlock:
 mov (80,sp),d0
 call UNLOCK,[d2],8

cc_next_dst_row:
 mov (64,sp),d0
 inc d0
 mov d0,(64,sp)
 bra cc_dst_row

cc_next_src_row:
 mov (52,sp),d0
 inc d0
 mov d0,(52,sp)
 bra cc_src_row

cc_ret:
 ret [d2,d3,a2,a3],104

/* cc_blend_span: blend dx_npairs YCbYCr pairs at cached ptr a0 using parent (4,a1) row_ptr.
 * a0 = dst cached ptr, a1 = parent frame.
 * Locals (48 B): (4) dst_ptr, (8) rem_pairs, (12) S, (16) src_w, (20) sx,
 *   (24) sub_x (0..S-1), (28) bg_word, (32) fg0_ptr, (36) fg1_ptr, (40) row_ptr. */
cc_blend_span:
 mov a0,(4,sp)
 mov (4,a1),a0
 mov a0,(40,sp)                   /* row_ptr */
 mov (76,a1),d0
 mov d0,(8,sp)                    /* rem_pairs */
 mov (40,a1),d2                   /* S */
 mov d2,(12,sp)
 mov (32,a1),d0
 mov d0,(16,sp)                   /* src_w */
 /* Compute initial pixel offset rel_x = dx_pair0 * 2 - dst_x0 (>= 0). */
 mov (72,a1),d0
 asl 1,d0
 mov (44,a1),d1
 sub d1,d0                        /* rel_x */
 /* sx = rel_x / S, sub_x = rel_x % S (one single divu for the whole row!). */
 clr d1
 mov d1,mdr
 divu d2,d0                       /* d0 = sx, mdr = sub_x */
 mov d0,(20,sp)                   /* sx */
 mov mdr,d1
 mov d1,(24,sp)                   /* sub_x */

cc_pair_loop:
 mov (8,sp),d0
 cmp 0,d0
 beq cc_blend_done
 /* Pixel 0: sx0 = (20,sp). Advance (sx, sub_x) by 1 for Pixel 1. */
 mov (20,sp),d0                   /* sx0 */
 mov (16,sp),d1                   /* src_w */
 cmp d1,d0
 bcs 1f
 mov d1,d0
 add -1,d0
1:
 asl2 d0
 mov (40,sp),a2                   /* row_ptr */
 add d0,a2                        /* a2 = &fg0[Y,Cb,Cr,A] */

 /* Advance by 1 pixel -> sx1. */
 mov (24,sp),d1                   /* sub_x */
 inc d1
 mov (12,sp),d2                   /* S */
 mov (20,sp),d0                   /* sx */
 cmp d2,d1
 bcs 2f
 clr d1
 inc d0
2:
 mov d0,(20,sp)                   /* sx1 */
 mov d1,(24,sp)
 mov (16,sp),d3                   /* src_w */
 cmp d3,d0
 bcs 3f
 mov d3,d0
 add -1,d0
3:
 asl2 d0
 mov (40,sp),a3                   /* row_ptr */
 add d0,a3                        /* a3 = &fg1[Y,Cb,Cr,A] */

 /* Advance by 1 more pixel for the NEXT pair's sx0! */
 mov (24,sp),d1
 inc d1
 mov (12,sp),d2
 mov (20,sp),d0
 cmp d2,d1
 bcs 4f
 clr d1
 inc d0
4:
 mov d0,(20,sp)
 mov d1,(24,sp)

 /* Read A0 and A1. */
 movbu (3,a2),d0                  /* A0 */
 movbu (3,a3),d1                  /* A1 */
 mov d0,d2
 or d1,d2
 beq cc_pair_next                 /* both transparent -> skip! */

 /* Fast path: both fully opaque (A0 == 255 && A1 == 255) -> zero multiplies! */
 mov d0,d2
 and d1,d2
 cmp 255,d2
 bne cc_pair_alpha
 movbu (0,a2),d0                  /* Y0 */
 movbu (1,a2),d1                  /* Cb */
 asl 8,d1
 or d1,d0
 movbu (0,a3),d1                  /* Y1 */
 asl 16,d1
 or d1,d0
 movbu (2,a2),d1                  /* Cr */
 asl 24,d1
 or d1,d0
 mov (4,sp),a0
 mov d0,(a0)
 bra cc_pair_next

cc_pair_alpha:
 /* Smooth 8-bit alpha blend for anti-aliased edges.
  * d0 = A0, d1 = A1, a2 = fg0, a3 = fg1. */
 mov (4,sp),a0
 mov (a0),d2
 mov d2,(28,sp)                   /* bg_word = [Y0, Cb, Y1, Cr] */
 mov a2,(32,sp)
 mov a3,(36,sp)

 /* Blend Y0: (bg_Y0*(255-A0) + fg_Y0*A0 + 128) >> 8 */
 mov d0,d3                        /* A0 */
 mov 255,d2
 sub d3,d2                        /* invA0 */
 mov (28,sp),d0
 and 0xff,d0                      /* bg_Y0 */
 mulu d2,d0
 movbu (0,a2),d2                  /* fg_Y0 */
 mulu d3,d2
 add d2,d0
 add 128,d0
 lsr 8,d0
 mov d0,a2                        /* out_Y0 */

 /* Blend Y1: (bg_Y1*(255-A1) + fg_Y1*A1 + 128) >> 8 */
 mov d1,d3                        /* A1 */
 mov 255,d2
 sub d3,d2                        /* invA1 */
 mov (28,sp),d0
 lsr 16,d0
 and 0xff,d0                      /* bg_Y1 */
 mulu d2,d0
 movbu (0,a3),d2                  /* fg_Y1 */
 mulu d3,d2
 add d2,d0
 add 128,d0
 lsr 8,d0
 asl 16,d0
 mov a2,d2
 or d0,d2
 mov d2,a2                        /* out = Y0 | (Y1<<16) */

 /* Chroma alpha Ac = (A0 + A1 + 1) >> 1; use fg0 chroma if A0 >= A1 else fg1. */
 mov (32,sp),a0                   /* fg0 */
 mov (36,sp),a1                   /* fg1 */
 movbu (3,a0),d0                  /* A0 */
 movbu (3,a1),d1                  /* A1 */
 cmp d1,d0
 bcc 5f
 mov a1,a0                        /* pick stronger-alpha pixel's chroma */
5:
 add d1,d0
 inc d0
 lsr 1,d0                         /* Ac */
 mov d0,d3
 mov 255,d2
 sub d3,d2                        /* invAc */
 mov d2,a3                        /* save invAc */

 /* Blend Cb */
 mov (28,sp),d0
 lsr 8,d0
 and 0xff,d0                      /* bg_Cb */
 mulu d2,d0
 movbu (1,a0),d1                  /* fg_Cb */
 mulu d3,d1
 add d1,d0
 add 128,d0
 lsr 8,d0
 asl 8,d0
 mov a2,d2
 or d0,d2
 mov d2,a2

 /* Blend Cr */
 mov (28,sp),d0
 lsr 24,d0                        /* bg_Cr */
 mov a3,d2                        /* invAc */
 mulu d2,d0
 movbu (2,a0),d1                  /* fg_Cr */
 mulu d3,d1
 add d1,d0
 add 128,d0
 lsr 8,d0
 asl 24,d0
 mov a2,d2
 or d0,d2

 mov (4,sp),a0
 mov d2,(a0)

cc_pair_next:
 mov (4,sp),a0
 add 4,a0
 mov a0,(4,sp)
 mov (8,sp),d0
 add -1,d0
 mov d0,(8,sp)
 bra cc_pair_loop

cc_blend_done:
 ret [d2,d3,a2,a3],64

/* 128x128 R8G8B8a8 sprite, matching the colour-wheel IMG2 format. */
cc_sprite:
 mov (CC_BUF_UC),a2
 cmp 0,a2
 beq cc_sprite_ret
 mov a2,(12,sp)
 movhu (6,a2),d0                  /* src_w */
 mov d0,(16,sp)
 movhu (8,a2),d1                  /* src_h */
 mov d1,(20,sp)
 /* max_dim = max(src_w, src_h) in d2. */
 mov d0,d2
 cmp d1,d2
 bcc 1f
 mov d1,d2
1:
 /* fit_w = ((src_w * 128) / max_dim) & ~1, clamped [2..128]. */
 mov (16,sp),d0
 asl 7,d0
 clr d1
 mov d1,mdr
 divu d2,d0
 and 0xfffffffe,d0
 mov d0,(24,sp)                   /* fit_w */
 /* ox anchored by MF_CFG_POS: 0=左下 -> 0, 1=居中 -> (128-fit_w)/2, 2=右下 -> 128-fit_w. */
 mov (MF_CFG_POS),d3
 cmp 0,d3
 beq 31f
 mov 128,d1
 sub d0,d1
 cmp 1,d3
 bne 32f
 lsr 1,d1
 bra 32f
31:
 clr d1
32:
 and 0xfffffffe,d1
 mov d1,(32,sp)                   /* ox */
 /* fit_h = (src_h * 128) / max_dim, clamped [2..128]. */
 mov (20,sp),d0
 asl 7,d0
 clr d1
 mov d1,mdr
 divu d2,d0
 mov d0,(28,sp)                   /* fit_h */
 /* oy = 128 - fit_h (flush bottom) */
 mov 128,d1
 sub d0,d1
 mov d1,(36,sp)                   /* oy */
 /* step_x = (src_w << 16) / fit_w (16.16 fixed point; zero divides in inner loop!). */
 mov (16,sp),d0
 asl 16,d0
 clr d1
 mov d1,mdr
 mov (24,sp),d1
 divu d1,d0
 mov d0,(40,sp)                   /* step_x */

 mov FS_DST,a3
 clr d3
cc_sprite_row:
 mov d3,d0
 mov (36,sp),d1
 sub d1,d0
 bcs cc_sprite_blank_row
 mov (20,sp),d1
 mulu d1,d0
 clr d1
 mov d1,mdr
 mov (28,sp),d1
 divu d1,d0
 mov (16,sp),d1
 mulu d1,d0
 asl2 d0
 mov (12,sp),a2
 add 16,a2
 add d0,a2
 clr d2
cc_sprite_pixel:
 mov d2,d0
 mov (32,sp),d1
 sub d1,d0
 bcs cc_sprite_empty
 mov (24,sp),d1
 cmp d1,d0
 bcc cc_sprite_empty
 mov (40,sp),d1
 mulu d1,d0
 lsr 16,d0
 asl2 d0
 mov a2,a0
 add d0,a0
 movbu (3,a0),d0
 cmp 0,d0
 beq cc_sprite_store
 mov d0,(44,sp)
 movbu (a0),d0
 mov d0,(48,sp)
 movbu (1,a0),d0
 add -128,d0
 mov d0,(52,sp)
 movbu (2,a0),d0
 add -128,d0
 mov d0,(56,sp)
 mov 359,d1
 mul d1,d0
 call cc_rgb_channel,[],0
 asl 24,d0
 mov (44,sp),d1
 or d0,d1
 mov d1,(44,sp)
 mov (52,sp),d0
 mov -88,d1
 mul d1,d0
 mov d0,(60,sp)
 mov (56,sp),d0
 mov -183,d1
 mul d1,d0
 mov (60,sp),d1
 add d1,d0
 call cc_rgb_channel,[],0
 asl 16,d0
 mov (44,sp),d1
 or d0,d1
 mov d1,(44,sp)
 mov (52,sp),d0
 mov 454,d1
 mul d1,d0
 call cc_rgb_channel,[],0
 asl 8,d0
 mov (44,sp),d1
 or d1,d0
 bra cc_sprite_store
cc_sprite_empty:
 clr d0
cc_sprite_store:
 mov d0,(a3)
 inc4 a3
 inc d2
 cmp 128,d2
 bcs cc_sprite_pixel
 bra cc_sprite_next
cc_sprite_blank_row:
 clr d0
 mov 128,d2
1:
 mov d0,(a3)
 inc4 a3
 add -1,d2
 bne 1b
cc_sprite_next:
 inc d3
 cmp 128,d3
 bcs cc_sprite_row
 bra cc_sprite_ret
cc_rgb_channel:
 add 128,d0
 asr 8,d0
 mov (48,sp),d1
 add d1,d0
 bge 1f
 clr d0
1:
 cmp 255,d0
 bls 2f
 mov 255,d0
2:
 ret [],0
cc_sprite_ret:
 ret [d2,d3,a2,a3],84

 .balign 4
cc_path: .asciz "C:\\OM3MOD\\CARD1.BIN"
 .balign 4
cc_hdr:  .space 16, 0
 .balign 64                       /* isolate uncached CC_*_UC from cached cc_hdr */
cc_buf_uc:  .long 0
cc_slot_uc: .long 0
cc_painted: .long 0
cc_review_gui: .long 0
.set CC_PAINTED,cc_painted+0x40000000
.set CC_REVIEW,cc_review_gui+0x40000000
 .balign 64
 .set CC_BUF_UC,  cc_buf_uc  + 0x40000000
 .set CC_SLOT_UC, cc_slot_uc + 0x40000000
 .balign 16
cc_buf:  .space 16 + CC_MAX_PIX, 0

/* Native capture-review submit. With card debug enabled record the concrete
 * handle type and live/latched sources across the stock call. Its argument
 * is a polymorphic handle, never a CPU pixel address. */
.section .hook_cc_recdisp,"ax"
 call cc_recdisp,[a2,a3],24
.section .ext13,"ax"
cc_recdisp:
 mov (CC_BUF_UC),d0
 cmp 0,d0
 beq cc_recdisp_native
 cmp 0,a1
 beq cc_recdisp_native
 mov a0,(4,sp)
 mov a1,(8,sp)
 movbu (lg_on),d0
 cmp 1,d0
 bne 1f
 mov cc_rec_sample+0x40000000,a2
 mov (a2),d0
 inc d0
 mov d0,(a2)
 mov (a1),d0
 mov d0,(4,a2)
 add 8,a2
 call cc_rec_banks,[d2,d3,a3],16
1:
 mov (8,sp),a1
 mov (a1),d0
 cmp 0x60f147f8,d0                /* handle observed at native automatic review */
 mov 0,a3
 bne 2f
 mov 1,a3
2:
 mov (4,sp),a0
 call cc_stock_recdisp,[a2,a3],24
 mov d0,(4,sp)
 mov a0,(8,sp)
 movbu (lg_on),d0
 cmp 1,d0
 bne 3f
 mov cc_rec_sample+128+0x40000000,a2
 call cc_rec_banks,[d2,d3,a3],16
3:
 cmp 0,a3
 beq 8f
 mov (MF_CFG_PREV),d0
 cmp 0,d0
 beq 8f
 mov (MF_CFG_CARD),d0
 cmp 0,d0
 beq 8f
 movbu (UI_PSW),d0
 cmp 2,d0
 bne 8f
 mov (FB_SLOT),d0
 cmp 0,d0
 bne 8f
 /* Queue the transparent layer on the active output as the native review
  * is submitted, even when histogram callbacks have stopped for the shot. */
 mov (0x9bb90060),d0
 btst 32,d0
 beq 4f
 mov 1,d0
 bra 5f
4:
 mov (0x9bb88060),d0
 btst 32,d0
 beq 8f
 mov 2,d0
5:
 movhu (LG_GUI),d1
 inc d1
 mov d1,(CC_REVIEW)
 call fs_tick,[d2,d3,a2,a3],48
8:
 mov (4,sp),d0
 mov (8,sp),a0
 ret [a2,a3],24
cc_recdisp_native:
 jmp cc_stock_recdisp
cc_rec_banks:
 mov 0x9bb88000,a0
 mov 2,d2
1:
 mov cc_rec_regs,a3
 mov 15,d3
2:
 movhu (a3),d0
 mov a0,a1
 add d0,a1
 mov (a1),d1
 mov d1,(a2)
 inc4 a2
 add 2,a3
 add -1,d3
 bne 2b
 add 0x8000,a0
 add -1,d2
 bne 1b
 ret [d2,d3,a3],16
.balign 2
cc_rec_regs:
 .short 0x60,0x390,0x3a8,0x400,0x42c,0x430,0x2060,0x2390
 .short 0x39c,0x3a0,0x3a4,0x62c,0x630,0x634,0x4e0
.balign 4
cc_rec_sample: .space 248,0
