/* Diagnostic only. No AF commands, stock calls, startup hooks or MMIO writes.
 * Samples ordinary RAM mirrors at the existing DEBUG.TXT-gated shutter event.
 * These are non-atomic snapshots of lens state, NOT optical focus measurements.
 * Rows: u32 event, u8 valid/inhibit/direction/recordOK, u16 status,
 * s16 lens record +40/+22/+36. Missing record uses -32768 sentinels.
 * Eight events retain three deliberate half-press/release pairs plus a spare.
 */
.section .ext13,"ax"
fp_take:
 mov (lg_n),d2
 mov d2,d0
 and 7,d0
 asl 4,d0
 mov fp_rows,a2
 add d0,a2
 mov d2,(a2)
 movbu (0xa32d3d32),d0
 movbu d0,(4,a2)
 movbu (0x62997490),d0
 movbu d0,(5,a2)
 movbu (0x62997470),d0
 movbu d0,(6,a2)
 clr d0
 movbu d0,(7,a2)
 movhu (0xa32c9c28),d0
 movhu d0,(8,a2)
 mov -32768,d0
 movhu d0,(10,a2)
 movhu d0,(12,a2)
 movhu d0,(14,a2)
 movbu (4,a2),d0
 cmp 1,d0
 bne 9f
 mov (0xa32c9c24),a3
 mov a3,d0
 and 3,d0
 bne 9f
 /* Only cached/uncached DRAM aliases; never dereference peripherals or null. */
 cmp 0x62000000,a3
 bcs 9f
 cmp 0x63ffffd4,a3
 bcs 1f
 cmp 0xa2000000,a3
 bcs 9f
 cmp 0xa3ffffd4,a3
 bcc 9f
1:
 movhu (40,a3),d0
 movhu d0,(10,a2)
 movhu (22,a3),d0
 movhu d0,(12,a2)
 movhu (36,a3),d0
 movhu d0,(14,a2)
 mov 1,d0
 movbu d0,(7,a2)
9:
 ret [d2,d3,a2,a3],24

fp_text:
 LGS fp_title
 mov (lg_n),d2
 mov 8,d3
1:
 cmp 0,d2
 beq 9f
 mov d2,d0
 and 7,d0
 asl 4,d0
 mov fp_rows,a2
 add d0,a2
 mov (a2),d0
 cmp d2,d0
 bne 9f
 LGS fp_prefix
 mov d2,d0
 LGD
 LGS fp_valid
 movbu (4,a2),d0
 LGD
 LGS fp_status
 movhu (8,a2),d0
 LGD
 LGS fp_inhibit
 movbu (5,a2),d0
 LGD
 LGS fp_dir
 movbu (6,a2),d0
 LGD
 LGS fp_record
 movbu (7,a2),d0
 LGD
 LGS fp_pos
 movhu (10,a2),d0
 exth d0
 LGD
 LGS fp_lo
 movhu (12,a2),d0
 exth d0
 LGD
 LGS fp_hi
 movhu (14,a2),d0
 exth d0
 LGD
 LGN
 add -1,d2
 add -1,d3
 bne 1b
9:
 ret [d2,d3,a2,a3],24
fp_title:
 .asciz "\r\nFOCUS PROBE 2 - raw lens state, NOT focus accuracy (newest first)\r\n"
fp_prefix: .asciz "FP "
fp_valid: .asciz " valid="
fp_status: .asciz " status="
fp_inhibit: .asciz " inhibit="
fp_dir: .asciz " dir="
fp_record: .asciz " record="
fp_pos: .asciz " pos="
fp_lo: .asciz " lo="
fp_hi: .asciz " hi="
 .balign 4
fp_rows: .space 8 * 16

/* Probe 2: 8 x 1600-byte records, no pointer dereference and no stock getter.
 * cf_slot(d0=event) -> a2; writes only d0/d1/d2/a2. Frame [d2],8.
 * OMCF header: magic,version,slots,stride,last_event,work_addr,config_addr,raw_len.
 * Record: seq(0), fp row(4,16B), config(20,16B), debug mask(36),
 * debug count(40,u16), reserved(42,u16), producer-state byte(44), reserved(45..47),
 * pre metadata(48,8B), post metadata(56,8B), raw work(64,1496B), hash(1560), padding.
 * Metadata is NOT established as a frame counter. Debug count is gated in stock.
 * No lock/cache flush: stable metadata does not guarantee a coherent/fresh frame.
 */
cf_slot:
 and 7,d0
 asl 6,d0
 mov d0,d2
 mov d0,d1
 asl 4,d0
 asl 3,d1
 add d1,d0
 add d2,d0
 mov cf_rows+0x40000000,a2
 add d0,a2
 ret [d2],8

cf_take:
 mov (CF_GENERATION),d0
 inc d0
 mov d0,(CF_GENERATION)
 mov (lg_n),d0
 mov d0,(cf_latest+0x40000000)
 call cf_slot,[d2],8
 mov (lg_n),d0
 mov d0,(a2)
 and 7,d0
 asl 4,d0
 mov fp_rows,a0
 add d0,a0
 mov (a0),d0
 mov d0,(4,a2)
 mov (4,a0),d0
 mov d0,(8,a2)
 mov (8,a0),d0
 mov d0,(12,a2)
 mov (12,a0),d0
 mov d0,(16,a2)
 mov 0xa33d07ba,a0             /* native getter 0x60915875 returns this address */
 mov a2,a1
 add 20,a1
 mov 16,d2
1:
 movbu (a0),d0
 movbu d0,(a1)
 inc a0
 inc a1
 add -1,d2
 bne 1b
 mov (0xa33f3624),d0
 mov d0,(36,a2)
 movhu (0x62fa1d90),d0
 movhu d0,(40,a2)
 movbu (0xa33cf880),d0
 movbu d0,(44,a2)
 mov (0x62fa2364),d0
 mov d0,(48,a2)
 mov (0x62fa2368),d0
 mov d0,(52,a2)
 mov a2,a1
 add 64,a2
 mov 0x62fa1d94,a3
 mov 374,d2
 clr d3
2:
 mov (a3),d0
 mov d0,(a2)
 /* Order-sensitive hash for changes, not a validity/freshness flag. */
 mov d3,d1
 asl 5,d3
 add d1,d3
 xor d0,d3
 inc4 a3
 inc4 a2
 add -1,d2
 bne 2b
 mov d3,(a2)                  /* record +1560 */
 mov (0x62fa2364),d0
 mov d0,(56,a1)
 mov (0x62fa2368),d0
 mov d0,(60,a1)
 mov (CF_GENERATION),d0
 inc d0
 mov d0,(CF_GENERATION)
 ret [d2,d3,a2,a3],24

cf_write:                       /* existing card/log gate already passed */
 /* Take a private snapshot before the worker can block in the filesystem.
  * Only the shutter task produces CF records. An overlapping update leaves
  * the preceding file intact and the next release requests a new snapshot. */
 mov (CF_GENERATION),d3
 btst 1,d3
 bne 9f
 mov cf_file+0x40000000,a0
 mov cf_snapshot,a1
 mov cf_end - cf_file,d2
 lsr 2,d2
1:
 mov (a0),d0
 mov d0,(a1)
 inc4 a0
 inc4 a1
 add -1,d2
 bne 1b
 mov (CF_GENERATION),d0
 cmp d3,d0
 bne 9f
 mov cf_path,a0
 mov lg_mw,a1
 call fopen,[],4
 cmp 0,a0
 beq 9f
 mov a0,(4,sp)
 mov a0,a1
 mov cf_snapshot,a0
 mov 1,d0
 mov cf_end - cf_file,d1
 call fwrite,[d2,d3,a2,a3],24
 mov (4,sp),a0
 call fclose,[d2,a2,a3],16
9:
 ret [d2,d3,a2,a3],24
cf_path: .asciz "C:\\OM3MOD\\CFPROBE.BIN"
 .balign 4
cf_file:
 .ascii "OMCF"
 .long 2,8,1600
cf_latest: .long 0
 .long 0x62fa1d94,0xa33d07ba,1496
cf_rows: .space 8 * 1600
cf_end:
cf_generation: .long 0
.set CF_GENERATION,cf_generation+0x40000000
cf_snapshot: .space cf_end-cf_file
