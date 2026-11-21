/* Screen-test diagnostics. No card access from DISPLAY, no new hooks.
 * Counters only advance while armed. Text uses the existing DEBUG/card/release
 * logger and is bounded by lg_lim. MMIO snapshots are read-only, non-atomic.
 */
fs_diag_capture:                  /* d0 channel; caller already validated 1/2 */
 asl 15,d0
 add 0x9bb80000,d0
 mov d0,a3
 mov cap_regs,a2
 mov FS_D_RAW,a1
 mov 13,d3
1:
 mov (a2),d1
 mov a3,a0
 add d1,a0
 mov (a0),d0
 mov d0,(a1)
 add 4,a1
 add 4,a2
 add -1,d3
 bne 1b
 ret [d2,d3,a2,a3],20

fs_diag_text:
 LGS sb_diag_label
 mov sb_diag_fields,a2
 mov 7,d3
 mov 1,d2
 call fs_diag_words,[d2,d3,a2,a3],24
 LGS fs_diag_title
 LGS fs_diag_state_label
 mov fs_diag_states,a2
 mov 8,d3
 mov 1,d2
 call fs_diag_words,[d2,d3,a2,a3],24
 mov (FS_ON),d0
 cmp 1,d0
 bne 9f
 LGS fs_diag_counts_label
 mov FS_D,a2
 mov 16,d3
 clr d2
 call fs_diag_words,[d2,d3,a2,a3],24
 LGS fs_diag_last_label
 mov FS_D_RAW,a2
 mov 13,d3
 clr d2
 call fs_diag_words,[d2,d3,a2,a3],24
 LGS fs_diag_tft_label
 mov 2,d0
 call fs_diag_display,[d2,d3,a2,a3],24
 LGS fs_diag_evf_label
 mov 1,d0
 call fs_diag_display,[d2,d3,a2,a3],24
 /* Take a consistent copy of all four last-active snapshots. Limit the lock
  * to the copy; CADLOG formatting runs outside the critical section. */
 clr d0
 call LOCK,[d2],8
 mov d0,(4,sp)
 mov FS_ACTIVE,a0
 mov FS_ACTIVE_COPY,a1
 mov 156,d2
1:
 mov (a0),d1
 mov d1,(a1)
 inc4 a0
 inc4 a1
 add -1,d2
 bne 1b
 mov FS_TH_SAMPLES,a0
 mov FS_TH_COPY,a1
 mov 22,d2
2:
 mov (a0),d1
 mov d1,(a1)
 inc4 a0
 inc4 a1
 add -1,d2
 bne 2b
 mov (4,sp),d0
 call UNLOCK,[d2],8
 .macro FS_ROW title, off
 LGS \title
 mov FS_ACTIVE_COPY+\off,a2
 mov 39,d3
 clr d2
 call fs_diag_words,[d2,d3,a2,a3],24
 .endm
 FS_ROW fs_pre_evf,0
 FS_ROW fs_post_evf,156
 FS_ROW fs_pre_tft,312
 FS_ROW fs_post_tft,468
 LGS fs_th_tft_label
 mov FS_TH_COPY,a2
 mov 11,d3
 clr d2
 call fs_diag_words,[d2,d3,a2,a3],24
 LGS fs_th_evf_label
 mov FS_TH_COPY+44,a2
 mov 11,d3
 clr d2
 call fs_diag_words,[d2,d3,a2,a3],24
 LGS fs_miss_label
 mov FS_EV_MISS,a2
 mov 3,d3
 clr d2
 call fs_diag_words,[d2,d3,a2,a3],24
 LGS fs_latched_label
 mov FS_EV_LATCHED,a2
 mov 1,d3
 clr d2
 call fs_diag_words,[d2,d3,a2,a3],24
 LGS fs_focus_label
 mov fs_focus_stats+0x40000000,a2
 mov 4,d3
 clr d2
 call fs_diag_words,[d2,d3,a2,a3],24
 LGS fs_held_label
 mov FS_HELD,a2
 mov 1,d3
 clr d2
 call fs_diag_words,[d2,d3,a2,a3],24
 LGS zaf_hook_label
 mov zaf_hook_fields,a2
 mov 8,d3
 mov 1,d2
 call fs_diag_words,[d2,d3,a2,a3],24
 LGS pdaf_live_label
 mov pdaf_live_fields,a2
 mov 8,d3
 mov 1,d2
 call fs_diag_words,[d2,d3,a2,a3],24
9:
 ret [d2,d3,a2,a3],24

fs_diag_words:                    /* a2 words/pointers, d3 count, d2 indirect */
1:
 mov (a2),d0
 cmp 0,d2
 beq 2f
 mov d0,a0
 mov (a0),d0
2:
 call lg_h,[],0
 LGS fs_diag_space
 add 4,a2
 add -1,d3
 bne 1b
 LGN
 ret [d2,d3,a2,a3],24

fs_diag_display:
 asl 15,d0
 add 0x9bb80000,d0
 mov d0,a3
 mov fs_diag_regs,a2
 mov 16,d3
1:
 mov (a2),d1
 mov a3,a0
 add d1,a0
 mov (a0),d0
 call lg_h,[],0
 LGS fs_diag_space
 add 4,a2
 add -1,d3
 bne 1b
 LGN
 ret [d2,d3,a2,a3],24
.balign 4
fs_diag_states:
 .long FS_ON,FS_CHECKED,FS_FRAMES,FS_OWNER,FS_OWNER+4,FS_EPOCH,FS_BUSY,FS_LAST
sb_diag_fields:
 .long sb_enabled+0x40000000,SB_JOBS,SB_DRIVE,sb_produced+0x40000000,SB_CONSUMED,SB_REFUSED,SB_RESULT
sb_diag_label: .asciz "\r\nBEEP on jobs drive queued consumed refused lastResult: "
.balign 4
zaf_hook_fields:
 .long PH_MODE,ZAF_LV_CNT,ZAF_ENG_CNT,ZAF_LLK1_CNT,ZAF_CAP_CNT,ZAF_DISP_CNT,ZAF_LPOS_CNT,ZAF_LUT_CNT
zaf_hook_label: .asciz "ZAF_UNLOCK ph_mode lv eng llk1 cap disp lpos lut: "
.balign 4
pdaf_live_fields:
 .long PD_VALID,PD_LAG_RAW,PD_LAG_EMA,PD_SCORE,PD_CNT,PD_SPLIT_S,FS_GREEN_TICKS,MF_BEEP_REQ
pdaf_live_label: .asciz "PDAF_LIVE valid lag_raw ema_q2 score cnt split green beep: "
.balign 4
fs_diag_regs:
 .long 0x60,0x390,0x3a8,0x3c0,0x3d8,0x400,0x42c,0x430
 .long 0x4f0,0x4f4,0x4f8,0x4fc,0x500,0x394,0x404,0x624
fs_diag_title: .asciz "\r\nSCREEN VISUAL TEST 2 - diagnostics (hex words)\r\n"
fs_miss_label: .asciz "EVF_MISS address changed held: "
fs_latched_label: .asciz "EVF source changes while original stayed latched: "
fs_focus_label: .asciz "FOCUS fine coarse split samples: "
fs_held_label: .asciz "TILE all buffers in use: "
fs_diag_state_label: .asciz "SC on checked frames owner owner_ch epoch busy last: "
fs_diag_counts_label: .asciz "SD update tick stop th gate mask ch cap why pub capN pubN cancel busy gui psw: "
fs_diag_last_label: .asciz "SL last capture regs: "
fs_diag_tft_label: .asciz "STFT current regs: "
fs_diag_evf_label: .asciz "SEVF current regs: "
fs_diag_space: .asciz " "

/* d0 = channel, d1 = 0 before capture / 1 after publish attempt. Caller
 * holds LOCK. Inactive IMG1 never replaces a useful snapshot. */
fs_diag_active:
 mov d0,d2
 asl 15,d2
 add 0x9bb80000,d2
 mov d2,a3
 mov (0x60,a3),d3
 and 32,d3
 beq fs_active_done
 add -1,d0
 asl 1,d0
 add d1,d0
 mov 156,d2
 mul d2,d0
 add FS_ACTIVE,d0
 mov d0,a1
 mov (a1),d0
 add 1,d0
 mov d0,(a1)
 inc4 a1
 mov fs_active_regs,a2
 mov 38,d3
1:
 mov (a2),d1
 mov a3,a0
 add d1,a0
 mov (a0),d0
 mov d0,(a1)
 inc4 a1
 inc4 a2
 add -1,d3
 bne 1b
fs_active_done:
 ret [d2,d3,a2,a3],20
.balign 4
fs_active_regs:
 .long 0x60,0x390,0x3a8,0x3c0,0x3d8,0x400,0x42c,0x430
 .long 0x4f0,0x4f4,0x4f8,0x4fc,0x500
 .long 0x394,0x3ac,0x3c4,0x404,0x438,0x43c
 .long 0x504,0x508,0x50c,0x510,0x514,0x518,0x624
 .long 0x420,0x424,0x2060,0x720,0x730,0x434,0x440
 .long 0x2394,0x23ac,0x2438,0x243c,0x2440
fs_pre_evf: .asciz "EVF_PRE active: "
fs_post_evf: .asciz "EVF_POST active: "
fs_pre_tft: .asciz "TFT_PRE active: "
fs_post_tft: .asciz "TFT_POST active: "
.balign 4
fs_active: .space 624,0
fs_active_copy: .space 624,0
.set FS_ACTIVE,fs_active+0x40000000
.set FS_ACTIVE_COPY,fs_active_copy+0x40000000

fs_th_tft_label: .asciz "TH_TFT mask fmt resize fromXY area src dst toXY fitXY size aspect: "
fs_th_evf_label: .asciz "TH_EVF mask fmt resize fromXY area src dst toXY fitXY size aspect: "
.balign 4
fs_th_copy: .space 88,0
.set FS_TH_COPY,fs_th_copy+0x40000000
