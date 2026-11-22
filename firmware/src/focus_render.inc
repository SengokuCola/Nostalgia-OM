/* Experimental visual screen renderer; also exercised by the standalone harness.
 * call screen_map,[d2,d3,a2,a3],40: a0 immutable YCbYCr source,
 * a1 separate destination, d0 u16 pair-index map, d1 number of pairs (1..8192).
 * Caller owns all three uncached DRAM allocations. No bus-window/MMIO/cache work.
 * Map 0xffff = white, 0xfffe = black; all other indices must be < count.
 * Validate the whole map before any destination write. d0=0 success, 1 rejected.
 * Whole 4-byte chroma pairs are moved together; no odd-pixel colour shifts.
 */

.global screen_map
screen_map:
 mov a0,(4,sp)
 mov a1,(8,sp)
 mov d0,(12,sp)
 mov d1,(16,sp)
 cmp 1,d1
 bcs sm_bad
 cmp 8192,d1
 bhi sm_bad
 mov d1,d2
 asl2 d2
 mov d2,(20,sp)
 /* Source / destination: aligned complete spans in uncached DRAM. */
 mov a0,d3
 mov a1,d0
 or d0,d3
 and 3,d3
 bne sm_bad
 cmp 0xa0000000,a0
 bcs sm_bad
 cmp 0xa0000000,a1
 bcs sm_bad
 cmp 0xb2000000,a0
 bcc sm_bad
 cmp 0xb2000000,a1
 bcc sm_bad
 mov a0,a2
 add d2,a2
 cmp 0xb2000000,a2
 bhi sm_bad
 mov a1,a3
 add d2,a3
 cmp 0xb2000000,a3
 bhi sm_bad
 /* Reject source/destination overlap. */
 cmp a2,a1
 bcc 1f
 cmp a3,a0
 bcs sm_bad
1:
 mov (12,sp),d0
 mov d0,d3
 and 1,d3
 bne sm_bad
 cmp 0xa0000000,d0
 bcs sm_bad
 cmp 0xb2000000,d0
 bcc sm_bad
 mov d0,a2
 mov d1,d2
 asl 1,d2
 add d0,d2
 cmp 0xb2000000,d2
 bhi sm_bad
 /* Reject destination/map overlap. */
 cmp d2,a1
 bcc 2f
 cmp a3,a2
 bcs sm_bad
2:
 mov d1,d3
3:
 movhu (a2),d0
 add 2,a2
 cmp 65534,d0
 bcc 4f
 cmp d1,d0
 bcc sm_bad
4:
 add -1,d3
 bne 3b
 mov (12,sp),a2
 mov (16,sp),d3
5:
 movhu (a2),d0
 add 2,a2
 cmp 65535,d0
 beq white
 cmp 65534,d0
 beq sm_black
 asl2 d0
 mov (4,sp),a0
 add d0,a0
 mov (a0),d0
 bra sm_store
white:
 mov (FS_GREEN_TICKS),d0
 cmp 0,d0
 bne sm_green
 mov 0x80eb80eb,d0
 bra sm_store
sm_green:
 mov 0x15962c96,d0
 bra sm_store
sm_black:
 mov 0x80108010,d0
sm_store:
 mov d0,(a1)
 inc4 a1
 add -1,d3
 bne 5b
 clr d0
 ret [d2,d3,a2,a3],40
sm_bad:
 mov 1,d0
 ret [d2,d3,a2,a3],40

/* screen_reticle (Test 28): copy ONLY the box x box center sub-rectangle (48/80/112 px)
 * from FS_SRC (a0) to FS_DST (a1) at matching (pad, pad) offset (stride 256 B) and draw
 * crisp 2px corner brackets on the outer edge + tiny center '+' crosshair.
 * Color: bright green (0x15962c96) when in focus, crisp white (0x80eb80eb) otherwise.
 * call screen_reticle,[d2,d3,a2,a3],32: a0 = FS_SRC, a1 = FS_DST, d0 = size_code (0=48, 1=80, 2=112)
 * Returns d0 = 0. */
.global screen_reticle
screen_reticle:
 mov a1,(4,sp)                     /* save FS_DST base */
 /* Map size_code (0/1/2) -> box (48/80/112), pad (40/24/8), arm_pairs (6/9/12), arm_rows (12/18/24). */
 cmp 0,d0
 beq sr_sz_s
 cmp 2,d0
 beq sr_sz_l
 mov 80,d1                         /* 中: box = 80, pad = 24 */
 mov 24,d2
 mov 9,d3                          /* arm_pairs */
 bra sr_sz_ok
sr_sz_s:
 mov 48,d1                         /* 小: box = 48, pad = 40 */
 mov 40,d2
 mov 6,d3
 bra sr_sz_ok
sr_sz_l:
 mov 112,d1                        /* 大: box = 112, pad = 8 */
 mov 8,d2
 mov 12,d3
sr_sz_ok:
 mov d1,(8,sp)                     /* box (rows = pixels) */
 mov d2,(12,sp)                    /* pad (rows = pixels) */
 mov d3,(16,sp)                    /* arm_pairs */
 /* Compute starting byte offset = pad*256 + pad*2 */
 mov d2,d0
 asl 8,d0
 mov d2,d3
 asl 1,d3
 add d3,d0
 add d0,a0                         /* src row start */
 add d0,a1                         /* dst row start */
 mov a1,a2                         /* save dst sub-rect top-left */
 /* Copy box rows x (box/2) pairs, stride 256 B. */
 mov d1,d3                         /* row_cnt = box */
 mov d1,d2
 lsr 1,d2                          /* pairs_per_row = box / 2 */
 mov 256,d0
 mov d2,d1
 asl2 d1
 sub d1,d0                         /* row_gap = 256 - box*2 */
sr_row:
 mov d2,d1                         /* inner pair count */
sr_px:
 mov (a0),a3
 mov a3,(a1)
 add 4,a0
 add 4,a1
 add -1,d1
 bne sr_px
 add d0,a0
 add d0,a1
 add -1,d3
 bne sr_row

 /* Choose reticle color: green when in focus, white otherwise. */
 mov 0x80eb80eb,d2                 /* white */
 mov (FS_GREEN_TICKS),d0
 cmp 0,d0
 bne sr_green
 mov (PD_VALID),d0
 cmp 1,d0
 bne sr_draw
 mov (PD_SPLIT_S),d0
 cmp 0,d0
 bne sr_draw
sr_green:
 mov 0x15962c96,d2                 /* green */
sr_draw:
 /* a2 = top-left of box x box sub-rect in FS_DST.
  * Right-edge pair byte offset = (box/2 - 1) * 4 = box*2 - 4. */
 mov (8,sp),d1                     /* box */
 mov d1,d0
 asl 1,d0
 add -4,d0                         /* right_x_off = box*2 - 4 */
 mov (16,sp),d3                    /* arm_pairs */
 mov d3,a3                         /* arm_pairs */
 /* Top horizontal brackets (rows 0..1) */
 mov a2,a0
 call sr_hbars,[],0
 /* Bottom horizontal brackets (rows box-2..box-1) */
 mov (8,sp),d1
 add -2,d1
 asl 8,d1
 mov a2,a0
 add d1,a0
 call sr_hbars,[],0
 /* Top vertical brackets (rows 0..arm_rows-1, arm_rows = arm_pairs*2) */
 mov a2,a0
 call sr_vbars,[],0
 /* Bottom vertical brackets (rows box-arm_rows..box-1) */
 mov a3,d1
 asl 1,d1                          /* arm_rows */
 mov (8,sp),a0
 sub d1,a0                         /* box - arm_rows */
 mov a0,d1
 asl 8,d1
 mov a2,a0
 add d1,a0
 call sr_vbars,[],0
 /* Center crosshair '+' at center of 128x128 tile (y=63..64, px=30..33; y=60..67, px=31..32). */
 mov (4,sp),a2                     /* FS_DST base */
 mov a2,a0
 add 63*256 + 30*4,a0
 mov 4,d3
sr_ch:
 mov d2,(a0)
 mov d2,(256,a0)
 add 4,a0
 add -1,d3
 bne sr_ch
 mov a2,a0
 add 60*256 + 31*4,a0
 mov 8,d3
sr_cv:
 mov d2,(a0)
 mov d2,(4,a0)
 add 256,a0
 add -1,d3
 bne sr_cv
 clr d0
 ret [d2,d3,a2,a3],32

/* sr_hbars: leaf helper, a0 = row start, d0 = right_x_off, d2 = color, a3 = arm_pairs. */
sr_hbars:
 mov a0,a1                         /* left arm cursor */
 mov a0,d1
 add d0,d1                         /* right-edge byte addr */
 mov d1,a0                         /* right arm cursor (moves left) */
 mov a3,d3                         /* arm_pairs */
1:
 mov d2,(a1)
 mov d2,(256,a1)
 mov d2,(a0)
 mov d2,(256,a0)
 add 4,a1
 add -4,a0
 add -1,d3
 bne 1b
 ret [],0

/* sr_vbars: leaf helper, a0 = row start, d0 = right_x_off, d2 = color, a3 = arm_pairs. */
sr_vbars:
 mov a0,a1
 mov a3,d3
 asl 1,d3                          /* arm_rows = arm_pairs * 2 */
1:
 mov d2,(a1)
 mov a1,a0
 add d0,a0
 mov d2,(a0)
 add 256,a1
 add -1,d3
 bne 1b
 ret [],0
