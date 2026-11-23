/* Evaluate fine versus coarse luminance gradients on sixteen central scanlines.
 * Separate horizontal and vertical lines catch edges in either orientation.
 * Compare energies as integers. No lens position, AF movement or extra DMA.
 * d0 = split displacement in chroma pairs, 0 aligned .. 4 maximum.
 */
fs_measure:
 clr d0
 mov d0,(4,sp)                    /* fine energy */
 mov d0,(8,sp)                    /* coarse energy */
 mov 2,d0
 mov d0,(12,sp)                   /* two scan orientations */
 mov 2,d0
 mov d0,(16,sp)                   /* distance to next luma, in bytes */
 mov 2048,d0
 mov d0,(20,sp)                   /* eight rows to next horizontal line */
fs_measure_axis:
 mov FS_SRC+8256,a2               /* pixel (32,32) */
 mov 8,d0
 mov d0,(24,sp)
fs_measure_line:
 mov a2,a0
 mov (16,sp),d0
 mov a0,a1
 add d0,a1
 asl2 d0
 mov a0,a3
 add d0,a3
 mov 64,d3
fs_measure_sample:
 movbu (a0),d2
 movbu (a3),d0
 sub d2,d0
 mul d0,d0
 cmp 100,d0                       /* reject weak/noise-only long gradients */
 bcs fs_measure_next
 mov (8,sp),d1
 add d0,d1
 mov d1,(8,sp)
 movbu (a1),d0
 sub d2,d0
 mul d0,d0
 mov (4,sp),d1
 add d0,d1
 mov d1,(4,sp)
fs_measure_next:
 mov (16,sp),d0
 add d0,a0
 add d0,a1
 add d0,a3
 sub 1,d3
 bne fs_measure_sample
 mov (20,sp),d0
 add d0,a2
 mov (24,sp),d0
 sub 1,d0
 mov d0,(24,sp)
 bne fs_measure_line
 mov (12,sp),d0
 sub 1,d0
 mov d0,(12,sp)
 beq fs_measure_level
 mov 256,d0
 mov d0,(16,sp)
 mov 16,d0
 mov d0,(20,sp)
 bra fs_measure_axis
fs_measure_level:
 mov (8,sp),d1
 mov 4,d0
 cmp 16384,d1
 bcs fs_measure_out
 mov (4,sp),d2
 asl 4,d2
 mov d1,d3
 lsr 2,d3
 add d3,d1                        /* ratio thresholds: 1.25, 2, 2.75, 3.5 / 16 */
 mov d3,a0
 add d3,d3
 add a0,d3
fs_measure_band:
 cmp d1,d2
 bcs fs_measure_out
 add d3,d1
 sub 1,d0
 bne fs_measure_band
fs_measure_out:
 mov (4,sp),d1
 mov d1,(fs_focus_stats+0x40000000)
 mov (8,sp),d1
 mov d1,(fs_focus_stats+4+0x40000000)
 mov d0,(fs_focus_stats+8+0x40000000)
 mov (fs_focus_stats+12+0x40000000),d1
 inc d1
 mov d1,(fs_focus_stats+12+0x40000000)
 ret [d2,d3,a2,a3],48

.balign 4
fs_focus_stats: .space 16

/* A 1/8-wide margin in score units on each boundary, followed by
 * three consecutive votes for the same band. Re-seed on a display switch.
 * d0 raw band, d1 panel; no writes to the map here. */
fs_filter_band:
 mov fs_filter_state+0x40000000,a0
 mov d0,d2
 mov (a0),d0
 cmp d1,d0
 bne fs_filter_seed
 mov (fs_strength+0x40000000),d3
 cmp d3,d2
 beq fs_filter_hold
 mov (fs_focus_stats+4+0x40000000),d1
 cmp 16384,d1
 bcs fs_filter_vote                  /* prolonged low signal returns to maximum */
 mov 4,d0
 sub d3,d0                           /* tightening boundary = 1.25 + .75*(4-stable) */
 mov d1,a1
 lsr 2,d1
 mov d1,a2
 add d1,d1
 add a2,d1
 mul d1,d0
 add a1,d0
 add a2,d0
 mov a2,d1
 lsr 1,d1
 mov d1,a3                            /* coarse / 8 */
 cmp d3,d2
 bcs fs_filter_tighten
 mov a2,d1
 add d1,d1
 add a2,d1
 sub d1,d0                           /* relaxing boundary, minus margin */
 sub a3,d0
 mov (fs_focus_stats+0x40000000),d1
 asl 4,d1
 cmp d0,d1
 bcc fs_filter_hold
 bra fs_filter_vote
fs_filter_tighten:
 add a3,d0
 mov (fs_focus_stats+0x40000000),d1
 asl 4,d1
 cmp d0,d1
 bcs fs_filter_hold
fs_filter_vote:
 mov (4,a0),d0
 cmp d2,d0
 beq fs_filter_count
 mov d2,(4,a0)
 clr d0
 mov d0,(8,a0)
fs_filter_count:
 mov (8,a0),d0
 inc d0
 mov d0,(8,a0)
 cmp 3,d0
 bcs fs_filter_previous
 mov d2,d3
fs_filter_hold:
 clr d0
 mov d0,(8,a0)
fs_filter_previous:
 mov d3,d0
 ret [d2,d3,a2,a3],20
fs_filter_seed:
 mov d1,(a0)
 clr d0
 mov d0,(8,a0)
 mov d2,d0
 ret [d2,d3,a2,a3],20
.balign 4
fs_filter_state: .space 12

/* Rebuild displaced pair indices only when the measured band changes.
 * White rings, seam and untouched pixels keep their generated indices. */
fs_set_strength:
 mov (fs_map_dirty+0x40000000),d1
 cmp 0,d1
 bne 1f
 mov (fs_strength+0x40000000),d1
 cmp d0,d1
 beq fs_strength_done
1:
 clr d1
 mov d1,(fs_map_dirty+0x40000000)
 mov d0,(fs_strength+0x40000000)
 mov d0,(4,sp)
 mov d0,d1
 asr 1,d1
 asl 6,d1
 add d0,d1
 mov d1,(8,sp)
 mov fs_shape+0x40000000,a2
 mov FS_MAP,a3
 clr d3
fs_shape_pair:
 movbu (a2),d2
 btst 1,d3
 beq 1f
 lsr 4,d2
 inc a2
1:
 and 15,d2
 mov d3,d1
 cmp 0,d2
 beq fs_shape_write
 cmp 4,d2
 bls 2f
 mov 65540,d1
 sub d2,d1
 bra fs_shape_write
2:
 mov (4,sp),d0
 cmp 2,d2
 bls fs_shape_horizontal
 mov (8,sp),d0
fs_shape_horizontal:
 btst 1,d2
 bne fs_shape_positive
 mov d3,d1
 sub d0,d1
 bra fs_shape_write
fs_shape_positive:
 mov d3,d1
 add d0,d1
fs_shape_write:
 movhu d1,(a3)
fs_shape_next:
 add 2,a3
 inc d3
 cmp 8192,d3
 bcs fs_shape_pair
fs_strength_done:
 ret [d2,d3,a2,a3],32
