/* A private 8-bit OSD1 surface. Only the rear LCD uses it. Keep the stock
 * position and pixel format; temporarily own 32 palette entries. Only rebind the base; use the native row pitch.
 * Follow stock buffer rotations while open, so exit restores its latest base. */
.section .fb_runtime,"ax"
.balign 4
fb_rim_state: .space 8
.set RIM_DMA,fb_rim_state+0x40000000
.set RIM_BASE,RIM_DMA+4

fb_rim_unpack:
 add FB_RIM_OFFSET,a0
 mov (0x9bb903b4),d2
 cmp 64,d2
 bcs 5f
 cmp 128,d2
 bhi 5f
 btst 7,d2
 beq 6f
5:
 mov 104,d2                      /* standard E147 shooting pitch */
6:
 mov d2,(-4,a0)
 asl 4,d2
 add -1024,d2
 mov 256,d3
 mov fb_rim_runs,a1
 mov fb_rim_words,a2
1:
 movbu (a1),d0
 cmp 0,d0
 beq 3f
 sub d0,d3
 movbu (1,a1),d1
 add 2,a1
 asl2 d1
 mov (d1,a2),d1
2:
 mov d1,(a0)
 inc4 a0
 add -1,d0
 bne 2b
 cmp 0,d3
 bne 1b
 add d2,a0
 mov 256,d3
 bra 1b
3:
 ret [d2,d3,a2,a3],20

fb_rim_mask:                     /* stock GUI DMA-enable setter */
 mov d1,d3
 mov d0,d2
 call fb_rim_bind,[d2,d3,a2,a3],20
 and -16,d3
 or d3,d0
 mov d0,d1
 mov d2,d0
 jmp fb_stock_dma

fb_rim_refresh:
 call fb_rim_bind,[d2,d3,a2,a3],20
 mov (0x9bb90060),d1
 and -16,d1
 or d0,d1
 mov d1,(0x9bb90060)
 ret [d2,d3],12

fb_rim_bind:
 mov 0x9bb90000,a3
 mov (FB_SLOT),d0
 cmp 0,d0
 beq 8f
 mov (FB_PAGES),a2
 cmp 0,a2
 beq 8f
 mov (0x420,a3),d1
 mov (0x450,a3),d0
 cmp d0,d1
 bne 8f
 exthu d0
 cmp 900,d0
 bne 8f
 mov (0x424,a3),d1
 mov (0x454,a3),d0
 cmp d0,d1
 bne 8f
 exthu d0
 cmp 600,d0
 bne 8f
 mov (0x534,a3),d0
 cmp 0,d0
 bne 8f
 mov (0x3dc,a3),d0
 extbu d0
 cmp 0,d0
 bne 8f
 mov (0x3cc,a3),d0
 cmp 64,d0
 bne 8f
 mov (0x40c,a3),d0
 and 15,d0
 cmp 1,d0
 bne 8f
 mov (0x62c,a3),d0
 cmp 0x100,d0
 bne 8f
 add FB_RIM_OFFSET,a2
 mov (-4,a2),d0
 mov (0x3b4,a3),d1
 cmp d1,d0
 bne 8f
 call fb_rim_inks,[d2,d3,a2,a3],20
 mov a2,d2
 lsr 4,d2
 mov (0x39c,a3),d0
 cmp d2,d0
 beq 4f
 mov d0,(RIM_BASE)
 mov d2,(RIM_DMA)
 mov d2,(0x39c,a3)
4:
 mov 4,d0
 ret [d2,d3,a2,a3],20
8:
 call fb_rim_release,[d2,d3,a2,a3],20
 clr d0
 ret [d2,d3,a2,a3],20

fb_rim_release:
 mov (RIM_DMA),d2
 cmp 0,d2
 beq 3f
 mov 0x9bb90000,a3
 mov (0x39c,a3),d0
 cmp d2,d0
 bne 1f
 mov (0x60,a3),d0
 and -5,d0
 mov d0,(0x60,a3)
 mov (RIM_BASE),d0
 mov d0,(0x39c,a3)
1:
 clr d0
 mov d0,(RIM_DMA)
 call fb_rim_inks_release,[d2,d3,a2,a3],20
3:
 ret [d2,d3,a2,a3],20

fb_rim_scanning:
 mov (FB_PAGES),d0
 add FB_RIM_OFFSET,d0
 lsr 4,d0
 mov (0x9bb90060),d1
 btst 4,d1
 beq 1f
 mov (0x9bb9039c),d1
 cmp d1,d0
 beq 2f
1:
 mov (0x9bb92060),d1
 btst 4,d1
 beq 3f
 mov (0x9bb9239c),d1
 cmp d1,d0
 bne 3f
2:
 mov 1,d0
 ret [],0
3:
 clr d0
 ret [],0

.balign 4
fb_rim_inks_state: .space 2*132
.set RIM_INKS,fb_rim_inks_state+0x40000000
/* Each bank holds {owned, previous[32]}. Preserve the latest stock upload;
 * the remaining indices, including transparent index zero, stay native. */
fb_rim_inks:
 mov RIM_INKS,a2
 mov 0x9bb944c0,a3
 mov (0x9bb904e0),d0
 btst 1,d0
 beq 1f
 add 132,a2
 add 0x400,a3
1:
 mov fb_rim_palette,a0
 mov (a2),d3
 cmp 0,d3
 beq 2f
 mov (a3),d0
 mov (a0),d1
 cmp d1,d0
 bne 2f
 mov (124,a3),d0
 mov (124,a0),d1
 cmp d1,d0
 beq 5f
2:
 mov 1,d0
 mov d0,(a2)
 inc4 a2
 mov 32,d2
3:
 mov (a0),d1
 mov (a3),d0
 cmp 0,d3
 beq 4f
 cmp d1,d0
 beq 6f
4:
 mov d0,(a2)
 mov d1,(a3)
6:
 inc4 a2
 inc4 a3
 inc4 a0
 add -1,d2
 bne 3b
5:
 ret [d2,d3,a2,a3],20

fb_rim_inks_release:
 mov RIM_INKS,a2
 mov 0x9bb944c0,a3
 mov 2,d3
1:
 mov (a2),d0
 cmp 0,d0
 beq 4f
 clr d0
 mov d0,(a2)
 mov a2,a1
 inc4 a1
 mov a3,a0
 mov fb_rim_palette,a2
 mov 32,d2
2:
 mov (a0),d0
 mov (a2),d1
 cmp d1,d0
 bne 3f
 mov (a1),d0
 mov d0,(a0)
3:
 inc4 a1
 inc4 a2
 inc4 a0
 add -1,d2
 bne 2b
 mov a1,a2
 bra 5f
4:
 add 132,a2
5:
 add 0x400,a3
 add -1,d3
 bne 1b
 ret [d2,d3,a2,a3],20
