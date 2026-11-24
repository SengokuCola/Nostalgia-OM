"""Native-pixel artwork for the film gate. Square box ends are drawn from primitives."""
from PIL import Image, ImageDraw, ImageFont


# Four inks per box end. The type band and frame reproduce each stock family's
# visual vocabulary on the native LCD grid. LookLab v1 stamps retain their own 48-pixel grid.
STOCK_INKS = {
    'Portra': ('#dab958', '#754675', '#f3e9cd'), 'Ektar': ('#b83735', '#e99b20', '#fff5d2'),
    'Ektachrome': ('#164978', '#d1ae54', '#f1f2e1'), 'Kodachrome': ('#c8422f', '#f6b83b', '#fff4cc'),
    'CineStill': ('#172e39', '#b94c3f', '#eee6cb'), 'Velvia': ('#407542', '#9a3278', '#f0edde'),
    'Provia': ('#146243', '#4166a6', '#e7eedf'), 'Pro': ('#347e64', '#873c65', '#f1efdf'),
    'NPS': ('#36755c', '#587ca8', '#efe9cb'), 'NHG': ('#35683c', '#bc835e', '#efebd8'),
    'Superia': ('#247348', '#aa3638', '#fff1d8'), 'Fuji': ('#317849', '#bc512e', '#faf2d7'),
    'Fujifilm': ('#23875e', '#614635', '#f5ead5'), 'Natura': ('#55775c', '#b28ba3', '#f6ebda'),
    'Sunlit': ('#4a6441', '#c28746', '#e9e1bd'),
}


def gate_labels(names):
    tiles = bytearray()
    inks = bytearray()
    offsets = bytearray()
    # A neutral index label for unknown recipes, followed by the three redrawn ends.
    for name in names:
        stock = {'Portra 800': 'portra', 'Gold 200': 'gold', 'ColorPlus 200': 'colorplus'}.get(name, name)
        im = Image.new('RGB', (144, 144), '#c4bd9e')
        draw = ImageDraw.Draw(im)

        def word(x, y, text, size, color, face='DejaVuSans-Bold.ttf'):
            draw.text((x, y), text, font=ImageFont.truetype(face, size), fill=color, anchor='lt')

        if stock == 'portra':
            for y in range(144):
                draw.line((0, y, 143, y), fill=(147, 137-y//5, 190-y//5))
            word(82, 16, '135-36', 16, '#fff7e4', 'DejaVuSerif.ttf')
            word(49, 48, '800', 48, '#fff9e8', 'DejaVuSerif.ttf')
            draw.rectangle((0, 104, 143, 143), fill='#edb738')
            word(7, 112, 'PORTRA', 29, '#695376', 'DejaVuSerif.ttf')
        elif stock == 'gold':
            draw.rectangle((0, 0, 143, 143), fill='#f3ab17')
            draw.polygon([(8,13),(30,13),(20,24),(30,34),(8,34)], fill='#ce3024')
            word(103, 9, '135', 15, '#302424')
            word(103, 27, '36 EXP', 9, '#302424')
            draw.rectangle((0, 61, 143, 128), fill='#201f20')
            word(5, 69, 'KODAK', 15, '#ef5142')
            word(66, 69, 'GOLD', 17, '#fff8ee')
            draw.rectangle((0, 111, 64, 117), fill='#985588')
            word(68, 96, '200', 33, '#fff9ea')
            draw.rectangle((0, 129, 143, 134), fill='#985588')
        elif stock == 'colorplus':
            import math
            draw.rectangle((0, 0, 143, 143), fill='#f3ad36')
            for x in range(144):
                draw.line((x, 54+int(18*math.sin(math.pi*x/144)**2), x, 143), fill='#c12735')
            word(6, 12, 'Kodak', 28, '#b6262c')
            word(103, 14, '200', 18, '#352920')
            word(5, 83, 'ColorPlus', 30, '#fff5db', 'DejaVuSansCondensed.ttf')
        elif name:
            family, _, speed = name.partition(' ')
            body, accent, paper = STOCK_INKS[family]
            draw.rectangle((0, 0, 143, 143), fill=body)
            draw.rectangle((0, 0, 143, 39), fill=paper)
            word(5, 8, family.upper(), min(28, 215 // len(family)), body)
            draw.polygon([(0, 104), (143, 69), (143, 91), (0, 126)], fill=accent)
            word(7, 46, speed or family, 36 if len(speed) <= 4 else 25, paper)
            word(7, 122, '135 / 36', 16, paper)
        else:
            draw.rectangle((0, 22, 143, 30), fill='#5b6a62')
            word(10, 53, 'FILM', 39, '#393c34')
            word(12, 106, '35 mm', 19, '#53554a')
        # Preserve the original painted ends' full sixteen-ink artwork.
        colors = 16 if stock in ('custom','portra','gold','colorplus') or not name else 4
        indexed = im.resize((80, 80), Image.Resampling.LANCZOS).quantize(colors=colors)
        offsets.extend(len(tiles).to_bytes(2, 'little'))
        pixels = indexed.tobytes()
        bits = 4 if colors == 16 else 2
        stride = 8 // bits
        for i in range(0, len(pixels), stride):
            packed = 0
            for index in pixels[i:i+stride]:
                packed = (packed << bits) | index
            tiles.append(packed)
        palette = bytes(indexed.getpalette()[:48]).ljust(48, bytes(1))
        for y, cb, cr in Image.frombytes('RGB', (16, 1), palette).convert('YCbCr').getdata():
            inks.extend((y, cb, y, cr))
    return bytes(tiles), bytes(inks), bytes(offsets)


def gate_frames():
    """Seven stops slide through a stationary aperture. Side labels shrink on the same path."""
    # Source row and box size at each resting position. The middle slot
    # owns the fixed footer throughout its transition.
    import struct
    stops = [(22,10), (51,14), (82,22), (122,38), (177,22), (216,14), (252,10)]
    data = bytearray()
    for offset in (0, .8,.6,.4,.2, -.8,-.6,-.4,-.2):
        for i, (top, side) in enumerate(stops):
            other = stops[max(0, min(6, i + (1 if offset > 0 else -1)))]
            y = round(top + abs(offset) * (other[0] - top))
            size = round(side + abs(offset) * (other[1] - side)) // 2 * 2
            show = 39 <= y and y + size <= 244
            name_y = y + (size - 16) // 2
            native_side = round(size * 600/320) & ~1
            data.extend(struct.pack('<5H', round(y * 600/320), native_side if show else 0,
                                    58 + native_side, round(name_y * 600/320), int(i == 3)))
    return bytes(data)


def gate_surround():
    """Draw on the 900 x 600 LCD grid. Encode only the left panel in a 320-pixel aligned DMA stride."""
    import struct
    from itertools import groupby

    im = Image.new('RGB', (960, 600), '#333630')
    pen = ImageDraw.Draw(im)
    def px(v):
        return round(v * 15/8)
    def point(x, y):
        return (px(x), px(y))
    def box(x, y, xx, yy):
        return (*point(x, y), px(xx+1)-1, px(yy+1)-1)
    pen.rectangle(box(0, 0, 479, 26), fill='#bcbeb2')
    for y, color in [(0, '#dedccf'), (1, '#cbcdc0'), (25, '#a5a79b'),
                     (26, '#d2d2c4'), (27, '#191c19'), (317, '#95988c'),
                     (318, '#b5b7ab'), (319, '#cbcdc1')]:
        pen.rectangle(box(0, y, 479, y), fill=color)
    pen.rectangle(box(0, 28, 143, 316), fill='#282b26')
    pen.rectangle(box(143, 28, 143, 316), fill='#151714')
    pen.rectangle(box(144, 28, 144, 316), fill='#53564b')
    pen.rectangle(box(144, 7, 144, 19), fill='#96998e')
    pen.rounded_rectangle(box(6, 36, 137, 246), 6, fill='#121511', outline='#56594d')
    pen.rounded_rectangle(box(9, 39, 134, 243), 4, fill='#2b2d28')
    pen.rectangle(box(9, 114, 134, 168), fill='#e6dfcc')
    pen.rectangle(box(9, 114, 134, 114), fill='#f5eedc')
    pen.rectangle(box(9, 168, 134, 168), fill='#b2a891')
    for y in range(44, 242, 8):
        for x in (13, 128):
            pen.rectangle(box(x, y, x+2, y+2), fill='#151713')
    pen.polygon([point(2,138), point(5,141), point(2,144)], fill='#edb553')
    pen.rectangle(box(12, 281, 131, 281), fill='#585b50')
    for inset, radius, color in [(9,8,'#1f211d'),(8,7,'#aeb1a4'),(7,6,'#6f7468'),
                                 (6,6,'#1a1d19'),(5,5,'#52564b'),(4,4,'#32362e'),
                                 (2,2,'#10120e'),(0,0,'#101010')]:
        pen.rounded_rectangle(box(160-inset,50-inset,465+inset,279+inset), px(radius), fill=color)
    # Fine matte finish and horizontal brushing stay behind the film artwork.
    import random
    rng = random.Random(310)
    for _ in range(2500):
        x, y = rng.randrange(900), rng.randrange(600)
        if px(158) <= x <= px(467) and px(48) <= y <= px(281):
            continue
        rgb = im.getpixel((x,y))
        delta = rng.choice((-3, -2, 2, 3))
        tint = tuple(max(0,min(255,c+delta)) for c in rgb)
        end = min(899, x + (rng.randrange(1,6) if y < px(25) else 1))
        if all(im.getpixel((i,y)) == rgb for i in range(x,end+1)):
            pen.line((x,y,end,y),fill=tint)
    # Use the same RGB artwork as the sidebar. Reserve index zero for both
    # transparent holes; the display owner supplies 32 private colour entries
    # in the active OSD1 bank while the stock HUD is hidden.
    right = im.crop((270, 0, 900, 600))
    inks = right.quantize(colors=32, dither=Image.Dither.NONE)
    colors = Image.new('RGB', (32, 1))
    rgb = inks.getpalette()[:96]
    colors.putdata([tuple(rgb[i:i+3]) for i in range(0, 96, 3)])
    colors = b''.join(bytes((y, u, v, 31)) for y, u, v in colors.convert('YCbCr').getdata())
    frame = Image.new('L', (900, 600), 0)
    frame.paste(Image.frombytes('L', inks.size, inks.tobytes()).point([48+i if i<32 else 0 for i in range(256)]), (270,0))
    ImageDraw.Draw(frame).rectangle((298,94,873,523), fill=0)
    # Each row expands into 1024 indices. Word runs give the camera aligned
    # stores, including the transparent padding fetched by the DMA burst.
    rim = bytearray()
    rim_words = {}
    for y in range(600):
        row = frame.crop((0, y, 900, y+1)).tobytes() + bytes(124)
        for word, group in groupby(struct.iter_unpack('<I', row)):
            count = sum(1 for _ in group)
            index = rim_words.setdefault(word[0], len(rim_words))
            if count == 256:
                rim.extend((255, index))
                count = 1
            rim.extend((count, index))
    rim.extend(bytes(2))
    raw = im.crop((0, 0, 320, 600)).convert('YCbCr').tobytes()
    pairs = ((y0 | ((u0+u1)//2)<<8 | y1<<16 | ((v0+v1)//2)<<24)
             for y0,u0,v0,y1,u1,v1 in zip(*[iter(raw)]*6))
    # After the first paint only the left-hand controls can change. Encode
    # that boundary in the stream, so repainting can jump over the live well.
    palette = {}
    runs = bytearray()
    def warm_region(x, y):
        # Bounds include the two-line names, custom captions and footer glyphs.
        if 48 <= y < 476:
            return 40 <= x < 264
        if 4 <= y < 48:
            return 168 <= x < 264
        return 12 <= x < 264 and (476 <= y < 514 or 540 <= y < 576)

    # Break at scanlines even when two adjacent lines are entirely immutable.
    marked = ((word, (i // 160, not warm_region(2 * (i % 160), i // 160)))
              for i, word in enumerate(pairs))
    for (_, fixed), region in groupby(marked, key=lambda pair: pair[1]):
        start = len(runs)
        if fixed:
            runs.extend(bytes(4))
        span = 0
        for (word, _), group in groupby(region):
            count = sum(1 for _ in group)
            assert count < 32768
            index = palette.setdefault(word, len(palette))
            runs.extend(struct.pack('<HH', count, index))
            span += count
        if fixed:
            # A warm page skips the whole fixed region with one command;
            # a cold page falls through and decodes its ordinary colour runs.
            size = len(runs) - start - 4
            assert span < 32768 and size <= 65535
            struct.pack_into('<HH', runs, start, 0x8000 | span, size)
    return bytes(runs) + bytes(4), b''.join(struct.pack('<I', word) for word in palette), bytes(rim), b''.join(struct.pack('<I', word) for word in rim_words), colors
