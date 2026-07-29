#!/usr/bin/env python3
# What this finds out: whether the markdown preview keeps per-frame costs flat at scale.
# It writes a 100,000-line markdown file (headings, paragraphs, blockquotes, tables) for
# the scale-parity drive of #236 (terminal stylesheet).
# Run: python3 236-generate-large-markdown-fixture.py /tmp/large-236.md
# Read the output: open the file in Invar, toggle the preview (Ctrl+Shift+V), and page.
# Every PageDown must settle in one frame like a 10-line file does; a settle that grows
# with document length is the defect this fixture exists to expose.
import sys

lines = []
section = 0
while len(lines) < 100000:
    section += 1
    lines += [
        f'## Section {section:05d}',
        '',
        f'Paragraph body for section {section} long enough to wrap at narrow pane widths '
        'and exercise the shared break generator on every row.',
        '',
        f'> A quoted line inside section {section}.',
        '',
        '| Name | Value |',
        '| --- | ---: |',
        f'| row {section} | {section} |',
        '',
    ]
open(sys.argv[1], 'w').write('\n'.join(lines) + '\n')
