# Measure where a separator glyph puts its ink inside one terminal cell.
#
# WHY: the app grid dump names WHICH glyph is in a cell, but not where that
# glyph paints inside the cell. The task asks for a mark in the VERTICAL
# MIDDLE of its row. This script answers that question with numbers.
#
# HOW TO RUN:
#   python3 .invar/tasks/in-progress/345-horizontal-separator-centered-glyph/measure-345-separator-glyph-ink.py
#
# It rasterizes each candidate glyph into one cell of DejaVu Sans Mono (the
# system monospace font) at a normal terminal cell size, then reports the ink
# band inside that cell.
#
# HOW TO READ THE OUTPUT, per glyph:
#   inkTop/inkBottom  first and last cell row (0 = cell top) that holds ink.
#   thicknessRatio    ink height divided by cell height. The VERTICAL
#                     separator fills a whole cell, and a terminal cell is
#                     about twice as tall as it is wide, so a horizontal mark
#                     of ratio about 0.5 carries the same apparent weight as
#                     the vertical bar. A smaller ratio reads thinner.
#   centerOffsetRatio (ink midpoint - cell midpoint) / cell height. 0.0 means
#                     the mark sits in the vertical middle of the row.
#                     Positive means it sits BELOW the middle.
#
# A change in centerOffsetRatio toward 0.0 is the whole point of task #345.
# A change in thicknessRatio away from 0.5 is the cost paid for it, and is
# what the "equal visual weight" record has to be re-worded against.

from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONT_PIXEL_SIZE = 64
CANDIDATES = [
    ("U+2584 lower half block (current)", "▄"),
    ("U+2501 heavy horizontal", "━"),
    ("U+2500 light horizontal", "─"),
    ("U+2588 full block (vertical separator reference)", "█"),
    ("U+002D hyphen minus (ascii tier)", "-"),
]


def measure(font: ImageFont.FreeTypeFont, glyph: str) -> None:
    ascent, descent = font.getmetrics()
    cellHeight = ascent + descent
    cellWidth = int(round(font.getlength("M")))
    image = Image.new("L", (cellWidth, cellHeight), color=0)
    ImageDraw.Draw(image).text((0, 0), glyph, font=font, fill=255)
    inkRows = [
        row
        for row in range(cellHeight)
        if any(image.getpixel((column, row)) > 127 for column in range(cellWidth))
    ]
    if not inkRows:
        print(f"  no ink in cell {cellWidth}x{cellHeight}")
        return
    inkTop, inkBottom = inkRows[0], inkRows[-1]
    thickness = inkBottom - inkTop + 1
    inkMiddle = (inkTop + inkBottom + 1) / 2
    cellMiddle = cellHeight / 2
    print(
        f"  cell={cellWidth}x{cellHeight} inkTop={inkTop} inkBottom={inkBottom} "
        f"thicknessRatio={thickness / cellHeight:.3f} "
        f"centerOffsetRatio={(inkMiddle - cellMiddle) / cellHeight:+.3f}"
    )


def main() -> None:
    font = ImageFont.truetype(FONT_PATH, FONT_PIXEL_SIZE)
    for name, glyph in CANDIDATES:
        print(f"{name}  {glyph!r}")
        measure(font, glyph)


main()
