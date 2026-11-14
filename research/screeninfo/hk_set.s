# Emulator-only probe (not for the camera): mask bytes of display-DB entries as they are set.
# Patched over 0x610cd5c4 (mov a0,a2; mov (0x6036f6e4),a0 = 7 bytes) with `jmp hk` + 2 nop.
# Table tbl: {u16 id, u16 off, u16 len, u16 val} ..., id 0xffff ends it.
	.text
	.global hk
hk:
	movm	[d2,d3,a2,a3],(sp)
	add	-8,sp
	mov	d0,(0,sp)
	mov	a0,(4,sp)
	mov	tbl,a2
1:	movhu	(a2),d2
	cmp	0xffff,d2
	beq	9f
	mov	(0,sp),d3
	exthu	d3
	cmp	d2,d3
	bne	3f
	movhu	(2,a2),d3
	mov	(4,sp),a3
	add	d3,a3
	movhu	(4,a2),d3
	movbu	(6,a2),d2
2:	cmp	0,d3
	beq	3f
	movbu	d2,(a3)
	inc	a3
	add	-1,d3
	bra	2b
3:	add	8,a2
	bra	1b
9:	mov	(0,sp),d0
	mov	(4,sp),a0
	add	8,sp
	movm	(sp),[d2,d3,a2,a3]
	mov	a0,a2
	mov	(0x6036f6e4),a0
	jmp	back
