/* E147 experimental IMG2 owner; focus_screen.inc supplies locking and validation.
 * call overlay_native,[d2,d3,a2,a3],40
 * a0: caller-owned, zero-initialized 120-byte state; d0: channel 1/2;
 * a1: 13 validated register values in table order, or NULL to release.
 * Caller serializes display access and validates tile allocation/geometry.
 * d0: 0 success, 1 busy/invalid channel, 2 ownership lost (no writes).
 * State: active, channel, saved SPOS (bit 0 owns AREA3), saved AREA3,
 * saved[13], last[13]. AREA3 is the second field's vertical origin.
 * Hardware register accesses match native E147 0x60211e1c.
 */

.global overlay_native
overlay_native:
 mov a0,(4,sp)
 mov a1,(8,sp)
 mov d0,(12,sp)
 cmp 1,d0
 bcs ov_bad
 cmp 2,d0
 bhi ov_bad
 mov d0,d1
 asl 15,d1
 add 0x9bb80000,d1
 mov d1,a3
 mov (a0),d1
 cmp 0,d1
 beq ov_idle
 mov (4,a0),d1
 cmp d0,d1
 bne ov_bad
 mov (0x60,a3),d1
 and 0x10,d1
 bne ov_check_spos
 mov (8,a0),d1
 and 1,d1
 beq ov_lost
ov_check_spos:
 mov (0x3d8,a3),d1
 and 0x7f00,d1
 bne ov_lost
 mov (8,a0),d1
 and 1,d1
 beq ov_check_common
 mov (88,a0),d1                   /* last IMG2AREA2 */
 lsr 16,d1
 mov (0x440,a3),d2
 cmp d1,d2
 bne ov_lost
ov_check_common:
 mov ov_offsets,a2
 add 68,a0
 mov 13,d3
ov_compare:
 mov (a2),d1
 mov a3,a1
 add d1,a1
 mov (a1),d1
 mov (a0),d2
 cmp d2,d1
 bne ov_lost
 add 4,a0
 add 4,a2
 sub 1,d3
 bne ov_compare
 mov (0x60,a3),d1
 and 0x10,d1
 beq ov_disabled
 bra ov_write
ov_disabled:
 /* The camera frequently disables IMG2 between two publications. Restore
  * our auxiliary origin only if the whole last descriptor still matches,
  * before reacquisition saves the inactive plane as its new baseline. */
 mov (4,sp),a0
 mov (8,a0),d1
 and 1,d1
 beq ov_lost
 mov (12,sp),d0
 clr d1
 call ov_hold,[d2,d3],8
 mov (4,sp),a0
 mov (12,a0),d2
 mov d2,(0x440,a3)
 mov (12,sp),d0
 mov 1,d1
 call ov_hold,[d2,d3],8
 bra ov_lost
ov_idle:
 mov (8,sp),a1
 cmp 0,a1
 beq ov_ok
 mov (0x60,a3),d1
 and 0x10,d1
 bne ov_bad
 mov (12,sp),d0
 mov d0,(4,a0)
 mov (0x3d8,a3),d1
 and 0x7f00,d1
 mov d1,(8,a0)
 add 16,a0
 mov ov_offsets,a2
 mov 13,d3
ov_save:
 mov (a2),d1
 mov a3,a1
 add d1,a1
 mov (a1),d1
 mov d1,(a0)
 add 4,a0
 add 4,a2
 sub 1,d3
 bne ov_save
ov_write:
 mov (12,sp),d0
 mov 0,d1
 call ov_hold,[d2,d3],8
 mov (4,sp),a0
 mov (8,sp),a1
 mov (12,sp),d0
 cmp 1,d0
 bne ov_fields_done
 cmp 0,a1
 beq ov_restore_field
 mov (20,a1),d2
 mov d2,d1
 and 65535,d1
 mov (FS_LV_H),d0
 lsr 1,d0
 cmp d0,d1
 bne ov_restore_field
 mov (0x720,a3),d1
 and 0x01000000,d1
 bne ov_restore_field
 mov (0x730,a3),d1
 and 0x7fff,d1
 cmp 410,d1
 bne ov_restore_field
 mov (8,a0),d1
 and 1,d1
 bne ov_field_origin
 mov (0x440,a3),d0
 mov d0,(12,a0)
 mov (8,a0),d1
 or 1,d1
 mov d1,(8,a0)
ov_field_origin:
 lsr 16,d2
 mov d2,(0x440,a3)
 bra ov_fields_done
ov_restore_field:
 mov (8,a0),d1
 mov d1,d0
 and 1,d0
 beq ov_fields_done
 and 0x7f00,d1
 mov d1,(8,a0)
 mov (12,a0),d0
 mov d0,(0x440,a3)
ov_fields_done:
 mov (8,sp),a0
 cmp 0,a0
 bne ov_present
 mov (0x60,a3),d1
 and 0xffffffef,d1
 mov d1,(0x60,a3)
 mov (4,sp),a0
 add 16,a0
ov_present:
 mov ov_offsets,a2
 mov 13,d3
ov_copy:
 mov (a2),d1
 mov a3,a1
 add d1,a1
 mov (a0),d2
 mov d2,(a1)
 add 4,a0
 add 4,a2
 sub 1,d3
 bne ov_copy
 mov (0x3d8,a3),d1
 and 0xffff80ff,d1
 mov (8,sp),a1
 cmp 0,a1
 bne ov_enable
 mov (4,sp),a0
 mov (8,a0),d2
 or d2,d1
 mov d1,(0x3d8,a3)
 mov 0,d0
 mov d0,(a0)
 bra ov_commit
ov_enable:
 mov d1,(0x3d8,a3)
 mov (0x60,a3),d1
 or 0x10,d1
 mov d1,(0x60,a3)
 mov (4,sp),a0
 mov 1,d0
 mov d0,(a0)
 add 68,a0
 mov 13,d3
ov_last:
 mov (a1),d1
 mov d1,(a0)
 add 4,a1
 add 4,a0
 sub 1,d3
 bne ov_last
ov_commit:
 mov (12,sp),d0
 mov 1,d1
 call ov_hold,[d2,d3],8
ov_ok:
 mov 0,d0
 ret [d2,d3,a2,a3],40
ov_lost:
 mov (4,sp),a0
 mov 0,d0
 mov d0,(a0)
 mov 2,d0
 ret [d2,d3,a2,a3],40
ov_bad:
 mov 1,d0
 ret [d2,d3,a2,a3],40
.balign 4
ov_offsets:
 .long 0x394,0x3ac,0x3c4,0x404,0x438,0x43c
 .long 0x504,0x508,0x50c,0x510,0x514,0x518,0x624
