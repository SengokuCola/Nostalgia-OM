/* Test 20: Tight-center Layer 0 Quad-Pixel PDAF engine (uncached DRAM only,
 * zero MMIO/DMA/SD I/O, pure 32-bit signed integer math, < 0.3 ms/frame).
 *
 * Improvements over Test 19:
 * - Tight center 320-px ROI (x = 720..1040, matching the split circle / RF
 *   patch) instead of 768 px, preventing out-of-focus background objects from
 *   pulling the phase away from the central subject.
 * - Finer 2-px binning (160 bins, +-24 bins = +-48 px) + 1-px parabolic fit.
 * - Only highlight saturation (A + B >= sat_th) is masked; dark pixels remain valid.
 * - Fast 1-frame adaptive EMA (no 3-frame median lag) + 2 px hysteresis deadband.
 */

.set PD_ROI_X0,720                   /* tight center 320 px of 1760-px row (880 +- 160) */
.set PD_ROI_W,320
.set PD_NBINS,160                    /* 320 / 2 */
.set PD_MAX_LAG,24                   /* +-24 bins = +-48 sensor pixels */
.set PD_NUM_LAGS,49                  /* 2 * 24 + 1 */
.set PD_OVERLAP,112                  /* 160 - 2 * 24 */
.set PD_MIN_CNT,20                   /* minimum valid non-saturated bins */
.set PD_MIN_ENERGY,256               /* reject flat/blank texture */
.set PD_MIN_SCORE,250                /* r^2 >= 250/1024 (r >= 0.494, better for wide-open f/0.95) */
.set PD_HOLD_LIMIT,8                 /* frames to hold before low-conf */

.set PD_AB,pd_ab+0x40000000
.set PD_BB,pd_bb+0x40000000
.set PD_OK,pd_ok+0x40000000
.set PD_SCORES,pd_scores+0x40000000
.set PD_STATE,pd_live_state+0x40000000
.set PD_VALID,PD_STATE+0
.set PD_LAG_RAW,PD_STATE+4
.set PD_LAG_EMA,PD_STATE+8           /* quarter-pixel fixed point (4 * lag_px) */
.set PD_SCORE,PD_STATE+12
.set PD_CNT,PD_STATE+16
.set PD_SPLIT_S,PD_STATE+20
.set FS_GREEN_TICKS,PD_STATE+24      /* countdown frames for green ring flash */
.set PD_LOW_CNT,PD_STATE+28
.set PD_MED0,PD_STATE+32
.set PD_MED1,PD_STATE+36
.set PD_MED2,PD_STATE+40
.set PD_SEEDED,PD_STATE+44
.set PD_EA,PD_STATE+48
.set PD_SAT_TH,PD_STATE+52
.set PD_LOCK_ARMED,PD_STATE+56       /* 1 = armed to fire beep + green flash on focus lock */
.set PD_LOCK_COOLDOWN,PD_STATE+60    /* frame countdown (~45 = 1.5s) before next lock chime */

/* Compute one raw optical phase measurement from ptr_a0 into PD_STATE.
 * Returns d0 = 1 if valid measurement (score >= PD_MIN_SCORE), 0 otherwise.
 * Frame: [d2,d3,a2,a3],88 (locals (4..64,sp); saved regs at (72..84,sp))
 *   (4,sp)  = A_roi cursor
 *   (8,sp)  = B_roi cursor
 *   (12,sp) = sat_th
 *   (16,sp) = best_sc
 *   (20,sp) = best_lag_idx (0..48)
 *   (24,sp) = best_cnt
 *   (28,sp) = best_ea
 *   (32,sp) = cur_idx (0..48) / ok_ptr in pass 2
 *   (36,sp) = ma (mean A) / px4_cnt in pass 2
 *   (40,sp) = mb (mean B) / bin_ok in pass 2
 *   (44,sp) = dot / inner_cnt in pass 3a
 *   (48,sp) = ea
 *   (52,sp) = eb
 *   (56,sp) = cur_cnt / rem_bins in pass 2
 *   (60,sp) = cur_lag (-24..+24)
 *   (64,sp) = inner_cnt in pass 3b
 */
fs_pdaf_measure_raw:
 movhu (0xa33e9c8c),d0               /* latest_slot */
 cmp 4,d0
 bcc pdm_fail
 asl 4,d0
 mov 0xa33e9be0,a0
 add d0,a0
 mov (a0),a0                         /* ptr_a0 */
 call sw_valid_pdaf_ptr,[],0
 cmp 0,d0
 beq pdm_fail
 call sw_to_uncached,[],0
 mov a0,a2
 add 460800+PD_ROI_X0*2,a2           /* A-half row 13 sub-row 1, col 496 */
 mov a2,(4,sp)
 mov a0,a3
 add 1393920+PD_ROI_X0*2,a3          /* B-half row 13 sub-row 1, col 496 */
 mov a3,(8,sp)

 /* Pass 1: find max(A + B) across 320 px to adapt saturation threshold. */
 clr d2                              /* max_sum */
 mov PD_ROI_W,d3
1:
 movhu (a2),d0
 movhu (a3),d1
 add d1,d0
 cmp d2,d0
 bls 2f
 mov d0,d2
2:
 add 2,a2
 add 2,a3
 add -1,d3
 bne 1b

 mov 65535,d0
 cmp 24000,d2
 bls 3f
 add -512,d2
 mov 40000,d0
 cmp d0,d2
 bcc 3f
 mov d2,d0
3:
 mov d0,(12,sp)                      /* sat_th */
 mov d0,(PD_SAT_TH)

 /* Pass 2: 2-pixel horizontal box-average into PD_AB[160], PD_BB[160], PD_OK[160]. */
 mov (4,sp),a0                       /* A pixel cursor */
 mov (8,sp),a1                       /* B pixel cursor */
 mov PD_AB,a2
 mov PD_BB,a3
 mov PD_OK,d0
 mov d0,(32,sp)                      /* ok cursor */
 mov PD_NBINS,d0
 mov d0,(56,sp)                      /* remaining bins */
pdm_bin_loop:
 clr d2                              /* sa */
 clr d3                              /* sb */
 mov 1,d0
 mov d0,(40,sp)                      /* bin_ok = 1 */
 mov 2,d0
 mov d0,(36,sp)                      /* 2 pixels per bin */
pdm_px4:
 movhu (a0),d0                       /* va */
 movhu (a1),d1                       /* vb */
 add 2,a0
 add 2,a1
 add d0,d2                           /* sa += va */
 add d1,d3                           /* sb += vb */
 add d1,d0                           /* va + vb */
 mov (12,sp),d1                      /* sat_th */
 cmp d1,d0
 bcs pdm_px_ok
 clr d0
 mov d0,(40,sp)                      /* highlight saturated -> bin_ok = 0 */
pdm_px_ok:
 mov (36,sp),d0
 add -1,d0
 mov d0,(36,sp)
 bne pdm_px4

 lsr 1,d2
 lsr 1,d3
 movhu d2,(a2)
 movhu d3,(a3)
 add 2,a2
 add 2,a3
 mov a0,(4,sp)                       /* update saved A cursor */
 mov (32,sp),a0                      /* ok cursor */
 mov (40,sp),d0
 movbu d0,(a0)
 inc a0
 mov a0,(32,sp)
 mov (4,sp),a0                       /* restore A cursor */
 mov (56,sp),d0
 add -1,d0
 mov d0,(56,sp)
 bne pdm_bin_loop

 /* Pass 3: evaluate integer ZNCC^2 (0..1024) for idx = 0..48 (lag = idx - 24). */
 clr d0
 mov d0,(16,sp)                      /* best_sc = 0 */
 mov 24,d0
 mov d0,(20,sp)                      /* best_lag_idx = 24 (lag=0) */
 clr d0
 mov d0,(24,sp)                      /* best_cnt = 0 */
 mov d0,(28,sp)                      /* best_ea = 0 */
 mov d0,(32,sp)                      /* cur_idx = 0 */

pdm_lag_loop:
 mov (32,sp),d0                      /* cur_idx */
 add -PD_MAX_LAG,d0
 mov d0,(60,sp)                      /* cur_lag */

 /* Sub-pass 3a: compute sumA, sumB, cnt for valid overlapping bins. */
 mov PD_OK+PD_MAX_LAG,a0
 mov a0,a1
 add d0,a1                           /* PD_OK + 24 + lag */
 mov PD_AB+PD_MAX_LAG*2,a2
 mov d0,d1
 asl 1,d1
 mov PD_BB+PD_MAX_LAG*2,a3
 add d1,a3                           /* PD_BB + (24 + lag)*2 */
 clr d2                              /* sumA */
 clr d3                              /* sumB */
 clr d0
 mov d0,(56,sp)                      /* cur_cnt = 0 */
 mov PD_OVERLAP,d0
 mov d0,(44,sp)                      /* loop count = 144 */
pdm_mean_loop:
 movbu (a0),d0
 cmp 0,d0
 beq pdm_mean_next
 movbu (a1),d0
 cmp 0,d0
 beq pdm_mean_next
 movhu (a2),d0
 add d0,d2
 movhu (a3),d1
 add d1,d3
 mov (56,sp),d0
 inc d0
 mov d0,(56,sp)
pdm_mean_next:
 inc a0
 inc a1
 add 2,a2
 add 2,a3
 mov (44,sp),d0
 add -1,d0
 mov d0,(44,sp)
 bne pdm_mean_loop

 mov (56,sp),d1                      /* cur_cnt */
 cmp PD_MIN_CNT,d1
 bcs pdm_score_zero

 /* ma = sumA / cur_cnt, mb = sumB / cur_cnt (both >= 0). */
 clr d0
 mov d0,mdr
 div d1,d2
 mov d2,(36,sp)                      /* ma */
 clr d0
 mov d0,mdr
 div d1,d3
 mov d3,(40,sp)                      /* mb */

 /* Sub-pass 3b: accumulate dot, ea, eb over valid bins with >>5 scaling. */
 mov (60,sp),d0                      /* cur_lag */
 mov PD_OK+PD_MAX_LAG,a0
 mov a0,a1
 add d0,a1
 mov PD_AB+PD_MAX_LAG*2,a2
 mov d0,d1
 asl 1,d1
 mov PD_BB+PD_MAX_LAG*2,a3
 add d1,a3
 clr d0
 mov d0,(44,sp)                      /* dot = 0 */
 mov d0,(48,sp)                      /* ea = 0 */
 mov d0,(52,sp)                      /* eb = 0 */
 mov PD_OVERLAP,d0
 mov d0,(64,sp)                      /* loop count = 144 */
pdm_corr_loop:
 movbu (a0),d0
 cmp 0,d0
 beq pdm_corr_next
 movbu (a1),d0
 cmp 0,d0
 beq pdm_corr_next
 movhu (a2),d2
 mov (36,sp),d0
 sub d0,d2
 asr 5,d2                            /* xa = (ab[i] - ma) >> 5 */
 movhu (a3),d3
 mov (40,sp),d0
 sub d0,d3
 asr 5,d3                            /* xb = (bb[i+lag] - mb) >> 5 */
 mov d2,d0
 mul d3,d0
 mov (44,sp),d1
 add d0,d1
 mov d1,(44,sp)                      /* dot += xa * xb */
 mov d2,d0
 mul d2,d0
 mov (48,sp),d1
 add d0,d1
 mov d1,(48,sp)                      /* ea += xa * xa */
 mov d3,d0
 mul d3,d0
 mov (52,sp),d1
 add d0,d1
 mov d1,(52,sp)                      /* eb += xb * xb */
pdm_corr_next:
 inc a0
 inc a1
 add 2,a2
 add 2,a3
 mov (64,sp),d0
 add -1,d0
 mov d0,(64,sp)
 bne pdm_corr_loop

 mov (44,sp),d0                      /* dot */
 cmp 0,d0
 ble pdm_score_zero
 mov (48,sp),d2                      /* ea */
 cmp PD_MIN_ENERGY,d2
 bcs pdm_score_zero
 mov (52,sp),d3                      /* eb */
 cmp PD_MIN_ENERGY,d3
 bcs pdm_score_zero

 /* Scale d0 (dot), d2 (ea), d3 (eb) right until ea < 32768 && eb < 32768. */
pdm_scale:
 cmp 32768,d2
 bcc pdm_shr
 cmp 32768,d3
 bcs pdm_scaled
pdm_shr:
 lsr 1,d2
 lsr 1,d3
 lsr 1,d0                            /* dot > 0 so lsr == asr */
 bra pdm_scale
pdm_scaled:
 mov d2,d1
 mul d3,d1
 lsr 10,d1                           /* denom = (ea_s * eb_s) >> 10 */
 cmp 0,d1
 beq pdm_score_zero
 mul d0,d0                           /* num = dot_s * dot_s (>= 0) */
 clr d2
 mov d2,mdr
 div d1,d0                           /* sc = num / denom (0..1024) */
 bra pdm_store_score

pdm_score_zero:
 clr d0
pdm_store_score:
 mov (32,sp),d1                      /* cur_idx */
 asl2 d1
 mov PD_SCORES,a0
 add d1,a0
 mov d0,(a0)
 mov (16,sp),d1                      /* best_sc */
 cmp d1,d0
 ble pdm_next_lag
 mov d0,(16,sp)                      /* best_sc */
 mov (32,sp),d1
 mov d1,(20,sp)                      /* best_lag_idx */
 mov (56,sp),d1
 mov d1,(24,sp)                      /* best_cnt */
 mov (48,sp),d1
 mov d1,(28,sp)                      /* best_ea */
pdm_next_lag:
 mov (32,sp),d0
 inc d0
 mov d0,(32,sp)
 cmp PD_NUM_LAGS,d0
 bcs pdm_lag_loop

 /* Pass 4: parabolic sub-bin refinement (1-px resolution from 2-px bins). */
 mov (20,sp),d2                      /* best_lag_idx */
 mov d2,d3
 add -PD_MAX_LAG,d3
 asl 1,d3                            /* lag_px = (best_lag_idx - 24) * 2 */
 cmp 0,d2
 beq pdm_no_sub
 cmp PD_NUM_LAGS-1,d2
 bcc pdm_no_sub
 asl2 d2
 mov PD_SCORES,a0
 add d2,a0
 mov (-4,a0),d1                      /* sL */
 cmp 0,d1
 ble pdm_no_sub
 mov (4,a0),d2                       /* sR */
 cmp 0,d2
 ble pdm_no_sub
 mov (a0),d0                         /* sC */
 asl 1,d0                            /* 2 * sC */
 sub d1,d0
 sub d2,d0                           /* den = 2*sC - sL - sR */
 cmp 0,d0
 ble pdm_no_sub
 mov d0,(44,sp)                      /* save den */
 mov d2,d0
 sub d1,d0                           /* sR - sL (signed) */
 ext d0                              /* sign-extend d0 into mdr for signed div */
 mov (44,sp),d1                      /* den (> 0) */
 div d1,d0                           /* sub_px */
 cmp 1,d0
 ble 1f
 mov 1,d0
1:
 cmp -1,d0
 bge 2f
 mov -1,d0
2:
 add d0,d3                           /* lag_px += sub_px */
pdm_no_sub:
 mov d3,(PD_LAG_RAW)
 mov (16,sp),d0
 mov d0,(PD_SCORE)
 mov (24,sp),d1
 mov d1,(PD_CNT)
 mov (28,sp),d1
 mov d1,(PD_EA)
 cmp PD_MIN_SCORE,d0
 blt pdm_low_conf
 mov 1,d0
 ret [d2,d3,a2,a3],88
pdm_fail:
 clr d0
 mov d0,(PD_SCORE)
 mov d0,(PD_CNT)
 mov d0,(PD_EA)
pdm_low_conf:
 clr d0
 ret [d2,d3,a2,a3],88

/* Quantize filtered lag_px (d0) with hysteresis against current shift (d1).
 * a0 = ascending positive threshold table (u32[max_s]), d2 = max_s.
 * Returns d0 = new signed shift in [-max_s..+max_s].
 * Frame: [d2,d3,a2,a3],32 (locals (4..8,sp); saved regs at (16..28,sp))
 */
fs_pdaf_quant:
 mov d0,d3                           /* signed lag_px */
 mov d1,a2                           /* cur_s */
 mov a0,a3                           /* table */
 /* abs_lag = |lag_px|, sign = (lag_px < 0) ? -1 : +1 */
 cmp 0,d3
 bge 1f
 clr d0
 sub d3,d0                           /* abs_lag */
 mov -1,d1                           /* sign = -1 */
 bra 2f
1:
 mov d3,d0                           /* abs_lag */
 mov 1,d1                            /* sign = +1 */
2:
 mov d0,(4,sp)                       /* abs_lag */
 mov d1,(8,sp)                       /* sign */
 /* Compute raw unsigned magnitude raw_m in 0..max_s. */
 clr d3                              /* raw_m = 0 */
 mov a3,a0
3:
 cmp d2,d3
 bcc 4f
 mov (a0),d1                         /* T[raw_m] */
 cmp d1,d0
 bcs 4f
 inc d3
 add 4,a0
 bra 3b
4:
 /* raw_s = (sign < 0) ? -raw_m : raw_m */
 mov (8,sp),d1
 cmp 0,d1
 bge 5f
 clr d0
 sub d3,d0
 bra 6f
5:
 mov d3,d0
6:
 /* d0 = raw_s, d3 = raw_m, a2 = cur_s. If raw_s == cur_s -> keep cur_s. */
 mov a2,d1                           /* cur_s */
 cmp d1,d0
 beq pdq_keep
 /* If cur_s != 0 and signs differ (crossed 0 directly), accept raw_s immediately. */
 cmp 0,d1
 beq pdq_check_out
 mov d1,d2
 xor d0,d2
 cmp 0,d2
 blt pdq_accept                      /* opposite signs */
 /* Same sign (or cur_s == 0): compute cur_m = |cur_s|. */
 cmp 0,d1
 bge 7f
 clr d2
 sub d1,d2
 bra 8f
7:
 mov d1,d2                           /* cur_m */
8:
 /* If raw_m > cur_m (moving away from 0): require abs_lag >= T[cur_m] + 2. */
 cmp d2,d3
 bhi pdq_check_out_m
 /* Moving toward 0 (raw_m < cur_m): require abs_lag <= T[cur_m - 1] - 1. */
 add -1,d2
 asl2 d2
 mov a3,a0
 add d2,a0
 mov (a0),d2                         /* T[cur_m - 1] */
 add -1,d2
 mov (4,sp),d1                       /* abs_lag */
 cmp d2,d1
 ble pdq_accept
 bra pdq_keep
pdq_check_out:
 clr d2                              /* cur_m = 0 */
pdq_check_out_m:
 asl2 d2
 mov a3,a0
 add d2,a0
 mov (a0),d2                         /* T[cur_m] */
 add 2,d2                            /* +2 px hysteresis to step outward */
 mov (4,sp),d1                       /* abs_lag */
 cmp d2,d1
 bge pdq_accept
pdq_keep:
 mov a2,d0
pdq_accept:
 ret [d2,d3,a2,a3],32

/* Live per-frame PDAF update (called from fs_tick on dumb manual lens).
 * Returns d0 = 1 if PD_VALID == 1, 0 if low confidence.
 * Frame: [d2,d3,a2,a3],28 (local (4,sp); saved regs at (12..24,sp))
 */
fs_pdaf_live:
 call fs_pdaf_measure_raw,[d2,d3,a2,a3],88
 cmp 0,d0
 bne pdl_got_sample
 /* Low confidence: hold last shift up to PD_HOLD_LIMIT frames before clearing PD_VALID. */
 mov (PD_LOW_CNT),d0
 inc d0
 cmp 255,d0
 bls 1f
 mov 255,d0
1:
 mov d0,(PD_LOW_CNT)
 cmp PD_HOLD_LIMIT,d0
 bcs pdl_ret
 clr d0
 mov d0,(PD_VALID)
 bra pdl_ret

pdl_got_sample:
 clr d0
 mov d0,(PD_LOW_CNT)
 mov 1,d0
 mov d0,(PD_VALID)
 mov (PD_LAG_RAW),d0
 mov (PD_SEEDED),d1
 cmp 0,d1
 bne pdl_med3
 /* First valid sample: seed median ring and EMA directly. */
 mov d0,(PD_MED0)
 mov d0,(PD_MED1)
 mov d0,(PD_MED2)
 asl 2,d0
 mov d0,(PD_LAG_EMA)
 mov 1,d1
 mov d1,(PD_SEEDED)
 mov (PD_LAG_RAW),d0
 bra pdl_quant

pdl_med3:
 /* Fast 1-frame adaptive EMA in quarter-pixels (no 3-frame median lag):
  * |diff| > 4 px -> alpha = 0.75 (step = diff - diff/4); else alpha = 0.50. */
 asl 2,d0                            /* target_q2 */
 mov (PD_LAG_EMA),d1                 /* ema_q2 */
 mov d0,d2
 sub d1,d2                           /* diff = target_q2 - ema_q2 */
 mov d2,d3
 cmp 0,d3
 bge 5f
 clr d0
 sub d3,d0
 mov d0,d3                           /* |diff| */
5:
 cmp 16,d3
 ble 6f
 /* Fast ring motion (> 4 px): step = diff - (diff >> 2) (alpha = 0.75). */
 mov d2,d0
 asr 2,d0
 sub d0,d2
 bra 7f
6:
 /* Fine focus or stopped ring: alpha = 0.50 with rounding. */
 cmp 0,d2
 bge 61f
 add -1,d2
 bra 62f
61:
 add 1,d2
62:
 asr 1,d2
7:
 add d2,d1
 mov d1,(PD_LAG_EMA)
 /* Rounded integer lag_px = (ema_q2 +- 2) >> 2. */
 mov d1,d0
 cmp 0,d0
 bge 8f
 add -2,d0
 bra 9f
8:
 add 2,d0
9:
 asr 2,d0

pdl_quant:
 mov (PD_SPLIT_S),d1
 mov pd_thresh_split,a0
 mov 6,d2
 call fs_pdaf_quant,[d2,d3,a2,a3],32
 mov d0,(PD_SPLIT_S)

 /* Test 22: MF focus-lock green blink + double-beep state machine.
  * Decrement visual flash & cooldown timers every frame. */
 mov (FS_GREEN_TICKS),d0
 cmp 0,d0
 ble 1f
 add -1,d0
 mov d0,(FS_GREEN_TICKS)
1:
 mov (PD_LOCK_COOLDOWN),d0
 cmp 0,d0
 ble 2f
 add -1,d0
 mov d0,(PD_LOCK_COOLDOWN)
2:
 mov (PD_VALID),d0
 cmp 1,d0
 bne pdl_ret
 mov (PD_SPLIT_S),d0
 cmp 0,d0
 beq pdl_in_focus

 /* Out of focus: re-arm if |PD_SPLIT_S| >= 2, or cooldown expired while defocused. */
 cmp 2,d0
 bge pdl_rearm
 cmp -2,d0
 ble pdl_rearm
 mov (PD_LOCK_COOLDOWN),d0
 cmp 0,d0
 bne pdl_ret
pdl_rearm:
 mov 1,d0
 mov d0,(PD_LOCK_ARMED)
 bra pdl_ret

pdl_in_focus:
 mov (PD_LOCK_ARMED),d0
 cmp 0,d0
 beq pdl_ret
 /* Require 2 consecutive in-focus frames (PD_LOCK_ARMED >= 2) before chime/blink. */
 cmp 2,d0
 bge 1f
 add 1,d0
 mov d0,(PD_LOCK_ARMED)
 bra pdl_ret
1:
 mov (PD_LOCK_COOLDOWN),d0
 cmp 0,d0
 bne pdl_ret
 clr d0
 mov d0,(PD_LOCK_ARMED)
 mov 45,d0
 mov d0,(PD_LOCK_COOLDOWN)
 mov 6,d0
 mov d0,(FS_GREEN_TICKS)
 mov (MF_BEEP_REQ),d0
 add 1,d0
 mov d0,(MF_BEEP_REQ)

pdl_ret:
 mov (PD_VALID),d0
 ret [d2,d3,a2,a3],28

.balign 4
pd_thresh_split:
 .long 2,5,9,14,20,28
.balign 4
pd_ab: .space 384,0
pd_bb: .space 384,0
pd_ok: .space 192,0
pd_scores: .space 196,0
.balign 4
pd_live_state: .space 64,0
