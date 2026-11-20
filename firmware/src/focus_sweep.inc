/* MF sweep. DISPLAY samples RAM; only CADLOG's low-priority task touches SD.
 * Each page is a separate file. The filename of the first page identifies
 * the boot. A sequence gap advertises a stalled/removed card. */
.section .ext13,"ax"
.balign 4
.set SW_CAP,512
.set SW_PAGE,64
.set SW_STRIDE,40
.set SW_ROWS,sw_rows+0x40000000
.set SW_HEAD,sw_head+0x40000000
.set SW_RELEASE,sw_release+0x40000000
sw_head: .long 0
sw_release: .long 0
sw_rows: .space SW_CAP*SW_STRIDE

/* Inside zr_sample's existing lock. a3 points to its completed 32-byte row.
 * Lens record validity and its DRAM bounds mirror fp_take. */
sw_capture:
 mov (a3),d2
 mov d2,d0
 and 511,d0
 mov d0,d1
 asl2 d0
 add d1,d0
 asl 3,d0
 mov SW_ROWS,a2
 add d0,a2
 mov a3,a0
 mov a2,a1
 mov 8,d1
1:
 mov (a0),d0
 mov d0,(a1)
 inc4 a0
 inc4 a1
 add -1,d1
 bne 1b
 mov -32768,d0
 movhu d0,(32,a2)
 clr d0
 movbu d0,(34,a2)
 movbu (0x62997490),d0
 movbu d0,(35,a2)
 mov (lg_n),d0
 mov d0,(36,a2)
 movbu (0xa32d3d32),d0
 cmp 1,d0
 bne 9f
 mov (0xa32c9c24),a0
 mov a0,d0
 and 3,d0
 bne 9f
 cmp 0x62000000,a0
 bcs 9f
 cmp 0x63ffffd4,a0
 bcs 2f
 cmp 0xa2000000,a0
 bcs 9f
 cmp 0xa3ffffd4,a0
 bcc 9f
2:
 movhu (40,a0),d1
 mov (0xa32c9c24),a1
 cmp a1,a0
 bne 9f
 movbu (0xa32d3d32),d0
 cmp 1,d0
 bne 9f
 movhu d1,(32,a2)
 movbu d0,(34,a2)
9:
 mov d2,(SW_HEAD)
 ret [d2,d3,a2,a3],24

/* Single writer. Keep locks to one 40-byte slot, never across file I/O. */
sw_flush:
 mov (SW_HEAD),d3
 mov (sw_saved),d2
 cmp d2,d3
 bhi 1f
 jmp sw_out
1:
 mov d3,d0
 sub d2,d0
 /* After leaving the sampling view, drain a short tail without a release.
  * While samples are arriving keep batching 64 at a time. */
 mov (sw_seen),d1
 cmp d1,d3
 beq 10f
 mov d3,(sw_seen)
 clr d1
 mov d1,(sw_quiet)
 bra 11f
10:
 mov (sw_quiet),d1
 inc d1
 mov d1,(sw_quiet)
 cmp 20,d1
 bcc 2f
11:
 cmp SW_PAGE,d0
 bcc 2f
 mov (SW_RELEASE),d1
 cmp d2,d1
 bhi 2f
 jmp sw_out
2:
 cmp SW_CAP,d0
 bls 3f
 mov d3,d2
 add -SW_CAP,d2
3:
 inc d2
 mov d2,(sw_first)
 mov d3,d0
 sub d2,d0
 inc d0
 cmp SW_PAGE,d0
 bls 4f
 mov SW_PAGE,d0
4:
 mov d0,(sw_count)
 mov d0,d3
 mov sw_payload,a3
sw_copy_row:
 mov d2,d0
 and 511,d0
 mov d0,d1
 asl2 d0
 add d1,d0
 asl 3,d0
 mov SW_ROWS,a2
 add d0,a2
 clr d0
 call LOCK,[d2],8
 mov d0,(4,sp)
 mov (a2),d1
 cmp d2,d1
 bne sw_raced
 mov 10,d1
5:
 mov (a2),d0
 mov d0,(a3)
 inc4 a2
 inc4 a3
 add -1,d1
 bne 5b
 mov (4,sp),d0
 call UNLOCK,[d2],8
 inc d2
 add -1,d3
 bne sw_copy_row
 mov 61440,d0
 mov (MS_A),d1
 cmp d0,d1
 beq sw_choose
 mov (MS_B),d1
 cmp d0,d1
 beq sw_choose
 mov (MS_C),d1
 cmp d0,d1
 bne sw_out
sw_choose:
 mov 16,d0
 mov d0,(8,sp)
sw_next_name:
 mov (sw_number),d0
 cmp 999999,d0
 bcc sw_out
 inc d0
 mov d0,(sw_number)
 mov sw_digits+5,a0
6:
 movbu (a0),d1
 inc d1
 cmp 58,d1
 bne 7f
 mov 48,d1
 movbu d1,(a0)
 add -1,a0
 bra 6b
7:
 movbu d1,(a0)
 mov sw_path,a0
 mov lg_mr,a1
 call fopen,[],4
 cmp 0,a0
 beq 8f
 call fclose,[d2,a2,a3],16
 /* Continue past previous boots with bounded work per poll. */
 mov (8,sp),d0
 add -1,d0
 mov d0,(8,sp)
 bne sw_next_name
 bra sw_out
8:
 mov sw_path,a0
 mov lg_mw,a1
 call fopen,[],4
 cmp 0,a0
 beq sw_out
 mov a0,a2
 mov (sw_session),d0
 cmp 0,d0
 bne 9f
 mov (sw_number),d0
 mov d0,(sw_session)
9:
 mov sw_payload,d3
 sub d3,a3
 mov a3,d1
 add 24,d1
 mov d1,d3
 mov 1,d0
 mov a2,a1
 mov sw_file,a0
 call fwrite,[d2,d3,a2,a3],24
 cmp d3,d0
 bne sw_short
 mov a2,a0
 call fclose,[d2,a2,a3],16
 cmp 0,d0
 bne sw_out
 add -1,d2
 mov d2,(sw_saved)
sw_out:
 ret [d2,d3,a2,a3],32
sw_short:
 mov a2,a0
 call fclose,[d2,a2,a3],16
 bra sw_out
sw_raced:
 mov (4,sp),d0
 call UNLOCK,[d2],8
 jmp sw_out
.balign 4
sw_seen: .long 0
sw_quiet: .long 0
sw_saved: .long 0
sw_number: .long 0
sw_file: .ascii "OMSW"
 .long 1
sw_session: .long 0
sw_first: .long 0
sw_count: .long 0
 .long SW_STRIDE
sw_payload: .space SW_PAGE*SW_STRIDE
sw_path: .ascii "C:\\OM3MOD\\ZS"
sw_digits: .asciz "000000.BIN"
