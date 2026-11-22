/* ---- MF Assist + Cyber Card custom menu settings (Test 31) ----
 * Virtual setting IDs MFB+0..MFB+3 in AF -> 7. MF -> MF Assist (mode 0x11a). */

.section .ext13,"ax"

/* mf_sync: copy mf_ram[12..27] -> uncached MF_CFG_* mirrors (leaf, uses d0). */
mf_sync:
 mov (mf_ram + 12),d0
 mov d0,(MF_CFG_SPLIT)
 mov (mf_ram + 16),d0
 mov d0,(MF_CFG_OFS)
 mov (mf_ram + 20),d0
 mov d0,(MF_CFG_CARD)
 mov (mf_ram + 24),d0
 mov d0,(MF_CFG_POS)
 ret [],0

/* mf_ld: `call mf_ld,[d2,d3,a2,a3],20`: load 'OM3M' record from M into mf_ram once
 * per power-on (missing/bad record -> defaults: split=1, ofs=5, card=0, pos=2). */
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
 bcs 2f
 mov 5,d0
 mov d0,(mf_ram + 16)
2:
 mov (mf_ram + 20),d0
 cmp 6,d0
 bcs 3f
 clr d0
 mov d0,(mf_ram + 20)
3:
 mov (mf_ram + 24),d0
 cmp 3,d0
 bcs 7f
 mov 2,d0
 mov d0,(mf_ram + 24)
 bra 7f
8:
 mov mf_ram,a0
 mov MF_LEN,d1
 call ub_zero,[],0
 mov 1,d0
 mov d0,(mf_ram + 12)             /* split = 1 (开) */
 mov 5,d0
 mov d0,(mf_ram + 16)             /* ofs   = 5 (0) */
 clr d0
 mov d0,(mf_ram + 20)             /* card  = 0 (关) */
 mov 2,d0
 mov d0,(mf_ram + 24)             /* pos   = 2 (右下) */
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
 mov d0,d3                        /* idx: 0=split(2), 1=ofs(11), 2=card(6), 3=pos(3) */
 mov mf_max_tab,a0
 add d0,a0
 movbu (a0),d1
 mov d1,a1                        /* max_cnt in a1 */
 asl2 d0
 mov mf_ram + 12,a2
 add d0,a2
 mov (a2),d0                      /* cur_val */
 cmp 0,d2
 bne 1f
 mov a3,d1
 cmp a1,d1
 bcs 7f
 clr d1
 bra 7f
1:
 cmp 2,d2
 bne 2f
 /* prev: (cur + max - 1) % max */
 mov d0,d1
 mov a1,d3
 add d3,d1
 add -1,d1
 cmp a1,d1
 bcs 7f
 sub d3,d1
 bra 7f
2:
 /* next/toggle: (cur + 1) % max */
 mov d0,d1
 inc d1
 cmp a1,d1
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
 exthu d0
 add -MFB,d0
 mov mf_max_tab,a0
 add d0,a0
 movbu (a0),d0
 rets

mf_vbi:
 exthu d0
 add -MFB,d0
 mov mf_max_tab,a0
 add d0,a0
 movbu (a0),d0                    /* max_cnt */
 mov d0,a0
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
 exthu d0
 add -MFB,d0
 mov mf_max_tab,a0
 add d0,a0
 movbu (a0),d0                    /* max_cnt */
 mov d0,a0
 clr d0
 cmp a0,d1
 bcc 2f
 mov 1,d0
2:
 rets

mf_def:
 cmp 0,a1
 beq 1f
 exthu d0
 add -MFB,d0
 mov mf_def_tab,a0
 add d0,a0
 movbu (a0),d1
 mov d1,(a1)
 clr d0
 rets
1:
 mov -268435434,d0
 rets

mf_max_tab: .byte 2, 11, 6, 3
mf_def_tab: .byte 1, 5, 0, 2

/* ---- UTF-16LE strings for st_get (0x7f70 .. 0x7f86) ---- */
 .balign 4
mf_strs:
 .long mf_s_split, mf_s_ofs
 .long mf_s_m5, mf_s_m4, mf_s_m3, mf_s_m2, mf_s_m1
 .long mf_s_0, mf_s_p1, mf_s_p2, mf_s_p3, mf_s_p4, mf_s_p5
 .long mf_s_card, mf_s_pos
 .long mf_s_c1, mf_s_c2, mf_s_c3, mf_s_c4, mf_s_c5
 .long mf_s_pl, mf_s_pc, mf_s_pr

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
mf_s_card:  .hword 0x56fe, 0x5361, 0                                /* 图卡 */
mf_s_pos:   .hword 0x56fe, 0x5361, 0x4f4d, 0x7f6e, 0                /* 图卡位置 */
mf_s_c1:    .hword 0x5361, '1', 0                                   /* 卡1 */
mf_s_c2:    .hword 0x5361, '2', 0                                   /* 卡2 */
mf_s_c3:    .hword 0x5361, '3', 0                                   /* 卡3 */
mf_s_c4:    .hword 0x5361, '4', 0                                   /* 卡4 */
mf_s_c5:    .hword 0x5361, '5', 0                                   /* 卡5 */
mf_s_pl:    .hword 0x5de6, 0x4e0b, 0                                /* 左下 */
mf_s_pc:    .hword 0x5c45, 0x4e2d, 0                                /* 居中 */
mf_s_pr:    .hword 0x53f3, 0x4e0b, 0                                /* 右下 */

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
mf_cfg_card:  .long 0
mf_cfg_pos:   .long 2
 .balign 64
 .set MF_CFG_SPLIT, mf_cfg_split + 0x40000000
 .set MF_CFG_OFS,   mf_cfg_ofs   + 0x40000000
 .set MF_CFG_CARD,  mf_cfg_card  + 0x40000000
 .set MF_CFG_POS,   mf_cfg_pos   + 0x40000000

/* ---- Patched menu tables populated by firmware/build.py ---- */
 .balign 4
mf_recs:                          /* 7 x 36 B = 252 B (stock 283, 566, 1892 + our 4 rows) */
 .space 36 * (3 + MF_N), 0
mf_recs_end:
 .balign 4
mf_ord:                           /* 7 x u16 = 14 B (row order for mode 0x11a) */
 .space 2 * (3 + MF_N), 0
mf_ord_end:
 .balign 4
mf_ofs_vals:                      /* 11 x 12 B = 132 B (list-row value list for -5..+5) */
 .space 12 * 11, 0
mf_ofs_vals_end:
 .balign 4
mf_card_vals:                     /* 6 x 12 B = 72 B (list-row value list: 关 / 卡1..卡5) */
 .space 12 * 6, 0
mf_card_vals_end:
 .balign 4
mf_pos_vals:                      /* 3 x 12 B = 36 B (list-row value list: 左下 / 居中 / 右下) */
 .space 12 * 3, 0
mf_pos_vals_end:
 .balign 4
mf_ptitles:                       /* 4 x 8 B = 32 B (picker screen titles) */
 .space 8 * MF_N, 0
mf_ptitles_end:
 .balign 4
mf_pofs_vals:                     /* 11 x 12 B = 132 B (picker button labels for -5..+5) */
 .space 12 * 11, 0
mf_pofs_vals_end:
 .balign 4
mf_pcard_vals:                    /* 6 x 12 B = 72 B (picker button labels: 关 / 卡1..卡5) */
 .space 12 * 6, 0
mf_pcard_vals_end:
 .balign 4
mf_ppos_vals:                     /* 3 x 12 B = 36 B (picker button labels: 左下 / 居中 / 右下) */
 .space 12 * 3, 0
mf_ppos_vals_end:
 .balign 4
mf_phelps:                        /* (2 + 11 + 6 + 3) x 12 B = 264 B (picker help strings) */
 .space 12 * 22, 0
mf_phelps_end:
 .balign 4
mf_pickers:                       /* 100 x 36 B = 3600 B (stock 96 + our 4 picker screens) */
 .space 36 * (96 + MF_N), 0
mf_pickers_end:
 .balign 4
mf_g8:                            /* 420 x 24 B = 10080 B (stock 416 + our 4 G8 action links) */
 .space 24 * (416 + MF_N), 0
mf_g8_end:
 .balign 4
mf_acts:                          /* 7 x 24 B = 168 B (stock 283/566/1892 + our 4 OK actions) */
 .space 24 * (3 + MF_N), 0
mf_acts_end:
 .balign 4
