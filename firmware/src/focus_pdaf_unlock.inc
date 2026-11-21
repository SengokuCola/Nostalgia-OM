/* Route A manual-lens PDAF unlock (strictly opt-in via FOCUS.TXT + ZAF.TXT,
 * post-boot card-ready arm only, stills mode only, dumb manual lens only).
 *
 * 1. .hook_zaf_lv   @ 0x609ed0d4 (TAKE_FOCUS 0r starter, 7 B: call 0x602f3231,[],4)
 *    Allows stills-mode 0r (d2 == 0x1700) to pass the lens-mounted gate when
 *    FS_ON==1, SEC_READY&32, PH_MODE!=0, and no electronic lens is mounted.
 *    TAKE_FOCUS's stock stop path (0x609eda66) stops 0x1700 automatically on
 *    menu/shutter/mode-change/power-off with zero extra hooks.
 *
 * 2. .hook_zaf_eng  @ 0x60902150 (fcs_control engine selector, 6 B: movbu d3,(0xa33ca30c))
 *    Forces engine mask 3 (IAF|ZAF) -> 2 (ZAF-only) on dumb manual lenses so
 *    contrast-AF IAF is never woken; only sensor Quad-Pixel PDAF + TruePic X HW
 *    PDAF runs and stops cleanly.
 *
 * 3. .hook_zaf_llk1 @ 0x6098fcc4 (ZAF LLK1 lens-position getter, 7 B)
 *    Returns 0 cleanly instead of asserting in 0x60068a54 when no electronic
 *    lens is mounted and LLK1 is absent (0xa33df455==0) or -32768 sentinel.
 *
 * 4. .hook_zaf_cap  @ 0x6094e4df (DMA post-capture callback, 6 B: movbu (0x62b3d9b4),d0)
 *    On dumb manual lenses, pre-capture 0x6098e67e (lens position sync) returns
 *    nonzero and clears 0x62b3d9b4=0, causing 0x6094e4df to set capture_state=3
 *    and skip 0x6094eb5b (leaving ring_flags stuck at [1,1,1,1]). Returning 1
 *    lets 0x6094eb5b -> 0x609958c9 mark slot flag 1->2 and update latest_slot.
 *
 * 5. .hook_zaf_disp @ 0x6095013d (0x6094fbf4 mount_type==0 branch, 6 B: movbu (0x62b3d938),d0)
 *    Enters the stock lens-free dispatch at 0x60950147 -> 0x60950174 ->
 *    0x60992846(6) so TruePic X HW PDAF wakes up without changing 0x62b3d938.
 *
 * 6. .hook_zaf_lpos @ 0x609901b6 (0x6098c749 lens-pos-valid leaf, 6 B: movbu (0xa33df46c),d0)
 *    Prevents 0x609a592d from looping forever waiting for 0xa33df46c==1 before
 *    running 0x6099ff62 -> 0x60992b3a (HW PDAF) -> 0x6096294b (SW defocus).
 *
 * 7. .hook_zaf_lut  @ 0x609525e3 (0x6095192d Ch0 shading-LUT gate, 7 B: mov (832,a0),d0; btst 1,d0)
 *    On dumb manual lenses, the lens exit-pupil gain LUT at 0x62b3d9f0 / shift
 *    table at 0x62b3d9f4 are all zero, so enabling Ch0 shading multiplies every
 *    sensor Quad-Pixel sample by 0 before DMA-writing ptr_a0. Clearing bit 0 of
 *    (832,a0) and taking beq 0x60952647 disables the zero LUT cleanly (matching
 *    stock templates T[7]/T[9]/T[15]) and restores bit 0 if an electronic lens
 *    is later hot-swapped on.
 *
 * All fast-path gates live in .ext4 (same loader section as all 7 hook sites).
 * Unarmed boot and electronic lenses follow exact stock paths.
 */
.section .hook_zaf_lv,"ax"
 call zaf_lv_entry,[],4

.section .hook_zaf_eng,"ax"
 jmp zaf_eng_entry
 nop

.section .hook_zaf_llk1,"ax"
 jmp zaf_llk1_entry
 nop
 nop

.section .hook_zaf_cap,"ax"
 jmp zaf_cap_entry
 nop

.section .hook_zaf_disp,"ax"
 jmp zaf_disp_entry
 nop

.section .hook_zaf_lpos,"ax"
 jmp zaf_lpos_entry
 nop

.section .hook_zaf_lut,"ax"
 jmp zaf_lut_entry
 nop
 nop

.section .ext4,"ax"
zaf_lv_entry:
 mov (FS_ON),d1
 cmp 1,d1
 bne 1f
 mov (SEC_READY),d1
 and 32,d1
 beq 1f
 jmp zaf_lv_armed
1:
 jmp zaf_stock_lens_ptr

zaf_eng_entry:
 mov (FS_ON),d0
 cmp 1,d0
 bne 1f
 mov (SEC_READY),d0
 and 32,d0
 beq 1f
 jmp zaf_eng_armed
1:
 movbu d3,(0xa33ca30c)
 jmp zaf_eng_resume

zaf_llk1_entry:
 mov d1,d3
 mov (FS_ON),d1
 cmp 1,d1
 bne 1f
 mov (SEC_READY),d1
 and 32,d1
 beq 1f
 jmp zaf_llk1_armed
1:
 movbu (0xa33df455),d1
 jmp zaf_llk1_resume

zaf_cap_entry:
 mov (FS_ON),d0
 cmp 1,d0
 bne 1f
 mov (SEC_READY),d0
 and 32,d0
 beq 1f
 jmp zaf_cap_armed
1:
 movbu (0x62b3d9b4),d0
 jmp zaf_cap_resume

zaf_disp_entry:
 mov (FS_ON),d0
 cmp 1,d0
 bne 1f
 mov (SEC_READY),d0
 and 32,d0
 beq 1f
 jmp zaf_disp_armed
1:
 movbu (0x62b3d938),d0
 jmp zaf_disp_resume

zaf_lpos_entry:
 mov (FS_ON),d0
 cmp 1,d0
 bne 1f
 mov (SEC_READY),d0
 and 32,d0
 beq 1f
 jmp zaf_lpos_armed
1:
 movbu (0xa33df46c),d0
 jmp zaf_lpos_resume

zaf_lut_entry:
 mov (FS_ON),d0
 cmp 1,d0
 bne 1f
 mov (SEC_READY),d0
 and 32,d0
 beq 1f
 jmp zaf_lut_armed
1:
 mov (832,a0),d0
 btst 1,d0
 jmp zaf_lut_resume

.section .ext13,"ax"
.balign 4
zaf_lv_cnt: .long 0
zaf_eng_cnt: .long 0
zaf_llk1_cnt: .long 0
zaf_cap_cnt: .long 0
zaf_disp_cnt: .long 0
zaf_lpos_cnt: .long 0
zaf_lut_cnt: .long 0
zaf_lut_saved: .long 0
.set ZAF_LV_CNT,zaf_lv_cnt+0x40000000
.set ZAF_ENG_CNT,zaf_eng_cnt+0x40000000
.set ZAF_LLK1_CNT,zaf_llk1_cnt+0x40000000
.set ZAF_CAP_CNT,zaf_cap_cnt+0x40000000
.set ZAF_DISP_CNT,zaf_disp_cnt+0x40000000
.set ZAF_LPOS_CNT,zaf_lpos_cnt+0x40000000
.set ZAF_LUT_CNT,zaf_lut_cnt+0x40000000
.set ZAF_LUT_SAVED,zaf_lut_saved+0x40000000

zaf_lv_armed:
 call zaf_stock_lens_ptr,[],4
 cmp 0,a0
 bne 9f                            /* electronic lens mounted -> stock path */
 mov (PH_MODE),d1
 cmp 0,d1
 beq 9f                            /* no ZAF.TXT -> stock path */
 mov d2,d1
 exthu d1
 cmp 0x1700,d1
 bne 9f                            /* stills 0r only, never movie 0x1400 */
 movbu (0xa32d3d32),d1
 cmp 0,d1
 bne 9f
 mov (ZAF_LV_CNT),d1
 inc d1
 mov d1,(ZAF_LV_CNT)
 mov 1,a0
9:
 ret [],4

zaf_eng_armed:
 mov (PH_MODE),d0
 cmp 0,d0
 beq 1f
 movbu (0xa32d3d32),d0
 cmp 0,d0
 bne 1f                            /* electronic lens mounted -> stock mask */
 cmp 3,d3
 bne 1f                            /* only narrow IAF|ZAF (3) -> ZAF-only (2) */
 mov 2,d3
 mov (ZAF_ENG_CNT),d0
 inc d0
 mov d0,(ZAF_ENG_CNT)
1:
 movbu d3,(0xa33ca30c)
 jmp zaf_eng_resume

zaf_llk1_armed:
 mov (PH_MODE),d1
 cmp 0,d1
 beq 1f
 movbu (0xa32d3d32),d1
 cmp 0,d1
 bne 1f                            /* electronic lens mounted -> stock LLK1 */
 movbu (0xa33df455),d1
 cmp 0,d1
 beq 2f
 cmp 0,d0
 beq 3f
 cmp 1,d0
 beq 4f
 bra 2f
3:
 mov (0xa33df460),d1
 cmp -32768,d1
 beq 2f
 bra 1f
4:
 mov (0xa33df45c),d1
 cmp -32768,d1
 beq 2f
 bra 1f
2:
 mov (ZAF_LLK1_CNT),d1
 inc d1
 mov d1,(ZAF_LLK1_CNT)
 clr d0
 ret [d2,d3,a2],44                 /* matches caller 0x6098c726 frame */
1:
 movbu (0xa33df455),d1
 jmp zaf_llk1_resume

zaf_cap_armed:
 mov (PH_MODE),d0
 cmp 0,d0
 beq 1f
 movbu (0xa32d3d32),d0
 cmp 0,d0
 bne 1f
 mov (ZAF_CAP_CNT),d0
 inc d0
 mov d0,(ZAF_CAP_CNT)
 mov 1,d0
 jmp zaf_cap_resume
1:
 movbu (0x62b3d9b4),d0
 jmp zaf_cap_resume

zaf_disp_armed:
 mov (PH_MODE),d0
 cmp 0,d0
 beq 1f
 movbu (0xa32d3d32),d0
 cmp 0,d0
 bne 1f
 mov (ZAF_DISP_CNT),d0
 inc d0
 mov d0,(ZAF_DISP_CNT)
 mov 1,d0
 jmp zaf_disp_resume
1:
 movbu (0x62b3d938),d0
 jmp zaf_disp_resume

zaf_lpos_armed:
 mov (PH_MODE),d0
 cmp 0,d0
 beq 1f
 movbu (0xa32d3d32),d0
 cmp 0,d0
 bne 1f
 mov (ZAF_LPOS_CNT),d0
 inc d0
 mov d0,(ZAF_LPOS_CNT)
 mov 1,d0
 jmp zaf_lpos_resume
1:
 movbu (0xa33df46c),d0
 jmp zaf_lpos_resume

zaf_lut_armed:
 mov (PH_MODE),d0
 cmp 0,d0
 beq 2f
 movbu (0xa32d3d32),d0
 cmp 0,d0
 bne 2f
 /* Dumb manual lens: clear Ch0 shading-LUT enable bit 0 so ISP skips the
  * all-zero exit-pupil gain LUT and writes unattenuated Quad-Pixel samples. */
 mov (832,a0),d0
 btst 1,d0
 beq 1f
 mov a0,(ZAF_LUT_SAVED)
 and -2,d0
 mov d0,(832,a0)
1:
 mov (ZAF_LUT_CNT),d0
 inc d0
 mov d0,(ZAF_LUT_CNT)
 clr d0
 btst 1,d0
 jmp zaf_lut_resume
2:
 /* Stock path (electronic lens or PH_MODE==0): restore bit 0 on hot-swap. */
 mov (ZAF_LUT_SAVED),d0
 cmp 0,d0
 beq 3f
 mov d0,a1
 cmp a0,a1
 bne 3f
 mov (832,a0),d0
 or 1,d0
 mov d0,(832,a0)
 clr d0
 mov d0,(ZAF_LUT_SAVED)
3:
 mov (832,a0),d0
 btst 1,d0
 jmp zaf_lut_resume
