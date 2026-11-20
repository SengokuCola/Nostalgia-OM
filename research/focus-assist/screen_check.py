"""Build/run standalone MN10300 screen kernel. No firmware image is modified."""
import argparse
import json
import os
from pathlib import Path
import random
import struct
import subprocess
from PIL import Image, ImageDraw
from screen_model import make_map, render

HERE = Path(__file__).resolve().parent


def target():
    im = Image.new('RGB', (128,128), '#5e8995')
    d = ImageDraw.Draw(im)
    d.rectangle((16,12,111,120), fill='#c8ba9e')
    for x in range(24,110,16):
        for y in range(20,118,19):
            d.rectangle((x,y,x+8,y+11),fill='#293944')
            d.line((x+4,y,x+4,y+11),fill='#dae5df',width=1)
    d.line((64,0,64,127),fill='#eff1d0',width=3)
    d.line((0,110,127,20),fill='#c64432',width=3)
    px=im.convert('YCbCr').load()
    buf=bytearray()
    for y in range(128):
        for x in range(0,128,2):
            a,b=px[x,y],px[x+1,y]
            buf.extend((a[0],(a[1]+b[1])//2,b[0],(a[2]+b[2])//2))
    return bytes(buf)


def picture(raw):
    px=bytearray()
    for y0,cb,y1,cr in struct.iter_unpack('4B',raw):
        px.extend((y0,cb,cr,y1,cb,cr))
    return Image.frombytes('YCbCr',(128,128),bytes(px)).convert('RGB')


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out',type=Path,required=True)
    args=ap.parse_args()
    out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
    work=Path(os.environ.get('OM3_WORK','/opt/caduceus-om3-dev'))
    tc=work/'toolchain/build'
    subprocess.run([str(tc/'gas/as-new'),'-I',str(HERE.parent.parent/'firmware/src'),'-o',str(out/'screen.o'),str(HERE/'screen.s')],check=True)
    subprocess.run([str(tc/'ld/ld-new'),'-Ttext=0xa7f10000','-e','screen_map','-o',str(out/'screen.elf'),str(out/'screen.o')],check=True)
    subprocess.run([str(tc/'binutils/objcopy'),'-O','binary','-j','.text',str(out/'screen.elf'),str(out/'screen.bin')],check=True)
    source=target(); specs=[]; expected={}
    def case(name, mapping, src=source, error=False, **kw):
        ip,mp,op=(out/(name+s) for s in ('.input','.map','.output'))
        ip.write_bytes(src);mp.write_bytes(mapping)
        specs.append(dict(name=name,source=str(ip),map=str(mp),output=str(op),**kw))
        expected[name]=(1 if error else 0, bytes([0xa5])*len(src) if error else render(src,mapping))
    identity=make_map(enabled=False)
    case('off',identity)
    for strength in range(9):
        case(f'strength-{strength}',make_map(strength=strength))
    case('phase-1',make_map(strength=4,phase=1))
    rng=random.Random(77)
    case('random-chroma',make_map(strength=8),bytes(rng.randrange(256) for _ in source))
    case('minimum',struct.pack('<H',0),b'\x00\xff\xfe\x01')
    bad=bytearray(identity);struct.pack_into('<H',bad,len(bad)-2,8192)
    case('bad-last-index',bytes(bad),error=True)
    for name,kw in [
        ('zero-count',dict(count=0)),('large-count',dict(count=8193)),
        ('source-overlap',dict(dest_address=0xa8000004)),
        ('map-overlap',dict(dest_address=0xa8040000)),
        ('unaligned-source',dict(source_address=0xa8000001)),
        ('unaligned-dest',dict(dest_address=0xa8020002)),
        ('unaligned-map',dict(map_address=0xa8040001)),
        ('null-source',dict(source_address=0)),('mmio-dest',dict(dest_address=0x9bb80000)),
        ('source-overflow',dict(source_address=0xfffffffc)),
        ('map-overflow',dict(map_address=0xfffffffe)),
        ('source-tail',dict(source_address=0xb1fffffc)),
    ]:
        case(name,identity,error=True,**kw)
    (out/'spec.json').write_text(json.dumps(specs))
    env={**os.environ,'OM_EMU_MODEL':'E147'}
    cmd=[str(work/'node/bin/node'),str(HERE/'screen_emu.mjs'),str(work/'om-emu/emu'),
         str(work/'decoded/00_0100_50000000.decoded.bin'),str(work/'card.omsd'),str(out/'screen.bin'),
         str(out/'spec.json'),str(out/'results.json')]
    r=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=300)
    (out/'emulator.log').write_text(r.stdout+r.stderr)
    if r.returncode:
        raise RuntimeError(r.stderr[-4000:])
    results=json.loads((out/'results.json').read_text())
    assert len(results)==len(specs)
    for result, spec in zip(results,specs):
        name=result['name'];status,want=expected[name]
        assert all(result[k] for k in ['returned','preserved','sourceUnchanged','mapUnchanged','guards']),result
        assert result['status']==status,result
        assert Path(spec['output']).read_bytes()==want,name
        print('pass',name,result['steps'],'instructions')
    # Independent visual invariants: off is identity; outside the circle unchanged.
    assert render(source,identity)==source
    for strength in range(9):
        raw=(out/f'strength-{strength}.output').read_bytes()
        assert raw[:128*4]==source[:128*4]
        picture(raw).resize((512,512),Image.Resampling.NEAREST).save(out/f'strength-{strength}.png')
    names=['off','strength-0','strength-6']
    sheet=Image.new('RGB',(960,370),'#202328');d=ImageDraw.Draw(sheet)
    labels=['OFF','ALIGNED / manual strength 0','SPLIT / manual strength 6']
    for i,(name,label) in enumerate(zip(names,labels)):
        sheet.paste(picture((out/(name+'.output')).read_bytes()).resize((320,320),Image.Resampling.NEAREST),(i*320,30))
        d.text((i*320+8,10),label,fill='white')
    d.text((8,354),'MN10300 emulator output / synthetic scene / NOT a camera screenshot or focus measurement',fill='white')
    sheet.save(out/'preview.png')
    frames=[]
    for strength in list(range(8,-1,-1))+[0]*4+list(range(1,9)):
        frame=Image.new('RGB',(512,544),'#202328')
        frame.paste(picture((out/f'strength-{strength}.output').read_bytes()).resize((512,512),Image.Resampling.NEAREST),(0,32))
        ImageDraw.Draw(frame).text((8,10),f'EMULATOR / manual strength {strength} / no focus data',fill='white')
        frames.append(frame)
    frames[0].save(out/'preview.gif',save_all=True,append_images=frames[1:],duration=160,loop=0)
    print(json.dumps(dict(passed=len(results),code_bytes=(out/'screen.bin').stat().st_size,preview=str(out/'preview.png'))))


if __name__=='__main__':
    main()
