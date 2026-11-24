"""YC422 lookup tables for the developed still pass. No runtime floating point."""
import math
import struct


def tables():
    ir, plates, screen, inks = (bytearray() for _ in range(4))
    for y in range(8, 256, 16):
        for u in range(8, 256, 16):
            for v in range(8, 256, 16):
                r,g,b = [min(255,max(0,x))/255 for x in (
                    y+1.402*(v-128),y-.344*(u-128)-.714*(v-128),y+1.772*(u-128))]
                leaf = min(1,max(0,(g-b-.025)*8))*min(1,max(0,(g-.82*r)*13))
                sky = min(1,max(0,(b-r)*4))*min(1,max(0,(b-g)*9))
                tint = min(1,.19+.94*(y/255))
                rgb = [(1-leaf)*c*(1-.42*sky)+leaf*min(1,tint*k)
                       for c,k in zip((r,g,b),(1.32,.20,.37))]
                yy,uu,vv = ycc(rgb)
                # Signed changes preserve input gradients inside each bin.
                ir.extend(struct.pack('bbbB',*(min(127,max(-128,x)) for x in
                          (yy-y,uu-u,vv-v)),int(bool(leaf or sky))) if leaf or sky else bytes(4))
                k = (1-max(r,g,b))*.84
                plates.extend(round(126*a) for a in (1-r/(1-k),1-g/(1-k),1-b/(1-k),k))
    for y in range(32):
        for x in range(32):
            for a,b in ((3,1),(1,3),(3,0),(2,2)):
                wave = math.cos(math.tau*(a*x+b*y)/32)+math.cos(math.tau*(-b*x+a*y)/32)
                screen.append(round(63-30.5*wave))
    for mask in range(16):
        rgb = [.99,.965,.9]
        for i,ink in enumerate(((.16,.72,.80),(.88,.25,.49),(.99,.82,.15),(.18,.19,.21))):
            if mask & (1<<i):
                rgb = [a*b for a,b in zip(rgb,ink)]
        y,u,v = ycc(rgb)
        inks.extend((y,u,y,v))
    return ir+plates+screen+inks


def ycc(rgb):
    r,g,b = rgb
    y = .299*r+.587*g+.114*b
    return tuple(min(255,max(0,round(x))) for x in (255*y,128+143.82*(b-y),128+181.88*(r-y)))


def light_table():
    data = bytearray()
    for i in range(64):
        weight = i / 63
        y,u,v = ycc([1,min(1,.28+weight**2),min(1,.08+weight**4)])
        opacity = round(128*weight)
        data.extend(struct.pack('<BBHHH',128-opacity,0,opacity*y+64,opacity*u+64,opacity*v+64))
    return data
