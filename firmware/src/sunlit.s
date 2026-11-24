/* Post-development, full-frame Sunlit Foliage. One private row per invocation.
 * Work in groups of two virtual pixels (489 groups across at camera resolution).
 * A group is fully sampled before overwriting its input. The next vertical band
 * is read before any of its rows are written. No shared mutable image state. */
.section .ext13,"ax"
.balign 4
sun_light:
 .incbin "sunlit.lut",0,16384
sun_palette:
 .incbin "sunlit.lut",16384

/* d0 = Y, d1 = (Cb bin << 10) | (Cr bin << 6); d3 = PRNG state.
 * Returns one packed uniform-colour pair in d0; preserves address registers. */
sun_sample:
 lsr 2,d0
 or d1,d0
 mov sun_light,a0
 movbu (d0,a0),d0
 mov 1664525,d1
 mul d1,d3
 add 1013904223,d3
 mov d3,d1
 lsr 26,d1
 asl 8,d1
 or d1,d0
 asl2 d0
 mov sun_palette,a0
 mov (d0,a0),d0
 ret [],0                         /* mul writes MDR; return via the saved address */

/* Blend packed YCbYCr pair d0 with original pair at (a2) per sharp in d1 (< 0):
 * -1 => 75% Sunlit + 25% orig, -2 => 50/50, -3..-5 => 25% Sunlit + 75% orig.
 * Clobbers d0, d1, a0, a1; preserves d2, d3, a2, a3. */
sun_blend_pair:
 cmp 0,d1
 bge 9f
 mov d2,(4,sp)
 mov d3,(8,sp)
 mov (a2),d2                      /* orig YCbYCr */
 clr d3                           /* result accumulator */
 mov 4,a0                         /* 4 bytes */
 mov d1,a1                        /* sharp (< 0) */
1:
 mov d0,d1
 and 0xff,d1                      /* new_b */
 mov d2,d3
 and 0xff,d3                      /* orig_b */
 cmp -1,a1
 beq 2f
 cmp -2,a1
 beq 3f
 /* -3..-5: (new + 3*orig + 2) >> 2 */
 add d3,d1
 add d3,d1
 add d3,d1
 add 2,d1
 lsr 2,d1
 bra 4f
2:
 /* -1: (3*new + orig + 2) >> 2 */
 add d1,d3
 add d1,d3
 add d1,d3
 add 2,d3
 mov d3,d1
 lsr 2,d1
 bra 4f
3:
 /* -2: (new + orig + 1) >> 1 */
 add d3,d1
 inc d1
 lsr 1,d1
4:
 lsr 8,d0
 lsr 8,d2
 mov (12,sp),d3
 asl 24,d1
 lsr 8,d3
 or d1,d3
 mov d3,(12,sp)
 add -1,a0
 cmp 0,a0
 bne 1b
 mov (12,sp),d0
 mov (4,sp),d2
 mov (8,sp),d3
9:
 ret [],16

/* Parent locals (frame 88): (4..56,sp) core state, (60,sp) sharp (-5..+2),
 * (64,sp) groups_cap, (68,sp) right colour. Saved [d2,d3,a2,a3] at (72..84,sp). */
sun_groups_tbl:
 .long 489,960,320,192

sunlit_run:
 mov d0,d1
 and 0xff,d1
 cmp 1,d1
 bne 99f
 mov d0,d1
 lsr 8,d1
 and 3,d1
 asl2 d1
 mov sun_groups_tbl,a1
 mov (d1,a1),d1
 mov d1,(64,sp)                   /* groups_cap */
 lsr 16,d0
 extb d0
 mov d0,(60,sp)                   /* sharp (-5..+2) */
 movhu (16,a0),d0
 cmp 0x0c02,d0
 bne 99f
 mov (4,a0),d0
 cmp 0,d0
 bne 99f
 movhu (20,a0),d0
 cmp 64,d0
 bcs 99f
 cmp 8192,d0
 bhi 99f
 btst 3,d0
 bne 99f
 movhu (18,a0),d1
 cmp d0,d1
 bcs 99f
 btst 1,d1
 bne 99f
 add d1,d1
 mov d1,(16,sp)
 lsr 1,d0
 mov d0,(8,sp)
 movhu (22,a0),d1
 cmp 64,d1
 bcs 99f
 cmp 8192,d1
 bhi 99f
 mov d1,(12,sp)
 mov (a0),d1
 btst 3,d1
 bne 99f
 mov d1,(20,sp)
 mov d0,d2
 mov (64,sp),d1
 cmp d1,d2
 bls 1f
 mov d1,d2
1:
 mov d2,(28,sp)
 clr d1
 mov d1,mdr
 divu d2,d0
 mov d0,(32,sp)
 mov mdr,d1
 mov d1,(36,sp)
 mov (8,sp),d0
 mov d0,(40,sp)                  /* first row starts a band */
 asl2 d0
 call malloc,[],4
 cmp 0,a0
 beq 99f
 mov a0,(24,sp)
 mov 21760,d0
 mov d0,(44,sp)
 call FLUSH,[d2,d3],16
2:
 mov (40,sp),d0
 mov (8,sp),d1
 cmp d1,d0
 bcs 7f
 sub d1,d0
 mov d0,(40,sp)
 mov sp,a0
 mov (20,sp),d0
 clr d1
 call sun_transfer,[d2,d3,a2,a3],32
 cmp 0,d0
 beq 9f
 mov (24,sp),a2
 mov (28,sp),a3
 mov (44,sp),d3
 clr d0
 mov d0,(48,sp)
3:
 mov (32,sp),d2
 mov (48,sp),d0
 mov (36,sp),d1
 add d1,d0
 mov (28,sp),d1
 cmp d1,d0
 bcs 4f
 sub d1,d0
 inc d2
4:
 mov d0,(48,sp)
 mov d2,(52,sp)
 /* Sample near each half-group's centre, retaining both Y values for n=1. */
 .macro SUNPIX right
 mov d2,d0
 .if \right
 add d0,d0
 add d2,d0
 .endif
 lsr 1,d0                       /* pixel floor(n/2) or floor(3n/2) */
 mov d0,d1
 and -2,d1
 add d1,d1
 mov a2,a1
 add d1,a1
 and 1,d0
 add d0,d0
 movbu (d0,a1),d0
 mov (60,sp),d1
 cmp 1,d1
 blt 90f
 beq 91f
 mov d0,d1
 lsr 2,d1
 add d1,d0
 bra 92f
91:
 mov d0,d1
 lsr 3,d1
 add d1,d0
92:
 cmp 255,d0
 bls 90f
 mov 255,d0
90:
 movbu (1,a1),d1
 and 0xf0,d1
 asl 6,d1
 movbu (3,a1),d2
 and 0xf0,d2
 asl2 d2
 or d2,d1
 call sun_sample,[],0
 .endm
 SUNPIX 0
 mov d0,(56,sp)
 mov (52,sp),d2
 SUNPIX 1
 mov d0,(68,sp)                   /* save right colour */
 mov (56,sp),d1                   /* left colour */
 mov (52,sp),d2
 lsr 1,d2
 beq 51f
5:
 mov (56,sp),d0
 mov (60,sp),d1
 cmp 0,d1
 bge 50f
 call sun_blend_pair,[],16
50:
 mov d0,(a2)
 add 4,a2
 add -1,d2
 bne 5b
51:
 mov (52,sp),d0
 btst 1,d0
 beq 53f
 /* Middle pair shares rounded mean chroma, but keeps each pixel's Y. */
 mov (56,sp),d1
 mov (68,sp),a1
 mov a1,d0
 xor d1,d0
 and 0xff00ff00,d0
 lsr 1,d0
 and 0xff00ff00,d0
 mov a1,a0
 mov a0,d2
 or d1,d2
 sub d0,d2
 and 0xff00ff00,d2
 and 255,d1
 or d1,d2
 mov a1,d0
 and 0x00ff0000,d0
 or d0,d2
 mov d2,d0
 mov (60,sp),d1
 cmp 0,d1
 bge 52f
 call sun_blend_pair,[],16
52:
 mov d0,(a2)
 add 4,a2
53:
 mov (52,sp),d2
 lsr 1,d2
 beq 55f
54:
 mov (68,sp),d0
 mov (60,sp),d1
 cmp 0,d1
 bge 56f
 call sun_blend_pair,[],16
56:
 mov d0,(a2)
 add 4,a2
 add -1,d2
 bne 54b
55:
 add -1,a3
 cmp 0,a3
 bne 3b
 mov d3,(44,sp)
7:
 /* Batch-write all consecutive rows that share this band (1 hl_open + 1 FLUSH + 1 UNLOCK). */
 mov (12,sp),d2                   /* remaining rows in image (>= 1) */
 mov 1,d3                         /* nrows in this band (>= 1) */
 mov (40,sp),d0
 mov (28,sp),a1                   /* groups_cap */
 mov (8,sp),a0                    /* width_pairs */
71:
 add a1,d0
 cmp 1,d2
 beq 72f
 cmp a0,d0
 bcc 72f
 inc d3
 add -1,d2
 bra 71b
72:
 mov d0,(40,sp)                   /* updated band accumulator after d3 rows */
 mov (12,sp),d0
 sub d3,d0
 mov d0,(12,sp)                   /* remaining rows after this band */
 /* Compute total span = (d3 - 1) * stride + width_pairs * 4. */
 mov d3,d0
 add -1,d0
 mov (16,sp),d1                   /* stride bytes */
 mul d1,d0
 mov (8,sp),d1
 asl2 d1
 add d1,d0                        /* span bytes */
 mov (20,sp),d1                   /* bus */
 and 0x07ffffff,d1
 add d0,d1
 cmp 0x08000000,d1
 bhi 76f                          /* crosses 128 MB bus window: fall back to row-by-row */
 /* Fast path: map entire band once, copy d3 rows (4x unrolled), FLUSH once, UNLOCK once! */
 mov d0,d1                        /* bytes */
 mov (20,sp),d0                   /* bus */
 mov d3,(48,sp)                   /* save nrows */
 call hl_open,[d2,d3,a2,a3],28
 mov d0,(52,sp)                   /* save lock handle */
 cmp 0,a0
 beq 91f
 mov a0,d0
 clr d1
 cmp 0xb8000000,d0
 bcs 73f
 add -0x40000000,d0
 mov 1,d1
73:
 mov d0,a3                        /* row dst ptr */
 mov d1,(56,sp)                   /* save needs_flush */
 mov (48,sp),d3                   /* nrows */
74:
 mov (24,sp),a2                   /* src scratch row */
 mov a3,a0                        /* dst cursor */
 mov (8,sp),d2                    /* width_pairs */
 cmp 4,d2
 bcs 742f
741:
 mov (a2),d0
 mov d0,(a0)
 mov (4,a2),d0
 mov d0,(4,a0)
 mov (8,a2),d0
 mov d0,(8,a0)
 mov (12,a2),d0
 mov d0,(12,a0)
 add 16,a2
 add 16,a0
 add -4,d2
 cmp 4,d2
 bcc 741b
742:
 cmp 0,d2
 beq 744f
743:
 mov (a2),d0
 mov d0,(a0)
 add 4,a2
 add 4,a0
 add -1,d2
 bne 743b
744:
 mov (16,sp),d0                   /* stride */
 add d0,a3
 add -1,d3
 bne 74b
 mov (56,sp),d0
 cmp 0,d0
 beq 75f
 call FLUSH,[d2,d3],16
75:
 mov (52,sp),d0
 call UNLOCK,[d2],8
 mov (48,sp),d0                   /* nrows */
 mov (16,sp),d1                   /* stride */
 mul d1,d0
 mov (20,sp),d1
 add d0,d1
 mov d1,(20,sp)                   /* advance bus by nrows * stride */
 bra 79f
91:
 mov (52,sp),d0
 call UNLOCK,[d2],8
 bra 9f
76:
 /* Fallback across 128 MB boundary: write d3 rows via sun_transfer. */
 mov d3,(48,sp)
77:
 mov sp,a0
 mov (20,sp),d0
 mov 1,d1
 call sun_transfer,[d2,d3,a2,a3],32
 cmp 0,d0
 beq 9f
 mov (20,sp),d0
 mov (16,sp),d1
 add d1,d0
 mov d0,(20,sp)
 mov (48,sp),d0
 add -1,d0
 mov d0,(48,sp)
 bne 77b
79:
 mov (12,sp),d0
 cmp 0,d0
 bne 2b
9:
 mov (24,sp),a0
 call free,[],4
99:
 ret [d2,d3,a2,a3],88
