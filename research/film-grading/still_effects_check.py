"""Exercise per-roll effects through the firmware's developed-still entry point."""
import json
import struct
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def run(emu, build, out, looks):
    from emu_test import FILM_BOX_BIND, elf_symbols, make_card, run_ncall

    out.mkdir(parents=True, exist_ok=True)
    base = bytearray(looks.read_bytes()[:1632])
    # The synthetic job should measure just the requested effect, regardless of
    # the first recipe's grain, halation or border in the supplied library.
    base[32:96] = bytes(64)
    base[1312:1328] = b'Effects test'.ljust(16, b'\0')
    struct.pack_into('<I', base, 8, zlib.crc32(base[12:]))
    records = bytearray(20 * 1024)
    records[976] = 62
    bank = out / 'LOOKS.BIN'
    bank.write_bytes(base + struct.pack('<4sIII', b'OM3L', 16 + len(records),
                                       zlib.crc32(records), zlib.crc32(base[32:])) + records)
    card = out / 'effects.omsd'
    make_card(emu, build, bank, card)
    sy = elf_symbols(build / 'p.elf')
    xb = elf_symbols(build / 'xb10000000.elf')
    target = f"W(P+{sy['XPTR']})+{xb['xb_gs'] - 0x10000000}"
    photo = Path(__file__).parents[2] / 'webapp/public/samples/meadow.jpg'
    w, h = 160, 96
    with Image.open(photo) as image:
        rgb = np.asarray(image.resize((w, h)).convert('YCbCr'), dtype=np.uint16)
    frame = np.full((h, w * 2 + 16), 0xa5, np.uint8)
    pairs = frame[:, :w * 2].reshape(h, -1, 4)
    pairs[:, :, ::2] = rgb[:, :, 0].reshape(h, -1, 2)
    pairs[:, :, 1::2] = (rgb[:, ::2, 1:] + rgb[:, 1::2, 1:] + 1) // 2
    bus = 0xa8000000
    descriptor = struct.pack('<4I4H', bus, 0, 0, 0, 0xc02, w+8, w, h)
    saved = dict(d2=0x2222, d3=0x3333, a2=0x6666, a3=0x7777)
    cases = []
    checks = [('combined', None, 11), ('original', 0, 11), ('infrared', 2, 11),
              ('screenprint', 4, 11), ('leader', 8, 11), ('back leak', 16, 11),
              ('sunlit', 32, 11), ('raw', 62, 2), ('reserved', 1, 11), ('invalid', 0xff, 11)]
    sunlit = sy.get('sunlit_run')
    if not sunlit:
        checks = [case for case in checks if case[0] != 'sunlit']
    for name, mask, job in checks:
        memory = [['SP', '=B+0x20'], ['B+0x100+10276', '=B+0x3000'],
                  ['B+0x3000', descriptor.hex()], ['B+0x3000+5352', struct.pack('<I', job).hex()],
                  [bus, frame.tobytes().hex() + '91'*16], [xb['SF_ENT'], '00f0fc'],
                  [xb['BUFIDX'], '00dfc008'], [sy['FLUSH'], 'dfc010']]
        if mask is not None:
            memory.append([f"W({sy['FB_LABEL_BANK']})+2612", f'{mask:02x}'])
        if name == 'leader':
            memory.append([sy['style_rolls'] + 0x40000000, struct.pack('<II', 0x53646789, 0).hex()])
        cases.append(dict(name=name, pc=target, stop=['B+0x20'], max=9000000,
                          regs=dict(a0='B+0x100', **saved), mem=memory,
                          read=[[bus, frame.size+16]],
                          count=[sy['film_style_run']] + ([sunlit] if sunlit else [])))
    results = run_ncall(emu, build, out, card, FILM_BOX_BIND +
                        ' up right left s1 expect:p:712=01 ncall', cases)
    if isinstance(results, str):
        return [results]
    errors = []
    sp = json.loads((out / 'out.json').read_text())['SP']
    sheet = Image.new('RGB', (w*3, (h+18)*2))
    draw = ImageDraw.Draw(sheet)
    lut = np.fromfile(build / 'film_styles.lut', dtype=np.uint8).reshape(-1, 4)
    bins = (pairs >> 4).astype(np.int32)
    index = (bins[:,:,0] * 16 + bins[:,:,1]) * 16 + bins[:,:,3]
    delta = lut[:4096].view(np.int8)[index].astype(np.int16)
    ir = np.clip(pairs + delta[:,:,[0,1,0,2]], 0, 255).astype(np.uint8)
    yy, xx = np.indices(index.shape)
    dots = lut[4096 + index] >= lut[8192 + (yy//2 % 32)*32 + xx % 32]
    printed = lut[9216 + dots @ np.array([1,2,4,8])]
    for i, (name, mask, job) in enumerate(checks):
        result = results[name]
        data = bytes.fromhex(result['mem'][0])
        actual = np.frombuffer(data[:frame.size], np.uint8).reshape(frame.shape)
        changed = np.any(actual != frame)
        expected = name not in ('original', 'raw', 'reserved', 'invalid')
        if name in ('infrared', 'screenprint'):
            reference = ir if name == 'infrared' else printed
            if not np.array_equal(actual[:, :w*2].reshape(pairs.shape), reference):
                errors.append(f'{name}: firmware pixels differ from reference')
        calls = [int(expected and name != 'sunlit')]
        if sunlit:
            calls.append(int(name in ('combined', 'sunlit')))
        if (changed != expected or result['count'] != calls or
                result['regs']['sp'] != sp or result['steps'] >= cases[i]['max'] or
                any(int(result['regs'][reg], 16) != val for reg, val in saved.items()) or
                np.any(actual[:, w*2:] != 0xa5) or data[frame.size:] != bytes([0x91])*16):
            errors.append(f"{name}: changed={changed}, calls={result['count']}, steps={result['steps']}")
        if i < 6:
            rendered = actual[:, :w*2].reshape(h, -1, 4)
            pixels = np.repeat(rendered[:, :, [0, 1, 3]], 2, axis=1)
            pixels[:, 1::2, 0] = rendered[:, :, 2]
            x, y = (i % 3)*w, (i // 3)*(h+18)
            sheet.paste(Image.frombytes('YCbCr', (w,h), pixels.tobytes()).convert('RGB'), (x,y))
            draw.text((x+3, y+h+2), name, fill='white')
    sheet.save(out / 'native-effects.png')
    return errors
