/* MF sweep. DISPLAY samples RAM; only CADLOG's low-priority task touches SD.
 * Each page is a separate file. The filename of the first page identifies
 * the boot. A sequence gap advertises a stalled/removed card. */
.section .ext13,"ax"
.balign 4
.set SW_CAP,512
.set SW_PAGE,64
.set SW_STRIDE,160
.set SW_ROWS,sw_rows+0x40000000
.set SW_HEAD,sw_head+0x40000000
.set SW_RELEASE,sw_release+0x40000000
.set SW_LAST_VIEW,sw_last_view+0x40000000
.set SW_FI_INIT,sw_fi_init+0x40000000
.set SW_FI_SEQ,sw_fi_seq+0x40000000
.set SW_FI_PREV,sw_fi_prev+0x40000000
.set SW_RAW_AB,sw_raw_ab+0x40000000
sw_head: .long 0
sw_release: .long 0
sw_last_view: .long 0
sw_fi_init: .long 0
sw_fi_seq: .long 0
sw_fi_prev: .space 12,0
sw_raw_ab: .space 12,0
sw_rows: .space SW_CAP*SW_STRIDE

/* Call stock Focus Indicator getter 0x60153ee1 outside LOCK.
 * Guard lens record bounds and divisor monotonicity before invoking stock.
 * Returns d0 = valid | (index << 8) | (dir << 16) | (invoked << 31). */
sw_sample_fi:
 call sw_sample_raw_ab,[d2,d3,a2,a3],44
 clr d0
 mov d0,(4,sp)
 movbu (0xa32d3d32),d0
 cmp 1,d0
 bne sw_fi_invoke
 mov (0xa32c9c24),a0
 mov a0,d0
 and 3,d0
 bne sw_fi_skip
 cmp 0x62000000,a0
 bcs sw_fi_skip
 cmp 0x63fe2000,a0
 bcs sw_fi_bounds_ok
 cmp 0xa2000000,a0
 bcs sw_fi_skip
 cmp 0xa3fe2000,a0
 bcc sw_fi_skip
sw_fi_bounds_ok:
 movhu (22,a0),d0
 exth d0
 movhu (24,a0),d1
 exth d1
 cmp d0,d1
 blt sw_fi_skip
 movhu (34,a0),d2
 exth d2
 cmp d1,d2
 blt sw_fi_skip
 movhu (36,a0),d3
 exth d3
 cmp d2,d3
 blt sw_fi_skip
 mov (0xa32c9c24),a1
 cmp a1,a0
 bne sw_fi_skip
 movbu (0xa32d3d32),d0
 cmp 1,d0
 bne sw_fi_skip
sw_fi_invoke:
 mov mdr,d0
 mov d0,(8,sp)
 mov sp,a0
 inc4 a0
 call sw_stock_fi,[a2],8
 mov (8,sp),d0
 mov d0,mdr
 movbu (4,sp),d0
 movbu (5,sp),d1
 asl 8,d1
 or d1,d0
 movbu (6,sp),d1
 asl 16,d1
 or d1,d0
 mov 0x80000000,d1
 or d1,d0
 ret [d2,d3,a2,a3],28
sw_fi_skip:
 clr d0
 ret [d2,d3,a2,a3],28

/* Inside zr_sample's existing lock. a3 points to its completed 32-byte row;
 * d0 carries sw_sample_fi's packed result.
 * Lens record validity and its DRAM bounds mirror fp_take. */
sw_capture:
 mov d0,(4,sp)
 mov (a3),d2
 mov d2,d0
 and 511,d0
 asl 5,d0
 mov d0,d1
 asl 2,d0
 add d1,d0
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
 cmp 1,d2
 bne 3f
 clr d0
 mov d0,(SW_LAST_VIEW)
 mov d0,(SW_FI_INIT)
 mov d0,(SW_FI_SEQ)
3:
 mov (FS_VIEW_SEQ),d0
 cmp 0,d0
 beq 4f
 mov (SW_LAST_VIEW),d1
 cmp d1,d0
 beq 4f
 mov d0,(SW_LAST_VIEW)
 mov FS_SWEEP_VIEW,a0
 mov (a0),d0
 mov d0,(40,a2)
 mov (4,a0),d0
 mov d0,(44,a2)
 mov (8,a0),d0
 mov d0,(48,a2)
 mov (12,a0),d0
 mov d0,(52,a2)
 bra 5f
4:
 mov -1,d0
 mov d0,(40,a2)
 mov d0,(44,a2)
 mov (fs_focus_stats+12+0x40000000),d0
 mov d0,(48,a2)
 mov 0x00ff80ff,d0
 mov d0,(52,a2)
5:
 mov (4,sp),d0
 movbu (0x62997470),d1
 and 15,d1
 movbu (0x62997471),d3
 and 1,d3
 asl 4,d3
 or d3,d1
 asl 24,d1
 and 0x80ffffff,d0
 or d1,d0
 mov d0,(56,a2)
 movhu (0x6299748e),d1
 movhu d1,(60,a2)
 movhu (0xa32c9c28),d3
 movhu d3,(62,a2)
 mov (0x62997474),d3
 mov d3,(64,a2)
 and 0x1fffffff,d0
 mov (SW_FI_INIT),a0
 cmp 1,a0
 beq 6f
 mov 1,a0
 mov a0,(SW_FI_INIT)
 mov d0,(SW_FI_PREV)
 movhu d1,(SW_FI_PREV+4)
 mov d3,(SW_FI_PREV+8)
 cmp 0,d0
 bne 7f
 mov 0x8000,a0
 cmp a0,d1
 bne 7f
 cmp 0,d3
 bne 7f
 clr d0
 mov d0,(68,a2)
 bra 8f
6:
 mov (SW_FI_PREV),d3
 cmp d3,d0
 bne 7f
 movhu (SW_FI_PREV+4),d3
 cmp d3,d1
 bne 7f
 mov (64,a2),d3
 mov (SW_FI_PREV+8),a0
 cmp a0,d3
 beq 75f
7:
 mov d0,(SW_FI_PREV)
 movhu d1,(SW_FI_PREV+4)
 mov (64,a2),d3
 mov d3,(SW_FI_PREV+8)
 mov (SW_FI_SEQ),d0
 inc d0
 mov d0,(SW_FI_SEQ)
75:
 mov (SW_FI_SEQ),d0
 mov d0,(68,a2)
8:
 mov (ZAF+4),d0
 movhu (ZAF+12),d1
 movbu (ZAF+1),d3
 mov d3,(4,sp)
 movbu (ZAF+10),d3
 mov (ZAF+4),a0
 cmp d0,a0
 beq 85f
 mov -1,d0
 mov 0x8000,d1
85:
 mov d0,(72,a2)
 movhu d1,(76,a2)
 mov (4,sp),d0
 movbu d0,(78,a2)
 movbu d3,(79,a2)
 /* Layer 0: raw sensor Quad-Pixel PDAF stream & 4-slot ring state. */
 movbu (0x62b3d938),d0
 movbu d0,(80,a2)
 movbu (0x62b3d93a),d0
 movbu d0,(81,a2)
 movbu (0x62b3d97c),d0
 movbu d0,(82,a2)
 mov (0x62b3d9c8),d0
 movbu d0,(83,a2)
 movhu (0xa33e9c80),d0
 movhu d0,(84,a2)
 movhu (0xa33e9c82),d0
 movhu d0,(86,a2)
 movhu (0xa33e9c84),d0
 movhu d0,(88,a2)
 movhu (0xa33e9c86),d0
 movhu d0,(90,a2)
 movhu (0xa33e9c8a),d0
 cmp 4,d0
 bcs 86f
 mov 255,d0
86:
 movbu d0,(92,a2)
 movhu (0xa33e9c8c),d3
 cmp 4,d3
 bcs 87f
 mov 255,d3
87:
 movbu d3,(93,a2)
 movhu (0xa33e9c8e),d0
 cmp 4,d0
 bcs 88f
 mov 255,d0
88:
 movbu d0,(94,a2)
 movhu (0xa33e9c90),d0
 cmp 4,d0
 bcs 89f
 mov 255,d0
89:
 movbu d0,(95,a2)
 /* Hash 8 central words of active A-half (+461680) and B-half (+1394800) of ptr_a0. */
 clr d0
 mov d0,(96,a2)
 mov d0,(100,a2)
 mov -1,d0
 mov d0,(104,a2)
 cmp 4,d3
 bcc 93f
 mov d3,d0
 asl 4,d0
 mov 0xa33e9be0,a0
 add d0,a0
 mov (a0),a1
 mov 461680,d1
 call sw_hash_pdaf,[d2,d3,a2,a3],20
 mov d0,(96,a2)
 mov d3,d0
 asl 4,d0
 mov 0xa33e9be0,a0
 add d0,a0
 mov (a0),a1
 mov 1394800,d1
 call sw_hash_pdaf,[d2,d3,a2,a3],20
 mov d0,(100,a2)
 mov 0xa33e9c94,a0
 mov d3,d1
 cmp 0,d1
 beq 92f
91:
 add 332,a0
 add -1,d1
 bne 91b
92:
 mov (a0),d0
 mov d0,(104,a2)
93:
 /* Layer 1: TruePic X HW PDAF engine & AF/ZAF task state. */
 movbu (0x62f48190),d0
 movbu d0,(108,a2)
 movbu (0x62f48191),d0
 movbu d0,(109,a2)
 mov (0xa33d1e40),d0
 movbu d0,(110,a2)
 mov (0xa33eabd8),d0
 movbu d0,(111,a2)
 /* Layer 2: center cell (526) in auxiliary 1053-zone correlation/phase arrays. */
 mov -32768,d0
 movhu d0,(112,a2)
 movhu (0xa33eabe4),d0
 movhu d0,(114,a2)
 mov -1,d0
 mov d0,(116,a2)
 mov d0,(120,a2)
 mov d0,(124,a2)
 mov d0,(128,a2)
 mov d0,(132,a2)
 mov d0,(136,a2)
 mov (0xa33e99ec),a0
 call sw_valid_zaf_ptr,[],0
 cmp 0,d0
 beq 94f
 movhu (1052,a0),d0
 movhu d0,(112,a2)
94:
 mov (0xa33e99f0),a0
 call sw_valid_zaf_ptr,[],0
 cmp 0,d0
 beq 95f
 movhu (1052,a0),d0
 movhu (3158,a0),d1
 asl 16,d1
 or d1,d0
 mov d0,(116,a2)
95:
 mov (0xa33e99f4),a0
 call sw_valid_zaf_ptr,[],0
 cmp 0,d0
 beq 96f
 movhu (1052,a0),d0
 movhu (3158,a0),d1
 asl 16,d1
 or d1,d0
 mov d0,(120,a2)
96:
 mov (0xa33e99fc),a0
 call sw_valid_zaf_ptr,[],0
 cmp 0,d0
 beq 97f
 mov (2104,a0),d0
 mov d0,(124,a2)
 mov (6316,a0),d0
 mov d0,(136,a2)
97:
 mov (0xa33e9a08),a0
 call sw_valid_zaf_ptr,[],0
 cmp 0,d0
 beq 98f
 mov (2104,a0),d0
 mov d0,(128,a2)
98:
 mov (0xa33e99c8),a0
 call sw_valid_zaf_ptr,[],0
 cmp 0,d0
 beq 99f
 mov (2104,a0),d0
 mov d0,(132,a2)
99:
 /* Route A v4 tail: Layer 0 raw A/B words + 1D lag xcorr + hook/ctrl state. */
 mov SW_RAW_AB,a0
 mov (a0),d0
 mov d0,(140,a2)
 mov (4,a0),d0
 mov d0,(144,a2)
 mov (8,a0),d0
 mov d0,(148,a2)
 mov (ZAF_LV_CNT),d0
 and 0xffff,d0
 mov (ZAF_LLK1_CNT),d1
 asl 16,d1
 or d1,d0
 mov d0,(152,a2)
 clr d0
 movhu d0,(156,a2)
 mov (0xa33f3644),a0
 call sw_valid_zaf_ptr,[],0
 cmp 0,d0
 beq 995f
 movhu (20,a0),d0
 movhu d0,(156,a2)
995:
 movbu (0xa33ca30c),d0
 movbu d0,(158,a2)
 movbu (0xa33df455),d0
 movbu d0,(159,a2)
 mov d2,(SW_HEAD)
 ret [d2,d3,a2,a3],24

/* Leaf check: is a0 a 4-byte-aligned DRAM pointer safe for +16KB ZAF reads? */
sw_valid_zaf_ptr:
 mov a0,d0
 and 3,d0
 bne 1f
 cmp 0x62000000,a0
 bcs 1f
 cmp 0x71fe0000,a0
 bcs 2f
 cmp 0xa2000000,a0
 bcs 1f
 cmp 0xb1fe0000,a0
 bcc 1f
2:
 mov 1,d0
 ret [],0
1:
 clr d0
 ret [],0

/* Leaf check: is a0 a 4-byte-aligned DRAM pointer safe for +1.87MB PDAF plane? */
sw_valid_pdaf_ptr:
 mov a0,d0
 and 3,d0
 bne 1f
 cmp 0x62000000,a0
 bcs 1f
 cmp 0x71e00000,a0
 bcs 2f
 cmp 0xa2000000,a0
 bcs 1f
 cmp 0xb1e00000,a0
 bcc 1f
2:
 mov 1,d0
 ret [],0
1:
 clr d0
 ret [],0

/* Leaf: convert valid DRAM ptr in a0 from cached 0x6x/7x to uncached 0xax/bx. */
sw_to_uncached:
 cmp 0x80000000,a0
 bcc 1f
 add 0x40000000,a0
1:
 ret [],0

/* Outside LOCK: sample raw center A/B words and compute 1D u16 SAD cross-corr
 * (lags -8..+8 over 32 samples) on active A-half (+461680) vs B-half (+1394800)
 * of ptr_a0 (0xa33e9be0[latest_slot]) via uncached DRAM alias. */
sw_sample_raw_ab:
 mov SW_RAW_AB,a0
 clr d0
 mov d0,(a0)
 mov d0,(4,a0)
 mov 0x8000,d0
 mov d0,(8,a0)
 movhu (0xa33e9c8c),d0
 cmp 4,d0
 bcc 9f
 asl 4,d0
 mov 0xa33e9be0,a1
 add d0,a1
 mov (a1),a0
 call sw_valid_pdaf_ptr,[],0
 cmp 0,d0
 beq 9f
 call sw_to_uncached,[],0
 mov a0,a2
 mov a0,a3
 add 461680,a2
 add 1394800,a3
 mov SW_RAW_AB,a0
 mov (a2),d0
 mov d0,(a0)
 mov (a3),d0
 mov d0,(4,a0)
 mov a2,(16,sp)
 mov a3,(20,sp)
 mov 0x7fffffff,d0
 mov d0,(4,sp)                     /* min_sad */
 clr d0
 mov d0,(8,sp)                     /* max_sad */
 mov -32768,d0
 mov d0,(12,sp)                    /* best_lag */
 mov 0,a2                          /* lag_idx = 0..16 -> lag = lag_idx - 8 */
1:
 mov (16,sp),a0                    /* ptrA = base_a */
 mov (20,sp),a1                    /* ptrB = base_b - 16 + 2*lag_idx */
 add -16,a1
 mov a2,d0
 add d0,d0
 add d0,a1
 clr d2                            /* sad = 0 */
 mov 32,d3
2:
 movhu (a0),d0
 movhu (a1),d1
 sub d1,d0
 cmp 0,d0
 bge 3f
 not d0
 inc d0
3:
 add d0,d2
 add 2,a0
 add 2,a1
 add -1,d3
 bne 2b
 mov (4,sp),d0
 cmp d0,d2
 bcc 4f
 mov d2,(4,sp)
 mov a2,d0
 add -8,d0
 mov d0,(12,sp)
4:
 mov (8,sp),d0
 cmp d2,d0
 bcc 5f
 mov d2,(8,sp)
5:
 inc a2
 cmp 17,a2
 bne 1b
 mov (8,sp),d0
 mov (4,sp),d1
 sub d1,d0
 lsr 4,d0
 cmp 65535,d0
 bls 6f
 mov 65535,d0
6:
 asl 16,d0
 mov (12,sp),d1
 and 0xffff,d1
 or d1,d0
 mov d0,(SW_RAW_AB+8)
9:
 ret [d2,d3,a2,a3],44

/* Hash 8 words at byte offset d1 of a raw PDAF buffer pointer in a1 (uncached),
 * if aligned and inside DRAM bounds. */
sw_hash_pdaf:
 mov a1,a0
 call sw_valid_pdaf_ptr,[],0
 cmp 0,d0
 beq 9f
 call sw_to_uncached,[],0
 add d1,a0
 mov 8,d2
 mov 0x811c9dc5,d0
2:
 mov (a0),d1
 xor d1,d0
 mov d0,d3
 asl 5,d0
 add d3,d0
 inc4 a0
 add -1,d2
 bne 2b
 ret [d2,d3,a2,a3],20
9:
 clr d0
 ret [d2,d3,a2,a3],20

/* Single writer. Keep locks to one 128-byte slot, never across file I/O. */
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
 asl 5,d0
 mov d0,d1
 asl 2,d0
 add d1,d0
 mov SW_ROWS,a2
 add d0,a2
 clr d0
 call LOCK,[d2],8
 mov d0,(4,sp)
 mov (a2),d1
 cmp d2,d1
 bne sw_raced
 mov 40,d1
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
 .long 4
sw_session: .long 0
sw_first: .long 0
sw_count: .long 0
 .long SW_STRIDE
sw_payload: .space SW_PAGE*SW_STRIDE
sw_path: .ascii "C:\\OM3MOD\\ZS"
sw_digits: .asciz "000000.BIN"

/* Test 16: On-demand raw PDAF & TruePic X HW snapshot dumper (OMPD v1, 19456 B).
 * Runs ONLY in CADLOG's low-priority background task after shutter release
 * (never from DISPLAY, never under LOCK), capped at 16 files per boot, and only
 * when FS_ON==1 && PH_MODE!=0 && (ZAF_CAP_CNT!=0 || stream_en!=0). */
.set PD_SIZE,24928
.set PD_MAX_FILES,16

/* Leaf: copy d0 32-bit words from a0 to a1. Clobbers a0, a1, d0, d1. */
pd_copy_words:
1:
 mov (a0),d1
 mov d1,(a1)
 inc4 a0
 inc4 a1
 add -1,d0
 bne 1b
 ret [],0

/* Pure memory snapshot builder into pd_buf (no SD I/O). Returns d0 = PD_SIZE. */
pd_build_snap:
 mov pd_buf,a2
 mov a2,a0
 mov PD_SIZE/4,d0
 clr d1
1:
 mov d1,(a0)
 inc4 a0
 add -1,d0
 bne 1b
 mov 0x44504d4f,d0                 /* "OMPD" */
 mov d0,(0,a2)
 mov 2,d0
 mov d0,(4,a2)                     /* version = 2 */
 mov (pd_count),d0
 inc d0
 mov d0,(8,a2)                     /* snap_seq (1-based) */
 mov (lg_n),d0
 mov d0,(12,a2)                    /* shutter_event */
 mov (USCLK),d0
 mov d0,(16,a2)                    /* usclk */
 movhu (0xa33e9c8c),d3             /* latest_slot */
 movhu d3,(20,a2)
 movhu (0xa33e9c90),d0             /* locked_slot */
 movhu d0,(22,a2)
 mov (0xa33e9c80),d0               /* ring_flags[0..1] */
 mov d0,(24,a2)
 mov (0xa33e9c84),d0               /* ring_flags[2..3] */
 mov d0,(28,a2)
 movhu (0xa33d1e34),d0             /* pdaf_gain (s16) */
 movhu d0,(32,a2)
 movbu (0xa32d3d32),d0             /* lens_mounted */
 movbu d0,(34,a2)
 movbu (0x62b3d938),d0             /* stream_en */
 movbu d0,(35,a2)
 mov (FS_SWEEP_VIEW),d0            /* edge_fine */
 mov d0,(36,a2)
 mov (FS_SWEEP_VIEW+4),d0          /* edge_coarse */
 mov d0,(40,a2)
 mov (SW_RAW_AB),d0                /* raw_a0 */
 mov d0,(44,a2)
 mov (SW_RAW_AB+4),d0              /* raw_b0 */
 mov d0,(48,a2)
 mov (SW_RAW_AB+8),d0              /* raw_xcorr */
 mov d0,(52,a2)
 mov (ZAF_CAP_CNT),d0
 mov d0,(56,a2)
 mov (ZAF_DISP_CNT),d0
 mov d0,(60,a2)
 mov (ZAF_LPOS_CNT),d0
 mov d0,(64,a2)
 mov (ZAF_LLK1_CNT),d0
 mov d0,(68,a2)
 /* Copy shadow ptrs 0xa33e9c60 (+0x68) and 0xa33e9c70 (+0x78). */
 mov 0xa33e9c60,a0
 mov a2,a1
 add 0x68,a1
 mov 8,d0
 call pd_copy_words,[],0
 /* Copy 10 ZAF/HW buffer pointers (+0x88..+0xaf). */
 mov (0xa33e99a8),d0
 mov d0,(0x88,a2)
 mov (0xa33e99ac),d0
 mov d0,(0x8c,a2)
 mov (0xa33e99b0),d0
 mov d0,(0x90,a2)
 mov (0xa33e99e8),d0
 mov d0,(0x94,a2)
 mov (0xa33e99ec),d0
 mov d0,(0x98,a2)
 mov (0xa33e99f0),d0
 mov d0,(0x9c,a2)
 mov (0xa33e99f4),d0
 mov d0,(0xa0,a2)
 mov (0xa33e99fc),d0
 mov d0,(0xa4,a2)
 mov (0xa33e9a08),d0
 mov d0,(0xa8,a2)
 mov (0xa33e99c8),d0
 mov d0,(0xac,a2)
 mov PD_SIZE,d0
 mov d0,(0xb4,a2)
 clr d2                            /* section_valid_mask */
 /* If latest_slot < 4, copy ptr_a[0..3], ptr_b[0..3], and 332-B slot_struct. */
 cmp 4,d3
 bcc pd_skip_slot
 mov d3,d0
 asl 4,d0
 mov 0xa33e9be0,a0
 add d0,a0
 mov a2,a1
 add 0x48,a1
 mov 4,d0
 call pd_copy_words,[],0
 mov d3,d0
 asl 4,d0
 mov 0xa33e9c20,a0
 add d0,a0
 mov a2,a1
 add 0x58,a1
 mov 4,d0
 call pd_copy_words,[],0
 /* Bit 0: slot_struct (332 B = 83 words) @ +0x0100 */
 mov 0xa33e9c94,a0
 mov d3,d1
 cmp 0,d1
 beq 2f
1:
 add 332,a0
 add -1,d1
 bne 1b
2:
 mov a2,a1
 add 0x100,a1
 mov 83,d0
 call pd_copy_words,[],0
 or 1,d2
pd_skip_slot:
 /* Bit 1: ZAF control RAM 0xa33d1e00..0xa33d1eff (256 B) @ +0x0280 */
 mov 0xa33d1e00,a0
 mov a2,a1
 add 0x280,a1
 mov 64,d0
 call pd_copy_words,[],0
 or 2,d2
 /* Bit 2: Sensor PDAF DMA control RAM 0xa2b3d920..0xa2b3da1f (256 B) @ +0x0380 */
 mov 0xa2b3d920,a0
 mov a2,a1
 add 0x380,a1
 mov 64,d0
 call pd_copy_words,[],0
 or 4,d2
 /* Bit 3: Live DMA Template [3] 0xa03af0f4 + 512..1023 (512 B) @ +0x0480 */
 mov 0xa03af2f4,a0
 mov a2,a1
 add 0x480,a1
 mov 128,d0
 call pd_copy_words,[],0
 or 8,d2
 /* Bits 4..9: ptr_a0 active rows (row 40 full 3584 B A/B, row 41 1024 B A/B, row 3 2048 B A/B) */
 mov (0x48,a2),a0
 call sw_valid_pdaf_ptr,[],0
 cmp 0,d0
 beq pd_skip_a0
 call sw_to_uncached,[],0
 mov a0,a3
 mov a3,a0
 add 460800,a0                     /* A-half row 40 col 0 (entire 1760 px active row) */
 mov a2,a1
 add 0x680,a1
 mov 896,d0
 call pd_copy_words,[],0
 or 16,d2
 mov a3,a0
 add 1393920,a0                    /* B-half row 40 col 0 (933120 + 460800) */
 mov a2,a1
 add 0x1480,a1
 mov 896,d0
 call pd_copy_words,[],0
 or 32,d2
 mov a3,a0
 add 472320,a0                     /* A-half row 41 col 0 (41*11520) */
 mov a2,a1
 add 0x2280,a1
 mov 256,d0
 call pd_copy_words,[],0
 or 64,d2
 mov a3,a0
 add 1405440,a0                    /* B-half row 41 col 0 (933120 + 472320) */
 mov a2,a1
 add 0x2680,a1
 mov 256,d0
 call pd_copy_words,[],0
 or 128,d2
 mov a3,a0
 add 34560,a0                      /* A-half row 3 col 0 (3*11520) */
 mov a2,a1
 add 0x2a80,a1
 mov 512,d0
 call pd_copy_words,[],0
 or 256,d2
 mov a3,a0
 add 967680,a0                     /* B-half row 3 col 0 (933120 + 34560) */
 mov a2,a1
 add 0x3280,a1
 mov 512,d0
 call pd_copy_words,[],0
 or 512,d2
pd_skip_a0:
 /* Bits 10..11: ptr_99a8 TruePic X HW raw phase/corr output (512 B @ +0, ALL 1053 pts 4224 B @ +33792) */
 mov (0x88,a2),a0
 call sw_valid_zaf_ptr,[],0
 cmp 0,d0
 beq pd_skip_99a8
 call sw_to_uncached,[],0
 mov a0,a3
 mov a3,a0
 mov a2,a1
 add 0x3a80,a1
 mov 128,d0
 call pd_copy_words,[],0
 or 1024,d2
 mov a3,a0
 add 33792,a0
 mov a2,a1
 add 0x3c80,a1
 mov 1056,d0
 call pd_copy_words,[],0
 or 2048,d2
pd_skip_99a8:
 /* Bit 12: ptr_99b0 TruePic X HW status (1024 B @ +35384 around center pt 526) */
 mov (0x90,a2),a0
 call sw_valid_zaf_ptr,[],0
 cmp 0,d0
 beq pd_skip_99b0
 call sw_to_uncached,[],0
 add 35384,a0
 mov a2,a1
 add 0x4d00,a1
 mov 256,d0
 call pd_copy_words,[],0
 or 4096,d2
pd_skip_99b0:
 /* Bit 13: ptr_99ac ALL 1053 pts Bank 0 flags (1056 B @ +0x5100) */
 mov (0x8c,a2),a0
 call sw_valid_zaf_ptr,[],0
 cmp 0,d0
 beq pd_skip_99ac
 call sw_to_uncached,[],0
 mov a2,a1
 add 0x5100,a1
 mov 264,d0
 call pd_copy_words,[],0
 or 8192,d2
pd_skip_99ac:
 /* Bit 14: ptr_99e8 ALL 1053 pts Bank 0 defocus s16 (2112 B @ +0x5520) */
 mov (0x94,a2),a0
 call sw_valid_zaf_ptr,[],0
 cmp 0,d0
 beq pd_skip_99e8
 call sw_to_uncached,[],0
 mov a2,a1
 add 0x5520,a1
 mov 528,d0
 call pd_copy_words,[],0
 or 16384,d2
pd_skip_99e8:
 /* Bits 15..16: ptr_a1 row 43 col 0 A/B (512 B each: +126592, +382720) */
 mov (0x4c,a2),a0
 call sw_valid_pdaf_ptr,[],0
 cmp 0,d0
 beq pd_skip_a1
 call sw_to_uncached,[],0
 mov a0,a3
 mov a3,a0
 add 126592,a0
 mov a2,a1
 add 0x5d60,a1
 mov 128,d0
 call pd_copy_words,[],0
 or 32768,d2
 mov a3,a0
 add 382720,a0
 mov a2,a1
 add 0x5f60,a1
 mov 128,d0
 call pd_copy_words,[],0
 or 65536,d2
pd_skip_a1:
 mov d2,(0xb0,a2)
 mov PD_SIZE,d0
 ret [d2,d3,a2,a3],32

/* Called from lg_wk after dr_save (card mounted, shutter up, DEBUG.TXT active). */
pd_save:
 mov (FS_ON),d0
 cmp 1,d0
 bne pd_out
 mov (PH_MODE),d0
 cmp 0,d0
 beq pd_out
 mov (ZAF_CAP_CNT),d0
 cmp 0,d0
 bne 1f
 movbu (0x62b3d938),d0
 cmp 0,d0
 beq pd_out
1:
 mov (pd_count),d0
 cmp PD_MAX_FILES,d0
 bcc pd_out
 call pd_build_snap,[d2,d3,a2,a3],32
 mov 16,d0
 mov d0,(4,sp)
pd_next_name:
 mov (pd_number),d0
 cmp 999999,d0
 bcc pd_out
 inc d0
 mov d0,(pd_number)
 mov pd_digits+5,a0
2:
 movbu (a0),d1
 inc d1
 cmp 58,d1
 bne 3f
 mov 48,d1
 movbu d1,(a0)
 add -1,a0
 bra 2b
3:
 movbu d1,(a0)
 mov pd_path,a0
 mov lg_mr,a1
 call fopen,[],4
 cmp 0,a0
 beq 4f
 call fclose,[d2,a2,a3],16
 mov (4,sp),d0
 add -1,d0
 mov d0,(4,sp)
 bne pd_next_name
 bra pd_out
4:
 mov pd_path,a0
 mov lg_mw,a1
 call fopen,[],4
 cmp 0,a0
 beq pd_out
 mov a0,a2
 mov PD_SIZE,d1
 mov 1,d0
 mov a2,a1
 mov pd_buf,a0
 call fwrite,[d2,d3,a2,a3],24
 mov d0,d2
 mov a2,a0
 call fclose,[d2,a2,a3],16
 cmp PD_SIZE,d2
 bne pd_out
 cmp 0,d0
 bne pd_out
 mov (pd_count),d0
 inc d0
 mov d0,(pd_count)
pd_out:
 ret [d2,d3,a2,a3],32

.balign 4
pd_count: .long 0
pd_number: .long 0
pd_path: .ascii "C:\\OM3MOD\\PD"
pd_digits: .asciz "000000.BIN"
.balign 4
pd_buf: .space PD_SIZE,0
