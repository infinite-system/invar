import { test, expect } from 'bun:test';
import { join } from 'node:path';
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

test('heading levels carry a distinct intensity ramp', () => {
  const stylesheet = MarkdownStylesheet.Class;
  const rampKeys = [1, 2, 3, 4, 5, 6].map((level) => {
    const style = stylesheet.textStyle(stylesheet.headingSelector(level));
    return `${style.colorSlot}:${style.bold}:${style.italic}:${style.underline}`;
  });
  // each level must be visually distinguishable from its neighbour
  for (let level = 1; level < rampKeys.length; level++) {
    expect(rampKeys[level]).not.toBe(rampKeys[level - 1]);
  }
});

test('inline styles overlay the element style through the stylesheet', () => {
  const stylesheet = MarkdownStylesheet.Class;
  expect(stylesheet.inlineTextStyle('inlineCode').backgroundSlot).toBe('panel');
  expect(stylesheet.inlineTextStyle('inlineEmphasis').italic).toBe(true);
  expect(stylesheet.inlineTextStyle('inlineEmphasis').colorSlot).toBe(null);
  expect(stylesheet.inlineTextStyle('inlineStrong').bold).toBe(true);
  expect(stylesheet.inlineTextStyle('inlineLink').underline).toBe(true);
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
