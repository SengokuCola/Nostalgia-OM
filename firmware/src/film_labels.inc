/* Optional OM3L trailer. A complete verified bank is published in one swap.
 * The DISPLAY reader copies one record under the same lock, then draws unlocked. */
.section .ext13,"ax"
.balign 4
fb_label_bank: .long 0
.set FB_LABEL_BANK,fb_label_bank+0x40000000
.section .fb_runtime,"ax"
.balign 4
fb_label_scratch: .space 880+80*80
.set FB_LABEL_COPY,fb_label_scratch+0x40000000
.section .ext13,"ax"
.set FB_LABEL_TILE,FB_LABEL_COPY+880

fb_publish_labels:
 mov d0,a3
 clr d0
 call LOCK,[d2],8
 mov (FB_LABEL_BANK),a2
 mov a3,(FB_LABEL_BANK)
 call UNLOCK,[d2],8
 cmp 0,a2
 beq 1f
 mov (1632,a2),a0
 call free,[],4
 mov a2,a0
 call free,[],4
1:
 ret [d2,d3,a2,a3],24

fb_read_labels:
 mov a0,a3
 mov a1,(24,sp)
 mov sp,a0
 add 4,a0
 mov a3,a1
 mov 1,d0
 mov 16,d1
 call fread,[d2,d3,a2,a3],24
 cmp 16,d0
 bne 7f
 mov (4,sp),d0
 cmp 0x4c334d4f,d0
 bne 7f
 mov (8,sp),d0
 cmp 20496,d0
 bne 7f
 mov (24,sp),a0
 call ub_id,[d2,d3],12
 mov (16,sp),d1
 cmp d1,d0
 bne 7f
 /* The camera allocator has a 16 KiB per-allocation ceiling. */
 mov 1636+10240,d0
 call malloc,[],4
 cmp 0,a0
 beq 7f
 mov a0,a2
 mov 10240,d0
 call malloc,[],4
 cmp 0,a0
 beq 5f
 mov a0,(1632,a2)
 mov a2,a0
 mov (24,sp),a1
 mov 1632,d1
 call ub_cpy,[],0
 mov a2,a0
 add 1636,a0
 mov a3,a1
 mov 1,d0
 mov 10240,d1
 call fread,[d2,d3,a2,a3],24
 cmp 10240,d0
 bne 6f
 mov (1632,a2),a0
 mov a3,a1
 mov 1,d0
 mov 10240,d1
 call fread,[d2,d3,a2,a3],24
 cmp 10240,d0
 bne 6f
 mov a2,a0
 add 1636,a0
 mov -1,d0
 mov 10240,d1
 call sd_crc,[d2,d3],12
 mov (1632,a2),a0
 mov 10240,d1
 call sd_crc,[d2,d3],12
 not d0
 mov (12,sp),d1
 cmp d1,d0
 bne 6f
 mov a2,d0
 bra 8f
6:
 mov (1632,a2),a0
 call free,[],4
5:
 mov a2,a0
 call free,[],4
7:
 clr d0
8:
 call fb_publish_labels,[d2,d3,a2,a3],24
 ret [d2,d3,a2,a3],56

/* Compare the actual active slot, since a previously seen card bank may lose
 * to the internal bank. No SD reads or heap allocation on the display task. */
fb_label_snapshot:
 clr d1
 bra fb_record_snapshot
/* a1 = effective native slot. Preserve the capture flag word and slot in
 * the caller. Return slot index (bits 8..12) and single-frame effects. */
.section .fb_runtime,"ax"
film_style_slot:
 mov a1,(4,sp)
 mov d1,(8,sp)
 PVAL 8f
 mov a1,d0
 sub a2,d0
 add -32,d0
 cmp 192,d0
 bhi 8f
 btst 63,d0
 bne 8f
 lsr 6,d0
 mov d0,d2
 mov a2,a0
 add d0,a0
 movbu (LIDX,a0),d1
 add -1,d1
 cmp 4,d1
 bhi 8f
 asl2 d0
 add d2,d0
 add d1,d0
 mov 1,d1
 call fb_record_snapshot,[d2,d3,a2,a3],32
 bra 9f
8:
 clr d0
9:
 mov (4,sp),a1
 mov (8,sp),d1
 ret [d2,d3,a2,a3],28
.section .ext13,"ax"
fb_record_snapshot:
 mov d1,(12,sp)
 mov d0,(4,sp)
 clr d0
 call LOCK,[d2],8
 mov d0,(8,sp)
 mov (FB_LABEL_BANK),a3
 cmp 0,a3
 beq 8f
 PVAL 8f
 mov (LPTR,a2),a1
 cmp 0,a1
 beq 8f
 mov a3,a0
 mov (4,sp),d0
 asl 6,d0
 add 32,d0
 add d0,a0
 add d0,a1
 mov 16,d2
1:
 mov (a0),d0
 mov (a1),d1
 cmp d1,d0
 bne 8f
 inc4 a0
 inc4 a1
 add -1,d2
 bne 1b
 mov (LPTR,a2),a1
 mov a3,a0
 mov (4,sp),d0
 asl 4,d0
 add 1312,d0
 add d0,a1
 add d0,a0
 mov 4,d2
2:
 mov (a0),d0
 mov (a1),d1
 cmp d1,d0
 bne 8f
 inc4 a0
 inc4 a1
 add -1,d2
 bne 2b
 mov (4,sp),d0
 cmp 10,d0
 bcs 3f
 add -10,d0
 mov (1632,a3),a1
 bra 4f
3:
 mov a3,a1
 add 1636,a1
4:
 asl 10,d0
 add d0,a1
 mov (12,sp),d0
 cmp 0,d0
 beq 5f
 movbu (976,a1),d3
 cmp 31,d3
 bhi 8f
 and 30,d3
 beq 9f
 mov (4,sp),d0
 asl 8,d0
 or d0,d3
 bra 9f
5:
 movbu (a1),d0
 add -1,d0
 cmp 3,d0
 bcc 8f
 add 96,a1
 mov FB_LABEL_COPY,a0
 mov 880,d1
 call ub_cpy,[],0
 mov 1,d3
 bra 9f
8:
 clr d3
9:
 mov (8,sp),d0
 call UNLOCK,[d2],8
 mov d3,d0
 ret [d2,d3,a2,a3],32
