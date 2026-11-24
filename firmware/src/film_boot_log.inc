/* Four independent boot journals. Each holds 128 cyclic 64-byte records.
 * Only the existing DEBUG worker touches SD. Choose the oldest generation
 * once per boot; a torn sample leaves the preceding records readable. */
.section .fb_runtime,"ax"
.balign 4
fb_boot_names: .long fb_boot0,fb_boot1,fb_boot2,fb_boot3
fb_boot0: .asciz "C:\\OM3MOD\\FILMBT0.BIN"
fb_boot1: .asciz "C:\\OM3MOD\\FILMBT1.BIN"
fb_boot2: .asciz "C:\\OM3MOD\\FILMBT2.BIN"
fb_boot3: .asciz "C:\\OM3MOD\\FILMBT3.BIN"
fb_update_mode: .asciz "r+"
.balign 4
fb_boot_state: .space 32
.set J_STATE,fb_boot_state+0x40000000
fb_boot_record: .space 64
.set J_REC,fb_boot_record+0x40000000
fb_boot_sample:
 mov (MS_A),d0
 cmp 61440,d0
 beq 1f
 mov (MS_B),d0
 cmp 61440,d0
 beq 1f
 mov (MS_C),d0
 cmp 61440,d0
 bne fb_boot_end
1:
 mov (J_STATE+8),d0
 mov (USCLK),d1
 sub d1,d0
 and 0x7fffffff,d0
 cmp 1000000,d0
 bcs fb_boot_end
 mov d1,(J_STATE+8)
 mov (J_STATE),d0
 cmp 0,d0
 bne fb_boot_ready
 mov fb_boot_names,a2
 clr d2                          /* largest boot generation */
 mov -1,d3                       /* smallest boot generation */
1:
 mov (a2),a0
 mov lg_mr,a1
 call fopen,[],4
 clr d1
 cmp 0,a0
 beq 2f
 mov a0,a3
 mov a0,a1
 mov J_REC,a0
 mov 1,d0
 mov 8,d1
 call fread,[d2,d3,a2,a3],24
 mov d0,(4,sp)
 mov a3,a0
 call fclose,[d2,a2,a3],16
 clr d1
 mov (4,sp),d0
 cmp 8,d0
 bne 2f
 mov (J_REC),d0
 cmp 0x314a4246,d0
 bne 2f
 mov (J_REC+4),d1
2:
 cmp d2,d1
 bls 3f
 mov d1,d2
3:
 cmp d3,d1
 bcc 4f
 mov d1,d3
 mov (a2),d0
 mov d0,(J_STATE)
4:
 inc4 a2
 cmp fb_boot_names+16,a2
 bne 1b
 inc d2
 mov d2,(J_STATE+4)
fb_boot_ready:
 mov (lg_n),d0
 mov (FB_PUBLISHED),d1
 mov (J_STATE+12),d2
 cmp 0,d2
 beq 1f
 mov (J_STATE+16),d3
 cmp d3,d0
 bne 1f
 mov (J_STATE+20),d3
 cmp d3,d1
 bne 1f
 mov (FB_SLOT),d3
 mov (J_STATE+24),a0
 cmp a0,d3
 bne 1f
 mov (FB_Q_WRITE),d3
 mov (J_STATE+28),a0
 cmp a0,d3
 beq fb_boot_end
1:
 mov J_REC,a2
 mov 0x314a4246,d3
 mov d3,(a2)
 mov (J_STATE+4),d3
 mov d3,(4,a2)
 mov d2,(8,a2)
 mov (USCLK),d3
 mov d3,(12,a2)
 mov d0,(16,a2)
 mov d1,(20,a2)
 .irp field,FB_SLOT,FB_PAINTED,FB_Q_WRITE,FB_Q_READ,FB_Q_PEAK,FB_Q_DROPS,FB_LAG+4,FB_LAG+8,FB_COPY_US
 mov (\field),d0
 mov d0,(24,a2)
 inc4 a2
 .endr
 mov d2,d0
 not d0
 mov d0,(24,a2)                  /* end marker = complement of sequence */
 mov (J_STATE),a0
 mov fb_update_mode,a1
 cmp 0,d2
 bne 2f
 mov lg_mw,a1
2:
 call fopen,[],4
 cmp 0,a0
 beq fb_boot_end
 mov a0,a3
 mov d2,d0
 and 127,d0
 asl 6,d0
 mov 2,d1
 call fseek,[d2,d3,a2,a3],20
 cmp 0,d0
 bne 3f
 mov J_REC,a0
 mov a3,a1
 mov 1,d0
 mov 64,d1
 call fwrite,[d2,d3,a2,a3],24
 cmp 64,d0
 bne 3f
 inc d2
 mov d2,(J_STATE+12)
 mov (J_REC+16),d0
 mov d0,(J_STATE+16)
 mov (J_REC+20),d0
 mov d0,(J_STATE+20)
 mov (J_REC+24),d0
 mov d0,(J_STATE+24)
 mov (J_REC+32),d0
 mov d0,(J_STATE+28)
3:
 mov a3,a0
 call fclose,[d2,a2,a3],16
fb_boot_end:
 ret [d2,d3,a2,a3],24
