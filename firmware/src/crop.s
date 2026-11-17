/* Custom crop modes (feature/crop-modes, 2026-11-17): crop round 1 = the parts of feature/composition-guides c5 that
 * worked on the camera (c1..c6, 2026-11-13/14), with nothing of ours at start-up. research/NOTES.md "Crop modes ...".
 *
 * The camera's still aspect setting 269 gets three more values: 5 (5:4, the camera's own hidden ratio, native in every
 * size table), 6 (repurposed from 7:6 -> XPan 65:24) and 7 (repurposed from 6:5 -> 21:9), after Caduceus for the E-P7
 * (cakelesscoder, docs/ASPECT.md: ids 6 / 7 -> Panorama / Wide). Code and data here are ours, written for the OM-3 1.1
 * addresses; firmware/crop.py fills the tables and points the camera at them.
 *
 * Start-up (owner, 2026-11-13: nothing of ours while the camera starts): the camera's saved settings never hold 5 / 6 / 7
 * (cr_sin / cr_sbuf save the ratio the crop sits inside, and our tag), so the camera always starts on a stock ratio;
 * cr_rst puts the crop back at the first half-press and sets cr_on. Until then every hook here that runs while the
 * camera draws (labels, the shooting screen's reads of 269) is the stock path plus one byte read. Left out of c5's
 * build: the c4 / c5 run counters and the 0x6043900f counter hook, the playback label diagnosis, the SetValue hook
 * (cr_set: cr_rst's own check covers it), and c6's AF target lists (c6 was the only build with black screens). */

.section .ext12,"ax"
 .balign 4
cr_vlist:                         /* validator list of 269 (stock 1,3,2,4,9 at 0x60616696) */
 .byte 1, 3, 2, 4, 9, 5, 6, 7
cr_rmap:                          /* the stills rule's allowed values (stock 0x605d100c, 6 entries) + 5, 6, 7 */
 .space 9 * 4
cr_stra:                          /* SCP strip lists A / B (stock 0x6155ea2c / 0x6155ea68, 5 x 12 B) + 3 entries */
 .space 8 * 12
cr_strb:
 .space 8 * 12
cr_on:                            /* 1 from the first half-press of a power-on (cr_rst) */
 .byte 0
 .balign 2

/* Live view / preview boxes in CapThr_ThroughImage: six switches on the aspect id pick a box in the 640 class (7:6
 * 560 x 480, 6:5 576 x 480 in stock). Their jump-table entries for ids 6 / 7 come here: 640 x 240 (65:24) and 640 x 272
 * (21:9), heights in multiples of 16 as every size the camera makes. Each block sets the switch's width / height places
 * as the stock cases do and jumps to the stock code after them. (They run only behind a mode check: c4 counted none
 * while shooting; the live view itself takes ratioToConvertSize below.) */
/* getOutputSize (jump table 0x60e90f28): width -> (40,sp), height at 0x60c14d28 -> (44,sp) */
cr_os6:
 mov 640,d0
 mov d0,(40,sp)
 mov 240,d0
 jmp cr_os_j
cr_os7:
 mov 640,d0
 mov d0,(40,sp)
 mov 272,d0
 jmp cr_os_j
/* getTakeAreaSize (jump table 0x60e90f54): width -> (36,sp), height at 0x60c15156 -> (40,sp) */
cr_ta6:
 mov 640,d0
 mov d0,(36,sp)
 mov 240,d0
 jmp cr_ta_j
cr_ta7:
 mov 640,d0
 mov d0,(36,sp)
 mov 272,d0
 jmp cr_ta_j
/* switch after GetValue(269) at 0x60c066b7 (jump table 0x60e88188): width d3, height d2, then 0x60c0670e */
cr_sa6:
 mov 640,d3
 mov 240,d2
 jmp cr_sa_j
cr_sa7:
 mov 640,d3
 mov 272,d2
 jmp cr_sa_j
/* switch after GetValue(269) at 0x60c28c24 (jump table 0x60e9b0b8): width d1, height d0, then 0x60c28c7b */
cr_sb6:
 mov 640,d1
 mov 240,d0
 jmp cr_sb_j
cr_sb7:
 mov 640,d1
 mov 272,d0
 jmp cr_sb_j
/* switch after GetValue(269) at 0x60c2ab11 (jump table 0x60e9b678): width d0, height d1, then 0x60c2ab68 */
cr_sc6:
 mov 640,d0
 mov 240,d1
 jmp cr_sc_j
cr_sc7:
 mov 640,d0
 mov 272,d1
 jmp cr_sc_j
/* playback get_aspect_frame (jump table 0x60eac870): width a0, height d2, then 0x60c66889 */
cr_pb6:
 mov 640,a0
 mov 240,d2
 jmp cr_pb_j
cr_pb7:
 mov 640,a0
 mov 272,d2
 jmp cr_pb_j

/* cr_gv <- the shooting screen's own reads of 269 (`mov 269,d0; call 0x610fd8ef,[d2,d3,a2,a3],28`, a0 = where the
 * value goes; crop.py GV_SITES). Entered with that call's frame. They look positions up by aspect in lists that only
 * know 1, 2, 3, 4, 9 (10): AF frame, grid, layouts (a miss draws nothing: the AF frame vanished at 5 / 6 / 7 in om-emu).
 * So these reads get the ratio the crop sits inside: 5 (5:4) -> 1 (4:3), 6 / 7 (XPan, 21:9) -> 3 (16:9), as the
 * E-P7's issue #23 fix. The getter's own result (d0) is kept. Before the first half-press: the stock read alone. */
cr_gv:
 mov a0,(8,sp)                    /* the stock getter keeps a0 there too: our frame's slot */
 call cr_gv0,[d2,d3,a2,a3],28
 movbu (cr_on),d1
 cmp 0,d1
 beq 9f
 mov (8,sp),a0
 mov (a0),d1
 cmp 5,d1
 bne 1f
 mov 1,d1
 mov d1,(a0)
 bra 9f
1:
 cmp 6,d1
 beq 2f
 cmp 7,d1
 bne 9f
2:
 mov 3,d1
 mov d1,(a0)
9:
 ret [d2,d3,a2,a3],28

/* cr_gvl <- the two label reads among them (0x611d8467 the SCP cell, 0x612357fb the top bar) and the top bar's "show the
 * label?" (0x612356c0): each crop borrows a label slot of its own, so the camera redraws on every change, and 5:4
 * borrows 1:1's (the top bar hides 4:3's label): 5 -> 4, 6 -> 3, 7 -> 2. cr_ic then shows our picture there. */
cr_gvl:
 mov a0,(8,sp)
 call cr_gv0,[d2,d3,a2,a3],28
 movbu (cr_on),d1
 cmp 0,d1
 beq 9f
 mov (8,sp),a0
 mov (a0),d1
 cmp 5,d1
 bne 1f
 mov 4,d1
 bra 8f
1:
 cmp 6,d1
 bne 2f
 mov 3,d1
 bra 8f
2:
 cmp 7,d1
 bne 9f
 mov 2,d1
8:
 mov d1,(a0)
9:
 ret [d2,d3,a2,a3],28

/* The camera's saved settings never hold a crop. Store M (RAM image 0x62920700, 256 KiB) keeps 269 at +0x2c2 and
 * +0x32458. The camera saves M through 0x60061183 (a0 = the store, a1 = a callback): after a menu with a callback (the
 * image is copied to the buffer 0xa373d280 with its checksum, then written: cr_sbuf patches the buffer), at power-off
 * without one (compared with flash, then sealed and written from the RAM image: cr_sin patches the RAM image first; the
 * camera is shutting down). The saved copy gets the ratio the crop sits inside (5 -> 1, 6 / 7 -> 3) and our tag at
 * +0x39FF0 in M's unused tail ('C' 'R' 0 id, or 0); the buffer's 16-bit checksum (+2, the whole image sums to 0) is
 * corrected. The stock function reads only a0 / a3 and its stack after 0x60061183 (a1 is stored first; d0 comes from
 * 0x60060eff; d1 is set before use), so the registers used here are free. */
 .set CR_MH, 0xa32bb920           /* the store M handle (as 0x60063d73 reads it) */
 .set CR_A1, 0x629209c2           /* M + 0x2c2 */
 .set CR_A2, 0x62952b58           /* M + 0x32458 */
 .set CR_TG, 0x6295a6f0           /* M + 0x39ff0 (free: the films block starts at +0x3A000) */
 .set CR_UNC, 0x40000000          /* + this = the uncached alias */
 .set CR_BUF, 0xa373d280
 .set CR_TAGV, 0x43520000
 .set CR_GUI, 0x603713a4          /* -> the GUI state (2 bytes: class, state; 0x0108 shooting, 0x0508 playback; om-emu) */
cr_sin:                           /* jmp from 0x60061183 (its frame; d2, d3, a2 not live yet) */
 mov a1,(12,sp)                   /* the stock instructions */
 mov a0,a3
 cmp 0,a1
 bne 9f                           /* a callback: the buffer is patched in cr_sbuf */
 mov (CR_MH),a1
 cmp a1,a0
 bne 9f
 movbu (CR_A1),d0
 cmp 5,d0
 bcs 8f
 cmp 8,d0
 bcc 8f
 mov d0,d2                        /* the crop */
 mov 1,d1
 cmp 5,d0
 beq 1f
 mov 3,d1
1:
 movbu d1,(CR_A1)
 movbu d1,(CR_A1 + CR_UNC)
 movbu d1,(CR_A2)
 movbu d1,(CR_A2 + CR_UNC)
 mov CR_TAGV,d0
 or d2,d0
 bra 7f
8:
 clr d0
7:
 mov d0,(CR_TG)
 mov d0,(CR_TG + CR_UNC)
9:
 call cr_ef,[],0                  /* the stock call (a0 = the store) */
 jmp cr_sin_back

cr_sbuf:                          /* jmp from 0x6006120e (0x60061183's frame; a3 = the store, the buffer is filled) */
 mov (CR_MH),a1
 cmp a1,a3
 bne 9f
 movbu (CR_BUF + 0x2c2),d0
 cmp 5,d0
 bcs 8f
 cmp 8,d0
 bcc 8f
 mov d0,d2                        /* the crop */
 mov 1,d3
 cmp 5,d0
 beq 1f
 mov 3,d3
1:
 movbu d3,(CR_BUF + 0x2c2)
 movbu d3,(CR_BUF + 0x32458)
 mov d3,d1                        /* the image's sum changes by 2 x (base - crop) (both bytes even: low halves) */
 sub d2,d1
 add d1,d1
 mov CR_TAGV,d0
 or d2,d0
 bra 7f
8:
 clr d1
 clr d0
7:
 mov (CR_BUF + 0x39ff0),d2        /* the tag: old -> new, and its two halves into the sum */
 mov d0,(CR_BUF + 0x39ff0)
 mov d0,d3
 exthu d3
 add d3,d1
 mov d0,d3
 lsr 16,d3
 add d3,d1
 mov d2,d3
 exthu d3
 sub d3,d1
 mov d2,d3
 lsr 16,d3
 sub d3,d1
 movhu (CR_BUF + 2),d0            /* the checksum takes the opposite */
 sub d1,d0
 movhu d0,(CR_BUF + 2)
9:
 mov CR_BUF,d3                    /* the stock instruction */
 jmp cr_sb_back

/* cr_rst: `call cr_rst,[d2,d3,a2,a3],20` from nm_ex, sd_load's last call (the first half-press of a power-on, the
 * HLS_EVENT task, where ar_getv / ar_setv are used as the dial handler uses them). Sets cr_on. Our tag in M (loaded with
 * the camera's settings) says the crop the camera was saved in; if the setting still holds that crop's base, set the
 * crop again. The tag is cleared either way (the next save seals it). */
cr_rst:
 mov 1,d0
 movbu d0,(cr_on)
 mov (CR_TG),d0
 mov d0,(cr_dtg)
 mov d0,d1
 lsr 16,d1
 cmp CR_TAGV >> 16,d1
 bne 9f
 and 0xff,d0
 cmp 5,d0
 bcs 8f
 cmp 8,d0
 bcc 8f
 mov d0,(4,sp)                    /* the crop */
 mov 269,d0
 call ar_getv,[d2,a2],24
 mov d0,(cr_das)
 mov (4,sp),d1
 mov 1,d2
 cmp 5,d1
 beq 1f
 mov 3,d2
1:
 cmp d2,d0
 bne 8f                           /* the setting was changed since: leave it */
 mov d1,(cr_dst)
 mov 269,d0
 call ar_setv,[d2,a2],20          /* d1 = the crop */
 mov 269,d0
 call ar_getv,[d2,a2],24
 mov d0,(cr_daf)
8:
 clr d0
 mov d0,(CR_TG)
 mov d0,(CR_TG + CR_UNC)
9:
 ret [d2,d3,a2,a3],20

.section .hook_crs,"ax"
 jmp cr_sin                       /* stock 0x60061183: mov a1,(12,sp); mov a0,a3; call 0x60060eff,[],0 */
 .byte 0xcb, 0xcb, 0xcb
.section .hook_crb,"ax"
 jmp cr_sbuf                      /* stock 0x6006120e: mov 0xa373d280,d3 */
 .byte 0xcb
.section .ext12,"ax"

/* Labels for the new ratios. Pictures CR_IC0 + 0..8 (5:4, XPan, 21:9 for the SCP strip 100 x 76, the top bar 46 x 34
 * and the SCP cell 160 x 48; our drawing, firmware/mkicons.py crop_label_streams), answered here at the end of the
 * picture hook chain (ar_ic); strings CR_ST0 + 0..2 (the same words, for the menus' text lists) at the end of st_get's
 * chain. */
 .set CR_IC0, 0x7fc4              /* free: ours are 0x7f70.., 0x7f80..0x7fc3, 0x7fd0..0x7fd8, 0x7fe0..0x7fff */
 .set CR_NIC, 9
 .set CR_ST0, 0x7f68              /* free: our strings are 0x7f00..0x7f09, 0x7f10.., 0x7f30.., 0x7f48..0x7f63 */
cr_ic:                            /* d0 = the id, d1 = its exthu (ar_ic); a0 <- &descriptor word, retf as ar_ic */
 cmp CR_IC0,d1
 bcs 1f
 cmp CR_IC0 + CR_NIC,d1
 bcc 1f
 add -CR_IC0,d1
8:
 asl2 d1
 mov cr_ent,a0
 add d1,a0
 retf [],0
1:                                /* the current value's label, asked through cr_gvl as 1:1 / 16:9 / 3:2 (top bar
                                   * 10934 / 10930 / 10932, SCP cell 5860 / 5859 / 5862) -> ours while 269 holds the
                                   * crop that borrows that slot (5 / 6 / 7); only on the shooting screens (GUI state
                                   * class below 5: playback shows a photo's own value through the same pictures) */
 movbu (cr_on),d1
 cmp 0,d1
 beq 9f
 mov (CR_GUI),a0
 cmp 0,a0
 beq 9f
 movbu (a0),d1
 cmp 5,d1
 bcc 9f
 cmp 3,d1
 beq 9f
 movbu (CR_A1),d1
 cmp 5,d1
 bcs 9f
 cmp 8,d1
 bcc 9f
 mov d1,a0                        /* the crop */
 mov d0,d1
 exthu d1
 cmp 10934,d1
 beq 5f
 cmp 10930,d1
 beq 6f
 cmp 10932,d1
 beq 7f
 cmp 5860,d1
 beq 51f
 cmp 5859,d1
 beq 61f
 cmp 5862,d1
 beq 71f
 bra 9f
5:
 cmp 5,a0
 bne 9f
 mov 3,d1
 bra 8b
6:
 cmp 6,a0
 bne 9f
 mov 4,d1
 bra 8b
7:
 cmp 7,a0
 bne 9f
 mov 5,d1
 bra 8b
51:
 cmp 5,a0
 bne 9f
 mov 6,d1
 bra 8b
61:
 cmp 6,a0
 bne 9f
 mov 7,d1
 bra 8b
71:
 cmp 7,a0
 bne 9f
 mov 8,d1
 bra 8b
9:
 mov d0,d1                        /* as ar_ic left it */
 exthu d1
 jmp ic_get
cr_str:                           /* st_get's frame, d0 = the id: a0 <- our UTF-16 string, ret [d2],8 as st_get */
 cmp CR_ST0,d0
 bcs 1f
 cmp CR_ST0 + 3,d0
 bcc 1f
 mov d0,d1
 add -CR_ST0,d1
 asl2 d1
 mov cr_strs,a0
 add d1,a0
 mov (a0),a0
 ret [d2],8
1:
 jmp cr_stk
 .balign 4
cr_strs:
 .long cr_s54, cr_sxp, cr_s219
cr_s54:
 .short 53, 58, 52, 0             /* "5:4" */
cr_sxp:
 .short 88, 80, 97, 110, 0        /* "XPan" */
cr_s219:
 .short 50, 49, 58, 57, 0         /* "21:9" */
 .balign 4
cr_ent:
 .long cr_d0, cr_d1, cr_d2, cr_d3, cr_d4, cr_d5, cr_d6, cr_d7, cr_d8
cr_d0:                            /* <6H3I> descriptors, filled by crop.py */
 .short 14, 0, 0, 8, 0, 0
 .long 0, 0, 0
cr_d1:
 .short 14, 0, 0, 8, 0, 0
 .long 0, 0, 0
cr_d2:
 .short 14, 0, 0, 8, 0, 0
 .long 0, 0, 0
cr_d3:
 .short 14, 0, 0, 8, 0, 0
 .long 0, 0, 0
cr_d4:
 .short 14, 0, 0, 8, 0, 0
 .long 0, 0, 0
cr_d5:
 .short 14, 0, 0, 8, 0, 0
 .long 0, 0, 0
cr_d6:
 .short 14, 0, 0, 8, 0, 0
 .long 0, 0, 0
cr_d7:
 .short 14, 0, 0, 8, 0, 0
 .long 0, 0, 0
cr_d8:
 .short 14, 0, 0, 8, 0, 0
 .long 0, 0, 0
cr_lst:                           /* the SCP strip's picture list (stock 0x615491c0, 5 x 12 B) + 3 entries */
 .space 8 * 12
cr_ml0:                           /* the three Image Aspect menu lists (stock 6 x 12 B) + 3 entries each */
 .space 9 * 12
cr_ml1:
 .space 9 * 12
cr_ml2:
 .space 9 * 12
 .balign 8
cr_pay:                           /* the picture streams (crop.py) */
 .space 12288
cr_pend:

/* The size text over the SCP strip ("5184x3888"): 0x6129fc29.. searches table 0x61600c10 (u16 ids 1,3,2,4,9, then 11
 * rows {u16 key, w[5], h[5]}); a ratio it does not know leaves the size unset (om-emu showed "36224x25159"). Our copy
 * with 8 columns (+ 5, 6, 7, filled by crop.py from the recorded-size lists), the function's constants changed to suit
 * (as the E-P7's v7 did for theirs). */
 .balign 4
cr_rtab:
 .space 16 + 11 * 34

/* The live view crop ratio (camera c1: live view showed no XPan strip). 0x60bf2cc8.. reads 269 (or the live view object's
 * +260) and picks the width : height pair through jump table 0x60e81df0 (index id - 1; 7:6 / 6:5 for ids 6 / 7), width
 * -> (24,sp), height at 0x60bf2d2b -> (28,sp) (= the E-P7's 0x60552d75 pair, their v5). */
cr_lr6:
 mov 65,d0
 mov d0,(24,sp)
 mov 24,d0
 jmp cr_lr_j
cr_lr7:
 mov 21,d0
 mov d0,(24,sp)
 mov 9,d0
 jmp cr_lr_j

/* The live view's own ratio (c5, camera-tested: the XPan / 21:9 strip). getOutputSize / getOutputSizeForFineZoom's
 * normal path asks ratioToConvertSize 0x60c0d30b (jump table 0x60e905b8 by id 0..10: 7:6 / 6:5 for 6 / 7) for w : h,
 * a1 -> the pair, the join 0x60c0d35f stores h at (4,a1) and retf (mdr untouched here); CapThr::
 * calculationOfDisplayAreaByAspect then fits it. */
cr_rc6:
 mov 65,d0
 mov d0,(a1)
 mov 24,d0
 jmp cr_rc_j
cr_rc7:
 mov 21,d0
 mov d0,(a1)
 mov 9,d0
 jmp cr_rc_j
/* getOutputAspect 0x60c14b28 (jump table 0x60e90efc by id 0..10): w -> (12,sp), h at the join 0x60c14b95 -> (16,sp) */
cr_oa6:
 mov 65,d0
 mov d0,(12,sp)
 mov 24,d0
 jmp cr_oa_j
cr_oa7:
 mov 21,d0
 mov d0,(12,sp)
 mov 9,d0
 jmp cr_oa_j

/* The debug log's CROP MODES line (cr_txt from lg_write): the tag at the first half-press, Image Aspect then, the value
 * set, Image Aspect after, and now. */
 .balign 4
cr_dtg:
 .long 0
cr_das:
 .long 0
cr_dst:
 .long 0
cr_daf:
 .long 0
cr_t1:
 .asciz "\r\n\r\nCROP MODES (crop round 1): tag at the first half-press "
cr_t2:
 .asciz ", Image Aspect then "
cr_t3:
 .asciz ", set to "
cr_t4:
 .asciz ", after "
cr_t5:
 .asciz ", now "
 .balign 2
cr_txt:                           /* `call cr_txt,[d2,d3,a2,a3],24` */
 LGS cr_t1
 mov (cr_dtg),d0
 call lg_h,[],0
 LGS cr_t2
 mov (cr_das),d0
 LGD
 LGS cr_t3
 mov (cr_dst),d0
 LGD
 LGS cr_t4
 mov (cr_daf),d0
 LGD
 LGS cr_t5
 movbu (CR_A1),d0
 LGD
 ret [d2,d3,a2,a3],24
