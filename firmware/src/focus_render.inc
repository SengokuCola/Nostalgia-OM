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

/* screen_reticle (Test 27): copy unmodified live-view 128x128 tile (a0 -> a1) and draw a clean
 * focus sampling reticle (4 corner brackets + center '+') showing the MF PDAF ROI.
 * Color: bright green (0x15962c96) when in focus (FS_GREEN_TICKS > 0 or PD_VALID==1 && PD_SPLIT_S==0),
 * crisp white (0x80eb80eb) otherwise.
 * call screen_reticle,[d2,d3,a2,a3],20: a0 = FS_SRC, a1 = FS_DST -> d0 = 0. */
.global screen_reticle
screen_reticle:
 mov a1,a2                         /* save dst base */
 mov 2048,d3                       /* 8192 dwords / 4 = 2048 */
sr_cpy:
 mov (a0),d0
 mov (4,a0),d1
 mov d0,(a1)
 mov d1,(4,a1)
 mov (8,a0),d0
 mov (12,a0),d1
 mov d0,(8,a1)
 mov d1,(12,a1)
 add 16,a0
 add 16,a1
 add -1,d3
 bne sr_cpy
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
 /* Horizontal corner bars: y = 28..29 and y = 98..99, px = 8..17 (left) & 46..55 (right). */
 mov a2,a0
 add 28*256,a0                     /* top outer bar */
 call sr_hbars,[],0
 mov a2,a0
 add 98*256,a0                     /* bottom outer bar */
 call sr_hbars,[],0
 /* Vertical corner bars: y = 28..47 (20 rows) and y = 80..99 (20 rows), px = 8 & 55. */
 mov a2,a0
 add 28*256,a0
 call sr_vbars,[],0
 mov a2,a0
 add 80*256,a0
 call sr_vbars,[],0
 /* Center crosshair '+': horiz y = 63..64, px = 29..34; vert y = 58..69, px = 31..32. */
 mov a2,a0
 add 63*256 + 29*4,a0
 mov 6,d3
sr_ch:
 mov d2,(a0)
 mov d2,(256,a0)
 add 4,a0
 add -1,d3
 bne sr_ch
 mov a2,a0
 add 58*256 + 31*4,a0
 mov 12,d3
sr_cv:
 mov d2,(a0)
 mov d2,(4,a0)
 add 256,a0
 add -1,d3
 bne sr_cv
 clr d0
 ret [d2,d3,a2,a3],20

/* sr_hbars: leaf helper, a0 = row start, d2 = color -> draws 2 rows x (px 8..17 and px 46..55). */
sr_hbars:
 mov a0,a1
 add 8*4,a1
 mov 10,d3
1:
 mov d2,(a1)
 mov d2,(256,a1)
 mov d2,(38*4,a1)
 mov d2,(256+38*4,a1)
 add 4,a1
 add -1,d3
 bne 1b
 ret [],0

/* sr_vbars: leaf helper, a0 = row start, d2 = color -> draws 20 rows at px 8 and px 55. */
sr_vbars:
 mov a0,a1
 mov 20,d3
1:
 mov d2,(8*4,a1)
 mov d2,(55*4,a1)
 add 256,a1
 add -1,d3
 bne 1b
 ret [],0
