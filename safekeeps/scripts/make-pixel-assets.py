"""Write crisp pre-scaled copies of the homebound pixel sprites.

One art pixel becomes exactly 3 device pixels on 2x phones (name@2x.png, scaled by 3)
and 4 device pixels on 3x phones (name@3x.png, scaled by 4). Nearest neighbor only.
src/components/pixel-art.tsx draws them and uses the same 3 and 4.

Frame sprites are also cut down: the plain middle (rows and columns that are all the same,
between the caps) is shortened to MIDDLE art pixels. The app stretches that plain middle back
to any size, so the screen shows the same pixels. A small image matters because React Native
downsamples (blurs) an image that is bigger than its view in both directions, for example the
check-in frame behind a half-width Accept button.

The originals are not changed. Run from the safekeeps folder:

    python scripts/make-pixel-assets.py
"""
from pathlib import Path

from PIL import Image

FOLDER = Path(__file__).resolve().parent.parent / 'assets' / 'images' / 'homebound'
SCALES = {'@2x': 3, '@3x': 4}  # file suffix -> device pixels per art pixel
MIDDLE = 6  # art pixels of plain middle kept; pixel-art.tsx rounds caps up by at most 2 on each side
# Caps [top, right, bottom, left] in art pixels. Keep the same numbers in src/components/pixel-art.tsx.
FRAMES = {
    'header': (31, 12, 3, 176),
    'sectionbig': (13, 87, 7, 87),
    'sectionfriends': (6, 5, 6, 5),
    'sectionalert': (6, 5, 6, 5),
    'frame1': (5, 5, 8, 5),
    'frame2': (5, 5, 8, 5),
    'friendempty': (1, 2, 3, 2),
    'friendaway': (16, 4, 5, 4),
    'friendpresent': (20, 4, 5, 4),
}
SPRITES = ['settingsbutton', 'flowerwhite', 'flowerred', 'stone']  # drawn at natural size, not cut


def cut(art, caps):
    """Keep the caps and MIDDLE plain art pixels between them, on both axes."""
    top, right, bottom, left = caps
    w, h = art.size
    px = art.load()
    rows = [tuple(px[x, y] for x in range(w)) for y in range(h)]
    cols = [tuple(px[x, y] for y in range(h)) for x in range(w)]
    assert len(set(rows[top:h - bottom])) == 1 and h - top - bottom >= MIDDLE, 'middle rows are not plain'
    assert len(set(cols[left:w - right])) == 1 and w - left - right >= MIDDLE, 'middle columns are not plain'
    out = Image.new('RGBA', (left + MIDDLE + right, top + MIDDLE + bottom))
    for (x0, x1, dx) in ((0, left + MIDDLE, 0), (w - right, w, left + MIDDLE - (w - right))):
        for (y0, y1, dy) in ((0, top + MIDDLE, 0), (h - bottom, h, top + MIDDLE - (h - bottom))):
            out.paste(art.crop((x0, y0, x1, y1)), (x0 + dx, y0 + dy))
    return out


out = FOLDER / 'scaled'
out.mkdir(exist_ok=True)
for name in [*FRAMES, *SPRITES]:
    art = Image.open(FOLDER / f'{name}.png').convert('RGBA')
    if name in FRAMES:
        art = cut(art, FRAMES[name])
    for suffix, k in SCALES.items():
        art.resize((art.width * k, art.height * k), Image.NEAREST).save(out / f'{name}{suffix}.png')
    print(name, art.size)
