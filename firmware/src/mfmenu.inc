/* MF Assist + Cyber Card custom menu settings (Test 31):
 * Adds 4 native menu rows to AF -> 7. MF -> MF Assist (mode 0x11a, 0x6158f15c):
 *   MFB + 0 (0x7d80): Split-Image Focus ("分像对焦") 0 = 关, 1 = 开 (default 1)
 *   MFB + 1 (0x7d81): MF Focus Offset   ("合焦微调") 0..10 -> -5..+5 (default 5 = 0)
 *   MFB + 2 (0x7d82): Cyber Card        ("透卡")     0 = 关, 1..5 = 卡1..卡5 (default 0)
 *   MFB + 3 (0x7d83): Cyber Card Pos    ("透卡位置") 0 = 左下, 1 = 居中, 2 = 右下 (default 2)
 * Persisted in unused tail of settings store M at M + 0x3C100 ('OM3M', CRC-32). */
 .set MFB, 0x7d80
 .set MF_N, 4
 .set MF_C, 0x6295c800            /* M image 0x62920700 + 0x3C100 */
 .set MF_U, 0xa295c800
 .set MF_MAGIC, 0x4d334d4f        /* "OM3M" */
 .set MF_VER, 4
 .set MF_LEN, 28                  /* +0 magic, +4 ver, +6 len, +8 CRC, +12 split, +16 ofs, +20 card, +24 pos */

 .set ST_MF_SPLIT, 0x7f70         /* "分像对焦" */
 .set ST_MF_OFS,   0x7f71         /* "合焦微调" */
 .set ST_MF_V0,    0x7f72         /* "-5" .. "+5" (11 strings: 0x7f72 .. 0x7f7c) */
 .set ST_MF_CARD,  0x7f7d         /* "透卡" */
 .set ST_MF_POS,   0x7f7e         /* "透卡位置" */
 .set ST_MF_C1,    0x7f7f         /* "卡1" .. "卡5" (5 strings: 0x7f7f .. 0x7f83) */
 .set ST_MF_P0,    0x7f84         /* "左下", "居中", "右下" (3 strings: 0x7f84 .. 0x7f86) */
 .set ST_MF_END,   0x7f87

 .macro MFCHK to                  /* d0 in MFB..MFB+MF_N-1 -> jmp \to (flags only) */
 cmp MFB,d0
 bcs 78f
 cmp MFB + MF_N,d0
 bcc 78f
 jmp \to
78:
 .endm
