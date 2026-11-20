/* Observe native driver submissions. Each tail jump uses the stock call's
 * frame and packet, including the native completion callback. The guard is
 * in the same loader section as all instrumented calls. */
.macro dr_site entry, kind, target
\entry:
 add -12,sp
 mov d0,(4,sp)
 mov mdr,d0
 mov d0,(8,sp)
 mov \kind,d0
 call dr_gate,[d2,d3,a2,a3],40
 mov (8,sp),d0
 mov d0,mdr
 mov (4,sp),d0
 add 12,sp
 jmp \target
.endm
.section .hook_dr_abs,"ax"
 call dr_abs,[d2,a2,a3],20
.section .ext4,"ax"
 dr_site dr_abs,1,dr_stock_abs
.section .hook_dr_sync,"ax"
 call dr_sync,[d2,d3,a2,a3],32
.section .ext4,"ax"
 dr_site dr_sync,2,dr_stock_sync
.section .hook_dr_async,"ax"
 call dr_async,[a2,a3],16
.section .ext4,"ax"
 dr_site dr_async,3,dr_stock_async
.section .hook_dr_main,"ax"
 call dr_main,[a2],12
.section .ext4,"ax"
 dr_site dr_main,4,dr_stock_main
.section .hook_dr_sub,"ax"
 call dr_sub,[a2],12
.section .ext4,"ax"
 dr_site dr_sub,5,dr_stock_sub
.section .hook_dr_abs2,"ax"
 call dr_abs2,[d2,a2,a3],20
.section .ext4,"ax"
 dr_site dr_abs2,6,dr_stock_abs2
.section .hook_dr_mft_move,"ax"
 call dr_mft_move,[d2,d3,a2],28
.section .ext4,"ax"
 dr_site dr_mft_move,7,dr_stock_mft_move
.section .hook_dr_mft_move2,"ax"
 call dr_mft_move2,[d2,d3,a2],32
.section .ext4,"ax"
 dr_site dr_mft_move2,8,dr_stock_mft_move2
.section .hook_dr_mft_ofs,"ax"
 call dr_mft_ofs,[d2,d3,a2],32
.section .ext4,"ax"
 dr_site dr_mft_ofs,9,dr_stock_mft_ofs
.section .hook_dr_mft_ofs2,"ax"
 call dr_mft_ofs2,[d2,d3,a2],32
.section .ext4,"ax"
 dr_site dr_mft_ofs2,10,dr_stock_mft_ofs2
.section .ext4,"ax"
dr_gate:
 mov (FS_ON),d2
 cmp 1,d2
 bne dr_out
 mov (SEC_READY),d2
 and 32,d2
 beq dr_out
 jmp dr_active
dr_out:
 ret [d2,d3,a2,a3],40
.section .ext13,"ax"
dr_active:
 mov (PH_MODE),d2
 cmp 1,d2
 beq 1f
 ret [d2,d3,a2,a3],40
1:
 mov d1,(4,sp)
 mov a0,(8,sp)
 mov a1,(12,sp)
 mov d0,d3
 mov a0,a2
 clr d0
 call LOCK,[d2],8
 mov d0,(16,sp)
 mov (DR_HEAD),d2
 inc d2
 mov d2,d0
 and 63,d0
 asl 4,d0
 mov DR_ROWS,a3
 add d0,a3
 mov d2,(a3)
 mov (0x98900284),d1
 mov 0x7fffffff,d0
 sub d1,d0
 and 0x7fffffff,d0
 mov d0,(4,a3)
 mov d3,d0
 asl 16,d0
 cmp 7,d3
 bcs dr_short_packet
 cmp 9,d3
 bcc dr_mft_offset
 movhu (56,a2),d1              /* lv.iaf_target, lv.iaf_flg */
 or d1,d0
 mov d0,(8,a3)
 movbu (58,a2),d0
 bra dr_aux
 dr_mft_offset:
 movhu (54,a2),d1              /* lv.ofs_move, lv.ofs_time */
 or d1,d0
 mov d0,(8,a3)
 movhu (52,a2),d0
 bra dr_aux
 dr_short_packet:
 movhu (a2),d1
 or d1,d0
 mov d0,(8,a3)
 clr d0
 cmp 1,d3
 beq dr_abs_flag
 cmp 6,d3
 bne dr_source
dr_abs_flag:
 movbu (2,a2),d0
dr_aux:
 asl 16,d0
dr_source:
 movhu (0xa33eabe4),d1
 or d1,d0
 mov d0,(12,a3)
 mov d2,(DR_HEAD)
 mov (16,sp),d0
 call UNLOCK,[d2],8
 mov (4,sp),d1
 mov (8,sp),a0
 mov (12,sp),a1
 ret [d2,d3,a2,a3],40

/* Shutter logger owns the snapshot. Copy whole slots at a time under the
 * same short critical section as the producer. Sequence tags detect reuse. */
.section .ext13,"ax"
.balign 4
dr_head: .long 0
dr_rows: .space 1024
.set DR_HEAD,dr_head+0x40000000
.set DR_ROWS,dr_rows+0x40000000
dr_file: .ascii "OMLD"
 .long 1,64,16,0
 .space 1024
dr_path: .asciz "C:\\OM3MOD\\LENSDRV.BIN"
dr_save:
 mov (FS_ON),d0
 cmp 1,d0
 bne dr_save_out
 mov (PH_MODE),d0
 cmp 1,d0
 bne dr_save_out
 mov (DR_HEAD),d0
 mov d0,(dr_file+16)
 mov DR_ROWS,a2
 mov dr_file,a3
 mov dr_path,d1
 mov 16,d0
 call dr_write_ring,[d2,d3,a2,a3],44
 mov (AW_HEAD),d0
 mov d0,(aw_file+16)
 mov AW_ROWS,a2
 mov aw_file,a3
 mov aw_path,d1
 mov 24,d0
 call dr_write_ring,[d2,d3,a2,a3],44
 mov (ZR_HEAD),d0
 mov d0,(zr_file+16)
 mov ZR_ROWS,a2
 mov zr_file,a3
 mov zr_path,d1
 mov 16,d0
 call dr_write_ring,[d2,d3,a2,a3],44
dr_save_out:
 ret [d2,d3,a2,a3],32

/* a2 = rows, a3 = header and snapshot, d1 = path, d0 = words per chunk (16 chunks). */
dr_write_ring:
 mov d1,(8,sp)
 mov a3,(12,sp)
 add 20,a3
 mov d0,(20,sp)
 mov 16,d3
 asl 6,d0
 add 20,d0
 mov d0,(16,sp)
dr_chunk:
 clr d0
 call LOCK,[d2],8
 mov d0,(4,sp)
 mov (20,sp),d2
dr_copy:
 mov (a2),d0
 mov d0,(a3)
 inc4 a2
 inc4 a3
 sub 1,d2
 bne dr_copy
 mov (4,sp),d0
 call UNLOCK,[d2],8
 sub 1,d3
 bne dr_chunk
 mov (8,sp),a0
 mov lg_mw,a1
 call fopen,[],4
 cmp 0,a0
 beq dr_write_done
 mov a0,(4,sp)
 mov a0,a1
 mov (12,sp),a0
 mov 1,d0
 mov (16,sp),d1
 call fwrite,[d2,d3,a2,a3],24
 mov (4,sp),a0
 call fclose,[d2,a2,a3],16
dr_write_done:
 ret [d2,d3,a2,a3],44

/* Native signed-halfword setter with three known callers. Use the original
 * leaf return and keep its MDR and registers intact on every path. */
.section .hook_af_write,"ax"
 jmp aw_entry
 nop
.section .ext4,"ax"
aw_entry:
 add -24,sp
 mov d1,(4,sp)
 mov (FS_ON),d1
 cmp 1,d1
 bne aw_stock
 mov (SEC_READY),d1
 and 32,d1
 beq aw_stock
 jmp aw_opt_entry
aw_stock:
 movhu d0,(0xa33eabe4)
aw_return:
 mov (4,sp),d1
 add 24,sp
 jmp af_stock_return

.section .ext13,"ax"
aw_opt_entry:
 mov (PH_MODE),d1
 cmp 1,d1
 beq 1f
 jmp aw_stock
1:
 mov d0,(8,sp)
 mov a0,(12,sp)
 mov a1,(16,sp)
 mov mdr,d1
 mov d1,(20,sp)
 call aw_record,[d2,d3,a2,a3],28
 mov (20,sp),d1
 mov d1,mdr
 mov (8,sp),d0
 mov (12,sp),a0
 mov (16,sp),a1
 jmp aw_return
aw_record:
 mov d0,d3
 exthu d3
 mov d1,a2
 clr d0
 call LOCK,[d2],8
 mov d0,(4,sp)
 movhu d3,(0xa33eabe4)
 mov (0x98900284),d1
 mov 0x7fffffff,d0
 sub d1,d0
 and 0x7fffffff,d0
 mov d0,a3
 mov (AW_HEAD),d2
 cmp 0x8000,d3
 bne aw_append
 cmp 0,d2
 beq aw_append
 mov (AW_LAST),d1
 cmp 0x8000,d1
 beq aw_unlock
aw_append:
 mov d3,(AW_LAST)
 inc d2
 mov d2,d0
 and 127,d0
 mov d0,d1
 add d0,d0
 add d1,d0
 asl2 d0
 mov AW_ROWS,a0
 add d0,a0
 mov d2,(a0)
 mov a3,(4,a0)
 mov a2,d1
 asl 16,d1
 or d3,d1
 mov d1,(8,a0)
 mov d2,(AW_HEAD)
aw_unlock:
 mov (4,sp),d0
 call UNLOCK,[d2],8
 ret [d2,d3,a2,a3],28
.balign 4
aw_head: .long 0
aw_last: .long 0
aw_rows: .space 1536
.set AW_HEAD,aw_head+0x40000000
.set AW_LAST,aw_last+0x40000000
.set AW_ROWS,aw_rows+0x40000000
aw_file: .ascii "OMAW"
 .long 1,128,12,0
 .space 1536
aw_path: .asciz "C:\\OM3MOD\\AFWRITE.BIN"

/* Passively sample the stock ZAF maker's first two centre cells for both
 * passes. The native consumer uses cached aliases of these exact allocations.
 * Independent scratch reads are observations, not a coherent sensor frame. */
.section .ext13,"ax"
.balign 4
zr_head: .long 0
zr_rows: .space 1024
.set ZR_HEAD,zr_head+0x40000000
.set ZR_ROWS,zr_rows+0x40000000
zr_sample:
 clr d0
 call LOCK,[d2],8
 mov d0,(4,sp)
 mov (ZR_HEAD),d2
 mov d2,d0
 and 31,d0
 asl 5,d0
 mov ZR_ROWS,a3
 add d0,a3
 mov (0x98900284),d1
 mov 0x7fffffff,d3
 sub d1,d3
 and 0x7fffffff,d3
 cmp 0,d2
 beq zr_append
 mov (4,a3),d1
 mov d3,d0
 sub d1,d0
 and 0x7fffffff,d0
 cmp 200000,d0
 bcc zr_append
 jmp zr_done
zr_append:
 inc d2
 mov d2,d0
 and 31,d0
 asl 5,d0
 mov ZR_ROWS,a3
 add d0,a3
 mov d2,(a3)
 mov d3,(4,a3)
 mov -1,d0
 mov d0,(8,a3)
 mov d0,(12,a3)
 mov d0,(24,a3)
 mov 0x80008000,d0
 mov d0,(16,a3)
 mov d0,(20,a3)
 mov d0,(28,a3)
 clr d0
 movbu d0,(15,a3)
 mov (0xa33e99e8),a0
 mov (0xa33e99ac),a1
 cmp 0xaa094900,a0
 bne zr_map_two
 cmp 0xa7c53c00,a1
 bne zr_slot
 mov 0x6a094900,a0
 mov 0x67c53c00,a1
 mov 1,d0
 bra zr_cells
zr_map_two:
 cmp 0xae660f00,a0
 bne zr_slot
 cmp 0xac220200,a1
 bne zr_slot
 mov 0x6e660f00,a0
 mov 0x6c220200,a1
 mov 2,d0
zr_cells:
 movbu d0,(15,a3)
 .macro zr_cell source,flag,target,status
 movhu (\source,a0),d0
 movhu d0,(\target,a3)
 movbu (\flag,a1),d0
 movbu d0,(\status,a3)
 .endm
 zr_cell 1052,526,16,24
 zr_cell 9756,5134,18,25
 zr_cell 3228,1678,20,26
 zr_cell 11932,6286,22,27
zr_slot:
 mov (0xa33f2c38),d3
 cmp 2,d3
 bhi zr_commit
 mov 0xa33eb074,a0
 cmp 0,d3
 beq zr_descriptor
 add 10560,a0
 cmp 1,d3
 beq zr_descriptor
 add 10560,a0
zr_descriptor:
 mov (10552,a0),d0
 mov d0,(8,a3)
 movbu d3,(12,a3)
 movbu (10536,a0),d0
 movbu d0,(13,a3)
 movbu (10556,a0),d0
 movbu d0,(14,a3)
 movhu (1052,a0),d0
 movhu d0,(28,a3)
 movhu (3158,a0),d0
 movhu d0,(30,a3)
 mov (10552,a0),d0
 mov (8,a3),d1
 cmp d1,d0
 bne zr_torn
 mov (0xa33f2c38),d0
 cmp d3,d0
 beq zr_commit
zr_torn:
 mov 254,d0
 movbu d0,(12,a3)
zr_commit:
 call sw_capture,[d2,d3,a2,a3],24
zr_done:
 mov d2,(ZR_HEAD)
 mov (4,sp),d0
 call UNLOCK,[d2],8
 ret [d2,d3,a2,a3],32
.section .ext13,"ax"
.balign 4
zr_file: .ascii "OMZR"
 .long 1,32,32,0
 .space 1024
zr_path: .asciz "C:\\OM3MOD\\ZAFZONE.BIN"

.include "focus_sweep.inc"
