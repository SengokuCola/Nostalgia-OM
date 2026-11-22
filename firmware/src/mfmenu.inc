/* MF Assist custom menu settings (Test 26-28):
 * Adds 4 native menu rows to AF -> 7. MF -> MF Assist (mode 0x11a, 0x6158f15c):
 *   MFB + 0 (0x7d80): Split-Image Focus ("分像对焦")   0 = 关, 1 = 准星, 2 = 分像 (default 2)
 *   MFB + 1 (0x7d81): MF Focus Beep     ("合焦提示音") 0 = 关, 1 = 开 (default 1)
 *   MFB + 2 (0x7d82): MF Focus Offset   ("合焦微调")   0..10 -> -5..+5 (default 5 = 0)
 *   MFB + 3 (0x7d83): Reticle Size      ("准星尺寸")   0 = 小(48), 1 = 中(80), 2 = 大(112) (default 1)
 * Persisted in unused tail of settings store M at M + 0x3C100 ('OM3M', CRC-32),
 * identical to screeninfo.s ('OM3I' at M + 0x3C000). */
 .set MFB, 0x7d80
 .set MF_N, 4
 .set MF_C, 0x6295c800            /* M image 0x62920700 + 0x3C100 (free: SI_C ends +0x3C028, SS_C starts +0x3D000) */
 .set MF_U, 0xa295c800
 .set MF_MAGIC, 0x4d334d4f        /* "OM3M" */
 .set MF_VER, 2
 .set MF_LEN, 28                  /* +0 magic, +4 u16 ver, +6 u16 len, +8 CRC-32 of 12..27, +12 split, +16 beep, +20 ofs, +24 size */

 .set ST_MF_SPLIT, 0x7f70         /* "分像对焦" */
 .set ST_MF_BEEP,  0x7f71         /* "合焦提示音" */
 .set ST_MF_OFS,   0x7f72         /* "合焦微调" */
 .set ST_MF_V0,    0x7f73         /* "-5" .. "+5" (11 strings: 0x7f73 .. 0x7f7d) */
 .set ST_MF_RET,   0x7f7e         /* "准星" */
 .set ST_MF_SPL,   0x7f7f         /* "分像" */
 .set ST_MF_SIZE,  0x7f80         /* "准星尺寸" */
 .set ST_MF_SZ0,   0x7f81         /* "小", "中", "大" (0x7f81 .. 0x7f83) */
 .set ST_MF_END,   0x7f84

 .macro MFCHK to                  /* d0 in MFB..MFB+MF_N-1 -> jmp \to (flags only) */
 cmp MFB,d0
 bcs 78f
 cmp MFB + MF_N,d0
 bcc 78f
 jmp \to
78:
 .endm
