/* OM-3 1.1 ZAFInfo. The native producer publishes a token before writing
 * the rest of its result. Recheck it and require agreement across two
 * different producer samples before presenting a direction. */
.set ZAF,0xa33d1dd4
.set PH_STATE,fs_phase_state+0x40000000
.set PH_SAMPLE,fs_phase_sample+0x40000000
.set PH_MODE,fs_phase_mode+0x40000000
.set PH_SEEN,fs_phase_seen+0x40000000
fs_phase_read:
 mov PH_SAMPLE,a2
 mov (ZAF+4),d2
 mov d2,(a2)
 movhu (ZAF+12),d0
 exth d0
 mov d0,(4,a2)
 mov (ZAF+16),d0
 mov d0,(8,a2)
 movbu (ZAF+1),d0                  /* IsRanging */
 asl 16,d0
 movhu (ZAF+10),d1                 /* stock-selected Area */
 or d1,d0
 mov d0,(12,a2)
 mov 1,d0
 mov d0,(PH_SEEN)
 cmp -1,d2
 beq fs_phase_invalid
 movbu (ZAF+1),d0
 cmp 1,d0
 bne fs_phase_invalid
 mov (12,a2),d0
 lsr 16,d0
 cmp 1,d0
 bne fs_phase_invalid
 mov (ZAF+4),d0
 cmp d2,d0
 bne fs_phase_invalid
 mov (4,a2),d3
 cmp -32768,d3                     /* stock invalid defmm sentinel */
 beq fs_phase_invalid
 call fs_zaf_clock,[],4            /* same clock as stock's ZAF freshness gate */
 sub d2,d0
 and 0x7fffffff,d0
 cmp 150000,d0
 bhi fs_phase_invalid
 cmp 0,d3
 beq fs_phase_zero
 blt fs_phase_negative
 mov 2,d3                         /* two chroma pairs, uncalibrated direction test */
 bra fs_phase_vote
fs_phase_negative:
 mov -2,d3
 bra fs_phase_vote
fs_phase_zero:
 clr d3
fs_phase_vote:
 mov PH_STATE,a0                   /* seen, token, packed area, shift, confirmed */
 mov (a0),d0
 cmp 1,d0
 bne fs_phase_seed
 mov (12,a2),d0
 mov (8,a0),d1
 cmp d0,d1
 bne fs_phase_seed
 mov (12,a0),d0
 cmp d3,d0
 bne fs_phase_seed
 mov (4,a0),d0
 cmp d2,d0
 beq fs_phase_previous
 mov d2,(4,a0)
 mov 1,d0
 mov d0,(16,a0)
fs_phase_previous:
 mov (16,a0),d0
 cmp 1,d0
 bne fs_phase_wait
 mov d3,d0
 ret [d2,d3,a2,a3],24
fs_phase_seed:
 mov 1,d0
 mov d0,(a0)
 mov d2,(4,a0)
 mov (12,a2),d0
 mov d0,(8,a0)
 mov d3,(12,a0)
 clr d0
 mov d0,(16,a0)
 bra fs_phase_wait
fs_phase_invalid:
 clr d0
 mov d0,(PH_STATE)
fs_phase_wait:
 mov 99,d0                        /* suppress the layer for an unavailable sample */
 ret [d2,d3,a2,a3],24
.balign 4
fs_phase_mode: .long 0
fs_phase_seen: .long 0
fs_phase_state: .space 20
fs_phase_sample: .space 16
fs_phase_path: .asciz "C:\\OM3MOD\\ZAF.TXT"
