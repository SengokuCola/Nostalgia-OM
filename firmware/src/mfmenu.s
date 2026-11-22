/* ---- MF Assist custom menu settings (Test 29 — pure Split-Image + Offset) ----
 * Virtual setting IDs MFB+0..MFB+1 in AF -> 7. MF -> MF Assist (mode 0x11a). */

.section .ext13,"ax"

/* mf_sync: copy mf_ram[12..19] -> uncached MF_CFG_* mirrors (leaf, uses d0). */
mf_sync:
 mov (mf_ram + 12),d0
 mov d0,(MF_CFG_SPLIT)
 mov (mf_ram + 16),d0
 mov d0,(MF_CFG_OFS)
 ret [],0

/* mf_ld: `call mf_ld,[d2,d3,a2,a3],20`: load 'OM3M' record from M into mf_ram once
 * per power-on (missing/bad record -> defaults: split=1, ofs=5). Reads only. */
mf_ld:
 movbu (mf_ok),d0
 cmp 0,d0
 bne 9f
 mov 1,d0
 movbu d0,(mf_ok)
 mov MF_C,a3
 mov (a3),d0
 cmp MF_MAGIC,d0
 bne 8f
 movhu (4,a3),d0
 cmp MF_VER,d0
 bne 8f
 movhu (6,a3),d0
 cmp MF_LEN,d0
 bne 8f
 mov -1,d0
 mov a3,a0
 add 12,a0
 mov MF_LEN - 12,d1
 call sd_crc,[d2,d3],12
 not d0
 mov (8,a3),d1
 cmp d1,d0
 bne 8f
 mov mf_ram,a0
 mov a3,a1
 mov MF_LEN,d1
 call ub_cpy,[],0
 mov (mf_ram + 12),d0
 cmp 2,d0
 bcs 1f
 mov 1,d0
 mov d0,(mf_ram + 12)
1:
 mov (mf_ram + 16),d0
 cmp 11,d0
 bcs 7f
 mov 5,d0
 mov d0,(mf_ram + 16)
 bra 7f
8:
 mov mf_ram,a0
 mov MF_LEN,d1
 call ub_zero,[],0
 mov 1,d0
 mov d0,(mf_ram + 12)             /* split = 1 (开) */
 mov 5,d0
 mov d0,(mf_ram + 16)             /* ofs   = 5 (0) */
7:
 call mf_sync,[],0
9:
 ret [d2,d3,a2,a3],20

/* mf_wr: `call mf_wr,[d2,d3,a2,a3],20`: write mf_ram -> M (both aliases) + UB_DIRTY. */
mf_wr:
 mov MF_MAGIC,d0
 mov d0,(mf_ram)
 mov MF_VER,d0
 movhu d0,(mf_ram + 4)
 mov MF_LEN,d0
 movhu d0,(mf_ram + 6)
 mov -1,d0
 mov mf_ram + 12,a0
 mov MF_LEN - 12,d1
 call sd_crc,[d2,d3],12
 not d0
 mov d0,(mf_ram + 8)
 clr d0
 call LOCK,[d2],8
 mov d0,d3
 movbu (UB_BUSY),d0
 cmp 0,d0
 bne 8f
 mov MF_C,a0
 mov mf_ram,a1
 mov MF_LEN,d1
 call ub_cpy,[],0
 mov MF_U,a0
 mov mf_ram,a1
 mov MF_LEN,d1
 call ub_cpy,[],0
 mov 1,d0
 movbu d0,(UB_DIRTY)
 clr d0
 movbu d0,(mf_pend)
 mov d3,d0
 call UNLOCK,[d2],8
 bra 9f
8:
 mov 1,d0
 movbu d0,(mf_pend)
 mov d3,d0
 call UNLOCK,[d2],8
9:
 ret [d2,d3,a2,a3],20

/* mf_get <- sl_get (CALLS: d0 id, a0 facade, a1 out != 0, MDR return) -> (a1) val, d0 0 */
mf_get:
 add -16,sp
 mov a1,(4,sp)
 mov d0,(12,sp)
 mov mdr,d0
 mov d0,(8,sp)
 call mf_ld,[d2,d3,a2,a3],20
 mov (12,sp),d0
 exthu d0
 add -MFB,d0
 asl2 d0
 mov mf_ram + 12,a0
 add d0,a0
 mov (a0),d0
 mov (4,sp),a1
 mov d0,(a1)
 mov (8,sp),d0
 mov d0,mdr
 add 16,sp
 clr d0
 rets

/* mf_sv <- si_sv (CALLS: d0 id, d1 mode, a1 value, a0 facade). */
mf_sv:
 add -20,sp
 mov d0,(8,sp)
 mov d1,(12,sp)
 mov a1,(16,sp)
 mov mdr,d0
 mov d0,(4,sp)
 mov (8,sp),d0
 mov (12,sp),d1
 mov (16,sp),a0
 call mf_put,[d2,d3,a2,a3],20
 mov (4,sp),d0
 mov d0,mdr
 add 20,sp
 clr d0
 rets

/* mf_put: `call mf_put,[d2,d3,a2,a3],20`: d0 id, d1 mode, a0 raw_val */
mf_put:
 mov d0,d3                        /* id */
 mov d1,d2                        /* mode */
 mov a0,a3                        /* raw_val */
 call mf_ld,[d2,d3,a2,a3],20
 mov d3,d0
 exthu d0
 add -MFB,d0
 mov d0,d3                        /* idx: 0 (split) or 1 (ofs) */
 asl2 d0
 mov mf_ram + 12,a2
 add d0,a2
 mov (a2),d0                      /* cur_val */
 cmp 1,d3
 beq 5f
 /* Binary setting (idx=0, split: 0=关, 1=开). */
 cmp 0,d2
 bne 1f
 mov a3,d1
 and 1,d1
 bra 7f
1:
 mov d0,d1
 xor 1,d1
 bra 7f
5:
 /* 11-step offset setting (idx=1, ofs: 0..10 -> -5..+5). */
 cmp 0,d2
 bne 6f
 mov a3,d1
 cmp 11,d1
 bcs 7f
 mov 5,d1
 bra 7f
6:
 cmp 2,d2
 bne 61f
 mov d0,d1
 add 10,d1
 cmp 11,d1
 bcs 7f
 add -11,d1
 bra 7f
61:
 mov d0,d1
 add 1,d1
 cmp 11,d1
 bcs 7f
 clr d1
7:
 cmp d0,d1
 beq 9f
 mov d1,(a2)
 call mf_sync,[],0
 call mf_wr,[d2,d3,a2,a3],20
9:
 ret [d2,d3,a2,a3],20

/* mf_cnt / mf_vbi / mf_sel / mf_def: CALLS facade handlers. */
mf_cnt:
 cmp MFB + 1,d0
 beq 1f
 mov 2,d0
 rets
1:
 mov 11,d0
 rets

mf_vbi:
 mov 2,a0
 cmp MFB + 1,d0
 bne 1f
 mov 11,a0
1:
 mov d1,d0
 cmp a0,d0
 bcs 2f
 mov -1,d0
2:
 cmp 0,a1
 beq 3f
 mov d0,(a1)
3:
 rets

mf_sel:
 mov 2,a0
 cmp MFB + 1,d0
 bne 1f
 mov 11,a0
1:
 clr d0
 cmp a0,d1
 bcc 2f
 mov 1,d0
2:
 rets

mf_def:
 cmp 0,a1
 beq 1f
 mov 1,d1                         /* split=1 */
 cmp MFB + 1,d0
 bne 2f
 mov 5,d1                         /* ofs=5 (0) */
2:
 mov d1,(a1)
 clr d0
 rets
1:
 mov -268435434,d0
 rets

/* ---- UTF-16LE strings for st_get (0x7f70 .. 0x7f7c) ---- */
 .balign 4
mf_strs:
 .long mf_s_split, mf_s_ofs
 .long mf_s_m5, mf_s_m4, mf_s_m3, mf_s_m2, mf_s_m1
 .long mf_s_0, mf_s_p1, mf_s_p2, mf_s_p3, mf_s_p4, mf_s_p5

 .balign 2
mf_s_split: .hword 0x5206, 0x50cf, 0x5bf9, 0x7126, 0                /* 分像对焦 */
mf_s_ofs:   .hword 0x5408, 0x7126, 0x5fae, 0x8c03, 0                /* 合焦微调 */
mf_s_m5:    .hword '-', '5', 0
mf_s_m4:    .hword '-', '4', 0
mf_s_m3:    .hword '-', '3', 0
mf_s_m2:    .hword '-', '2', 0
mf_s_m1:    .hword '-', '1', 0
mf_s_0:     .hword '0', 0
mf_s_p1:    .hword '+', '1', 0
mf_s_p2:    .hword '+', '2', 0
mf_s_p3:    .hword '+', '3', 0
mf_s_p4:    .hword '+', '4', 0
mf_s_p5:    .hword '+', '5', 0

/* ---- Runtime state & cache-line-isolated uncached mirrors ---- */
 .balign 4
mf_ram:
 .space MF_LEN, 0
mf_ok:
 .byte 0
mf_pend:
 .byte 0
 .balign 64                       /* isolate uncached MF_CFG_* from cached mf_ram/mf_pend! */
mf_cfg_split: .long 1
mf_cfg_ofs:   .long 5
 .balign 64
 .set MF_CFG_SPLIT, mf_cfg_split + 0x40000000
 .set MF_CFG_OFS,   mf_cfg_ofs   + 0x40000000

/* ---- Patched menu tables populated by firmware/build.py ---- */
 .balign 4
mf_recs:                          /* 5 x 36 B = 180 B (stock 283, 566, 1892 + our 2 rows) */
 .space 36 * (3 + MF_N), 0
mf_recs_end:
 .balign 4
mf_ord:                           /* 5 x u16 = 10 B (row order for mode 0x11a) */
 .space 2 * (3 + MF_N), 0
mf_ord_end:
 .balign 4
mf_ofs_vals:                      /* 11 x 12 B = 132 B (list-row value list for -5..+5) */
 .space 12 * 11, 0
mf_ofs_vals_end:
 .balign 4
mf_ptitles:                       /* 2 x 8 B = 16 B (picker screen titles) */
 .space 8 * MF_N, 0
mf_ptitles_end:
 .balign 4
mf_pofs_vals:                     /* 11 x 12 B = 132 B (picker button labels for -5..+5) */
 .space 12 * 11, 0
mf_pofs_vals_end:
 .balign 4
mf_phelps:                        /* (2 + 11) x 12 B = 156 B (picker help strings per item) */
 .space 12 * 13, 0
mf_phelps_end:
 .balign 4
mf_pickers:                       /* 98 x 36 B = 3528 B (stock 96 + our 2 picker screens) */
 .space 36 * (96 + MF_N), 0
mf_pickers_end:
 .balign 4
mf_g8:                            /* 418 x 24 B = 10032 B (stock 416 + our 2 G8 action links) */
 .space 24 * (416 + MF_N), 0
mf_g8_end:
 .balign 4
mf_acts:                          /* 5 x 24 B = 120 B (stock 283/566/1892 + our 2 OK actions) */
 .space 24 * (3 + MF_N), 0
mf_acts_end:
 .balign 4
