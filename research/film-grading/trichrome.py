"""Combine three developed exposures in chronological order, with no alignment."""
import argparse
from contextlib import ExitStack
from pathlib import Path

from PIL import Image, ImageOps


def compose(first, second, third):
    channels = [ImageOps.exif_transpose(photo).convert('RGB').getchannel(channel)
                for photo, channel in zip((first, second, third), 'RGB')]
    if any(channel.size != channels[0].size for channel in channels[1:]):
        raise ValueError('All three exposures must have the same oriented dimensions')
    return Image.merge('RGB', channels)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('exposures', nargs=3, type=Path, metavar='PHOTO')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.output.resolve() in {photo.resolve() for photo in args.exposures}:
        parser.error('Choose an output separate from the three source exposures')
    with ExitStack() as files:
        images = [files.enter_context(Image.open(path)) for path in args.exposures]
        compose(*images).save(args.output)
