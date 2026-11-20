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
 * All fast-path gates live in .ext4 (same loader section as all 3 hook sites).
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

.section .ext13,"ax"
.balign 4
zaf_lv_cnt: .long 0
zaf_eng_cnt: .long 0
zaf_llk1_cnt: .long 0
.set ZAF_LV_CNT,zaf_lv_cnt+0x40000000
.set ZAF_ENG_CNT,zaf_eng_cnt+0x40000000
.set ZAF_LLK1_CNT,zaf_llk1_cnt+0x40000000

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
