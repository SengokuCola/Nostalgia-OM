"""Boot the camera UI, pick FILM 20, and run both still hooks on synthetic jobs."""
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

from bank import sunlit_bank


def reference(frame, width):
    table = np.frombuffer((Path(__file__).parents[2] / 'firmware/src/sunlit.lut').read_bytes(), np.uint8)
    light = table[:16384].reshape(16,16,64)
    palette = table[16384:].reshape(64,256,4)
    pairs = width // 2
    groups = min(pairs, 489)
    result = frame.copy()
    seed = 21760
    for y in range(len(frame)):
        if y == 0 or y*groups//pairs != (y-1)*groups//pairs:
            row = frame[y, :2*width].reshape(pairs,4)
            pixels = []
            for i in range(groups):
                start, end = i*pairs//groups, (i+1)*pairs//groups
                n = end-start
                for x in (n//2, 3*n//2):
                    pair = row[start+x//2]
                    value = light[pair[1]//16, pair[3]//16, pair[2*(x%2)]//4]
                    seed = (1664525*seed+1013904223) & 0xffffffff
                    pixels.extend([palette[seed>>26,value]]*n)
            colors = np.array(pixels, dtype=np.uint16)
            rendered = colors[::2].copy()
            rendered[:,2] = colors[1::2,0]
            rendered[:,1::2] = (colors[::2,1::2]+colors[1::2,1::2]+1)//2
        result[y,:2*width] = rendered.ravel()
    return result


def run(emu, build, out, looks):
    from emu_test import FILM_BOX_BIND, elf_symbols, make_card, run_ncall
    out.mkdir(parents=True, exist_ok=True)
    bank = out / 'LOOKS.BIN'
    bank.write_bytes(sunlit_bank(looks.read_bytes()))
    card = out / 'sunlit.omsd'
    make_card(emu, build, bank, card)
    sy = elf_symbols(build / 'p.elf')
    xb = elf_symbols(build / 'xb10000000.elf')
    def target(label):
        return f"W(P+{sy['XPTR']})+{xb[label]-0x10000000}"
    # Uncached test DRAM, as in research/halation/emu_hl.mjs.
    buf = 0xa8000000
    job, records = 'B+0x100', 'B+0x3000'
    photo = Image.open(Path(__file__).parents[2] / 'devkit/photo-code/sample-film19-astia-100f.jpg')
    def make_frame(width,height):
        im = np.asarray(photo.resize((width,height)).convert('YCbCr'), dtype=np.uint16)
        frame = np.full((height,width*2+16),0xa5,np.uint8)
        row = frame[:,:width*2].reshape(height,-1,4)
        row[:,:,::2] = im[:,:,0].reshape(height,-1,2)
        row[:,:,1::2] = (im[:,::2,1:] + im[:,1::2,1:] + 1)//2
        return frame

    def cap(name,key):
        return dict(name=name, pc=target('xb_cap'), stop=[sy['fx_tail'],sy['fx_back']], max=20000,
                    regs=dict(a2='B+0x100',a3='B+0x200-38225'),
                    mem=[['B+0x200','00'],['B+0xf8','00000000'],['B+0xfc',struct.pack('<I',key<<16).hex()],
                         ['B+0x100','00000000']],read=[['B+0x100',4]])
    frames = {}
    def gs(name,key,w,h,enabled):
        frame = make_frame(w,h)
        frames[name] = reference(frame,w) if enabled else frame
        pitch = frame.shape[1]
        rec = struct.pack('<4I4H',buf,0,0,0,0x0c02,pitch//2,w,h)
        # Stub stock blend and buffer-index lookup; the real wrappers, name check, heap,
        # locking and Sunlit instructions execute. The emulated FLUSH register never completes.
        return dict(name=name,pc=target('xb_gs'),stop=['B+0x20'],max=5500000,
                    regs=dict(a0=job,d2=0x2222,d3=0x3333,a2=0x6666,a3=0x7777),
                    mem=[['SP','=B+0x20'],[job+'+10276','='+records],[records,rec.hex()],
                         [records+'+5352',struct.pack('<I',key).hex()],
                         [buf,frame.tobytes().hex()+'91'*16],
                         [xb['SF_ENT'],'00f0fc'],[xb['BUFIDX'],'00dfc008'],[sy['FLUSH'],'dfc010']],
                    read=[[buf,frame.size+16]],count=[sy['sunlit_run']])

    # From the first roll, one step left in the film picker selects FILM 20.
    pick = FILM_BOX_BIND + ' up left s1 expect:p:715=05'
    cases = [cap('color-cap',11),cap('raw-cap',2),gs('jpeg',11,160,120,True),
             gs('wide',11,1004,64,True),gs('raw-preview',2,64,64,False)]
    cases.append(gs('ordinary-film20',11,64,64,False))
    cases[-1]['mem'].append(['W(P+708)+1616','4e'])  # same slot, another recipe
    cases.append(cap('ordinary-cap',11))
    result = run_ncall(emu,build,out,card,pick+' ncall',cases)
    if isinstance(result,str):
        return [result]
    expected_sp = json.loads((out / "out.json").read_text())["SP"]
    errors = []
    for case in cases:
        name = case['name']
        item = result[name]
        ok = item['steps'] < case['max'] and item['regs']['sp'] == expected_sp
        if name in frames:
            expected = frames[name].tobytes()+bytes([0x91])*16
            actual = bytes.fromhex(item['mem'][0])
            differences = sum(a!=b for a,b in zip(expected,actual))
            ok &= actual == expected and item['count']==[int(name in ('jpeg','wide'))]
            ok &= all(int(item['regs'][k],16)==v for k,v in [('d2',0x2222),('d3',0x3333),('a2',0x6666),('a3',0x7777)])
            if name=='jpeg' and ok:
                pairs=np.frombuffer(actual[:frames[name].size],np.uint8).reshape(120,-1)[:,:320].reshape(120,80,4)
                pixels=np.repeat(pairs[:,:,[0,1,3]],2,axis=1)
                pixels[:,1::2,0]=pairs[:,:,2]
                Image.frombytes('YCbCr',(160,120),pixels.tobytes()).save(out/'emulated.jpg',quality=92,subsampling=1)
            detail=f"{differences} byte differences, calls {item['count']}"
        else:
            flags=int.from_bytes(bytes.fromhex(item['mem'][0]),'little')
            ok &= flags == (128 if name=='color-cap' else 0)
            detail=f'flags {flags:#x}'
        print(f'{"pass" if ok else "FAIL"} {name}: {detail}, {item["steps"]} instructions', flush=True)
        if not ok:
            errors.append(name+' '+detail)
    return errors
