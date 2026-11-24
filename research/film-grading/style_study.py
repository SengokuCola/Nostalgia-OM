"""Five independent offline effects. Run with output directory and bikes.mp4
(from the scikit-video 1.1.10 sample dataset). Needs ffmpeg, NumPy, Pillow, SciPy.
"""
import argparse
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from scipy.ndimage import gaussian_filter

from trait_study import LUMA, SAMPLES, decode, encode, sheet
from trichrome import compose


def load(name, box):
    with Image.open(SAMPLES / (name + ".jpg")) as im:
        return ImageOps.fit(im.convert("RGB"), box, method=Image.Resampling.LANCZOS)


def duotone(photo, shadow, accent):
    t = (decode(photo) @ LUMA) ** .45
    # Paper reflectance multiplied by each ink's transmission.
    dark = (1 - t) ** 2.15
    mid = np.clip(1.15 - abs(t - .46) * 1.9, 0, 1) * (1 - t ** 3)
    paper = np.array([.99,.96,.89])
    return encode(paper * np.power(shadow, dark[...,None]) * np.power(accent, mid[...,None]))


def false_ir(photo, pale):
    x = np.asarray(photo, dtype=float) / 255
    r,g,b = x.transpose(2,0,1)
    # Green dominance includes muted yellow-green leaves. Feather mask edges.
    veg = np.clip((g - b - .025) * 8,0,1) * np.clip((g - .82*r) * 13,0,1)
    light = np.sqrt(decode(photo) @ LUMA)
    pink = np.array([1.17,.67,.81]) if pale else np.array([1.32,.20,.37])
    tint = np.minimum((.19 + .94*light[...,None])*pink,1)
    sky = np.clip((b-r)*4,0,1) * np.clip((b-g)*9,0,1)
    background = x * (1-.42*sky[...,None])
    return Image.fromarray(np.uint8(np.rint(255*(background*(1-veg[...,None])+tint*veg[...,None]))))


def solar(photo, threshold):
    y = (decode(photo) @ LUMA)**.45
    # Fold the highlights around a moving density threshold; add a narrow
    # contour only where local exposure crosses the transition.
    width = .024
    reversal = y - 1.78 * width * np.logaddexp(0,(y-threshold)/width)
    slope = np.hypot(*np.gradient(gaussian_filter(y,.85)))
    line = np.exp(-.5*((y-threshold)/.032)**2)*np.minimum(.18,3*slope)
    gray = np.uint8(np.rint(255*np.clip(reversal/threshold-line,0,1)))
    return Image.fromarray(gray).convert("RGB")


def dots(photo, pitch, offset):
    # The sampled threshold distribution converts ink coverage to dot area.
    u = np.arange(192)/192*2*np.pi
    distribution = np.sort((np.cos(u[:,None])+np.cos(u)).ravel())
    rgb = np.asarray(photo, dtype=float)/255
    black = (1-rgb.max(axis=2))*.84
    cmy = 1-rgb/(1-black[...,None])
    y,x = np.indices(black.shape)
    paper = np.ones_like(rgb)*[.99,.965,.90]
    inks = [[.16,.72,.80],[.88,.25,.49],[.99,.82,.15],[.18,.19,.21]]
    for i,(angle,ink,plate) in enumerate(zip([15,75,0,45],inks,[*cmy.transpose(2,0,1),black])):
        a=np.deg2rad(angle)
        shift=offset*[-1,1,.5,0][i]
        dx,dy=x-shift,y+shift/2
        s=2*np.pi/pitch
        wave=np.cos(s*(dx*np.cos(a)+dy*np.sin(a)))+np.cos(s*(-dx*np.sin(a)+dy*np.cos(a)))
        rank=np.searchsorted(distribution,wave)/len(distribution)
        coverage=np.clip((plate-rank)*pitch+.5,0,1)
        coverage=np.where(plate<=0,0,np.where(plate>=1,1,coverage))
        paper *= 1-coverage[...,None]*(1-np.asarray(ink))
    return Image.fromarray(np.uint8(np.rint(255*paper)))


def motion(video):
    # frames 160..170 are in a single locked-off street shot at 25 fps.
    raw=subprocess.check_output(["ffmpeg","-v","error","-i",str(video),"-vf",
        "select=between(n\\,160\\,170),scale=640:272","-vsync","0",
        "-frames:v","11","-f","rawvideo","-pix_fmt","rgb24","pipe:1"])
    frames=np.frombuffer(raw,np.uint8).reshape(11,272,640,3)
    def combine(gap):
        return compose(*(Image.fromarray(frames[i]) for i in (5-gap, 5, 5+gap)))
    assert np.array_equal(np.asarray(combine(0)),frames[5])
    return [(label,combine(gap)) for label,gap in [("Reference",0),("80 ms / channel",2),("200 ms / channel",5)]]


def run(out, video):
    out.mkdir(parents=True,exist_ok=True)
    size=(420,295)
    canal=load("bluehour",size)
    mountain=load("meadow",size)
    face=load("headwrap",size)
    taxi=load("taxi",(840,590))
    sheet(out/"duotone.png",[[("Source",canal),("Navy + copper",duotone(canal,[.023,.064,.18],[.88,.32,.12])),
        ("Pine + rose",duotone(canal,[.018,.12,.085],[.98,.48,.63]))]],size)
    sheet(out/"infrared.png",[[("Source",mountain),("Crimson foliage",false_ir(mountain,False)),
        ("Pale pink foliage",false_ir(mountain,True))]],size)
    sheet(out/"motion.png",[motion(video)],(450,191))
    sheet(out/"solar.png",[[("B&W source",ImageOps.grayscale(face).convert("RGB")),
        ("Threshold 0.62",solar(face,.62)),("Threshold 0.45",solar(face,.45))]],size)
    plates=[("Source",taxi),("Fine / registered",dots(taxi,8,0)),("Coarse / offset",dots(taxi,15,2.4))]
    crop=(240,260,660,555)
    sheet(out/"screenprint.png",[plates,[(name+" / crop",im.crop(crop)) for name,im in plates]],size)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output",type=Path)
    parser.add_argument("video",type=Path)
    args=parser.parse_args()
    run(args.output,args.video)
