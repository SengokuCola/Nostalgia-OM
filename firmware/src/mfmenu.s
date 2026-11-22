/* ---- MF Assist + Computational Modes (Cyber Card & Film Filter) custom menu (Test 32) ----
 * Virtual setting IDs MFB+0..MFB+5:
 *   AF -> 7. MF -> MF Assist (mode 0x11a):
 *     MFB+0 (0x7d80): 分像对焦 (0=关, 1=开)
 *     MFB+1 (0x7d81): 合焦微调 (0..10 -> -5..+5)
 *   Cam2 -> 1. Computational Modes (0x61587bd0 / 0x61529544 / 0x6150fcb0):
 *     MFB+2 (0x7d82): 图卡     (0=关, 1..5=卡1..卡5)
 *     MFB+3 (0x7d83): 图卡位置 (0=左下, 1=居中, 2=右下)
 *     MFB+4 (0x7d84): 图卡预览 (0=关, 1=开)
 *     MFB+5 (0x7d85): 滤镜选择 (0=全部开, 1..20=toggle FILM 1..20 in MF_CFG_FLMASK) */

.section .ext13,"ax"

/* mf_sync: copy mf_ram[12..35] -> uncached MF_CFG_* mirrors (leaf, uses d0). */
mf_sync:
 mov (mf_ram + 12),d0
 mov d0,(MF_CFG_SPLIT)
 mov (mf_ram + 16),d0
 mov d0,(MF_CFG_OFS)
 mov (mf_ram + 20),d0
 mov d0,(MF_CFG_CARD)
 mov (mf_ram + 24),d0
 mov d0,(MF_CFG_POS)
 mov (mf_ram + 28),d0
 mov d0,(MF_CFG_PREV)
 mov (mf_ram + 32),d0
 mov d0,(MF_CFG_FLMASK)
 ret [],0

/* mf_ld: `call mf_ld,[d2,d3,a2,a3],20`: load 'OM3M' record from M into mf_ram once
 * per power-on (missing/bad record -> defaults: split=1, ofs=5, card=0, pos=2, prev=1, flmask=0xfffff). */
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
 bcs 4f
 mov 2,d0
 mov d0,(mf_ram + 24)
4:
 mov (mf_ram + 28),d0
 cmp 2,d0
 bcs 5f
 mov 1,d0
 mov d0,(mf_ram + 28)
5:
 mov (mf_ram + 32),d0
 and 0x000fffff,d0
 cmp 0,d0
 bne 6f
 mov 0x000fffff,d0
6:
 mov d0,(mf_ram + 32)
 bra 7f
8:
 mov mf_ram,a0
 mov MF_LEN,d1
 call ub_zero,[],0
 mov 1,d0
 mov d0,(mf_ram + 12)             /* split  = 1 (开) */
 mov 5,d0
 mov d0,(mf_ram + 16)             /* ofs    = 5 (0) */
 clr d0
 mov d0,(mf_ram + 20)             /* card   = 0 (关) */
 mov 2,d0
 mov d0,(mf_ram + 24)             /* pos    = 2 (右下) */
 mov 1,d0
 mov d0,(mf_ram + 28)             /* prev   = 1 (开) */
 mov 0x000fffff,d0
 mov d0,(mf_ram + 32)             /* flmask = all 20 films ON */
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
 cmp 5,d0                         /* MFB+5 (滤镜选择): always report 0 so CP row shows ST_MF_FLCNT ("NN/20") */
 bne 1f
 clr d0
 bra 2f
1:
 asl2 d0
 mov mf_ram + 12,a0
 add d0,a0
 mov (a0),d0
2:
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
 mov d0,d3                        /* idx: 0=split, 1=ofs, 2=card, 3=pos, 4=prev, 5=flmask */
 cmp 5,d3
 beq mf_put_fl
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

/* MFB+5 (滤镜选择): val=0 resets all 20 films ON; val=1..20 toggles film (val-1) in flmask. */
mf_put_fl:
 cmp 0,d2
 bne 9b
 mov (mf_ram + 32),d0             /* cur flmask */
 mov a3,d1                        /* picked item 0..20 */
 cmp 0,d1
 bne 1f
 mov 0x000fffff,d1                /* 0 = 全部开 */
 bra 2f
1:
 cmp 21,d1
 bcc 9b
 add -1,d1                        /* film idx 0..19 */
 mov 1,d2
 asl d1,d2                        /* bit = 1 << j */
 mov d0,d1
 xor d2,d1                        /* toggle bit j */
 and 0x000fffff,d1
 cmp 0,d1
 beq 9b                           /* never disable the last remaining film */
2:
 cmp d0,d1
 beq 9b
 mov d1,(mf_ram + 32)
 call mf_sync,[],0
 call mf_wr,[d2,d3,a2,a3],20
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
 clr d0
2:
 rets

mf_sel:
 exthu d0
 add -MFB,d0
 mov mf_max_tab,a0
 add d0,a0
 movbu (a0),d0
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

/* mf_str_get: `call mf_str_get,[d2,d3,a2,a3],20` from st_get: d0 = ST_MF_SPLIT .. ST_MF_END-1 -> a0 = UTF-16LE ptr. */
mf_str_get:
 cmp ST_MF_S_END,d0
 bcc 1f
 mov d0,d2
 add -ST_MF_SPLIT,d2
 asl2 d2
 mov mf_strs,a0
 add d2,a0
 mov (a0),a0
 ret [d2,d3,a2,a3],20
1:
 cmp ST_MF_FLCNT,d0
 bne mf_str_fl
 /* Dynamic "NN/20" count of enabled bits in MF_CFG_FLMASK. */
 mov (MF_CFG_FLMASK),d0
 and 0x000fffff,d0
 clr d1                           /* popcount */
 mov 20,d2
2:
 btst 1,d0
 beq 3f
 inc d1
3:
 lsr 1,d0
 add -1,d2
 bne 2b
 mov mf_flcnt_buf,a0
 mov a0,a1
 cmp 10,d1
 bcs 4f
 /* tens digit '1' or '2' */
 mov '1',d2
 cmp 20,d1
 bcs 5f
 mov '2',d2
 add -20,d1
 bra 6f
5:
 add -10,d1
6:
 movhu d2,(a1)
 add 2,a1
4:
 add '0',d1
 movhu d1,(a1)
 add 2,a1
 mov '/',d2
 movhu d2,(a1)
 add 2,a1
 mov '2',d2
 movhu d2,(a1)
 add 2,a1
 mov '0',d2
 movhu d2,(a1)
 add 2,a1
 clr d2
 movhu d2,(a1)
 ret [d2,d3,a2,a3],20

/* Dynamic "[开] 1:Name" or "[关] 1:Name" into mf_flstr_buf + j * 48 (j = 0..19). */
mf_str_fl:
 add -ST_MF_FL0,d0                /* j = 0..19 */
 mov d0,d2                        /* save j */
 mov 48,d1
 mulu d1,d0
 mov mf_flstr_buf,a0
 add d0,a0
 mov a0,a1                        /* write cursor */

 /* Prefix: 开 (0x5f00) or 关 (0x5173) + ' ' */
 mov (MF_CFG_FLMASK),d0
 lsr d2,d0
 btst 1,d0
 beq 1f
 mov 0x5f00,d1                    /* 开 */
 bra 2f
1:
 mov 0x5173,d1                    /* 关 */
2:
 movhu d1,(a1)
 add 2,a1
 mov ' ',d1
 movhu d1,(a1)
 add 2,a1

 /* Film number 1..20 + ':' */
 mov d2,d1
 inc d1
 cmp 10,d1
 bcs 3f
 mov '1',d3
 cmp 20,d1
 bcs 4f
 mov '2',d3
 add -20,d1
 bra 5f
4:
 add -10,d1
5:
 movhu d3,(a1)
 add 2,a1
3:
 add '0',d1
 movhu d1,(a1)
 add 2,a1
 mov ':',d1
 movhu d1,(a1)
 add 2,a1

 /* Append up to 16 ASCII bytes from LOOKS.BIN name table (LPTR + 1312 + 16*j) if loaded. */
 movhu (STATE),d0
 add -1,d0
 cmp HMAX,d0
 bcc mf_fl_noname
 btst 3,d0
 bne mf_fl_noname
 mov d0,a2
 add POOL,a2
 mov (a2),d0
 cmp MAGIC,d0
 bne mf_fl_noname
 mov (LPTR,a2),a2
 cmp 0,a2
 beq mf_fl_noname
 mov d2,d0
 asl 4,d0                         /* 16 * j */
 add 1312,d0
 add d0,a2
 movbu (a2),d0
 cmp 0,d0
 beq mf_fl_noname
 mov 16,d3
6:
 movbu (a2),d0
 cmp 0,d0
 beq mf_fl_done
 movhu d0,(a1)
 inc a2
 add 2,a1
 add -1,d3
 bne 6b
 bra mf_fl_done

mf_fl_noname:
 mov 'F',d0
 movhu d0,(a1)
 add 2,a1
 mov 'I',d0
 movhu d0,(a1)
 add 2,a1
 mov 'L',d0
 movhu d0,(a1)
 add 2,a1
 mov 'M',d0
 movhu d0,(a1)
 add 2,a1

mf_fl_done:
 clr d0
 movhu d0,(a1)
 ret [d2,d3,a2,a3],20

mf_max_tab: .byte 2, 11, 6, 3, 2, 21
mf_def_tab: .byte 1, 5, 0, 2, 1, 0

/* ---- UTF-16LE strings for st_get (0x7f70 .. 0x7f89) ---- */
 .balign 4
mf_strs:
 .long mf_s_split, mf_s_ofs
 .long mf_s_m5, mf_s_m4, mf_s_m3, mf_s_m2, mf_s_m1
 .long mf_s_0, mf_s_p1, mf_s_p2, mf_s_p3, mf_s_p4, mf_s_p5
 .long mf_s_card, mf_s_pos
 .long mf_s_c1, mf_s_c2, mf_s_c3, mf_s_c4, mf_s_c5
 .long mf_s_pl, mf_s_pc, mf_s_pr
 .long mf_s_prev, mf_s_fl, mf_s_flall

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
mf_s_prev:  .hword 0x56fe, 0x5361, 0x9884, 0x89c8, 0                /* 图卡预览 */
mf_s_fl:    .hword 0x6ee4, 0x955c, 0x9009, 0x62e9, 0                /* 滤镜选择 */
mf_s_flall: .hword 0x5168, 0x90e8, 0x5f00, 0                        /* 全部开 */

/* Dynamic UTF-16LE string buffers (16 B for "NN/20", 20 x 48 B = 960 B for film toggle rows). */
 .balign 4
mf_flcnt_buf: .space 16, 0
mf_flstr_buf: .space 20 * 48, 0

/* ---- Runtime state & cache-line-isolated uncached mirrors ---- */
 .balign 4
mf_ram:
 .space MF_LEN, 0
mf_ok:
 .byte 0
mf_pend:
 .byte 0
 .balign 64                       /* isolate uncached MF_CFG_* from cached mf_ram/mf_pend! */
mf_cfg_split:  .long 1
mf_cfg_ofs:    .long 5
mf_cfg_card:   .long 0
mf_cfg_pos:    .long 2
mf_cfg_prev:   .long 1
mf_cfg_flmask: .long 0x000fffff
 .balign 64
 .set MF_CFG_SPLIT,  mf_cfg_split  + 0x40000000
 .set MF_CFG_OFS,    mf_cfg_ofs    + 0x40000000
 .set MF_CFG_CARD,   mf_cfg_card   + 0x40000000
 .set MF_CFG_POS,    mf_cfg_pos    + 0x40000000
 .set MF_CFG_PREV,   mf_cfg_prev   + 0x40000000
 .set MF_CFG_FLMASK, mf_cfg_flmask + 0x40000000

/* ---- Patched menu tables populated by firmware/build.py ---- */
 .balign 4
mf_recs:                          /* 5 x 36 B = 180 B (MF Assist: stock 283, 566, 1892 + split, ofs) */
 .space 36 * 5, 0
mf_recs_end:
 .balign 4
mf_ord:                           /* 5 x u16 = 10 B (row order for mode 0x11a) */
 .space 2 * 5, 0
mf_ord_end:
 .balign 4
mf_ofs_vals:                      /* 11 x 12 B = 132 B (list-row value list for -5..+5) */
 .space 12 * 11, 0
mf_ofs_vals_end:
 .balign 4
/* Cam2 -> 1. Computational Modes (6 stock + 4 ours = 10 rows): */
cp_ord:                           /* 10 x u16 = 20 B */
 .space 2 * 10, 0
cp_ord_end:
 .balign 4
cp_labels:                        /* 10 x 12 B = 120 B */
 .space 12 * 10, 0
cp_labels_end:
 .balign 4
cp_helps:                         /* 10 x 12 B = 120 B */
 .space 12 * 10, 0
cp_helps_end:
 .balign 4
cp_vals:                          /* 10 x 8 B = 80 B */
 .space 8 * 10, 0
cp_vals_end:
 .balign 4
cp_card_vals:                     /* 6 x 12 B = 72 B */
 .space 12 * 6, 0
cp_card_vals_end:
 .balign 4
cp_pos_vals:                      /* 3 x 12 B = 36 B */
 .space 12 * 3, 0
cp_pos_vals_end:
 .balign 4
cp_prev_vals:                     /* 2 x 12 B = 24 B */
 .space 12 * 2, 0
cp_prev_vals_end:
 .balign 4
cp_fl_vals:                       /* 1 x 12 B = 12 B (val 0 -> ST_MF_FLCNT "NN/20") */
 .space 12 * 1, 0
cp_fl_vals_end:
 .balign 4
cp_acts:                          /* 10 x 24 B = 240 B (OK actions for 1. Computational Modes) */
 .space 24 * 10, 0
cp_acts_end:
 .balign 4
/* Picker screens (0x42, keys 0x63..0x68): */
mf_ptitles:                       /* 6 x 8 B = 48 B */
 .space 8 * MF_N, 0
mf_ptitles_end:
 .balign 4
mf_pofs_vals:                     /* 11 x 12 B = 132 B */
 .space 12 * 11, 0
mf_pofs_vals_end:
 .balign 4
mf_pcard_vals:                    /* 6 x 12 B = 72 B */
 .space 12 * 6, 0
mf_pcard_vals_end:
 .balign 4
mf_ppos_vals:                     /* 3 x 12 B = 36 B */
 .space 12 * 3, 0
mf_ppos_vals_end:
 .balign 4
mf_pfl_vals:                      /* 21 x 12 B = 252 B (0=全部开, 1..20=films) */
 .space 12 * 21, 0
mf_pfl_vals_end:
 .balign 4
mf_phelps:                        /* (2 + 11 + 6 + 3 + 2 + 21) x 12 B = 45 x 12 = 540 B */
 .space 12 * 45, 0
mf_phelps_end:
 .balign 4
mf_pickers:                       /* (96 + 6) x 36 B = 3672 B */
 .space 36 * (96 + MF_N), 0
mf_pickers_end:
 .balign 4
mf_g8:                            /* (416 + 6) x 24 B = 10128 B */
 .space 24 * (416 + MF_N), 0
mf_g8_end:
 .balign 4
mf_acts:                          /* 5 x 24 B = 120 B (OK actions for MF Assist: 3 stock + 2 ours) */
 .space 24 * 5, 0
mf_acts_end:
 .balign 4
