"""Read the OM-3 default still gamma object and compare two highlight shoulders offline."""
import csv
import struct
import sys
from pathlib import Path

from model import bend


def compare(image):
    # Stock still selector and object layout: research/splittone/curves.py.
    offset = 0x6066c04c - 0x60021020
    stock = list(struct.unpack_from("<256H", image, offset + 144))
    fine = list(struct.unpack_from("<64H", image, offset + 16))
    assert stock[0] == 0 and stock[-1] == 4095 and stock == sorted(stock)
    current = bend(stock + fine, [0, 0, 0, 0, -2, -7])[:256]
    # A monotone Hermite shoulder based on input knot INDEX. Preserve low/mid
    # knots, start value and incoming slope. Finish at white with slope 3 DN/knot.
    start = 160
    span = 255 - start
    indexed = stock.copy()
    slope = stock[start] - stock[start-1]
    for i in range(start+1,256):
        t=(i-start)/span
        indexed[i]=round((2*t**3-3*t**2+1)*stock[start]+(t**3-2*t**2+t)*span*slope
                         +(-2*t**3+3*t**2)*4095+(t**3-t**2)*span*3)
    assert indexed == sorted(indexed) and indexed[:161] == stock[:161] and indexed[-1]==4095
    return stock,current,indexed


if __name__ == "__main__":
    stock,current,indexed=compare(Path(sys.argv[1]).read_bytes())
    with open(sys.argv[2],"w",newline="") as stream:
        writer=csv.writer(stream)
        writer.writerow(["input_knot","stock_12bit","looklab_12bit","indexed_12bit"])
        writer.writerows(zip(range(256),stock,current,indexed))
    for name,curve in [("stock",stock),("LookLab",current),("indexed",indexed)]:
        print(name, "knots 241..255:",curve[241:],"illustrative 8-bit:",sorted({round(v*255/4095) for v in curve[241:]}))
