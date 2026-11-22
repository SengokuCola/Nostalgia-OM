/* MF Assist custom menu settings (Test 26):
 * Adds 3 native menu rows to AF -> 2. MF -> MF Assist (mode 0x114, 0x6158f0e4):
 *   MFB + 0 (0x7d80): Split-Image Focus ("裂像对焦")   0 = Off, 1 = On (default 1)
 *   MFB + 1 (0x7d81): MF Focus Beep     ("合焦提示音") 0 = Off, 1 = On (default 1)
 *   MFB + 2 (0x7d82): MF Focus Offset   ("合焦微调")   0..10 -> -5..+5 (default 5 = 0)
 * Persisted in unused tail of settings store M at M + 0x3C100 ('OM3M', CRC-32),
 * identical to screeninfo.s ('OM3I' at M + 0x3C000). */
 .set MFB, 0x7d80
 .set MF_N, 3
 .set MF_C, 0x6295c800            /* M image 0x62920700 + 0x3C100 (free: SI_C ends +0x3C028, SS_C starts +0x3D000) */
 .set MF_U, 0xa295c800
 .set MF_MAGIC, 0x4d334d4f        /* "OM3M" */
 .set MF_VER, 1
 .set MF_LEN, 24                  /* +0 magic, +4 u16 ver, +6 u16 len, +8 CRC-32 of 12..23, +12 split, +16 beep, +20 ofs */

 .set ST_MF_SPLIT, 0x7f70         /* "裂像对焦" */
 .set ST_MF_BEEP,  0x7f71         /* "合焦提示音" */
 .set ST_MF_OFS,   0x7f72         /* "合焦微调" */
 .set ST_MF_V0,    0x7f73         /* "-5" .. "+5" (11 strings: 0x7f73 .. 0x7f7d) */
 .set ST_MF_END,   0x7f7e

 .macro MFCHK to                  /* d0 in MFB..MFB+MF_N-1 -> jmp \to (flags only) */
 cmp MFB,d0
 bcs 78f
 cmp MFB + MF_N,d0
 bcc 78f
 jmp \to
78:
 .endm
