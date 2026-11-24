/* Read or write one row in bounded mapper windows; no mapped pointer survives UNLOCK.
 * a0 = parent frame; d0 = bus; d1 = 0 read, 1 write. Returns success in d0. */
sun_transfer:
 mov (24,a0),a2                  /* row scratch */
 mov (8,a0),d2                   /* number of pairs */
 mov d0,a3
 mov d1,(4,sp)
1:
 mov a3,d0
 and 0x07ffffff,d0
 mov 0x08000000,d1
 sub d0,d1
 lsr 2,d1
 cmp 4096,d1
 bls 2f
 mov 4096,d1
2:
 cmp d2,d1
 bls 3f
 mov d2,d1
3:
 mov d1,d3
 asl2 d1
 mov a3,d0
 call hl_open,[d2,d3,a2,a3],28
 mov d0,(8,sp)
 cmp 0,a0
 beq 8f
 mov a0,d0
 clr d1
 cmp 0xb8000000,d0
 bcs 4f
 add -0x40000000,d0
 mov 1,d1
4:
 mov d0,a0
 mov d1,(12,sp)
 sub d3,d2
 mov d3,d0
 asl2 d0
 add d0,a3
 mov (4,sp),d0
 cmp 0,d0
 bne 6f
5:
 mov (a0),d0
 mov d0,(a2)
 add 4,a0
 add 4,a2
 add -1,d3
 bne 5b
 bra 7f
6:
 mov (a2),d0
 mov d0,(a0)
 add 4,a0
 add 4,a2
 add -1,d3
 bne 6b
 mov (12,sp),d0
 cmp 0,d0
 beq 7f
 call FLUSH,[d2,d3],16
7:
 mov (8,sp),d0
 call UNLOCK,[d2],8
 cmp 0,d2
 bne 1b
 mov 1,d0
 ret [d2,d3,a2,a3],32
8:
 mov (8,sp),d0
 call UNLOCK,[d2],8
 clr d0
 ret [d2,d3,a2,a3],32
