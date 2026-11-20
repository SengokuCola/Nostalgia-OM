/* The card marker is checked once after mount. Audio runs in its own task.
 * REC_FILE only increments one aligned word. Read/write the shared counters
 * through the uncached alias on both cores. */
.section .hook_sb_done,"ax"
 jmp sb_done_entry
 nop
.section .ext1,"ax"
sb_done_entry:
 mov (SECBITS),d0
 and 32,d0
 beq 1f
 jmp sb_record_done
1:
 mov d3,a0
 movhu (a0),d1
 mov 62,d0
 jmp sb_reply_join
.section .ext13,"ax"
sb_record_done:
 mov (sb_enabled+0x40000000),d0
 cmp 1,d0
 bne sb_resume
 mov d2,d0
 exthu d0
 cmp 0,d0
 bne sb_resume
 movhu (186,a3),d0
 cmp 4097,d0                      /* a still capture job */
 bne sb_resume
 movbu (268,a3),d0                /* the recorder skipped its actual file-write path */
 cmp 0,d0
 bne sb_resume
 mov (20,a3),a0                   /* pExifParam still belongs to this packet */
 cmp 0,a0
 beq sb_resume
 mov (SB_JOBS),d0
 inc d0
 mov d0,(SB_JOBS)
 movhu (6110,a0),d0               /* CameraSettings.DriveMode[4], per exposure */
 mov d0,(SB_DRIVE)
 cmp 4,d0
 bne sb_resume
 mov (sb_produced+0x40000000),d0
 inc d0
 mov d0,(sb_produced+0x40000000)
sb_resume:
 mov d3,a0
 movhu (a0),d1
 mov 62,d0
 jmp sb_reply_join

sb_arm:
 mov (sb_checked),d0
 cmp 0,d0
 bne sb_arm_out
 call hl_ok,[a2],16
 cmp 0,d0
 bne sb_arm_out
 mov 1,d0
 mov d0,(sb_checked)
 mov sb_path,a0
 mov lg_mr,a1
 call fopen,[],4
 cmp 0,a0
 beq sb_arm_out
 call fclose,[d2,a2,a3],16
 mov 56,d0
 mov d0,(4,sp)
 mov 8192,d0
 mov d0,(8,sp)
 mov sb_stack,a0
 mov a0,(12,sp)
 mov sb_name,a0
 mov sb_worker,a1
 clr d0
 mov d0,d1
 call sdl_task_create,[d2,d3,a2,a3],56
 cmp 0,d0
 blt sb_arm_out
 exth d0
 call sdl_task_start,[d2,d3,a2],16
 cmp 0,d0
 bne sb_arm_out
 mov 1,d0
 mov d0,(sb_enabled+0x40000000)
sb_arm_out:
 ret [d2,d3,a2,a3],32
sb_worker:
 add -20,sp
 clr d3
sb_wait:
 mov 20,d0
 call sdl_dly_tsk,[d2,a2,a3],16
 mov (sb_produced+0x40000000),d0
 cmp d3,d0
 beq sb_wait
 call sb_play,[d2,d3,a2,a3],20
 mov d0,(SB_RESULT)
 cmp 0,d0
 beq sb_consumed
 mov (SB_REFUSED),d0
 inc d0
 mov d0,(SB_REFUSED)
sb_consumed:
 inc d3
 mov d3,(SB_CONSUMED)
 bra sb_wait
sb_play:
 /* Match the route selected by the stock single-shutter caller at 60cf1374.
  * The native sound controller handles its own volume and mute settings.
  * One confirmed file gets one start/end pair, with no AF-state retry. */
 mov 1,d0
 call sb_sound_route,[d2,d3,a2],36
 mov 2,d2
 cmp 2,d0
 beq sb_start
 mov 3,d2
 cmp 16,d0
 beq sb_start
 mov 1,d2
sb_start:
 mov d2,d1
 clr d0
 call sb_shutter_sound,[d2,d3,a2,a3],60
 cmp 0,d0
 bne sb_play_out
 mov d2,d1
 mov 1,d0
 call sb_shutter_sound,[d2,d3,a2,a3],60
sb_play_out:
 ret [d2,d3,a2,a3],20
sb_path: .asciz "C:\\OM3MOD\\BEEP.TXT"
sb_name: .asciz "CAD_BEEP"
.balign 4
sb_checked: .long 0
sb_enabled: .long 0
sb_produced: .long 0
sb_diag: .space 20
.set SB_JOBS,sb_diag+0x40000000
.set SB_DRIVE,SB_JOBS+4
.set SB_RESULT,SB_JOBS+8
.set SB_REFUSED,SB_JOBS+12
.set SB_CONSUMED,SB_JOBS+16
.balign 16
sb_stack: .space 8192
