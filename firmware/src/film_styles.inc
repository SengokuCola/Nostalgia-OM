/* Developed still only. sun_transfer expects the pitch, pair count, bus and
 * private row at the same frame offsets as Sunlit. All colour work is unlocked. */
.section .fb_runtime,"ax"
.balign 4
style_lut: .incbin "film_styles.lut"
.set style_plates,style_lut+16384
.set style_screen,style_plates+16384
.set style_inks,style_screen+4096
.balign 4
style_rolls: .space 20*8

.macro ST_INDEX
 movbu (0,a2),d0
 and 0xf0,d0
 asl 4,d0
 movbu (1,a2),d1
 and 0xf0,d1
 or d1,d0
 movbu (3,a2),d1
 lsr 4,d1
 or d1,d0
 asl2 d0
.endm
.macro ST_DELTA dst,src
 movbu (\dst,a2),d0
 movbu (\src,a0),d1
 extb d1
 add d1,d0
 cmp 255,d0
 bls 2f
 cmp 0,d0
 bge 1f
 clr d0
 bra 2f
1:
 mov 255,d0
2:
 movbu d0,(\dst,a2)
.endm

film_style_run:
 mov d0,(4,sp)
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
 cmp 0x08000000,d1
 bcs 99f
 mov d1,(20,sp)
 mov (12,sp),d2
 add -1,d2
 mov (16,sp),d1
 mul d1,d2
 mov (8,sp),d1
 asl2 d1
 add d1,d2
 mov (88,a0),d1                    /* allocator's byte count, where supplied */
 cmp 0,d1
 beq 1f
 cmp d2,d1
 bcs 99f
1:
 mov (20,sp),d1
 add d2,d1
 bcs 99f
 mov (4,sp),d1
 lsr 8,d1
 cmp 20,d1
 bcc 99f
 asl2 d0
 call malloc,[],4
 cmp 0,a0
 beq 99f
 mov a0,(24,sp)
 clr d0
 call LOCK,[d2],8
 mov d0,d2
 mov (4,sp),d0
 lsr 8,d0
 asl 3,d0
 mov style_rolls+0x40000000,a0
 add d0,a0
 mov (a0),d0
 cmp 0,d0
 bne 1f
 mov (USCLK),d0
 mov 1664525,d1
 mul d1,d0
 or 1,d0
 mov d0,(a0)
1:
 mov d0,(36,sp)
 mov (4,a0),d1
 mov (4,sp),d0
 btst 8,d0
 beq 2f
 cmp 4,d1
 bcc 2f
 inc d1
 mov d1,(4,a0)
2:
 mov d1,(40,sp)
 mov (USCLK),d0
 lsr 3,d0
 and 15,d0
 add 16,d0
 mov d0,(64,sp)                   /* back leak intensity varies per exposure */
 mov d2,d0
 call UNLOCK,[d2],8
 mov (40,sp),d0
 cmp 3,d0
 bls 3f
 mov (4,sp),d0
 and 0xf7,d0
 mov d0,(4,sp)
 cmp 0,d0
 beq style_free
3:
 clr d0
 mov d0,(28,sp)
 /* Q8 normalised horizontal coordinate, scaled again for subpixel steps. */
 mov 0x1000000,d0
 clr d1
 mov d1,mdr
 mov (8,sp),d1
 divu d1,d0
 mov d0,(44,sp)
 call FLUSH,[d2,d3],16
style_next_row:
 mov sp,a0
 mov (20,sp),d0
 clr d1
 call sun_transfer,[d2,d3,a2,a3],32
 cmp 0,d0
 beq style_free
 mov (24,sp),a2
 mov (8,sp),d3
 mov (28,sp),d2
 mov (4,sp),d0
 btst 2,d0
 beq style_print
style_ir_pair:
 ST_INDEX
 mov style_lut,a0
 add d0,a0
 movbu (3,a0),d1
 cmp 0,d1
 beq 4f
 ST_DELTA 0,0
 ST_DELTA 2,0
 ST_DELTA 1,1
 ST_DELTA 3,2
4:
 add 4,a2
 add -1,d3
 bne style_ir_pair
style_print:
 mov (4,sp),d0
 btst 4,d0
 beq style_light
 /* Work in pair coordinates. Scale screen pitch with image size. */
 clr d1
 mov (8,sp),d0
 cmp 640,d0
 bcs 1f
 inc d1
 cmp 1536,d0
 bcs 1f
 inc d1
1:
 mov d1,(48,sp)
 inc d1
 lsr d1,d2
 and 31,d2
 asl 7,d2
 mov style_screen,a3
 add d2,a3
 mov (24,sp),a2
 clr d3
style_print_pair:
 ST_INDEX
 mov style_plates,a0
 mov (d0,a0),d0
 or 0x80808080,d0
 mov d3,d2
 mov (48,sp),d1
 lsr d1,d2
 and 31,d2
 asl2 d2
 mov (d2,a3),d1
 sub d1,d0
 and 0x80808080,d0
 lsr 7,d0
 mov 0x01020408,d1
 mul d1,d0
 lsr 24,d0
 asl2 d0
 mov style_inks,a0
 mov (d0,a0),d0
 mov d0,(a2)
 add 4,a2
 inc d3
 mov (8,sp),d0
 cmp d0,d3
 bcs style_print_pair
style_light:
 mov (4,sp),d0
 and 24,d0
 beq style_write
 /* Vary the side, slope and width with the roll seed. */
 mov (28,sp),d0
 asl 8,d0
 clr d1
 mov d1,mdr
 mov (12,sp),d1
 divu d1,d0
 add -128,d0
 mov (36,sp),d1
 lsr 16,d1
 and 63,d1
 add -32,d1
 mul d1,d0
 asr 8,d0
 mov (36,sp),d1
 lsr 8,d1
 and 63,d1
 add 60,d1
 add d1,d0
 mov d0,(52,sp)                   /* first frame boundary */
 mov (24,sp),a2
 mov (8,sp),d3
 clr d2
style_light_pair:
 mov d2,d1
 lsr 16,d1
 mov (36,sp),d0
 btst 2,d0
 beq 1f
 xor 255,d1
1:
 mov d1,(56,sp)
 clr d0
 mov d0,(60,sp)
 mov (4,sp),d0
 btst 8,d0
 beq 4f
 mov (40,sp),d0
 cmp 1,d0
 bne 2f
 mov (52,sp),d0
 sub d1,d0
 add 16,d0
 asl2 d0
 bra 3f
2:
 cmp 3,d0
 bhi 4f
 mov 32,d1
 mov (56,sp),a0
 sub a0,d1
 add -1,d0
 asr d0,d1
 mov d1,d0
3:
 cmp 0,d0
 ble 4f
 mov d0,(60,sp)
4:
 mov (4,sp),d0
 btst 16,d0
 beq 6f
 mov (36,sp),d0
 lsr 24,d0
 and 31,d0
 add 8,d0
 mov (56,sp),d1
 sub d0,d1
 bge 5f
 not d1
 inc d1
5:
 mov (64,sp),d0
 sub d1,d0
 cmp 0,d0
 ble 6f
 mov (60,sp),d1
 add d1,d0
 mov d0,(60,sp)
6:
 mov (60,sp),d0
 cmp 0,d0
 beq 8f
 cmp 63,d0
 bls 7f
 mov 63,d0
7:
 asl 3,d0
 mov style_light_table,a0
 add d0,a0
 /* Y/Cb/Cr := (input * transmission + premultiplied highlight)/128. */
 .macro ST_MIX field,coef,bias
 movbu (\field,a2),d0
 movbu (\coef,a0),d1
 mul d1,d0
 movhu (\bias,a0),d1
 add d1,d0
 lsr 7,d0
 movbu d0,(\field,a2)
 .endm
 ST_MIX 0,0,2
 ST_MIX 2,0,2
 ST_MIX 1,0,4
 ST_MIX 3,0,6
8:
 mov (44,sp),d0
 add d0,d2
 add 4,a2
 add -1,d3
 bne style_light_pair
style_write:
 mov sp,a0
 mov (20,sp),d0
 mov 1,d1
 call sun_transfer,[d2,d3,a2,a3],32
 cmp 0,d0
 beq style_free
 mov (16,sp),d0
 mov (20,sp),d1
 add d1,d0
 mov d0,(20,sp)
 mov (28,sp),d0
 inc d0
 mov d0,(28,sp)
 mov (12,sp),d1
 cmp d1,d0
 bcs style_next_row
style_free:
 mov (24,sp),a0
 call free,[],4
99:
 ret [d2,d3,a2,a3],88
.balign 4
style_light_table: .incbin "film_light.lut"
