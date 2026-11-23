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
 movhu (LG_GUI),d1
 cmp 0x0801,d1
 bne fb_pass
 movbu (UI_PSW),d1
 cmp 2,d1
 bne fb_pass
 mov (FB_RELEASE),d1
 cmp 0,d1
 beq 1f
 sub d1,d0
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
 cmp 0x100001a,d2                 /* OK down */
 beq fb_apply
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
 mov d0,d2
 bgt 2f
 mov -1,d2
 bra 3f
2:
 mov 1,d2
3:
 mov (FB_SLOT),d0
 call fb_find,[d2,d3,a2,a3],24
 cmp 0,d0
 beq fb_take
 mov d0,(FB_SLOT)
 call fb_candidate,[d2,d3,a2,a3],20
 bra fb_take
fb_apply:
 mov d2,(FB_RELEASE)
 mov (FB_SLOT),d2
 call fb_close,[d2,d3,a2,a3],24
 mov (rc_in),a0
 cmp 0,a0
 beq fb_take
 mov 897,d0
 call ar_getv,[d2,a2],24
 cmp 901,d0
 bne fb_take
 mov (rc_in),a0
 mov 0,a1
 mov 901,d0
 mov d2,d1
 add FV0-1,d1
 call sx_set,[d2,d3,a2,a3],68
 bra fb_take
fb_key_open:
 mov d2,d0
 add -0x100000a,d0
 cmp 12,d0
 bhi fb_pass
 btst 3,d0
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
 mov d2,(FB_RELEASE)
 mov 897,d0
 call ar_getv,[d2,a2],24
 cmp 901,d0
 bne fb_take
 mov (rc_in),d0
 cmp 0,d0
 beq fb_take
 call mf_ld,[d2,d3,a2,a3],20
 mov 901,d0
 call fb_setting,[],4
 call fl_k,[],0
 cmp 0,d0
 blt fb_take
 mov d0,d2
 PVAL fb_take
 mov a2,a0
 add d2,a0
 movbu (LIDX,a0),d1
 mov d2,d0
 asl2 d0
 add d2,d0
 cmp 1,d1
 bcs 4f
 cmp 5,d1
 bhi 4f
 add d1,d0
 add -1,d0
4:
 mov 1,d2
 call fb_find,[d2,d3,a2,a3],24
 cmp 0,d0
 beq fb_take
 mov d0,(FB_SLOT)
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

/* Publish only a pointer to a look record. Browsing must not set camera
 * properties or update the film banks. Resolve saved edits once per detent. */
fb_candidate:
 add -1,d0
 mov d0,d2
 PVAL 3f
 mov (LPTR,a2),a3
 cmp 0,a3
 beq 3f
 asl 6,d0
 add 32,d0
 add d0,a3
 mov (TORG,a2),a1
 cmp 0,a1
 beq 2f
 add TWO,a1
 mov (12,a1),d0
 lsr d2,d0
 btst 1,d0
 beq 2f
 mov d2,d0
 call nf_cur,[d2,d3,a2,a3],20
 cmp 0,d0
 beq 2f
 mov d2,d0
 asl 6,d0
 asl2 d2
 add d2,d0
 add 16,d0
 add d0,a1
 mov a1,a3
2:
 mov a3,(FB_PREVIEW)
 ret [d2,d3,a2,a3],20
3:
 clr d0
 mov d0,(FB_PREVIEW)
 ret [d2,d3,a2,a3],20

/* From the verified section-6 gate in hl_pp_cb. Only the two still-camera
 * live request types take the candidate. The native builder obtains its
 * 12 saturation sectors at R+1739; give it the look's sector array instead.
 * hl_values consumes the hue/lightness arrays from the SAME record. */
fb_color_source:
 mov (FB_PREVIEW),d2
 cmp 0,d2
 beq 9f
 mov (FB_SLOT),d3
 cmp 0,d3
 beq 9f
 mov (4,a2),a1
 movhu (14,a1),d3
 cmp 0x30,d3
 beq 1f
 cmp 0x130,d3
 bne 9f
1:
 mov d2,a1
 add 24,a1
 movhu (0x606bb1d8),d0
 mov (12,a2),d1
 mov 0x606ba608,a0
 call color_builder,[d2,d3,a2,a3],96
 mov d2,a1
 mov 2,d0
 ret [d2,d3,a2],16
9:
 jmp slot_any

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
 mov (FB_SLOT),d0
 cmp 0,d0
 beq 1f
 clr d0
 mov d0,(FB_PREVIEW)
 mov d0,(FB_SLOT)
 call fs_clear,[d2,d3,a2,a3],24
 mov (FB_ARMED),d0
 cmp 0,d0
 beq 1f
 clr d0
 mov d0,(FB_ARMED)
 mov d0,(FS_ON)
1:
 ret [d2,d3,a2,a3],24

.balign 4
fb_preview: .long 0
.set FB_PREVIEW,fb_preview+0x40000000
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
 and -16,d1
1:
 jmp fb_stock_dma
.section .ext13,"ax"
.balign 4
fb_osd_bits: .long 0
.set FB_OSD_BITS,fb_osd_bits+0x40000000
fb_osd_hide:
 mov (FB_OSD_CHANNEL),d1
 cmp d0,d1
 beq 1f
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
1:
 ret [d2,d3],12
fb_osd_restore:
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

fb_title: .short 70,105,108,109,32,66,111,120,0
 .balign 4
fb_titles: .space 56*12
fb_icons: .space 56*12
fb_help: .space 56*12

/* Paint the 256 x 144 picker into its owned YCbYCr surface. */
fb_draw:
 mov a1,(4,sp)
 mov d0,(8,sp)                    /* snapshot of the one-based slot */
 call fb_unpack,[d2,d3,a2,a3],20
 mov (4,sp),a1
 mov 0x80268026,d1
 mov 256*144/2,d2
1:
 mov d1,(a1)
 inc4 a1
 add -1,d2
 bne 1b
 /* Brushed metal bezel, inner bevel and recessed OK plate. Coordinates
  * are in pixel pairs so every stroke writes complete chroma pairs. */
 mov fb_trim,a2
fb_trim_part:
 movbu (2,a2),d2
 cmp 0,d2
 beq fb_trim_done
 movbu (1,a2),d0
 asl 9,d0
 mov (4,sp),a1
 add d0,a1
 movbu (a2),d0
 asl2 d0
 add d0,a1
 movbu (4,a2),d0
 asl2 d0
 mov fb_finishes,a0
 mov (d0,a0),d1
 movbu (3,a2),d3
fb_trim_row:
 mov a1,a0
 mov d2,d0
1:
 mov d1,(a0)
 inc4 a0
 add -1,d0
 bne 1b
 add 512,a1
 add -1,d3
 bne fb_trim_row
 add 5,a2
 bra fb_trim_part
fb_trim_done:
 mov fb_panel,a0
 mov (4,sp),a1
 add 10*512+24,a1
 mov 33,d0
 mov 21,d1
 call fb_mask,[d2,d3,a2,a3],24
 mov fb_panel+693,a0
 mov (4,sp),a1
 add 112*512+52,a1
 mov 33,d0
 mov 21,d1
 call fb_mask,[d2,d3,a2,a3],24
fb_panel_done:
 mov (8,sp),d0
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
 movbu d1,(14,sp)
 mov sp,a0
 add 12,a0
 mov (4,sp),a1
 add 10*512+164,a1
 call fb_text,[d2,d3,a2,a3],24
 PVAL 8f
 mov (LPTR,a2),a0
 cmp 0,a0
 beq 8f
 mov (8,sp),d0
 add -1,d0
 asl 4,d0
 add d0,a0
 add 1312,a0
 movbu (a0),d0
 cmp 0,d0
 bne 7f
 mov fb_head,a0
7:
 mov a0,(12,sp)
 mov (4,sp),a1
 add 39*512+24,a1
 call fb_text,[d2,d3,a2,a3],24
 mov (12,sp),a0
 call fb_identity,[d2,d3,a2,a3],20
 bra fb_art
8:
 clr d0
fb_art:
 mov d0,(12,sp)
 mov (4,sp),a1
 add 65*512+24,a1
 mov a1,a3
 mov 12,d1
 mulu d1,d0
 mov fb_captions,a2
 add d0,a2
fb_caption_char:
 movbu (a2),d0
 cmp 0,d0
 beq fb_caption_done
 inc a2
 cmp FB_COMMA,d0
 bne 1f
 mov (4,sp),a3
 add 85*512+24,a3
 bra fb_caption_char
1:
 add -1,d0
 mov 100,d1
 mulu d1,d0
 mov fb_caption_glyphs,a0
 add d0,a0
 mov a3,a1
 mov 5,d0
 mov 20,d1
 call fb_mask,[d2,d3,a2,a3],24
 add 36,a3
 bra fb_caption_char
fb_caption_done:
 mov (12,sp),d0
 mov fb_families,a2
 movbu (d0,a2),d0
 asl 7,d0
 mov fb_palettes,a2
 add d0,a2
 mov fb_can,a0
 mov (4,sp),a1
 add 11*512+352,a1
 mov 120,d3
fb_can_row:
 mov 38,d2
1:
 movbu (a0),d0
 asl2 d0
 mov (d0,a2),d1
 movbu (1,a0),d0
 asl2 d0
 movbu (d0,a2),d0
 mov d1,(a1)
 movbu d0,(2,a1)
 add 2,a0
 inc4 a1
 add -1,d2
 bne 1b
 add 360,a1
 add -1,d3
 bne fb_can_row
 mov (12,sp),d0
 mov 72,d1
 mulu d1,d0
 mov fb_stamps,a0
 add d0,a0
 mov (4,sp),a1
 add 55*512+376,a1
 mov 12,d3
fb_stamp_row:
 mov 6,d2
1:
 movbu (a0),d1
 inc a0
 mov 8,a2
2:
 btst 128,d1
 beq 3f
 mov 26,d0
 movbu d0,(a1)
3:
 add d1,d1
 add 2,a1
 add -1,a2
 cmp 0,a2
 bne 2b
 add -1,d2
 bne 1b
 add 416,a1
 add -1,d3
 bne fb_stamp_row
 ret [d2,d3,a2,a3],32

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

/* Paint up to 16 ASCII glyphs, seven pixels apart. Only change luma. */
fb_text:
 mov a0,a2
 mov a1,a3
 mov 16,d3
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
 mov 54,d1
 mulu d1,d0
 mov fb_font,a0
 add d0,a0
 mov a3,a1
 mov 3,d0
 mov 18,d1
 call fb_mask,[d2,d3,a2,a3],24
 add 20,a3
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
 add 43,d0
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
 add 512,a1
 add -1,d3
 bne fb_mask_row
 ret [d2,d3,a2,a3],24
.balign 4
fb_finishes:
 .long 0x80198019,0x863c793c,0x89597859,0x927a737a,0x93986e98,0x80328032
fb_trim:
 /* x/2, y, width/2, height, finish. Stepped corners keep the frame off the text. */
 .byte 2,0,124,1,1, 1,1,126,2,3, 2,2,124,1,4
 .byte 0,3,1,137,2, 1,3,1,136,3, 126,3,1,137,2, 127,3,1,138,1
 .byte 1,140,126,2,2, 2,142,124,1,1, 3,143,122,1,0
 .byte 3,4,122,1,0, 2,5,1,132,0, 125,5,1,132,0, 3,138,122,1,2
 /* Pressed switch surround and inset face. */
 .byte 9,107,35,1,0, 8,108,1,22,0, 9,108,35,22,5
 .byte 44,108,1,22,2, 9,130,35,1,2, 10,109,33,1,1
 /* Recessed pin heads on the four corners. */
 .byte 3,6,2,2,3, 124,6,1,2,3, 3,135,1,2,2, 124,135,1,2,2
 .byte 0,0,0,0,0
fb_head: .asciz "FILM BOX"
.balign 2
.include "fb_art.inc"

fb_unpack:
 mov fb_atlas,a0
 mov fb_font,a1
fb_unpack_packet:
 cmp fb_atlas_end,a0
 bcc fb_unpack_done
 movbu (a0),d0
 inc a0
 cmp 128,d0
 bcc fb_unpack_match
 inc d0
1:
 movbu (a0),d1
 inc a0
 movbu d1,(a1)
 inc a1
 add -1,d0
 bne 1b
 bra fb_unpack_packet
fb_unpack_match:
 add -125,d0
 movbu (a0),d1
 movbu (1,a0),d2
 asl 8,d2
 or d2,d1
 add 2,a0
 mov a1,a2
 sub d1,a2
2:
 movbu (a2),d1
 inc a2
 movbu d1,(a1)
 inc a1
 add -1,d0
 bne 2b
 bra fb_unpack_packet
fb_unpack_done:
 ret [d2,d3,a2,a3],20
