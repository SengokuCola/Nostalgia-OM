/* E147 IMG2 commit, TFT and measured field-mode EVF. Stock's nonempty request always wins.
 * On the empty slot path d1 is the accumulated native DMA mask. The only
 * added bit is IMG2. Leave its address in place only while our complete
 * last-published descriptor is still on the hardware.
 */
.section .ext13,"ax"
fs_commit_image:
 mov (4,sp),a0
 inc4 a0
 mov (a0),d2
 cmp 0,d2
 bne fs_native_image_jump
 mov (FS_ON),d2
 cmp 1,d2
 bne fs_native_skip_jump
 mov (8,sp),d2
 cmp 1,d2
 beq fs_commit_channel_ok
 cmp 2,d2
 bne fs_native_skip_jump
fs_commit_channel_ok:
 mov (FS_OWNER),d2
 cmp 1,d2
 bne fs_native_skip_jump
 mov (FS_OWNER+4),d2
 mov (8,sp),d3
 cmp d3,d2
 bne fs_native_skip_jump
 movbu (UI_PSW),d2
 cmp 2,d2
 bne fs_native_skip_jump
 movhu (LG_GUI),d2
 cmp 0x0801,d2
 beq 1f
 inc d2
 mov (CC_REVIEW),d3
 cmp d3,d2
 bne fs_native_skip_jump
1:
 mov d1,d2
 and 32,d2
 beq fs_native_skip_jump
 mov (12,a0),d2
 cmp 0,d2
 beq fs_commit_idle_level
 /* A closed slot may retain its full-opacity level. With no address it
  * requests no image; an active native address still has priority above. */
 cmp 128,d2
 bne fs_native_skip_jump
fs_commit_idle_level:
 mov (8,sp),d2
 cmp 1,d2
 beq fs_commit_evf
 bra fs_commit_tft
fs_native_image_jump:
 jmp fs_native_image
fs_native_skip_jump:
 jmp fs_native_skip
 .macro FS_MATCH base,reg,n
 mov (\base+\reg),d2
 mov (FS_OWNER+68+4*\n),d3
 cmp d2,d3
 beq 1f
 jmp fs_native_skip
1:
 .endm
 .macro FS_CHECK base
 mov (\base+0x60),d2
 and 16,d2
 bne 1f
 mov (CC_REVIEW),d2
 cmp 0,d2
 bne 1f
 jmp fs_native_skip
1:
 mov (\base+0x3d8),d2
 and 0x7f00,d2
 beq 2f
 jmp fs_native_skip
2:
 FS_MATCH \base,0x394,0
 FS_MATCH \base,0x3ac,1
 FS_MATCH \base,0x3c4,2
 FS_MATCH \base,0x404,3
 FS_MATCH \base,0x438,4
 FS_MATCH \base,0x43c,5
 FS_MATCH \base,0x504,6
 FS_MATCH \base,0x508,7
 FS_MATCH \base,0x50c,8
 FS_MATCH \base,0x510,9
 FS_MATCH \base,0x514,10
 FS_MATCH \base,0x518,11
 FS_MATCH \base,0x624,12
 .endm
fs_commit_evf:
 mov (FS_OWNER+8),d2
 and 1,d2
 beq fs_native_skip_jump
 mov (0x9bb88720),d2
 and 0x01000000,d2
 bne fs_native_skip_jump
 mov (0x9bb88730),d2
 and 0x7fff,d2
 cmp 410,d2
 bne fs_native_skip_jump
 mov (FS_OWNER+88),d2
 lsr 16,d2
 mov (0x9bb88440),d3
 cmp d2,d3
 bne fs_native_skip_jump
fs_commit_evf_check:
 FS_CHECK 0x9bb88000
 bra fs_commit_keep
fs_commit_tft:
 FS_CHECK 0x9bb90000
fs_commit_keep:
 or 16,d1
 jmp fs_native_skip
fs_commit_level:
 mov (4,a3),a0
 and d0,d2
 /* An empty native IMG2 slot with bit16 set in this commit is our case.
  * With a native address the original level is used, including level zero. */
 mov a0,d3
 cmp 0,d3
 bne fs_level_done
 mov (-8,a3),d3
 cmp 0,d3
 bne fs_level_done
 mov d1,d3
 and 16,d3
 beq fs_level_done
 mov 128,a0
fs_level_done:
 jmp fs_native_level
