/* Only replace a job whose three channels still match the stock still curve. */
hilat_path: .asciz "C:\\OM3MOD\\HILAT.TXT"
hilat_summary: .asciz "\r\nHILAT (hex) enabled checked still-count other-count last-other-selector last-other-id: "
hilat_legend: .asciz "HILAT status: 1=request ID 2=variant 3=mode 4=table pointer 5=control 6=curve mismatch 7=applied\r\n"
hilat_row: .asciz "HILAT seq EXIF-count id enabled status R/G/B@241-before after mismatch-index actual expected: "
.balign 4
hilat_enabled: .long 0
hilat_checked: .long 0
hilat_count: .long 0
hilat_other_count: .long 0
hilat_other_selector: .long 0
hilat_other_id: .long 0
hilat_other_pairs: .space 12*8
hilat_other_overflow: .long 0
hilat_pair_label: .asciz "HILAT other selector:id(hex 16+16) / requests: "
hilat_overflow_label: .asciz "HILAT other requests beyond 12 distinct pairs: "
.balign 4
hilat_ring: .space 16*64
/* Last-request-only telemetry hid short-lived selectors behind live view. */
hilat_note_other:
 mov hilat_other_pairs+0x40000000,a0
 mov 12,d3
1:
 mov (4,a0),d1
 cmp 0,d1
 beq 2f
 mov (a0),d2
 cmp d0,d2
 beq 3f
 add 8,a0
 add -1,d3
 bne 1b
 mov (hilat_other_overflow+0x40000000),d1
 inc d1
 mov d1,(hilat_other_overflow+0x40000000)
 ret [d2,d3],12
2:
 mov d0,(a0)
3:
 inc d1
 mov d1,(4,a0)
 ret [d2,d3],12
/* One bounded entry per still request; file I/O stays in the debug logger.
 * Publish seq last. Zero samples mean unavailable for statuses 1..4. */
hilat_still:
 mov (hilat_count+0x40000000),d0
 mov d0,d2
 inc d0
 mov d0,(hilat_count+0x40000000)
 mov d0,d3
 and 15,d2
 asl 6,d2
 mov hilat_ring+0x40000000,a2
 add d2,a2
 mov a2,a0
 mov 16,d2
 clr d0
1:
 mov d0,(a0)
 add 4,a0
 add -1,d2
 bne 1b
 mov (lg_np),d0
 mov d0,(4,a2)
 movhu (10,a1),d0
 mov d0,(8,a2)
 mov (hilat_enabled+0x40000000),d1
 mov d1,(12,a2)
 mov 1,d2
 cmp 11,d0
 beq 2f
 cmp 12,d0
 bne hilat_skip
 mov 2,d2
 movbu (1731,a1),d0
 cmp 0,d0
 bne hilat_skip
2:
 mov 3,d2
 call mx_photo,[],0
 cmp 0,d0
 beq hilat_skip
 mov 4,d2
 mov a3,d1
 add 1252,d1
 mov (3172,a3),d0
 cmp d1,d0
 bne hilat_skip
 add 640,d1
 mov (3176,a3),d0
 cmp d1,d0
 bne hilat_skip
 add 640,d1
 mov (3180,a3),d0
 cmp d1,d0
 bne hilat_skip
 .macro HILAT_SAMPLE pos
 movhu (1734,a3),d0
 mov d0,(\pos,a2)
 movhu (2374,a3),d0
 mov d0,(\pos+4,a2)
 movhu (3014,a3),d0
 mov d0,(\pos+8,a2)
 .endm
 HILAT_SAMPLE 20
 mov 5,d2
 mov (12,a2),d0
 cmp 0,d0
 beq 3f
 mov a2,a1                     /* mismatch details for this record */
 call hilat_apply,[d2,d3,a2,a3],20
 mov d0,d2
3:
 HILAT_SAMPLE 32
 mov 1,d0                      /* still eligible for ordinary profile curves */
 bra hilat_publish
hilat_skip:
 clr d0
hilat_publish:
 mov d2,(16,a2)
 mov d3,(a2)
 ret [d2,d3,a2,a3],20
hilat_apply:
 mov a3,a2
 add 1252,a2
 mov 3,d3
1:
 mov 0x6066c0dc,a0              /* stock main knots (+144) */
 movhu (1254,a3),d0
 cmp 86,d0
 bne 8f
 mov 0x6066c56c,a0              /* second stock curve, still verify every knot */
8:
 mov 256,d2
2:
 movhu (a2),d0
 movhu (a0),d1
 cmp d0,d1
 bne hilat_mismatch
 add 2,a0
 add 2,a2
 add -1,d2
 bne 2b
 sub 640,a0                     /* past 256 knots -> fine knots at main -128 */
 mov 64,d2
3:
 movhu (a2),d0
 movhu (a0),d1
 cmp d0,d1
 bne hilat_mismatch
 add 2,a0
 add 2,a2
 add -1,d2
 bne 3b
 add -1,d3
 bne 1b
 mov a3,a2
 add 1574,a2                    /* output +1252 +161*2 */
 mov 3,d3
4:
 mov hilat_tail,a0
 movhu (1254,a3),d0
 cmp 86,d0
 bne 8f
 mov hilat_tail_86,a0
8:
 mov 95,d2
5:
 movhu (a0),d0
 movhu d0,(a2)
 add 2,a0
 add 2,a2
 add -1,d2
 bne 5b
 add 450,a2
 add -1,d3
 bne 4b
 mov 7,d0
 ret [d2,d3,a2,a3],20
hilat_mismatch:
 mov d0,(48,a1)
 mov d1,(52,a1)
 mov a2,d0
 sub a3,d0
 sub 1252,d0
 lsr 1,d0
 mov d0,(44,a1)                /* linear index: channel * 320 + knot */
 mov 6,d0
 ret [d2,d3,a2,a3],20
.balign 2
hilat_tail:
 .short 3617,3626,3634,3643,3652,3660,3668,3676,3684,3692
 .short 3700,3708,3715,3723,3730,3738,3745,3752,3759,3766
 .short 3773,3779,3786,3793,3799,3805,3812,3818,3824,3830
 .short 3836,3842,3848,3853,3859,3864,3870,3875,3880,3886
 .short 3891,3896,3901,3906,3911,3916,3920,3925,3930,3934
 .short 3939,3943,3948,3952,3956,3960,3965,3969,3973,3977
 .short 3981,3985,3989,3992,3996,4000,4004,4007,4011,4014
 .short 4018,4022,4025,4028,4032,4035,4039,4042,4045,4048
 .short 4052,4055,4058,4061,4064,4068,4071,4074,4077,4080
 .short 4083,4086,4089,4092,4095

/* Stretch this stock shoulder from knot 160 to its first white knot over
 * the remaining 95 inputs. Midtones retain the native curve. */
hilat_tail_86:
 .short 3888,3891,3894,3897,3901,3904,3906,3907,3910,3914
 .short 3917,3920,3923,3924,3926,3929,3933,3936,3936,3939
 .short 3942,3945,3948,3949,3951,3954,3956,3957,3960,3964
 .short 3964,3966,3970,3972,3972,3976,3979,3981,3982,3985
 .short 3988,3988,3991,3993,3994,3997,4000,4000,4003,4006
 .short 4008,4009,4012,4013,4015,4018,4020,4021,4024,4028
 .short 4028,4030,4034,4036,4036,4040,4043,4044,4046,4049
 .short 4052,4052,4055,4058,4060,4061,4064,4064,4067,4070
 .short 4072,4074,4076,4076,4079,4080,4081,4084,4084,4084
 .short 4087,4088,4088,4090,4095
