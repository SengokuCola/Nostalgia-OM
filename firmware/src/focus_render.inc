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
 mov 0x80eb80eb,d0
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

/* Test 19: Leica-style optical rangefinder yellow-patch renderer on the owned
 * 128x128 YUYV tile (uncached DRAM only, same strict bounds contract as
 * screen_map).
 * call screen_rangefinder,[d2,d3,a2,a3],48:
 *   a0 = immutable YCbYCr source (FS_SRC, 32768 B)
 *   a1 = separate destination (FS_DST, 32768 B)
 *   d0 = signed ghost shift in chroma pairs (clamped -10..+10 => -20..+20 px)
 *   d1 = border status: 0=low-conf grey, 1=tracking amber, 2=in-focus white
 * Returns d0 = 0 success, 1 rejected.
 */
.global screen_rangefinder
screen_rangefinder:
 /* Validate aligned non-overlapping 32768-byte spans in uncached DRAM. */
 mov a0,d3
 mov a1,d2
 or d2,d3
 and 3,d3
 bne sr_bad
 cmp 0xa0000000,a0
 bcs sr_bad
 cmp 0xa0000000,a1
 bcs sr_bad
 cmp 0xb2000000,a0
 bcc sr_bad
 cmp 0xb2000000,a1
 bcc sr_bad
 mov a0,a2
 add 32768,a2
 cmp 0xb2000000,a2
 bhi sr_bad
 mov a1,a3
 add 32768,a3
 cmp 0xb2000000,a3
 bhi sr_bad
 cmp a2,a1
 bcc 1f
 cmp a3,a0
 bcs sr_bad
1:
 /* Clamp shift d0 to -10..+10 chroma pairs and convert to byte offset (*4). */
 cmp 10,d0
 ble 2f
 mov 10,d0
2:
 cmp -10,d0
 bge 3f
 mov -10,d0
3:
 asl2 d0
 mov d0,(4,sp)                       /* shift_bytes (-40..+40) */

 /* Select border YUYV word from status d1. */
 mov 0x80508050,d0                   /* 0: low-conf dim grey */
 cmp 1,d1
 bne 4f
 mov 0x88386838,d0                   /* 1: tracking dark amber hairline */
 bra 5f
4:
 cmp 2,d1
 bne 5f
 mov 0x80eb80eb,d0                   /* 2: in-focus crisp white frame */
5:
 mov d0,(8,sp)                       /* border_word */

 mov a0,a2                           /* src cursor */
 mov a1,a3                           /* dst cursor */
 clr d2                              /* y = 0..127 */
sr_row:
 clr d3                              /* x = 0..63 chroma pairs */
sr_col:
 /* Patch outer box: y in 36..91 (56 px), x in 11..52 (84 px). */
 cmp 36,d2
 bcs sr_copy
 cmp 92,d2
 bcc sr_copy
 cmp 11,d3
 bcs sr_copy
 cmp 53,d3
 bcc sr_copy
 /* 1-px/1-pair hairline border on box perimeter. */
 cmp 36,d2
 beq sr_border
 cmp 91,d2
 beq sr_border
 cmp 11,d3
 beq sr_border
 cmp 52,d3
 beq sr_border

 /* Inside patch (x in 12..51, shift in -10..+10 => x+shift in 2..61):
  * 50/50 YUYV ghost blend + warm Leica golden-amber tint (Cb -24, Cr +10). */
 mov (4,sp),d0
 mov a2,a0
 add d0,a0                           /* shifted ghost pair ptr */
 /* Byte 0: Y0 = (Y0_1 + Y0_2) >> 1 */
 movbu (a2),d0
 movbu (a0),d1
 add d1,d0
 lsr 1,d0
 movbu d0,(a3)
 /* Byte 1: Cb = max(20, ((Cb_1 + Cb_2) >> 1) - 24) */
 movbu (1,a2),d0
 movbu (1,a0),d1
 add d1,d0
 lsr 1,d0
 add -24,d0
 cmp 20,d0
 bge 6f
 mov 20,d0
6:
 movbu d0,(1,a3)
 /* Byte 2: Y1 = (Y1_1 + Y1_2) >> 1 */
 movbu (2,a2),d0
 movbu (2,a0),d1
 add d1,d0
 lsr 1,d0
 movbu d0,(2,a3)
 /* Byte 3: Cr = min(236, ((Cr_1 + Cr_2) >> 1) + 10) */
 movbu (3,a2),d0
 movbu (3,a0),d1
 add d1,d0
 lsr 1,d0
 add 10,d0
 cmp 236,d0
 ble 7f
 mov 236,d0
7:
 movbu d0,(3,a3)
 bra sr_next

sr_border:
 mov (8,sp),d0
 mov d0,(a3)
 bra sr_next

sr_copy:
 mov (a2),d0
 mov d0,(a3)

sr_next:
 inc4 a2
 inc4 a3
 inc d3
 cmp 64,d3
 bcs sr_col
 inc d2
 cmp 128,d2
 bcs sr_row

 clr d0
 ret [d2,d3,a2,a3],48
sr_bad:
 mov 1,d0
 ret [d2,d3,a2,a3],48
