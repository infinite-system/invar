import { test, expect } from 'bun:test';
import { join } from 'node:path';
import { MarkdownParser } from './MarkdownParser';
import { MarkdownStylesheet } from './MarkdownStylesheet';

// invariant: Markdown presentation resolves through one stylesheet (src/modules/markdown/markdown.invariants.md)

test('margins collapse CSS-style between adjacent blocks', () => {
  const stylesheet = MarkdownStylesheet.Class;
  // a big heading pulls extra air even after a paragraph
  expect(stylesheet.spacingBetween('paragraph', 'heading2')).toBe(2);
  // list items sit tight against each other
  expect(stylesheet.spacingBetween('listItem', 'listItem')).toBe(0);
  // a list still separates from surrounding paragraphs
  expect(stylesheet.spacingBetween('paragraph', 'listItem')).toBe(1);
  expect(stylesheet.spacingBetween('listItem', 'paragraph')).toBe(1);
  // the document edge uses the pane's vertical padding, not a margin
  expect(stylesheet.spacingBetween(null, 'heading1')).toBe(
    stylesheet.panePadding.top,
  );
  expect(stylesheet.spacingBetween('listItem', null)).toBe(0);
  expect(stylesheet.spacingBetween(null, null)).toBe(0);
});

test('heading starts preserve authored gaps without synthetic rows', () => {
  const stylesheet = MarkdownStylesheet.Class;
  const parser = new MarkdownParser.Class();
  for (let level = 1; level <= 6; level++) {
    const prefix = '#'.repeat(level);
    const adjacentBlocks = parser.parse(`Before\n${prefix} Heading`).blocks;
    const spacedBlocks = parser.parse(`Before\n\n${prefix} Heading`).blocks;
    const topHeading = parser.parse(`${prefix} Heading`).blocks[0]!;
    expect(
      stylesheet.spacingBetweenBlocks(adjacentBlocks[0]!, adjacentBlocks[1]!),
    ).toBe(0);
    expect(
      stylesheet.spacingBetweenBlocks(spacedBlocks[0]!, spacedBlocks[1]!),
    ).toBe(1);
    expect(stylesheet.spacingBetweenBlocks(null, topHeading)).toBe(0);
  }
});

test('row selectors resolve every role and heading level', () => {
  const stylesheet = MarkdownStylesheet.Class;
  expect(stylesheet.rowSelector('content', 'heading', 1)).toBe('heading1');
  expect(stylesheet.rowSelector('content', 'heading', 6)).toBe('heading6');
  // out-of-range levels clamp instead of falling off the rule table
  expect(stylesheet.rowSelector('content', 'heading', 9)).toBe('heading6');
  expect(stylesheet.rowSelector('content', 'heading', undefined)).toBe(
    'heading1',
  );
  expect(stylesheet.rowSelector('content', 'listitem', undefined)).toBe(
    'listItem',
  );
  expect(stylesheet.rowSelector('content', 'paragraph', undefined)).toBe(
    'paragraph',
  );
  expect(stylesheet.rowSelector('quote', 'blockquote', undefined)).toBe(
    'blockquote',
  );
  expect(stylesheet.rowSelector('codeContent', 'code', undefined)).toBe(
    'codeBlock',
  );
  expect(stylesheet.rowSelector('tableSeparator', 'table', undefined)).toBe(
    'tableBorder',
  );
});

test('heading levels share the accent color without changing their attributes', () => {
  const stylesheet = MarkdownStylesheet.Class;
  const heading1 = stylesheet.textStyle('heading1');
  const heading2 = stylesheet.textStyle('heading2');
  expect(heading1.colorSlot).toBe('accent');
  expect(heading1.bold).toBe(true);
  expect(heading1.underline).toBe(false);
  expect(heading2).toMatchObject({
    colorSlot: 'accent',
    bold: true,
    italic: false,
    underline: false,
  });
  const headingStyles = [1, 2, 3, 4, 5, 6].map((level) =>
    stylesheet.textStyle(stylesheet.headingSelector(level)),
  );
  expect(headingStyles.map((style) => style.colorSlot)).toEqual(
    Array.from({ length: 6 }, () => 'accent'),
  );
  expect(
    headingStyles.map(({ bold, italic, underline }) => ({
      bold,
      italic,
      underline,
    })),
  ).toEqual([
    { bold: true, italic: false, underline: false },
    { bold: true, italic: false, underline: false },
    { bold: false, italic: false, underline: false },
    { bold: true, italic: false, underline: false },
    { bold: true, italic: false, underline: false },
    { bold: true, italic: true, underline: false },
  ]);
});

test('inline styles overlay the element style through the stylesheet', () => {
  const stylesheet = MarkdownStylesheet.Class;
  expect(stylesheet.inlineTextStyle('inlineCode').backgroundSlot).toBe('panel');
  expect(stylesheet.inlineTextStyle('inlineEmphasis').italic).toBe(true);
  expect(stylesheet.inlineTextStyle('inlineEmphasis').colorSlot).toBe(null);
  expect(stylesheet.inlineTextStyle('inlineStrong').bold).toBe(true);
  expect(stylesheet.inlineTextStyle('inlineLink').underline).toBe(true);
  expect(stylesheet.deadReferenceStyle).toMatchObject({
    colorSlot: 'error',
    underline: true,
  });
});

test('code fence rows share one background and rounded frame vocabulary', () => {
  const stylesheet = MarkdownStylesheet.Class;
  expect(stylesheet.textStyle('codeBlock').backgroundSlot).toBe(
    'selectionMuted',
  );
  expect(stylesheet.textStyle('codeBorder')).toMatchObject({
    colorSlot: 'fg',
    backgroundSlot: 'selectionMuted',
  });
  expect(stylesheet.prefixStyle('codeContent').backgroundSlot).toBe(
    'selectionMuted',
  );
  expect(stylesheet.vocabulary.codeFrame).toMatchObject({
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
  });
});

test('pane padding gives body text breathing room from the pane edges', () => {
  const padding = MarkdownStylesheet.Class.panePadding;
  expect(padding.left).toBeGreaterThanOrEqual(2);
  expect(padding.right).toBeGreaterThanOrEqual(2);
  expect(padding.top).toBeGreaterThanOrEqual(1);
  expect(MarkdownStylesheet.Class.panePaddingText).toBe(
    ' '.repeat(padding.left),
  );
});

// The census the stylesheet-seam record demands: no markdown element resolves presentation
// vocabulary outside the stylesheet. Projection and paint may ask the stylesheet and read
// the palette slots it names, but the glyphs, indents, and slot choices live in ONE file.
test('census: preview and renderable hold no presentation vocabulary of their own', async () => {
  const moduleDirectory = import.meta.dir;
  const presentationGlyphs = /[│─┌┐└┘┬┴├┤┼•]/u;
  for (const consumerFile of ['MarkdownPreview.ts', 'MarkdownRenderable.ts']) {
    const source = await Bun.file(join(moduleDirectory, consumerFile)).text();
    expect(presentationGlyphs.test(source)).toBe(false);
  }
  // The renderable resolves every color through stylesheet slots; the only direct palette
  // reads it may keep are the pane-level fg/bg defaults.
  const renderableSource = await Bun.file(
    join(moduleDirectory, 'MarkdownRenderable.ts'),
  ).text();
  const directPaletteReads = [
    ...renderableSource.matchAll(/palette\.([a-zA-Z]+)/g),
  ].map((match) => match[1]);
  expect(
    directPaletteReads.filter((slot) => slot !== 'fg' && slot !== 'bg'),
  ).toEqual([]);
});
