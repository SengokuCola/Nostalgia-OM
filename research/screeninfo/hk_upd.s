# Emulator-only prototype (not for the camera): clear item fields in the shooting-screen updater's buffers
# just before its change check. Patched over 0x6123043d (mov 0x62ceeb54,a0 = 6 B) with `jmp hk2` + nop.
# Table tbl2: {u8 sp slot of the buffer pointer, u8 len, u16 field offset} ..., slot 0 ends it.
# Uses d0, d1, a0, a1 only (all reloaded by the stock code after 0x61230443).
	.text
	.global hk2
hk2:
	mov	tbl2,a1
1:	movbu	(a1),d0
	cmp	0,d0
	beq	9f
	mov	sp,a0
	add	d0,a0
	mov	(a0),a0
	movhu	(2,a1),d0
	add	d0,a0
	movbu	(1,a1),d0
	clr	d1
2:	cmp	0,d0
	beq	3f
	movbu	d1,(a0)
	inc	a0
	add	-1,d0
	bra	2b
3:	add	4,a1
	bra	1b
9:	mov	0x62ceeb54,a0
	jmp	back2
