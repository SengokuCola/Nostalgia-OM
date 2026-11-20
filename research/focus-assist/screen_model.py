"""Vintage-screen visual simulation on an owned YCbYCr tile, not a focus measurement."""
import math
import struct


def make_map(size=128, strength=4, phase=0, enabled=True):
    if size < 16 or size > 128 or size % 2 or not 0 <= strength <= 8:
        raise ValueError('even tile size 16..128; strength 0..8')
    pairs = size // 2
    out = []
    inner, outer = size * .27, size * .40
    for y in range(size):
        for p in range(pairs):
            x = p*2+1
            dx, dy = x-size/2, y+.5-size/2
            r = math.hypot(dx, dy)
            src = y*pairs+p
            if enabled:
                if abs(r-outer) < .8 or abs(r-inner) < .7:
                    src = 65535
                elif abs(r-outer-1.4) < .6:
                    src = 65534
                elif r < inner:
                    # Opposing horizontal shear; direction/strength are artistic controls.
                    shift = strength if dy < 0 else -strength
                    src = y*pairs+min(pairs-1,max(0,p+shift))
                    if abs(dy) < .6:
                        src = 65534
                elif r < outer:
                    # Triangular facets, stable at zero; phase is animation, NOT AF data.
                    facet = int((p%3)*5 >= (y%5)*3) ^ (((p//3)+(y//5)+phase) % 2)
                    shift = (1 if facet else -1)*strength
                    sy = min(size-1,max(0,y+(strength//2 if facet else -strength//2)))
                    src = sy*pairs+min(pairs-1,max(0,p+shift))
            out.append(src)
    return struct.pack('<'+'H'*len(out), *out)


def render(source, mapping):
    if len(source)%4 or len(mapping)*2 != len(source) or not 1 <= len(mapping)//2 <= 8192:
        raise ValueError('invalid tile/map extent')
    indices = list(struct.unpack('<'+'H'*(len(mapping)//2), mapping))
    if any(i >= len(indices) and i < 65534 for i in indices):
        raise ValueError('map points outside source tile')
    return b''.join(b'\xeb\x80\xeb\x80' if i == 65535 else b'\x10\x80\x10\x80'
                    if i == 65534 else source[i*4:i*4+4] for i in indices)
