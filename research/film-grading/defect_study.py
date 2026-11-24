"""Offline film-defect sketches. Run: python research/film-grading/defect_study.py OUTPUT"""
import argparse
import secrets
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.ndimage import gaussian_filter

from trait_study import SAMPLES, decode, encode, sheet


SIZE = (640, 420)


def sample(name):
    with Image.open(SAMPLES / (name + ".jpg")) as photo:
        return ImageOps.fit(photo.convert("RGB"), SIZE, method=Image.Resampling.LANCZOS)


def expose(photo, dose, sensitivity):
    # Render a positive scan: stray exposure raises the shadows and progressively
    # erases local contrast. The three channels reach white at different doses.
    x = decode(photo)
    return encode(1 - (1-x) * np.exp(-dose[..., None]*np.asarray(sensitivity)))


def stream(seed, effect, frame=0):
    return np.random.default_rng([seed, effect, frame])


def leak(photo, kind, seed, frame):
    back = kind == "back"
    if kind not in ("leader", "back") or frame < 1:
        raise ValueError("Expected leader or back and a one-based frame")
    roll = stream(seed, 2 if back else 1)
    moment = stream(seed, 12 if back else 11, frame)
    y, x = np.indices((photo.height, photo.width), dtype=float)
    x /= photo.width
    y /= photo.height
    if roll.random() < .5:
        x = 1-x
    bend = roll.uniform(-.12,.12)*(y-.5)
    bend += roll.uniform(.005,.05)*np.sin(roll.uniform(2,8)*y+roll.uniform(0,6))
    sensitivity = [1,roll.uniform(.08,.38),roll.uniform(.018,.12)]
    if back:
        centre = roll.uniform(.015,.18) + bend + moment.normal(0,.006)
        width = roll.uniform(.018,.065)
        band = np.exp(-.5*((x-centre)/width)**2)
        wash = np.exp(-.5*((x-centre)/(width*2.8))**2)
        along = np.exp(-.5*((y-roll.uniform(.1,.9))/roll.uniform(.2,.55))**2)
        dose = (band+.32*wash)*(.09+along)*moment.uniform(.25,2.7)
    else:
        extent = roll.uniform(.18,.79)
        feather = roll.uniform(.011,.045)
        tail = roll.uniform(.035,.14)
        fade = roll.uniform(.08,.48)
        # An uneven wrap can burn only a corner or leave a bowed boundary.
        bend += roll.uniform(-.28,.28)*(y-.5)
        bend += roll.uniform(-.14,.14)*np.exp(-.5*((y-roll.uniform(0,1))/.24)**2)
        feather *= 1 + roll.uniform(-.65,.65)*(2*y-1)
        if frame == 1:
            dose = np.exp(np.clip((extent+bend-x)/feather,-40,7))
        else:
            # Light conducted through the base can reach later wraps. Side,
            # spatial falloff and the first exposure determine the whole tail.
            dose = extent*1.8*fade**(frame-2)*np.exp(-x/tail)
            dose *= .4+.6*np.exp(-.5*((y-roll.uniform(.1,.9))/.28)**2)
    return expose(photo,dose,sensitivity)


def fog(photo, seed):
    rng = stream(seed,3)
    base = rng.uniform(.012,.055,3)*rng.uniform(.45,1.25)
    transmission = rng.uniform(.72,.95,3)
    gamma = rng.uniform(.84,1.04,3)
    return encode(base + transmission*decode(photo)**gamma)


def scratch(photo, seed, frame):
    roll = stream(seed,4)
    moment = stream(seed,14,frame)
    y,x = np.indices((photo.height,photo.width))
    # Continuous strip coordinate keeps the same rail across frame boundaries.
    t = x + (frame-1)*photo.width
    position = roll.uniform(.12,.88)*photo.height + roll.uniform(.2,1.4)*np.sin(t/roll.uniform(150,320))
    line = np.exp(-.5*((y-position)/roll.uniform(.30,.68))**2)
    contact = np.clip(.42+.48*np.sin(t/roll.uniform(42,120))+.21*np.sin(t/roll.uniform(13,37)),0,1)
    return expose(photo,line*contact*moment.uniform(.28,.65),[1,.86,.64])


def static(photo, seed, frame):
    rng = stream(seed,5,frame)
    scale = 3
    mask = Image.new("L",(photo.width*scale,photo.height*scale))
    draw = ImageDraw.Draw(mask)

    def branch(start,angle,length,depth):
        point = np.array(start,dtype=float)
        forks = rng.choice(np.arange(2,length-1), size=min(2,length-3), replace=False)
        for step in range(length):
            angle += rng.normal(0,.23)
            nxt = point+rng.uniform(1.7,3.8)*np.array([np.cos(angle),np.sin(angle)])
            draw.line([tuple(point*scale),tuple(nxt*scale)],fill=int(rng.uniform(.76,1)*(48+depth*54)),width=depth+1)
            child_length = int(length*rng.uniform(.30,.60))
            if depth and step in forks and child_length >= 4:
                branch(nxt,angle+rng.choice([-1,1])*rng.uniform(.45,1.2),child_length,depth-1)
            point = nxt
    start = [photo.width*rng.uniform(.14,.86),photo.height*rng.uniform(.17,.83)]
    branch(start,rng.uniform(0,2*np.pi),int(rng.integers(20,41)),3)
    field = np.asarray(mask.resize(photo.size,Image.Resampling.LANCZOS),float)/255
    tint = [1,.18,.12] if rng.random()<.38 else [.35,.32,1]
    return expose(photo,(field+.4*gaussian_filter(field,1.5))*rng.uniform(.5,1.2),tint)


def crescent(photo, seed, frame):
    rng = stream(seed,6,frame)
    y,x = np.indices((photo.height,photo.width))
    dx = x-rng.uniform(.1,.9)*photo.width
    dy = y-rng.uniform(.12,.88)*photo.height
    a = rng.uniform(0,2*np.pi)
    u,v = dx*np.cos(a)+dy*np.sin(a),dy*np.cos(a)-dx*np.sin(a)
    radius = rng.uniform(8,20)
    height = radius*rng.uniform(.4,.8)
    ring = np.hypot(u/radius,v/height)
    mark = np.exp(-.5*((ring-1)/rng.uniform(.085,.19))**2)*np.clip(-v/height,0,1)**1.1
    return encode(decode(photo)*np.exp(-rng.uniform(.7,2)*mark[...,None]))


def roll_frame(photo, seed, frame):
    """Example event cadence for a 36-exposure roll; probabilities are artistic."""
    roll = stream(seed,20)
    moment = stream(seed,21,frame)
    aged, loose_back = roll.random(2) < [.32,.30]
    scratch_start = int(roll.integers(2,37))
    scratch_length = int(roll.integers(2,6))
    if aged:
        photo = fog(photo,seed)
    photo = leak(photo,"leader",seed,frame)
    if loose_back and moment.random() < .52:
        photo = leak(photo,"back",seed,frame)
    if scratch_start <= frame < scratch_start+scratch_length:
        photo = scratch(photo,seed,frame)
    if moment.random() < .055:
        photo = static(photo,seed,frame)
    if moment.random() < .03:
        photo = crescent(photo,seed,frame)
    return photo


def mark_detail(original, marked):
    delta = np.abs(np.asarray(marked,dtype=float)-np.asarray(original,dtype=float)).max(axis=2)
    y,x = np.where(delta>max(4,delta.max()*.12))
    w,h = 180,118
    left = int(np.clip((x.min()+x.max()-w)/2,0,marked.width-w))
    top = int(np.clip((y.min()+y.max()-h)/2,0,marked.height-h))
    return marked.crop((left,top,left+w,top+h))


def run(out, seed):
    out.mkdir(parents=True,exist_ok=True)
    street, night, face, sign = map(sample,("brasserie","bluehour","portrait","neon"))
    seeds = [seed+i for i in range(3)]
    sheet(out/"leader-rolls.png",[
        [(f"Roll {i} / frame {frame}",leak(street,"leader",s,frame)) for frame in (1,2,3)]
        for i,s in zip("ABC",seeds)],(338,222))
    sheet(out/"leak-fog.png",[
        [(f"Roll {i} / back leak",leak(night,"back",s,4)) for i,s in zip("ABC",seeds)],
        [(f"Roll {i} / age fog",fog(face,s)) for i,s in zip("ABC",seeds)]],(338,222))
    # Forced-event detail samples allow direct comparison of rare shapes.
    gray = ImageOps.grayscale(face).convert("RGB")
    sheet(out/"marks.png",[
        [(f"Roll {i} / scratch detail",mark_detail(street,scratch(street,s,8))) for i,s in zip("ABC",seeds)],
        [(f"Roll {i} / static detail",mark_detail(sign,static(sign,s,8))) for i,s in zip("ABC",seeds)],
        [(f"Roll {i} / pressure detail",mark_detail(gray,crescent(gray,s,8))) for i,s in zip("ABC",seeds)]],(260,170))
    sheet(out/"sequence.png",[
        [(f"Frame {f:02d}",roll_frame(street,seed,f)) for f in range(start,start+4)]
        for start in (1,5,9)],(246,162))
    print(f"First roll seed: {seed}")


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output",type=Path)
    parser.add_argument("--seed",type=int,help="First roll seed; omit for three new rolls")
    args=parser.parse_args()
    if args.seed is not None and args.seed < 0:
        parser.error("seed must be nonnegative")
    run(args.output,secrets.randbits(32) if args.seed is None else args.seed)
