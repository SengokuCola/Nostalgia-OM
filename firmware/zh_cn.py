"""Simplified Chinese artwork for the local firmware build (Noto Sans CJK SC).

Only UI words are translated. Film names, numeric glyphs and protocol data keep
their original encoding. Install Ubuntu's fonts-noto-cjk package to build.
"""
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
WORDS = {
    'Hue': '色相', 'Luminance': '明度', 'Saturation': '饱和度',
    'Shadows': '阴影', 'Highlights': '高光', 'Color': '颜色',
    'Extras': '扩展', 'Film': '胶片',
    'NR': '降噪', 'NR Std': '标准', 'NR Low': '低', 'NR Off': '关闭', 'NR High': '高',
    'Glow': '柔光', 'Clarity': '清晰度', 'Glo/Cla': '柔光',
    'Art Off': '关闭', 'Star': '星光', 'Pin Hole': '针孔', 'W. Edge': '白边', 'Frame': '边框',
    'Blacks': '黑色', 'Whites': '白色', 'Blk': '黑色', 'Wht': '白色', 'Blk/Wht': '黑白',
    'Vig Cam': '机身', 'Vig Off': '关闭', 'Vignette': '暗角',
    'Grain': '颗粒', 'Sharp': '锐度', 'Sharp Off': '关闭',
    'Noise': '降噪', 'Off': '关', 'On': '开', 'Low': '低', 'Std': '标准', 'High': '高',
    'Halo': '光晕', 'Bal': '平衡', 'Sat': '饱和', 'Level': '亮度', 'Pt': '点',
}


@lru_cache(maxsize=128)
def coverage(text, height, width):
    """Tightly cropped coverage, fitted uniformly; reserve outlines in the caller."""
    font = ImageFont.truetype(FONT, 128, index=2)  # Noto Sans CJK SC, not the JP face
    box = font.getbbox(text)
    im = Image.new('L', (box[2] - box[0] + 8, box[3] - box[1] + 8))
    ImageDraw.Draw(im).text((4 - box[0], 4 - box[1]), text, font=font, fill=255)
    im = im.crop(im.getbbox())
    scale = min(height / im.height, width / im.width)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.Resampling.LANCZOS)
    return np.asarray(im, dtype=float) / 255
