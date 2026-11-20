/* All publishers hold the display lock. Only the shutter task touches the
 * snapshot buffer or card. Rows contain no pixels or camera-owned pointers. */
fs_trace_record:                       /* outcome, channel in d0,d1 */
 mov d0,d3
 mov (FS_TRACE_HEAD),d2
 inc d2
 mov d2,d0
 and 127,d0
 asl 5,d0
 mov FS_TRACE_ROWS,a0
 add d0,a0
 mov d2,(a0)
 mov d1,(4,a0)
 mov d3,(8,a0)
 clr d0
 cmp 1,d3
 beq fs_trace_reject
 cmp 4,d3
 bne fs_trace_pub
fs_trace_reject:
 mov (FS_D+32),d0
 bra fs_trace_owner
fs_trace_pub:
 cmp 5,d3
 bne fs_trace_owner
 mov (FS_D+36),d0
fs_trace_owner:
 mov (FS_OWNER),a1
 cmp 1,a1
 bne fs_trace_detail
 mov (FS_OWNER+4),a1
 cmp d1,a1
 bne fs_trace_detail
 or 256,d0
fs_trace_detail:
 mov (PH_SEEN),d1
 cmp 1,d1
 bne fs_trace_contrast
 or 512,d0
 mov d0,(12,a0)
 mov PH_SAMPLE,a1
 mov (a1),d0
 mov d0,(16,a0)
 mov (4,a1),d0
 mov d0,(20,a0)
 mov (8,a1),d0
 mov d0,(24,a0)
 mov (12,a1),d0
 mov d0,(28,a0)
 bra fs_trace_end
fs_trace_contrast:
 mov d0,(12,a0)
 cmp 0,d3
 beq fs_trace_score
 cmp 3,d3
 beq fs_trace_score
 cmp 5,d3
 bcc fs_trace_score
 mov -1,d0
 mov d0,(16,a0)
 mov d0,(20,a0)
 mov d0,(24,a0)
 mov d0,(28,a0)
 bra fs_trace_end
fs_trace_score:
 mov fs_focus_stats+0x40000000,a1
 mov (a1),d0
 mov d0,(16,a0)
 mov (4,a1),d0
 mov d0,(20,a0)
 mov (8,a1),d0
 mov d0,(24,a0)
 mov (fs_strength+0x40000000),d0
 mov d0,(28,a0)
fs_trace_end:
 mov d2,(FS_TRACE_HEAD)
 ret [d2,d3,a2,a3],20

fs_trace_save:
 mov (FS_ON),d0
 cmp 1,d0
 bne fs_trace_save_out
 mov (FS_TRACE_HEAD),d0
 cmp 0,d0
 beq fs_trace_save_out
 mov d0,(fs_trace_file+16)
 mov FS_TRACE_ROWS,a2
 mov fs_trace_file+20,a3
 mov 16,d3
fs_trace_chunk:                        /* at most eight rows per lock */
 clr d0
 call LOCK,[d2],8
 mov d0,(4,sp)
 mov 64,d2
fs_trace_copy:
 mov (a2),d0
 mov d0,(a3)
 inc4 a2
 inc4 a3
 sub 1,d2
 bne fs_trace_copy
 mov (4,sp),d0
 call UNLOCK,[d2],8
 sub 1,d3
 bne fs_trace_chunk
 mov fs_trace_path,a0
 mov lg_mw,a1
 call fopen,[],4
 cmp 0,a0
 beq fs_trace_save_out
 mov a0,(4,sp)
 mov a0,a1
 mov fs_trace_file,a0
 mov 1,d0
 mov 4116,d1
 call fwrite,[d2,d3,a2,a3],24
 mov (4,sp),a0
 call fclose,[d2,a2,a3],16
fs_trace_save_out:
 ret [d2,d3,a2,a3],32

.section .ext13,"ax"
.balign 4
fs_trace_head: .long 0
fs_trace_rows: .space 4096
fs_trace_file: .ascii "OMFT"
 .long 2,128,32,0
 .space 4096
fs_trace_path: .asciz "C:\\OM3MOD\\FOCUSTRC.BIN"
.set FS_TRACE_HEAD,fs_trace_head+0x40000000
.set FS_TRACE_ROWS,fs_trace_rows+0x40000000
.section .ext13,"ax"
