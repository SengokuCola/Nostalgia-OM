/* Called inside TH's normal frame. Keep the caller's request untouched.
 * The stock body consumes a stack-local copy before returning. */
.section .fb_runtime,"ax"
.balign 4
fb_th_stats: .space 16
.set FB_TH_STATS,fb_th_stats+0x40000000
fb_inset_request:
 movhu (52,a0),d2
 movhu (54,a0),d3
 cmp 2,d2
 bcc 9f
 jmp fs_th_original
9:
 cmp 2,d3
 bcc 9f
 jmp fs_th_original
9:
 add -228,sp
 mov sp,a1
 inc4 a1
 mov 56,d0
1:
 mov (a0),d1
 mov d1,(a1)
 inc4 a0
 inc4 a1
 add -1,d0
 bne 1b
 mov d3,d0
 mov 574,d1
 mulu d1,d0
 clr d1
 mov d1,mdr
 divu d2,d0
 mov 574,d1
 cmp 430,d0
 bls 2f
 mov 430,d0
 mulu d0,d2
 clr d1
 mov d1,mdr
 divu d3,d2
 mov d2,d1
2:
 and -2,d0
 and -2,d1
 cmp 2,d0
 bcs 3f
 cmp 2,d1
 bcs 3f
 movhu d1,(56,sp)
 movhu d0,(58,sp)
 mov 1172,d2
 sub d1,d2
 lsr 1,d2
 and -2,d2
 movhu d2,(60,sp)
 mov 618,d2
 sub d0,d2
 lsr 1,d2
 movhu d2,(62,sp)
 mov (FB_TH_STATS),d0
 inc d0
 mov d0,(FB_TH_STATS)
 mov (52,sp),d0
 mov d0,(FB_TH_STATS+4)
 mov (56,sp),d0
 mov d0,(FB_TH_STATS+8)
 mov (60,sp),d0
 mov d0,(FB_TH_STATS+12)
3:
 mov sp,a0
 inc4 a0
 call fs_th_original,[d2,d3,a2,a3],76
 add 228,sp
 ret [d2,d3,a2,a3],76
