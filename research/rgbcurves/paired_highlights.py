"""Compare a camera JPEG's flat white areas with green photosites in its paired OM-3 ORF.
Usage: python paired_highlights.py output_directory image1.ORF [image2.ORF ...]
Dependencies: rawpy, numpy, scipy, Pillow. Coordinates refer to the unrotated JPEG.
"""
import csv
import sys
from pathlib import Path
import numpy as np
import rawpy
from PIL import Image
from scipy.ndimage import distance_transform_cdt, maximum_filter
from scipy.stats import spearmanr


def inspect(path):
    with Image.open(path.with_suffix(".JPG")) as image:
        ex = image.getexif()
        if str(ex.get(272)).strip() != "OM-3" or not str(ex.get(305)).startswith("Version"):
            return
        rgb = np.asarray(image.convert("RGB"))
    h, w, _ = rgb.shape
    if h % 4 or w % 4:
        return
    with rawpy.imread(str(path)) as raw:
        size = raw.sizes
        x, y = size.crop_left_margin, size.crop_top_margin
        if (size.crop_width, size.crop_height) != (w, h) or raw.raw_pattern is None:
            return
        plane = raw.raw_image[y:y+h, x:x+w].copy()
        if plane.shape != (h,w):
            return
        greens = []
        whites = raw.camera_white_level_per_channel or [raw.white_level]*4
        offsets = {}
        for dy, dx in np.ndindex(2,2):
            c = raw.raw_pattern[(dy+y-size.top_margin)%2,(dx+x-size.left_margin)%2]
            offsets.setdefault(chr(raw.color_desc[c]), []).append((dy,dx))
            if raw.color_desc[c:c+1] == b"G":
                black = raw.black_level_per_channel[c]
                greens.append((plane[dy::2,dx::2].astype(np.float32)-black)/(whites[c]-black))
        if len(greens) != 2:
            return
    # One value per 4x4 source pixels, averaging eight green samples.
    green = ((greens[0]+greens[1])*0.5).reshape(h//4,2,w//4,2).mean(axis=(1,3))
    jpeg = rgb[:,:,1].reshape(h//4,4,w//4,4).mean(axis=(1,3))
    flat = (rgb.min(axis=2)==255).reshape(h//4,4,w//4,4).all(axis=(1,3))
    dist = distance_transform_cdt(np.pad(flat,1),metric="chessboard")[1:-1,1:-1]
    yy, xx = np.where((dist>=4)&(dist==maximum_filter(dist,31)))
    chosen=[]
    for i in np.argsort(-dist[yy,xx]):
        cy,cx=int(yy[i]),int(xx[i])
        if any(abs(cy-p)<20 and abs(cx-q)<20 for p,q in chosen):
            continue
        if not (56<=cy<h//4-56 and 56<=cx<w//4-56):
            continue
        chosen.append((cy,cx))
        # Estimate local displacement from a 320-pixel context using rank correlation.
        # Verify a unique peak before trusting the correspondence.
        block=jpeg[cy-40:cy+40:4,cx-40:cx+40:4]
        if np.std(block)<12:
            continue
        scores=[]
        for oy in range(-8,9):
            for ox in range(-8,9):
                ref=green[cy+oy-40:cy+oy+40:4,cx+ox-40:cx+ox+40:4]
                corr=spearmanr(block.ravel(),ref.ravel()).statistic
                if np.isfinite(corr):
                    scores.append((corr,oy,ox))
        if not scores:
            continue
        corr,oy,ox=max(scores)
        if corr<0.85 or max(abs(oy),abs(ox))==8:
            continue
        if any(s>corr-.003 and max(abs(y-oy),abs(x-ox))>2 for s,y,x in scores):
            continue
        # Leave an 8-pixel margin from the JPEG white region's edge.
        radius=min(int(dist[cy,cx])-3,24)
        if radius<2:
            continue
        tile=green[cy+oy-radius:cy+oy+radius+1,cx+ox-radius:cx+ox+radius+1]
        lo,hi=np.percentile(tile,[10,90])
        side=(2*radius+1)*4
        rx,ry=4*(cx+ox-radius),4*(cy+oy-radius)
        samples=plane[ry:ry+side,rx:rx+side]
        levels={}
        blocks={}
        for channel,positions in offsets.items():
            cells=np.stack([samples[dy::2,dx::2] for dy,dx in positions])
            a,b=np.percentile(cells,[10,90])
            levels.update({channel+"_dn_p10":round(a,1),channel+"_dn_p90":round(b,1)})
            blocks[channel]=cells.mean(axis=0).reshape(side//4,2,side//4,2).mean(axis=(1,3))
        yield dict(file=path.name,jpeg_x=cx*4,jpeg_y=cy*4,side=side,
                   raw_offset_x=ox*4,raw_offset_y=oy*4,rank_corr=round(float(corr),4),
                   green_p10=round(float(lo),5),green_p90=round(float(hi),5),**levels),blocks


if __name__=="__main__":
    out=Path(sys.argv[1]); out.mkdir(parents=True,exist_ok=True)
    rows=[]; best=0
    for arg in sys.argv[2:]:
        for row,tile in inspect(Path(arg)):
            rows.append(row)
            gap=max(float(np.percentile(block,90)-np.percentile(block,10)) for block in tile.values())
            if gap>best:
                best=gap
                bestrow=row
                np.savez(out/"example-cfa.npz",**tile,source=row['file'],x=row['jpeg_x'],y=row['jpeg_y'])
    if rows:
        with (out/"regions.csv").open("w",newline="",encoding="utf-8") as f:
            writer=csv.DictWriter(f,fieldnames=rows[0]);writer.writeheader();writer.writerows(rows)
    print(len(rows),"regions",len(set(r["file"] for r in rows)),"pairs",bestrow if best else "")
