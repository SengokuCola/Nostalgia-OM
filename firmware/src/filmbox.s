.set FB_WIDTH,270
.set FB_ROWS,600
.set FB_PITCH,640                  /* YC422, rounded to a 128-byte DMA burst */
.set FB_PAGE_BYTES,FB_PITCH*FB_ROWS
/* Film box. The shooting event task owns the cursor; DISPLAY only reads it.
 * Zero denotes closed, 1..20 are the LOOKS.BIN slots. */
.set FB_CODE, 4201
.set FB_TITLE, 0x7fa0
.section .hook_fb_key,"ax"
 jmp fb_dispatch

.section .ext13,"ax"
fb_dispatch:
 mov a0,(4,sp)                    /* original event router frame */
 mov d0,d2
 mov d1,d3
 mov a1,a2
 mov mdr,d0
 mov d0,a3
 mov d2,d0
 mov (40,sp),a0                   /* native shooting state machine / current event */
 call fb_event,[d2,d3,a2,a3],28
 mov a3,d1
 mov d1,mdr
 cmp 0,d0
 bne fb_handled
 mov d2,d0
 mov d3,d1
 mov a2,a1
 mov (4,sp),a0
 mov 0,a3
 mov a3,a2
 jmp dl_walk
fb_handled:
 mov (40,sp),a0
 mov (204,a0),d0
 cmp 1,d0
 mov 1,d0
 bne 1f
 mov d0,(200,a0)
 bra 2f
1:
 mov d0,(192,a0)
2:
 mov d0,(32,a0)
 ret [d2,d3,a2,a3],36

fb_event:
 mov d0,d2
 cmp 0x1010007,d2
 beq fb_front_turn
 cmp 0x900004d,d2
 beq fb_front_turn
 movhu (LG_GUI),d1
 cmp 0x0304,d1
 beq fb_scp_event
 cmp 0x0801,d1
 bne fb_pass
 movbu (UI_PSW),d1
 cmp 2,d1
 bne fb_pass
 mov (FB_RELEASE),d1
 cmp 0,d1
 beq 1f
 sub d1,d0
 bne 2f
 mov (FB_SLOT),d1
 cmp 0,d1
 beq 1f
2:
 cmp 3,d0
 bhi 1f
 cmp 1,d0
 bne fb_take
 clr d0
 mov d0,(FB_RELEASE)
 bra fb_take
1:
 mov (FB_SLOT),d0
 cmp 0,d0
 beq fb_key_open
 /* Opening-key repeats are already consumed by FB_RELEASE above. */
 mov d2,d1
 add -0x100000a,d1
 cmp 15,d1
 bhi 4f
 mov d1,d0
 and 3,d0
 bne fb_take
 /* Up/left step back; down/right step forward. */
 btst 4,d1
 mov -1,d2
 beq fb_step
 mov 1,d2
 bra fb_step
4:
 cmp 0x100001a,d2
 bcs 8f
 cmp 0x100001d,d2
 bhi 8f
 jmp fb_ok
8:
 cmp 0x1010002,d2                 /* grouped report: second word identifies the encoder */
 beq fb_grouped_dial
 cmp 0x1010005,d2
 beq fb_grouped_dial
 cmp 0x1010003,d2
 bne fb_pass
 bra fb_dial
fb_grouped_dial:
 mov (4,a0),d0                    /* Grouped events can carry the physical encoder ID. */
 cmp 0x1010002,d0
 bcs fb_dial
 cmp 0x1010003,d0
 bhi fb_dial
 mov d0,d2
fb_dial:
 mov d2,d0
 call fb_dial_delta,[d2,a2],16       /* native signed dial displacement */
 cmp 0,d0
 beq fb_take
 /* A busy GUI coalesces adjacent detents into one signed report. Walk
  * each enabled slot, then apply only the final recipe. */
 mov d0,d3
 mov 1,d2
 cmp 0,d3
 bgt 1f
 mov -1,d2
 clr d0
 sub d3,d0
 mov d0,d3
1:
 /* Limit work on a malformed encoder report. */
 cmp 255,d3
 bls fb_steps
 mov 255,d3
 bra fb_steps
fb_step:
 mov 1,d3
fb_steps:
 mov (FB_SLOT),d0
2:
 call fb_find,[d2,d3,a2,a3],24
 cmp 0,d0
 beq fb_take
 call fb_enqueue,[d2,d3,a2,a3],32
 add -1,d3
 bne 2b
 mov d2,(FB_DIRECTION)
 mov d0,(FB_SLOT)
 clr d1
 mov d1,(FB_OFF)
 jmp fb_apply
/* The shooting router timestamps the press. Genifa's periodic message 1
 * reaches the GUI task even when the physical key sends no repeat reports. */
.set FB_HOLD_US,1500000
.section .hook_fb_clock,"ax"
 jmp fb_gui_clock
.section .fb_runtime,"ax"
fb_gui_clock:
 cmp 1,d0
 bne 2f
 mov (FB_OK_START),d0
 cmp 0,d0
 beq 1f
 mov (USCLK),d1
 sub d1,d0
 and 0x7fffffff,d0
 cmp FB_HOLD_US,d0
 bcs 1f
 call fb_clock_due,[d2,d3,a2,a3],28
1:
 mov (396,sp),d0
2:
 call fb_gui_message,[],4
 jmp fb_gui_resume

fb_clock_due:
 movhu (LG_GUI),d0
 cmp 0x0801,d0
 bne 1f
 movbu (UI_PSW),d0
 cmp 2,d0
 bne 1f
 clr d2                         /* clock tick, never a key release */
 jmp fb_ok_decide
1:
 jmp fb_ok_done

.section .ext11,"ax"
fb_ok:
 cmp 0x100001a,d2
 bne fb_ok_decide
 mov (FB_OK_START),d0
 cmp 0,d0
 bne fb_ok_done
 mov (USCLK),d0
 or 0x80000000,d0
 mov d0,(FB_OK_START)
 jmp fb_take

/* Serialize the deadline and key-up. Only the task which claims this press
 * changes the flag. Call the setting service after releasing the lock. */
fb_ok_decide:
 clr d0
 call LOCK,[d2],8
 mov d0,a3
 clr d3
 mov (FB_SLOT),d0
 cmp 0,d0
 beq 3f
 mov (FB_OK_START),d0
 cmp 0,d0
 beq 3f
 mov (USCLK),d1
 sub d1,d0
 and 0x7fffffff,d0
 cmp FB_HOLD_US,d0
 bcc 1f
 cmp 0x100001b,d2
 bne 3f
 mov 2,d3
 bra 2f
1:
 mov (FB_OFF),d1
 xor 32,d1
 mov d1,(FB_OFF)
 mov 1,d3
 cmp 0x100001b,d2
 beq 2f
 mov 0x100001a,d0
 mov d0,(FB_RELEASE)
2:
 clr d0
 mov d0,(FB_OK_START)
3:
 cmp 0x100001b,d2
 bne 4f
 clr d0
 mov d0,(FB_RELEASE)
4:
 mov a3,d0
 call UNLOCK,[d2],8
 cmp 1,d3
 beq fb_apply
 cmp 2,d3
 bne fb_ok_done
 call fb_close,[d2,d3,a2,a3],24
fb_ok_done:
 jmp fb_take
.balign 4
.section .fb_runtime,"ax"
.balign 4
fb_ok_start: .long 0
.set FB_OK_START,fb_ok_start+0x40000000

.section .ext13,"ax"
fb_apply:
 mov (FB_SLOT),d2
 cmp 0,d2
 bne 1f
 jmp fb_take
1:
 mov (FB_OFF),d3
 mov (rc_in),a0
 cmp 0,a0
 beq fb_take
 mov 897,d0
 call ar_getv,[d2,a2],24
 cmp 901,d0
 bne fb_take
 mov d2,(FB_LAST)
 mov d2,d1
 add FV0-1,d1
 cmp 0,d3
 beq 5f
 /* Leave the film through the native COLOR setting for the candidate's bank. */
 add -1,d2
 mov fl_cvt,a1
6:
 cmp 5,d2
 bcs 7f
 add -5,d2
 inc a1
 bra 6b
7:
 movbu (a1),d1
5:
 mov (rc_in),a0
 mov 0,a1
 mov 901,d0
 call sx_set,[d2,d3,a2,a3],68
 bra fb_take
fb_key_open:
 mov (FB_DISPLAY_MASK),d0
 cmp 2,d0
 beq fb_pass
 mov d2,d0
 add -0x100000a,d0
 cmp 13,d0
 bhi fb_pass
 btst 2,d0
 bne fb_pass
 lsr 2,d0
 add 50,d0
 mov d0,d3
 mov 158,d0
 call ar_getv,[d2,a2],24
 cmp 2,d0
 bne fb_pass
 mov d3,d0
 call ar_getv,[d2,a2],24
 cmp FB_CODE,d0
 bne fb_pass
 mov d2,d0
 btst 1,d2
 beq 1f
 clr d0                           /* release-only input, no following release to consume */
1:
 mov d0,(FB_RELEASE)
 mov d2,(FB_KEY)
 cmp 51,d3
 bne fb_open_color
 mov (FB_DOWN_OPENS),d0
 inc d0
 mov d0,(FB_DOWN_OPENS)
 bra fb_open_color
/* Take a mapped detent before the stock shooting handler enters Picture Mode. */
fb_front_turn:
 movhu (LG_GUI),d1
 cmp 0x1804,d1                    /* Turning straight from another position's native selector. */
 beq 1f
 cmp 0x0801,d1
 bne fb_pass
1:
 movbu (UI_PSW),d1
 cmp 2,d1
 bne fb_pass
 call dm_ok,[],0
 cmp 0,d1
 beq fb_pass
 /* Stock setPictureModeDialPosition reads the creative switch through this getter. */
 mov 0x612ff8c7,a0
 call fb_switch_service,[a2],12
 mov (a0),a1
 mov (348,a1),a1
 calls (a1)
 mov d0,d3
 add -1,d3
 cmp 2,d3
 bne 3f
 clr d1
 mov d1,(FB_DETENT)
 jmp fb_pass
3:
 cmp 2,d3
 bcs 2f
 add -1,d3
2:
 cmp 4,d3
 bcc fb_pass
 call dm_mode,[d2,d3],12
 cmp 4,d0
 bne fb_front_native
 mov (FB_DISPLAY_MASK),d0
 cmp 2,d0
 beq fb_pass
 mov (FB_DETENT),d1
 add -1,d1
 cmp d3,d1
 beq fb_take
 mov d3,d1
 inc d1
 mov d1,(FB_DETENT)
 call fb_set_position,[d2,d3,a2,a3],24
 clr d0
 mov d0,(FB_KEY)
 call fb_open_color,[d2,d3,a2,a3],28
 mov (FB_SLOT),d0
 cmp 0,d0
 beq fb_take
 movhu (LG_GUI),d1
 cmp 0x1804,d1
 bne fb_take
 /* Wake the native selector's dispatcher now so gx_map returns it to live view
  * before the photographer's first dial click. No physical key is held. */
 mov 0,a0
 mov fb_gui_release,a1
 mov fb_gui_send,a2
 calls (a2)
 bra fb_take
.balign 4
fb_gui_release: .long 22,0,0,0,0,0,0,0   /* event map index 22, OK release (0x900d) */
fb_front_native:
 clr d1
 mov d1,(FB_DETENT)
 mov d3,d2
 movbu (dm_pos),d3
 cmp d2,d3
 beq fb_pass
 cmp 4,d3
 bcc fb_pass
 call dm_mode,[d2,d3],12
 cmp 4,d0
 bne fb_pass
 mov d2,d3                        /* Return ownership to the destination family on this edge. */
 call fb_set_position,[d2,d3,a2,a3],24
 jmp fb_pass
fb_set_position:
 mov (rc_in),a0
 cmp 0,a0
 beq 1f
 mov 0,a1
 mov dm_fam,a2
 mov d3,d0
 asl2 d0
 add d0,a2
 mov (a2),d1
 mov 897,d0
 call sx_set,[d2,d3,a2,a3],68
1:
 ret [d2,d3,a2,a3],24
fb_open_color:
 mov (FB_DISPLAY_MASK),d0
 cmp 2,d0
 beq fb_take
 mov (FB_OPENS),d0
 inc d0
 mov d0,(FB_OPENS)
 mov (rc_in),d0
 cmp 0,d0
 beq 1f
 mov 897,d0
 call ar_getv,[d2,a2],24
 cmp 901,d0
 beq 1f
 mov (rc_in),a0
 mov 0,a1
 mov 897,d0
 mov 901,d1
 call sx_set,[d2,d3,a2,a3],68
1:
 call mf_ld,[d2,d3,a2,a3],20
 mov 901,d0
 call fb_setting,[],4
 call fl_k,[],0
 cmp 0,d0
 bge 1f
 /* Non-profile picture modes have no COLOR bank. Browse from the last roll
  * (or the first enabled roll); the first detent applies through fb_apply. */
 mov 32,d0
 mov d0,(FB_OFF)
 mov (FB_LAST),d0
 cmp NF,d0
 bls 2f
 clr d0
2:
 cmp 0,d0
 beq 4f
 add -1,d0
 bra 4f
1:
 mov d0,d2
 PVAL fb_take
 mov a2,a0
 add d2,a0
 movbu (LIDX,a0),d1
 mov d2,d0
 asl2 d0
 add d2,d0
 clr d3
 mov d3,(FB_OFF)
 cmp 1,d1
 bcs fb_open_off
 cmp 5,d1
 bhi fb_open_off
 add d1,d0
 add -1,d0
 bra 4f
fb_open_off:
 mov 32,d3
 mov d3,(FB_OFF)
 mov (FB_LAST),d1
 add -1,d1
 mov d1,d3
 sub d0,d3
 cmp 5,d3
 bcc 4f
 mov d1,d0
4:
 mov 1,d2
 call fb_find,[d2,d3,a2,a3],24
 cmp 0,d0
 beq fb_take
 mov d0,d3
 call fb_pages_init,[d2,d3,a2,a3],24
 cmp 0,d0
 beq fb_take
 mov d3,d0
 movhu (LG_GUI),d1                 /* SCP/dial can open during the native return to shooting. */
 mov d1,(FB_OPEN_GUI)
 mov d0,(FB_SLOT)
 mov (FB_OPENED),d1
 inc d1
 mov d1,(FB_OPENED)
 mov (FS_ON),d0
 cmp 1,d0
 beq fb_take
 mov 1,d0
 mov d0,(FB_ARMED)
 mov d0,(FS_ON)
fb_take:
 mov 1,d0
 ret [d2,d3,a2,a3],28
fb_pass:
 clr d0
 ret [d2,d3,a2,a3],28

/* d0 = one-based position before first candidate, d2 = +/-1.
 * Check at most a full lap, including wrap and the all-hidden case. */
fb_find:
 mov d0,(4,sp)
 PVAL 8f
 mov (LPTR,a2),a3
 cmp 0,a3
 beq 8f
 mov NF,d3
1:
 mov (4,sp),d0
 add d2,d0
 cmp NF,d0
 ble 2f
 mov 1,d0
2:
 cmp 1,d0
 bge 3f
 mov NF,d0
3:
 mov d0,(4,sp)
 add -1,d0
 mov a3,a0
 call fl_has,[],0
 cmp 0,d0
 bne 4f
 add -1,d3
 bne 1b
8:
 clr d0
 ret [d2,d3,a2,a3],24
4:
 mov (4,sp),d0
 ret [d2,d3,a2,a3],24

fb_close:
 clr d0
 call LOCK,[d2],8
 mov d0,(4,sp)
 mov (FB_SLOT),d0
 cmp 0,d0
 beq 3f
 mov (FB_OK_START),d0
 cmp 0,d0
 beq 2f
 mov 0x100001a,d0                 /* picker closed while OK was still down */
 mov d0,(FB_RELEASE)
2:
 clr d0
 mov d0,(FB_OK_START)
 mov d0,(FB_SLOT)
 mov d0,(FB_OPEN_GUI)
 mov d0,(FB_PREV_TIME)
 mov d0,(FB_PAINTED)
 mov d0,(FB_FINE)
 mov d0,(FB_MIRRORED)
 mov (FB_Q_WRITE),d1
 mov d1,(FB_Q_READ)
 mov d0,(FB_Q_ACTIVE)
 mov 1,d1
 mov d1,(FB_RETIRE)
 mov (4,sp),d0
 call UNLOCK,[d2],8
 call fs_clear,[d2,d3,a2,a3],24
 /* Give capture its resize buffer immediately if both latches are idle.
  * DISPLAY retries when a reader or a painter is still finishing. */
 call fb_retire_pages,[d2,d3,a2,a3],20
 mov (FB_ARMED),d0
 cmp 0,d0
 beq 1f
 clr d0
 mov d0,(FB_ARMED)
 mov d0,(FS_ON)
1:
 ret [d2,d3,a2,a3],24
3:
 mov (4,sp),d0
 call UNLOCK,[d2],8
 ret [d2,d3,a2,a3],24

.balign 4
fb_off: .long 0
fb_key: .long 0
fb_last: .long 0
.set FB_OFF,fb_off+0x40000000
.set FB_KEY,fb_key+0x40000000
.set FB_LAST,fb_last+0x40000000
fb_direction: .long 0
.set FB_DIRECTION,fb_direction+0x40000000
fb_slot: .long 0
fb_release: .long 0
fb_armed: .long 0
.set FB_SLOT, fb_slot+0x40000000
.set FB_RELEASE, fb_release+0x40000000
.set FB_ARMED, fb_armed+0x40000000

/* Preserve the stock GUI request; mask only the OSD planes and IMG3 focus graphics while the picker owns IMG2. */
.section .hook_fb_osd,"ax"
 call fb_mask_entry,[d2,d3],12
.section .ext1,"ax"
.balign 4
fb_osd_channel: .long 0
.set FB_OSD_CHANNEL,fb_osd_channel+0x40000000
fb_mask_entry:
 mov (20,sp),d0
 mov (FB_OSD_CHANNEL),d2
 cmp 0,d2
 beq 1f
 cmp d2,d0
 bne 1f
 jmp fb_rim_mask
1:
 jmp fb_stock_dma
.section .ext13,"ax"
.balign 4
fb_osd_bits: .long 0
.set FB_OSD_BITS,fb_osd_bits+0x40000000
fb_osd_hide:
 mov (FB_OSD_CHANNEL),d1
 cmp d0,d1
 beq fb_rim_refresh
 mov d0,(FB_OSD_CHANNEL)
 asl 15,d0
 add 0x9bb80060,d0
 mov d0,a0
 mov (a0),d1
 mov d1,d2
 and 15,d2
 mov d2,(FB_OSD_BITS)
 and -16,d1
 mov d1,(a0)
 jmp fb_rim_refresh
1:
 ret [d2,d3],12
fb_osd_restore:
 call fb_rim_release,[d2,d3,a2,a3],20
 mov (FB_OSD_CHANNEL),d0
 cmp 0,d0
 beq 1f
 clr d1
 mov d1,(FB_OSD_CHANNEL)
 asl 15,d0
 add 0x9bb80060,d0
 mov d0,a0
 mov (a0),d1
 mov (FB_OSD_BITS),d2
 or d2,d1
 mov d1,(a0)
1:
 ret [d2,d3],12

.section .ext11,"ax"
.balign 4
fb_title: .short 70,105,108,109,32,66,111,120,0
fb_scp_title: .short 0x80f6,0x5377,0
 .balign 4
fb_titles: .space 56*12
fb_icons: .space 56*12
fb_help: .space 56*12

.section .ext13,"ax"
/* Decode static artwork only when this private page changes film/phase. */
fb_draw:
 mov a1,(4,sp)
 mov d0,(8,sp)
 mov d1,d3                        /* nonzero when page geometry is reusable */
 mov fb_surround,a0
 mov fb_surround_palette,a3
1:
 movhu (a0),d2
 cmp 0,d2
 beq fb_panel_done
 movhu (2,a0),d1
 inc4 a0
 btst 0x8000,d2
 beq 4f
 cmp 0,d3
 beq 1b
 add d1,a0
 and 0x7fff,d2
 asl2 d2
 add d2,a1
 bra 1b
4:
 asl2 d1
 mov (d1,a3),d1
 cmp 8,d2
 bcs 2f
3:
 .irp off,0,4,8,12,16,20,24,28
 mov d1,(\off,a1)
 .endr
 add 32,a1
 add -8,d2
 cmp 8,d2
 bcc 3b
 cmp 0,d2
 beq 1b
2:
 mov d1,(a1)
 inc4 a1
 add -1,d2
 bne 2b
 bra 1b
fb_panel_done:
 mov (8,sp),d0
 and 31,d0
 clr d1
 mov '0',d2
5:
 cmp 10,d0
 bcs 6f
 add -10,d0
 inc d2
 bra 5b
6:
 add '0',d0
 movbu d2,(12,sp)
 movbu d0,(13,sp)
 mov 47,d1
 movbu d1,(15,sp)
 mov 32,d1
 movbu d1,(16,sp)
 mov 50,d1
 movbu d1,(17,sp)
 mov 48,d1
 movbu d1,(18,sp)
 clr d1
 movbu d1,(19,sp)
 mov 32,d1
 movbu d1,(14,sp)
 mov sp,a0
 add 12,a0
 mov (4,sp),a1
 add 8*FB_PITCH+348,a1
 call fb_text,[d2,d3,a2,a3],24
 /* The fixed aperture is the original 01 film gate. The neighbors, their
  * names and their square ends move on one curve through its perforations. */
 mov (8,sp),d0
 lsr 6,d0
 mov 70,d1
 mulu d1,d0
 mov fb_lanes,a3
 add d0,a3
 mov (8,sp),d0
 and 31,d0
 mov -1,d2
 call fb_find,[d2,d3,a2,a3],24
 call fb_find,[d2,d3,a2,a3],24
 call fb_find,[d2,d3,a2,a3],24
 mov d0,d3
 mov 7,d0
 mov d0,(16,sp)
fb_visible_lane:
 movhu (2,a3),d0
 cmp 0,d0
 beq 1f
 mov d3,d0
 mov a3,a0
 mov (4,sp),a1
 call fb_lane,[d2,d3,a2,a3],64
1:
 add 10,a3
 mov d3,d0
 mov 1,d2
 call fb_find,[d2,d3,a2,a3],24
 mov d0,d3
 mov (16,sp),d0
 add -1,d0
 mov d0,(16,sp)
 bne fb_visible_lane
 jmp fb_footer

/* d0 slot, a0 layout (top, sampling stride, name x/y, caption y), a1 page. */
fb_lane:
 cmp 0,d0
 beq fb_lane_end
 mov a0,(4,sp)
 mov a1,(8,sp)
 add -1,d0
 mov d0,(28,sp)
 asl 4,d0
 PVAL fb_lane_end
 mov (LPTR,a2),a0
 cmp 0,a0
 beq fb_lane_end
 add 1312,a0
 add d0,a0
 movbu (a0),d0
 cmp 0,d0
 bne 1f
 mov fb_head,a0
1:
 mov a0,(12,sp)
 call fb_identity,[d2,d3,a2,a3],20
 mov d0,(16,sp)
 mov (28,sp),d0
 call fb_label_snapshot,[d2,d3,a2,a3],32
 mov d0,(28,sp)
 cmp 0,d0
 beq 2f
 mov 48,d0
 mov d0,(44,sp)
 mov FB_LABEL_COPY+16,a0
 mov FB_LABEL_COPY,a2
fb_decode_tile:
 mov FB_LABEL_TILE,a1
 mov 576,d2
1:
 movbu (a0),d1
 inc a0
 mov 4,d3
3:
 mov d1,d0
 lsr 6,d0
 and 3,d0
 movbu d0,(a1)
 inc a1
 asl 2,d1
 add -1,d3
 bne 3b
 add -1,d2
 bne 1b
 mov FB_LABEL_TILE,a0
 bra fb_blit_label
2:
 mov 80,d0
 mov d0,(44,sp)
 /* Built-in labels are immutable. Decode each once into the unused tail
  * of the same camera allocation as the two pages. */
 mov (16,sp),d1
 mov 6400,d0
 mulu d1,d0
 mov (FB_PAGE2),a1
 add FB_PAGE_BYTES,a1
 add d0,a1
 mov a1,(32,sp)
 mov 1,d0
 asl d1,d0
 mov (FB_TAG_VALID),d2
 and d0,d2
 bne fb_expanded
 mov (16,sp),d0
 mov d0,d1
 add d0,d0
 mov fb_tag_offsets,a0
 movhu (d0,a0),d0
 mov fb_tags,a0
 add d0,a0
 mov 1600,d2
 cmp 0,d1
 beq fb_expand_four
 cmp 3,d1
 bcs fb_expand_two
 cmp 5,d1
 bhi fb_expand_two
fb_expand_four:
 mov 3200,d2
1:
 movbu (a0),d0
 inc a0
 mov d0,d3
 lsr 4,d3
 movbu d3,(a1)
 and 15,d0
 movbu d0,(1,a1)
 inc a1
 inc a1
 add -1,d2
 bne 1b
 bra fb_expanded
fb_expand_two:
1:
 movbu (a0),d0
 inc a0
 mov 4,d3
2:
 mov d0,d1
 lsr 6,d1
 and 3,d1
 movbu d1,(a1)
 inc a1
 asl 2,d0
 add -1,d3
 bne 2b
 add -1,d2
 bne 1b
fb_expanded:
 mov (16,sp),d1
 mov 1,d0
 asl d1,d0
 mov (FB_TAG_VALID),d2
 or d2,d0
 mov d0,(FB_TAG_VALID)
 mov (32,sp),a0
 mov (16,sp),d0
 asl 6,d0
 mov fb_palettes,a2
 add d0,a2
fb_blit_label:
 mov (4,sp),a3
 movhu (a3),d0
 mov FB_PITCH,d1
 mulu d1,d0
 mov (8,sp),a1
 add d0,a1
 add 88,a1
 movhu (2,a3),d3
 mov d3,(20,sp)
 mov d3,(40,sp)
 mov (44,sp),d0
 asl 8,d0
 clr d1
 mov d1,mdr
 divu d3,d0
 mov d0,(24,sp)
 mov a0,(32,sp)
 clr d0
 mov d0,(36,sp)
fb_tag_row:
 mov (36,sp),d1
 lsr 8,d1
 mov (44,sp),d0
 mulu d0,d1
 mov (32,sp),a0
 add d1,a0
 clr d2
 mov (20,sp),d3
 lsr 1,d3
1:
 mov d2,d0
 lsr 8,d0
 movbu (d0,a0),d0
 asl2 d0
 mov (d0,a2),d1
 mov d1,(a1)
 mov (24,sp),d1
 add d1,d2
 mov d2,d0
 lsr 8,d0
 movbu (d0,a0),d0
 asl2 d0
 movbu (d0,a2),d0
 movbu d0,(2,a1)
 add d1,d2
 inc4 a1
 add -1,d3
 bne 1b
 mov (20,sp),d0
 add d0,d0
 sub d0,a1
 add FB_PITCH,a1
 mov (36,sp),d0
 add d1,d0
 mov d0,(36,sp)
 mov (40,sp),d0
 add -1,d0
 mov d0,(40,sp)
 bne fb_tag_row
fb_tag_done:
 mov (4,sp),a3
 movhu (6,a3),d0
 mov FB_PITCH,d1
 mulu d1,d0
 movhu (4,a3),d1
 add d1,d1
 add d1,d0
 mov (8,sp),a1
 add d0,a1
 mov 235,d1
 movhu (4,a3),d0
 sub d0,d1
 mov (12,sp),a0
 call fb_lane_name,[d2,d3,a2,a3],32
 movhu (8,a3),d0
 cmp 0,d0
 beq fb_lane_end
 mov (8,sp),a1
 add 476*FB_PITCH+32,a1
 mov (28,sp),d0
 cmp 0,d0
 beq 4f
 mov FB_LABEL_COPY+592,a0
 mov 18,d0
 mov 224,d1
 mov 16,d3
 call fb_stamp_caption,[d2,d3,a2,a3],28
 bra fb_lane_end
4:
 mov a1,a3
 mov (16,sp),d0
 mov 12,d1
 mulu d1,d0
 mov fb_captions,a2
 add d0,a2
fb_caption_char:
 movbu (a2),d0
 cmp 0,d0
 beq fb_lane_end
 inc a2
 add -1,d0
 mov 180,d1
 mulu d1,d0
 mov fb_caption_glyphs,a0
 add d0,a0
 mov a3,a1
 mov 6,d0
 mov 30,d1
 call fb_mask,[d2,d3,a2,a3],24
 add 44,a3
 bra fb_caption_char
fb_lane_end:
 ret [d2,d3,a2,a3],64

.section .ext12,"ax"
fb_footer:
 mov (4,sp),a1
 mov fb_hint_on,a0
 mov (8,sp),d0
 btst 32,d0
 beq 4f
 mov fb_hint_off,a0
4:
 mov (4,sp),a1
 add 542*FB_PITCH+32,a1
 mov 30,d0
 mov 224,d1
 mov 30,d3
 call fb_stamp_height,[d2,d3,a2,a3],28
 ret [d2,d3,a2,a3],40

/* Twelve rows of one-bit wrapper ink; d0 is the row width in bytes. */
.section .fb_runtime,"ax"
 .macro fb_caption_bit mask,off,count
 btst \mask,d1
 beq 3f
 movbu d0,(\off,a1)
 .if \count == 2
 movbu d0,(\off+2,a1)
 .endif
3:
 .endm
fb_stamp_caption:
 /* Legacy LookLab stores the caption as a bitmap. Fit the whole source
  * into its native 240 x 30 destination, preserving transparent pixels. */
 mov a0,(4,sp)
 mov a1,a3
 clr d3
1:
 mov d3,d0
 mov 16,d1
 mulu d1,d0
 clr d1
 mov d1,mdr
 mov 30,d1
 divu d1,d0
 mov 18,d1
 mulu d1,d0
 mov (4,sp),a2
 add d0,a2
 mov a3,a1
 mov 6,d2                       /* 3 source bytes expand to 40 output pixels */
 mov 224,d0
2:
 movbu (0,a2),d1
 fb_caption_bit 128,0,2
 fb_caption_bit 64,4,2
 fb_caption_bit 32,8,1
 fb_caption_bit 16,10,2
 fb_caption_bit 8,14,2
 fb_caption_bit 4,18,1
 fb_caption_bit 2,20,2
 fb_caption_bit 1,24,2
 movbu (1,a2),d1
 fb_caption_bit 128,28,1
 fb_caption_bit 64,30,2
 fb_caption_bit 32,34,2
 fb_caption_bit 16,38,1
 fb_caption_bit 8,40,2
 fb_caption_bit 4,44,2
 fb_caption_bit 2,48,1
 fb_caption_bit 1,50,2
 movbu (2,a2),d1
 fb_caption_bit 128,54,2
 fb_caption_bit 64,58,1
 fb_caption_bit 32,60,2
 fb_caption_bit 16,64,2
 fb_caption_bit 8,68,1
 fb_caption_bit 4,70,2
 fb_caption_bit 2,74,2
 fb_caption_bit 1,78,1
 add 3,a2
 add 80,a1
 add -1,d2
 bne 2b
 add FB_PITCH,a3
 inc d3
 cmp 30,d3
 bcs 1b
 ret [d2,d3,a2,a3],28

fb_stamp_height:
 mov d0,a2
 mov d1,d0
fb_stamp_row:
 mov a1,a3
 mov a2,d2
1:
 movbu (a0),d1
 inc a0
 cmp 0,d1
 beq 4f
 .irp bit,0,1,2,3,4,5,6,7
 .set fb_hint_mask,128 >> \bit
 btst fb_hint_mask,d1
 beq 3f
 movbu d0,(2*\bit,a1)
3:
 .endr
4:
 add 16,a1
 add -1,d2
 bne 1b
 mov a3,a1
 add FB_PITCH,a1
 add -1,d3
 bne fb_stamp_row
 ret [d2,d3,a2,a3],28

.section .ext12,"ax"
/* Fixed-width bank names can occupy all 16 bytes without a terminator. */
fb_identity:
 mov a0,a2
 mov fb_names+16,a3
 mov 1,d3
fb_match_next:
 mov a2,a0
 mov a3,a1
 mov 16,d2
1:
 movbu (a0),d0
 movbu (a1),d1
 cmp d1,d0
 bne 2f
 cmp 0,d0
 beq 3f
 inc a0
 inc a1
 add -1,d2
 bne 1b
3:
 mov d3,d0
 ret [d2,d3,a2,a3],20
2:
 add 16,a3
 inc d3
 cmp FB_LOOK_COUNT,d3
 bcs fb_match_next
 clr d0
 ret [d2,d3,a2,a3],20

/* Wrap a bank name by the width between its box end and the perforations.
 * Split overlong words too. Each line stays inside the same right gutter. */
.section .fb_runtime,"ax"
fb_lane_name:
 mov a0,a2
 mov a1,a3
 mov d1,(4,sp)                     /* available pixels */
 mov 16,d0
 call fb_line_count,[d2,d3,a2,a3],20
 mov d0,d2
 mov d1,d3                         /* bytes preceding a following space */
 cmp 16,d2
 beq 1f
 movbu (d2,a2),d0
 cmp 0,d0
 beq 1f
 cmp 0,d3
 beq 2f
 mov d3,d2
2:
 mov d2,d0
 mov a2,a0
 mov a3,a1
 add -11*FB_PITCH,a1
 call fb_text_count,[d2,d3,a2,a3],24
 add d2,a2
 movbu (a2),d0
 cmp 32,d0
 bne 3f
 inc a2
 inc d2
3:
 mov 16,d0
 sub d2,d0
 mov (4,sp),d1
 mov a2,a0
 call fb_line_count,[d2,d3,a2,a3],20
 mov d0,d2
 mov a2,a0
 mov a3,a1
 add 11*FB_PITCH,a1
 bra 4f
1:
 mov a2,a0
 mov a3,a1
4:
 mov d2,d0
 cmp 0,d0
 beq 5f
 call fb_text_count,[d2,d3,a2,a3],24
5:
 ret [d2,d3,a2,a3],32

fb_line_count:
 mov a0,a2
 mov d0,a3
 clr d2
 clr d3
 mov fb_advances,a1
1:
 cmp a3,d2
 beq 4f
 movbu (d2,a2),d0
 cmp 0,d0
 beq 4f
 cmp 32,d0
 bne 2f
 mov d2,d3
2:
 add -32,d0
 cmp 95,d0
 bcs 3f
 mov 31,d0
3:
 movbu (d0,a1),d0
 sub d0,d1
 blt 4f
 inc d2
 bra 1b
4:
 mov d2,d0
 mov d3,d1
 ret [d2,d3,a2,a3],20
.section .ext13,"ax"
/* Paint the bank name using the same proportional advances as line fitting. */
fb_text:
 mov 16,d0
fb_text_count:
 mov a0,a2
 mov a1,a3
 mov d0,d3
1:
 movbu (a2),d0
 cmp 0,d0
 beq 5f
 inc a2
 add -32,d0
 cmp 95,d0
 bcs 2f
 mov 31,d0
2:
 mov fb_advances,a0
 movbu (d0,a0),d1
 mov d1,(4,sp)
 mov 192,d1
 mulu d1,d0
 mov fb_font,a0
 add d0,a0
 mov a3,a1
 mov 6,d0
 mov 32,d1
 call fb_mask,[d2,d3,a2,a3],24
 mov (4,sp),d0
 add d0,a3
 add d0,a3
 add -1,d3
 bne 1b
5:
 ret [d2,d3,a2,a3],24
/* Four 2-bit coverage samples per byte; leave chroma and clear pixels alone. */
fb_mask:
 mov d0,(4,sp)
 mov d1,d3
fb_mask_row:
 mov a1,a3
 mov (4,sp),d2
fb_mask_byte:
 movbu (a0),d1
 inc a0
 mov 4,a2
fb_mask_pixel:
 mov d1,d0
 and 0xc0,d0
 beq fb_mask_next
 /* Coverage 1/3, 2/3 and solid, on the panel's dark backing. */
 movbu (a1),d0
 cmp 180,d0
 bcs 1f
 mov d1,d0
 and 0xc0,d0
 not d0
 add -18,d0
 bra 2f
1:
 mov d1,d0
 and 0xc0,d0
 add 43,d0
2:
 movbu d0,(a1)
fb_mask_next:
 asl 2,d1
 add 2,a1
 add -1,a2
 cmp 0,a2
 bne fb_mask_pixel
 add -1,d2
 bne fb_mask_byte
 mov a3,a1
 add FB_PITCH,a1
 add -1,d3
 bne fb_mask_row
 ret [d2,d3,a2,a3],24
.section .ext13,"ax"
.balign 4
.section .ext12,"ax"
.balign 4
fb_target: .long 0,0
.set FB_TARGET,fb_target+0x40000000
.set FB_NEXT_KEY,FB_TARGET+4
.section .ext13,"ax"
/* The shooting task publishes each detent. DISPLAY acknowledges a pose
 * only after committing its page. A long burst uses one pose per slot. */
.section .fb_runtime,"ax"
.balign 4
fb_queue_state: .long 0,0,0,0
.set FB_Q_WRITE,fb_queue_state+0x40000000
.set FB_Q_READ,FB_Q_WRITE+4
.set FB_Q_ACTIVE,FB_Q_WRITE+8
.set FB_DISPLAY_MASK,FB_Q_WRITE+12
fb_queue_slots: .space 1024
fb_queue_time: .space 4096
fb_preview_state: .long 0,0
.set FB_MIRRORED,fb_preview_state+0x40000000
.set FB_FINE,FB_MIRRORED+4
fb_queue_revision: .space 8
.set FB_Q_REV,fb_queue_revision+0x40000000
.set FB_RENDER_REV,FB_Q_REV+4
fb_queue_diag: .space 8
.set FB_Q_PEAK,fb_queue_diag+0x40000000
.set FB_Q_DROPS,FB_Q_PEAK+4
fb_lag: .space 12
.set FB_LAG,fb_lag+0x40000000
fb_enqueue:
 mov d0,(8,sp)
 clr d0
 call LOCK,[d2],8
 mov d0,(4,sp)
 mov (8,sp),d0
 mov (FB_Q_WRITE),d3
 mov (FB_Q_READ),d1
 mov d3,a2
 sub d1,d3
 cmp 0,d3
 beq 8f
 mov a2,d1
 add -1,d1
 and 1023,d1
 mov fb_queue_slots+0x40000000,a1
 movbu (d1,a1),d1
 btst 128,d1
 beq 6f
 cmp 0,d2
 blt 8f
 bra 7f
6:
 cmp 0,d2
 bgt 8f
7:
 /* An opposite step undoes the newest unpresented step. Invalidate any
  * back page still painting the cancelled head before it can publish. */
 add -1,a2
 mov a2,(FB_Q_WRITE)
 mov (FB_Q_REV),d1
 inc d1
 mov d1,(FB_Q_REV)
 bra 2f
8:
 inc d3
 mov (FB_Q_PEAK),d1
 cmp d1,d3
 bls 3f
 mov d3,(FB_Q_PEAK)
3:
 cmp 1024,d3
 bls 4f
 mov (FB_Q_DROPS),d1
 inc d1
 mov d1,(FB_Q_DROPS)
 bra 2f
4:
 mov a2,d1
 and 1023,d1
 mov fb_queue_slots+0x40000000,a1
 add d1,a1
 cmp 0,d2
 bgt 1f
 or 128,d0
1:
 movbu d0,(a1)
 asl2 d1
 mov fb_queue_time+0x40000000,a1
 mov (USCLK),d3
 mov d3,(d1,a1)
 mov a2,d3
 inc d3
 mov d3,(FB_Q_WRITE)
2:
 mov (4,sp),d0
 call UNLOCK,[d2],8
 mov (8,sp),d0
 ret [d2,d3,a2,a3],32
.section .ext13,"ax"
/* d2 latest applied roll + filter flag, d0 last page. Superseded detents
 * need no display frames. Return the next paint key. */
fb_next_page:
 cmp 0,d0
 beq 4f
 mov d0,d1
 xor d2,d1
 and 31,d1
 beq 2f
 lsr 6,d0
 mov (FB_DIRECTION),d1
 cmp 0,d1
 beq 4f
 blt 1f
 cmp 5,d0
 bcs 3f
 mov 9,d1
 sub d0,d1
 mov d1,d0
 bra 6f
3:
 mov 1,d0
 bra 6f
1:
 cmp 1,d0
 bcs 7f
 cmp 5,d0
 bcc 7f
 mov 9,d1
 sub d0,d1
 mov d1,d0
 cmp 8,d0
 bls 6f
7:
 mov 5,d0
 bra 6f
2:
 lsr 6,d0
 cmp 0,d0
 beq 4f
 cmp 4,d0
 beq 4f
 cmp 8,d0
 beq 4f
 inc d0
6:
 asl 6,d0
 or d2,d0
 ret [],0
4:
 mov d2,d0
 ret [],0
.balign 4
fb_head: .asciz "Custom"
.balign 2
.include "fb_art.inc"
.set FB_RIM_OFFSET,128+2*FB_PAGE_BYTES+FB_LOOK_COUNT*6400
.set FB_RIM_END,FB_RIM_OFFSET+2048*600


.include "film_labels.inc"

.section .ext6,"ax"
.balign 4
.section .fb_runtime,"ax"
.balign 4
fb_pages: .long 0,0,0,0,0
.set FB_PAGES,fb_pages+0x40000000
.set FB_PAGE2,FB_PAGES+4
.set FB_HANDLE,FB_PAGES+8
.set FB_RETIRE,FB_PAGES+12
.set FB_TAG_VALID,FB_PAGES+16
/* The native resize bank has four 0x263400-byte elements. Acquire one
 * through the camera manager; its handle owns both aligned scanout pages. */
fb_pages_init:
 mov (SEC_READY),d0
 and 3,d0
 cmp 3,d0
 bne 9f
 clr d0
 call LOCK,[d2],8
 mov d0,d2
 clr d1
 mov d1,(FB_RETIRE)
 mov (FB_PAGES),d3
 mov d2,d0
 call UNLOCK,[d2],8
 cmp 0,d3
 bne 8f
 mov sp,a0
 add 4,a0
 mov 0x3200,d0
 call fb_mm_alloc,[d2,d3,a2,a3],52
 exthu d0
 cmp 0,d0
 bne 9f
 movhu (4,sp),d2
 mov d2,d0
 call fb_mm_address,[d2],28
 mov d0,d3
 /* Validate against the runtime bank object as well as the CPU DMA window. */
 mov (0xa31f69d8+12),d1
 cmp FB_RIM_END,d1
 bcs 7f
 mov d2,d0
 add -0x3201,d0
 cmp 3,d0
 bhi 7f
 mulu d1,d0
 mov (0xa31f69d8+8),d1
 add d1,d0
 cmp d0,d3
 bne 7f
 mov d3,d0
 and 127,d0
 bne 7f
 cmp 0xa0000000,d3
 bcs 7f
 cmp 0xb8000000-FB_RIM_END,d3
 bhi 7f
 mov d3,a0
 call fb_rim_unpack,[d2,d3,a2,a3],20
 clr d0
 call LOCK,[d2],8
 mov d0,(4,sp)
 mov (FB_PAGES),d1
 cmp 0,d1
 bne 6f
 mov d2,(FB_HANDLE)
 clr d0
 mov d0,(FB_TAG_VALID)
 mov d3,d0
 add FB_PAGE_BYTES,d0
 mov d0,(FB_PAGE2)
 mov d3,(FB_PAGES)
 mov (4,sp),d0
 call UNLOCK,[d2],8
8:
 mov 1,d0
 ret [d2,d3,a2,a3],24
6:
 /* A second opener acquired the bank while the allocator was running. */
 clr d1
 mov d1,(FB_RETIRE)
 mov (4,sp),d0
 call UNLOCK,[d2],8
 mov d2,d0
 call fb_mm_free,[],4
 bra 8b
7:
 mov d2,d0
 call fb_mm_free,[],4
9:
 clr d0
 ret [d2,d3,a2,a3],24

/* Called by DISPLAY even after the picker has disarmed the overlay. Do
 * not return a buffer until both panels have stopped scanning it and the
 * previous paint has left its critical lifetime. */
fb_retire_pages:
 clr d0
 call LOCK,[d2],8
 mov d0,d2
 clr d3
 mov (FB_RETIRE),d0
 cmp 0,d0
 beq 1f
 mov (FS_BUSY),d0
 cmp 0,d0
 bne 1f
 /* Stock can disable DMA ahead of fb_close restoring the descriptor. */
 mov (FS_OWNER),d0
 cmp 0,d0
 beq 3f
 mov (FS_OWNER+68),d1
 asl2 d1
 asl2 d1
 mov (FB_PAGES),d0
 cmp d1,d0
 beq 1f
 mov (FB_PAGE2),d0
 cmp d1,d0
 beq 1f
3:
 mov (FB_PAGES),d0
 call fs_address_in_use,[],0
 cmp 0,d0
 bne 1f
 mov (FB_PAGE2),d0
 call fs_address_in_use,[],0
 cmp 0,d0
 bne 1f
 call fb_rim_scanning,[],0
 cmp 0,d0
 bne 1f
 mov (FB_HANDLE),d3
 mov d0,(FB_PAGES)
 mov d0,(FB_PAGE2)
 mov d0,(FB_HANDLE)
 mov d0,(FB_RETIRE)
 mov d0,(FB_FRONT_PAGE)
 mov d0,(FB_CACHE)
 mov d0,(FB_CACHE+12)
1:
 mov d2,d0
 call UNLOCK,[d2],8
 cmp 0,d3
 beq 2f
 mov d3,d0
 call fb_mm_free,[],4
2:
 ret [d2,d3,a2,a3],20
/* Use the native picture-mode cell, cursor and frame. Property 261 is
 * the focused SCP setting. Preserve other picture families and movie mode. */
.section .ext12,"ax"
fb_scp_event:
 mov (FB_SCP_COLOR),d1
 cmp 1,d1
 bne fb_pass
 movbu (UI_PSW),d1
 cmp 2,d1
 bne fb_pass
 mov 261,d0
 call sget,[],4
 cmp 111,d0
 bne fb_pass
 mov 897,d0
 call ar_getv,[d2,a2],24
 cmp 901,d0
 bne fb_pass
 cmp 0x100001a,d2
 beq fb_take
 cmp 0x100001b,d2
 beq fb_scp_open
 cmp 0x1010002,d2
 beq fb_scp_open
 cmp 0x1010003,d2
 beq fb_scp_open
 cmp 0x1010005,d2
 beq fb_scp_open
 jmp fb_pass
.balign 4
fb_scp_badge_slot: .long fb_scp_badge_desc
fb_scp_badge_desc: .short 14,58,30,8,0,0
 .long fb_scp_badge_end-fb_scp_badge,fb_scp_badge+0x40000000,0
fb_scp_badge:
 .include "fb_scp.inc"
fb_scp_badge_end:
fb_scp_open:
 mov 3,d0
 mov d0,(FB_SCP_TOUCH)
 mov 0,a0
 mov fb_scp_exit,a1
 mov fb_gui_send,a2
 calls (a2)
 jmp fb_take
.balign 4
/* Native half-shutter GUI message: leave the SCP through its normal cleanup. */
fb_scp_exit: .long 4,0,0,0,0,0,0,0
/* GUI touch reports: index 109, phase, panel x/y. Only complete taps
 * beginning and ending in the native picture-mode cell belong to the film control. */
.section .hook_fb_touch,"ax"
 jmp fb_scp_touch
 nop
 nop
.section .ext12,"ax"
fb_scp_touch:
 mov a1,a2
 mov (a2),d0
 cmp 109,d0
 bne fb_scp_touch_stock
 movhu (LG_GUI),d0
 cmp 0x0304,d0
 bne fb_scp_touch_stock
 movbu (UI_PSW),d0
 cmp 2,d0
 bne fb_scp_touch_stock
 mov (FB_SCP_COLOR),d0
 cmp 1,d0
 bne fb_scp_touch_stock
 mov (12,a2),d0
 cmp 225,d0
 bcc fb_scp_touch_outside
 mov (16,a2),d0
 cmp 315,d0
 bcs fb_scp_touch_outside
 cmp 385,d0
 bcc fb_scp_touch_outside
 mov (8,a2),d0
 cmp 1,d0
 bne 1f
 mov d0,(FB_SCP_TOUCH)
 jmp fb_scp_touch_stock
1:
 cmp 4,d0
 bne fb_scp_touch_stock
 mov (FB_SCP_TOUCH),d0
 cmp 0,d0
 beq fb_scp_touch_stock
 /* Defer opening to the GUI consumer. The touch producer only posts the
  * original touch-up so the native gesture recognizer releases its capture. */
 mov 2,d0
 mov d0,(FB_SCP_TOUCH)
 bra fb_scp_touch_stock
fb_scp_touch_outside:
 clr d0
 mov d0,(FB_SCP_TOUCH)
fb_scp_touch_stock:
 mov 0x615022b4,d0
 jmp fb_touch_stock
.balign 4
/* Touch state: 1 = pressed inside, 2 = completed tap, 3 = awaiting live view. */
fb_scp_flags: .long 0,0
.set FB_SCP_COLOR,fb_scp_flags+0x40000000
.set FB_SCP_TOUCH,FB_SCP_COLOR+4
fb_open_stats: .long 0,0,0,0,0
.set FB_OPENS,fb_open_stats+0x40000000
.set FB_OPENED,FB_OPENS+4
.set FB_PUBLISHED,FB_OPENS+8
.set FB_DOWN_OPENS,FB_OPENS+12
.set FB_OPEN_GUI,FB_OPENS+16
fb_detent: .long 0
.set FB_DETENT,fb_detent+0x40000000

/* Cache the binding result for one SCP visit. */
.section .ext6,"ax"
fb_has_binding:
 mov 158,d0
 call ar_getv,[d2,a2],24
 cmp 2,d0
 bne 2f
 mov 50,d3
1:
 mov d3,d0
 call ar_getv,[d2,a2],24
 cmp FB_CODE,d0
 beq 4f
 inc d3
 cmp 54,d3
 bcs 1b
2:
 clr d3
3:
 call dm_mode,[d2,d3],12
 cmp 4,d0
 beq 4f
 inc d3
 cmp 4,d3
 bcs 3b
 mov -1,d0
 ret [d2,d3,a2,a3],20
4:
 mov 1,d0
 ret [d2,d3,a2,a3],20
 .include "film_boot_log.inc"

 .include "film_native_view.inc"

 .include "film_gate_frame.inc"
