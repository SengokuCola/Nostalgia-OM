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
