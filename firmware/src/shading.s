/* ================================================================== Gentler Shading s1 (#22, 2026-11-18; feature/gentler-shading)
 * Our own code. Owner (2026-11-18): "the +2 and -2 options are fine, but they should be at the max end. aka, it gets
 * too strong, too quick." The camera's Shading sets the corners' fade with a mask whose strength we could not reach
 * (probes s1 / s2, research/NOTES.md), so on our COLOR looks' stills the code block's xb_cap takes the Shading level
 * (the camera's current-mode Shading, getter key 0xf7c9) and clears the capture's own copy (capture +37722, which the
 * request builder copies to the development's +1752): the camera develops the still as with Shading 0, and xb_gs runs
 * this pass on the finished picture (buffer 0x1000, YCbYCr 4:2:2 as hl_run / bd_run take it) after halation and
 * grain, before the Border. Live view, video and RAW files are not touched.
 *
 * The vignette (firmware/shading.py is the exact model; research/shading/emu_check.py: bit-exact in om-emu):
 *   X = 4 p + 2 - W, Y = 2 y + 1 - H, S = X^2 + Y^2 (half pixels from the centre), D = W^2 + H^2, C = 2^41 / D,
 *   idx = min(VG_N, (S C) >> 32) ~ 512 r^2, g = 256 - (((L vg_m[idx] + 2) 13108) >> 16), L = |level| 1..5
 *   darker (level < 0): Y' = (Y g + 128) >> 8; lighter: Y' = 255 - (((255 - Y) g + 128) >> 8)
 *   Cb', Cr' = (C g + 32896 - 128 g) >> 8 (toward grey by the same amount)
 * Both Y and both chroma bytes of a pair in two 32-bit multiplies (16-bit lanes; no carry between them, shading.py
 * check). Per photo two tables are built here: vg_gk {g, KC2 = (32896 - 128 g) x 0x10001} per idx, and vg_nx, the
 * smallest S past idx whose g differs (from Sth[i] = ceil(i 2^32 / C), the smallest S of idx i), so a row needs no
 * multiply per pair: it is walked from its centre outwards (the pair right of the centre and its mirror on the left
 * share S), S grows by T and T by 32 a couple, and g is looked up again only when S reaches the next change of g or the
 * row's end. Pairs with g = 256 (the centre) are left as they are.
 * Rows through hl_open as bd_run: several rows per lock (at most VG_LOCKN instructions by the estimate), written through
 * the window's cached view and FLUSHed before the lock goes; a group across the window's edge is retried one row at a
 * time, and a row across it one pair at a time (a pair that cannot be mapped is left as it is). Crop modes: the part
 * of the buffer the camera keeps (crop.s cr_bdc, as the Border), so the corners are the photo's own. */
.section .ext13,"ax"
 .include "vg_tab.inc"
 .set VG_LOCKN, 120000            /* instructions under one lock, at most (by the estimate), as HL_LOCKN */
 .set VG_PAIR, 19                 /* the estimate: per pair (two pairs a turn, 35..37 instructions), and per row */
 .set VG_ROW, 4000                /* (set-up, the changes of g: about 25 instructions each, up to ~120 a row) */

 .macro VGP r, lt                 /* one pair at (\r): d2 = g, d3 = KC2; uses d0, d1 (MDR) */
 mov (\r),d0
 mov d0,d1
 .if \lt
 xor 0x00ff00ff,d0                /* lighter: 255 - Y in the Y lanes */
 .endif
 and 0x00ff00ff,d0                /* Y0, Y1 */
 lsr 8,d1
 and 0x00ff00ff,d1                /* Cb, Cr */
 mulu d2,d0
 mulu d2,d1
 add 0x00800080,d0
 add d3,d1
 lsr 8,d0
 and 0x00ff00ff,d0
 .if \lt
 xor 0x00ff00ff,d0
 .endif
 and 0xff00ff00,d1
 or d1,d0
 mov d0,(\r)
 .endm

 .macro VGROW lt                  /* a row from its centre: a0 right, a1 left, a2 S, a3 T, d1 = idx of S;
                                     (80) S at the row's end, (56) the next change of g; d2 g, d3 KC2 */
 bra 57f
59:                               /* the centre (g = 256): pointers and S only */
 add 4,a0
 add -4,a1
 add a3,a2                        /* S of the next couple: X +- 4 */
 add 32,a3
 mov (56,sp),d0
 cmp d0,a2
 bcs 59b
 bra 50f
60:
 VGP a0,\lt
 VGP a1,\lt
 add 4,a0
 add -4,a1
 add a3,a2
 add 32,a3
 mov (56,sp),d0
 cmp d0,a2
 bcs 60b
50:                               /* S reached the next change of g, or the row's end */
 mov (80,sp),d0
 cmp d0,a2
 bcc 58f
 mov a2,d0                        /* idx of S */
 mov (28,sp),d1
 mulu d1,d0
 mov mdr,d1
 cmp VG_N,d1
 bls 57f
 mov VG_N,d1
57:                               /* idx d1: g, KC2, and the S where g next changes (at most the row's end) */
 mov a3,(76,sp)
 mov d1,d0
 asl2 d0
 mov vg_nx,a3
 mov (d0,a3),d0
 mov (80,sp),a3
 cmp a3,d0
 bls 56f
 mov a3,d0
56:
 mov d0,(56,sp)
 asl 3,d1
 mov vg_gk,a3
 mov (d1,a3),d2
 mov vg_gk + 4,a3
 mov (d1,a3),d3
 mov (76,sp),a3
 cmp 256,d2
 beq 59b
 jmp 60b
58:
 .endm

/* vg_run: `call vg_run,[d2,d3,a2,a3],104`, a0 = buffer record, d0 = level -5..-1 (darker) / 1..5 (lighter); anything
 * else, or a buffer it does not take (format 0x0c02, W 64..8192 and a multiple of 4, memHw >= W, H 64..8192): nothing.
 * Locals: (0) call slot, (4) rec, (8) P = W / 2 pairs, (12) H, (16) pitch, (20) bus (cr_bdc reads and sets 8..20, as
 * bd_run's), (24) level, (28) C, (32) y, (36) K rows per lock, (40) rows left in this group, (44) token, (48) cached,
 * (52) the row's CPU address, (56) the next change of g (or the row's end), (64) L, (72) the start time, (76) a3
 * kept, (80) S at the row's end / p (one pair at a time), (84) Y^2. */
vg_run:
 mov a0,(4,sp)
 mov d0,(24,sp)
 mov (USCLK),d1
 mov d1,(72,sp)
 cmp 0,d0
 bge 1f
 clr d1
 sub d0,d1
 mov d1,d0
1:
 cmp 1,d0
 bcs 99f
 cmp 5,d0
 bhi 99f
 mov d0,(64,sp)                   /* L */
 movhu (16,a0),d0                 /* format 0x0c02 only (as hl_run) */
 cmp 0x0c02,d0
 bne 99f
 mov (4,a0),d0
 cmp 0,d0
 bne 99f
 movhu (20,a0),d0                 /* W: 64 .. 8192, a multiple of 4 */
 cmp 64,d0
 bcs 99f
 cmp 8193,d0
 bcc 99f
 btst 3,d0
 bne 99f
 mov d0,a2
 lsr 1,d0
 mov d0,(8,sp)                    /* P */
 movhu (18,a0),d1                 /* memHw >= W */
 cmp a2,d1
 bcs 99f
 add d1,d1
 mov d1,(16,sp)                   /* pitch */
 movhu (22,a0),d1                 /* H: 64 .. 8192 */
 cmp 64,d1
 bcs 99f
 cmp 8193,d1
 bcc 99f
 mov d1,(12,sp)
 mov (a0),d0
 mov d0,(20,sp)                   /* bus */
 mov a2,d0                        /* crop modes: the part the camera keeps (crop.s cr_bdc, as bd_run) */
 mov sp,a0
 call cr_bdc,[d2,d3,a2,a3],28
 mov d0,d1                        /* D = W^2 + H^2 (at most 2^27) */
 mul d1,d0
 mov (12,sp),d1
 mov d1,d2
 mul d2,d1
 add d0,d1
 mov 512,d0                       /* C = 2^41 / D */
 mov d0,mdr
 clr d0
 divu d1,d0
 mov d0,(28,sp)

 mov vg_m,a1                      /* vg_gk[i] = {g, KC2} */
 mov vg_gk,a0
 mov (64,sp),d2
 mov 13108,d3
 clr d1
3:
 movbu (d1,a1),d0
 mul d2,d0
 add 2,d0
 mul d3,d0
 lsr 16,d0
 mov d0,a2
 mov 256,d0
 sub a2,d0                        /* g */
 mov d0,(a0)
 asl 7,d0
 mov d0,a2
 mov 0x8080,d0
 sub a2,d0                        /* 32896 - 128 g */
 mov d0,a2
 asl 16,d0
 add a2,d0
 mov d0,(4,a0)
 add 8,a0
 inc d1
 cmp VG_N,d1
 bls 3b

 mov vg_nx + 4 * VG_N,a0          /* vg_nx[i]: the S where g next changes past idx i (all ones: never) */
 mov -1,d0
 mov d0,(a0)
 mov VG_N - 1,d2
 mov vg_gk + 8 * (VG_N - 1),a1
5:
 mov (a1),d0
 mov (8,a1),d1
 cmp d0,d1
 bne 6f
 mov (a0),d0                      /* g[i + 1] = g[i]: as past i + 1 */
 bra 7f
6:
 mov d2,d0                        /* Sth[i + 1] = ceil((i + 1) 2^32 / C) */
 inc d0
 mov d0,mdr
 mov (28,sp),d3
 mov d3,d0
 add -1,d0
 divu d3,d0
7:
 add -4,a0
 mov d0,(a0)
 add -8,a1
 add -1,d2
 bge 5b

 mov (8,sp),d0                    /* K = max(1, VG_LOCKN / (VG_PAIR P + VG_ROW)) */
 mov VG_PAIR,d1
 mul d1,d0
 add VG_ROW,d0
 mov d0,d1
 mov VG_LOCKN,d0
 call hl_div,[d2,d3,a2,a3],20
 cmp 1,d0
 bcc 4f
 mov 1,d0
4:
 mov d0,(36,sp)
 clr d0
 mov d0,(32,sp)

20:                               /* ---- a group: min(K, rows left) */
 mov (32,sp),d0
 mov (12,sp),d1
 cmp d1,d0
 bcc 90f
 sub d0,d1
 mov (36,sp),d0
 cmp d0,d1
 bcc 21f
 mov d1,d0
21:
 mov d0,(40,sp)
22:
 mov (40,sp),d1                   /* (k - 1) pitch + 4 P bytes from row y */
 add -1,d1
 mov (16,sp),d0
 mul d0,d1
 mov (8,sp),d0
 asl2 d0
 add d0,d1
 mov (32,sp),d0
 mov (16,sp),d3
 mul d3,d0
 mov (20,sp),d3
 add d3,d0
 call hl_open,[d2,d3,a2,a3],28
 mov d0,(44,sp)
 cmp 0,a0
 bne 23f
 mov (44,sp),d0                   /* across the window's edge */
 call UNLOCK,[d2],8
 mov (40,sp),d0
 cmp 1,d0
 bne 221f
 jmp 70f                          /* one row: a pair at a time */
221:
 mov 1,d0
 mov d0,(40,sp)
 bra 22b
23:
 mov a0,d0
 clr d1
 cmp 0xb8000000,d0
 bcs 24f
 add -0x40000000,d0               /* the window's cached view */
 mov 1,d1
24:
 mov d1,(48,sp)
 mov d0,(52,sp)

25:                               /* ---- a row: S, T and idx at its centre couple, S at its end */
 mov (32,sp),d0
 add d0,d0
 inc d0
 mov (12,sp),d1
 sub d1,d0                        /* Y = 2 y + 1 - H */
 mov d0,d1
 mul d1,d0
 mov d0,(84,sp)                   /* Y^2 */
 add 4,d0                         /* S of pairs P / 2 and P / 2 - 1 (X = +-2) */
 mov d0,a2
 mov 32,a3                        /* T: S(X + 4) - S(X) = 8 X + 16, X = 2 */
 mov (8,sp),d1                    /* the row's end: X = W + 2 */
 add d1,d1
 add 2,d1
 mov d1,d0
 mul d0,d1
 mov (84,sp),d0
 add d0,d1
 mov d1,(80,sp)
 mov (52,sp),d0
 mov (8,sp),d1
 add d1,d1                        /* 2 P bytes = pair P / 2 */
 add d1,d0
 mov d0,a0
 mov d0,a1
 add -4,a1
 mov a2,d0                        /* idx */
 mov (28,sp),d1
 mulu d1,d0
 mov mdr,d1
 cmp VG_N,d1
 bls 31f
 mov VG_N,d1
31:
 mov (24,sp),d0
 cmp 0,d0
 blt 32f
 VGROW 1
 jmp 33f
32:
 VGROW 0
33:
 mov (52,sp),d0
 mov (16,sp),d1
 add d1,d0
 mov d0,(52,sp)
 mov (32,sp),d0
 inc d0
 mov d0,(32,sp)
 mov (40,sp),d0
 add -1,d0
 mov d0,(40,sp)
 beq 34f
 jmp 25b
34:
 mov (48,sp),d0
 cmp 0,d0
 beq 35f
 call FLUSH,[d2,d3],16
35:
 mov (44,sp),d0
 call UNLOCK,[d2],8
 jmp 20b

70:                               /* ---- the row across the window's edge: each pair on its own */
 mov (32,sp),d0
 add d0,d0
 inc d0
 mov (12,sp),d1
 sub d1,d0
 mov d0,d1
 mul d1,d0
 mov d0,(84,sp)                   /* Y^2 */
 clr d0
 mov d0,(80,sp)
71:
 mov (80,sp),d0
 mov (8,sp),d1
 cmp d1,d0
 bcc 79f
 asl2 d0
 add 2,d0
 add d1,d1
 sub d1,d0                        /* X = 4 p + 2 - W */
 mov d0,d1
 mul d1,d0
 mov (84,sp),d1
 add d1,d0                        /* S */
 mov (28,sp),d1
 mulu d1,d0
 mov mdr,d0
 cmp VG_N,d0
 bls 72f
 mov VG_N,d0
72:
 asl 3,d0
 mov vg_gk,a0
 mov (d0,a0),d2
 mov vg_gk + 4,a0
 mov (d0,a0),d3
 mov (32,sp),d0                   /* bus + y pitch + 4 p, 4 bytes */
 mov (16,sp),d1
 mul d1,d0
 mov (20,sp),d1
 add d1,d0
 mov (80,sp),d1
 asl2 d1
 add d1,d0
 mov 4,d1
 call hl_open,[d2,d3,a2,a3],28
 mov d0,(44,sp)
 cmp 0,a0
 beq 77f                          /* not even this pair: left as it is */
 mov a0,d0
 clr d1
 cmp 0xb8000000,d0
 bcs 73f
 add -0x40000000,d0
 mov 1,d1
73:
 mov d1,(48,sp)
 mov d0,a0
 cmp 256,d2
 beq 77f
 mov (24,sp),d0
 cmp 0,d0
 blt 74f
 VGP a0,1
 bra 75f
74:
 VGP a0,0
75:
 mov (48,sp),d0
 cmp 0,d0
 beq 77f
 call FLUSH,[d2,d3],16
77:
 mov (44,sp),d0
 call UNLOCK,[d2],8
 mov (80,sp),d0
 inc d0
 mov d0,(80,sp)
 jmp 71b
79:
 mov (32,sp),d0
 inc d0
 mov d0,(32,sp)
 jmp 20b

90:                               /* done: the time (ms, as tg_fill's) and the counters for the debug log */
 mov (72,sp),d0
 mov (USCLK),d1
 sub d1,d0
 and 0x7fffffff,d0
 lsr 4,d0
 mov 1049,d1
 mul d1,d0
 lsr 16,d0
 mov d0,(vg_ms)
 mov (vg_n),d0
 inc d0
 mov d0,(vg_n)
 mov (24,sp),d0
 movbu d0,(vg_lvc)
99:
 ret [d2,d3,a2,a3],104

 .balign 4
vg_n:                             /* stills drawn this power-on */
 .long 0
vg_ms:                            /* the last one's time in ms */
 .long 0
vg_nt:                            /* stills whose Shading the code block's xb_cap took over */
 .long 0
vg_nd:                            /* ... of which the capture's own byte (+37722) differed from the setting */
 .long 0
vg_lvl:                           /* the level xb_cap took over for this still (-5..5, 0 none); xb_gs reads it */
 .byte 0
vg_lvc:                           /* the last level drawn (log) */
 .byte 0
 .balign 4
vg_nx:                            /* the next change of g past each idx, for this photo */
 .space 4 * VG_N + 4
vg_gk:                            /* {g, KC2} per idx for this photo's level */
 .space 8 * VG_N + 8
vg_l1:
 .asciz "\r\nShading (gentler s1): photos "
vg_l2:
 .asciz ", taken over "
vg_l3:
 .asciz ", capture byte differed "
vg_l4:
 .asciz ", last level "
vg_l5:
 .asciz ", last time (ms) "
vg_mi:
 .asciz "-"
 .balign 4
