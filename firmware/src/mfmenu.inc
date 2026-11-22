/* MF Assist + Computational Modes (Cyber Card & Film Filter) custom menu settings (Test 32):
 *   AF -> 7. MF -> MF Assist (mode 0x11a, 0x6158f15c):
 *     MFB + 0 (0x7d80): Split-Image Focus ("分像对焦") 0 = 关, 1 = 开 (default 1)
 *     MFB + 1 (0x7d81): MF Focus Offset   ("合焦微调") 0..10 -> -5..+5 (default 5 = 0)
 *   Cam2 -> 1. Computational Modes (0x61587bd0 / 0x61529544 / 0x6150fcb0):
 *     MFB + 2 (0x7d82): Cyber Card        ("图卡")     0 = 关, 1..5 = 卡1..卡5 (default 0)
 *     MFB + 3 (0x7d83): Cyber Card Pos    ("图卡位置") 0 = 左下, 1 = 居中, 2 = 右下 (default 2)
 *     MFB + 4 (0x7d84): Cyber Card Prev   ("图卡预览") 0 = 关, 1 = 开 (default 1)
 *     MFB + 5 (0x7d85): Film Filter       ("滤镜选择") 0 = 全部开, 1..20 = toggle FILM 1..20
 * Persisted in unused tail of settings store M at M + 0x3C100 ('OM3M', CRC-32). */
 .set MFB, 0x7d80
 .set MF_N, 6
 .set MF_C, 0x6295c800            /* M image 0x62920700 + 0x3C100 */
 .set MF_U, 0xa295c800
 .set MF_MAGIC, 0x4d334d4f        /* "OM3M" */
 .set MF_VER, 5
 .set MF_LEN, 36                  /* +0 magic, +4 ver, +6 len, +8 CRC, +12 split, +16 ofs, +20 card, +24 pos, +28 prev, +32 flmask */

 .set ST_MF_SPLIT, 0x7f70         /* "分像对焦" */
 .set ST_MF_OFS,   0x7f71         /* "合焦微调" */
 .set ST_MF_V0,    0x7f72         /* "-5" .. "+5" (11 strings: 0x7f72 .. 0x7f7c) */
 .set ST_MF_CARD,  0x7f7d         /* "图卡" */
 .set ST_MF_POS,   0x7f7e         /* "图卡位置" */
 .set ST_MF_C1,    0x7f7f         /* "卡1" .. "卡5" (5 strings: 0x7f7f .. 0x7f83) */
 .set ST_MF_P0,    0x7f84         /* "左下", "居中", "右下" (3 strings: 0x7f84 .. 0x7f86) */
 .set ST_MF_PREV,  0x7f87         /* "图卡预览" */
 .set ST_MF_FL,    0x7f88         /* "滤镜选择" */
 .set ST_MF_FLALL, 0x7f89         /* "全部开" */
 .set ST_MF_S_END, 0x7f8a         /* end of static table mf_strs */
 .set ST_MF_FLCNT, 0x7f8a         /* dynamic "NN/20" enabled count */
 .set ST_MF_FL0,   0x7f8b         /* dynamic "[开] 1:Name" .. "[关] 20:Name" (20 strings: 0x7f8b .. 0x7f9e) */
 .set ST_MF_END,   0x7f9f

 .macro MFCHK to                  /* d0 in MFB..MFB+MF_N-1 -> jmp \to (flags only) */
 cmp MFB,d0
 bcs 78f
 cmp MFB + MF_N,d0
 bcc 78f
 jmp \to
78:
 .endm
