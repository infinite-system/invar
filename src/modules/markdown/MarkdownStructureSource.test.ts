import { expect, test } from 'bun:test';
import { TextDocument } from '../text/TextDocument';
import { MarkdownStructureSource } from './MarkdownStructureSource';

function makeDocument(text: string, path = '/tmp/readme.md') {
  const document = new TextDocument.Class();
  document.loadFromText(text, path);
  return document;
}

test('only .md paths are supported, and non-markdown documents answer null', async () => {
  const source = new MarkdownStructureSource.Class();
  expect(MarkdownStructureSource.Class.isMarkdownPath('/tmp/a.md')).toBe(true);
  expect(MarkdownStructureSource.Class.isMarkdownPath('/tmp/a.MD')).toBe(true);
  expect(MarkdownStructureSource.Class.isMarkdownPath('/tmp/a.ts')).toBe(false);
  expect(MarkdownStructureSource.Class.isMarkdownPath('')).toBe(false);
  const typescript = makeDocument('# not markdown\n', '/tmp/a.ts');
  expect(source.supportsDocument(typescript)).toBe(false);
  expect(await source.documentSymbols(typescript)).toBeNull();
  source.dispose();
});

test('headings nest by level in document order with section extents', async () => {
  const source = new MarkdownStructureSource.Class();
  const document = makeDocument(
    [
      '# Title', //            line 0
      'intro', //              line 1
      '## First', //           line 2
      'body', //               line 3
      '### Deep', //           line 4
      'body', //               line 5
      '## Second', //          line 6
      'body', //               line 7
      '# Appendix', //         line 8
      'tail', //               line 9
    ].join('\n'),
  );
  const result = await source.documentSymbols(document);
  expect(result).not.toBeNull();
  expect(result!.truncated).toBe(false);
  const [title, appendix] = result!.symbols;
  expect(result!.symbols.map((symbol) => symbol.name)).toEqual([
    'Title',
    'Appendix',
  ]);
  expect(title!.line).toBe(0);
  expect(title!.column).toBe(0);
  expect(title!.endLine).toBe(7);
  expect(title!.children.map((child) => child.name)).toEqual([
    'First',
    'Second',
  ]);
  const [first, second] = title!.children;
  expect(first!.line).toBe(2);
  expect(first!.endLine).toBe(5);
  expect(first!.children.map((child) => child.name)).toEqual(['Deep']);
  expect(first!.children[0]!.endLine).toBe(5);
  expect(second!.line).toBe(6);
  expect(second!.endLine).toBe(7);
  expect(appendix!.line).toBe(8);
  expect(appendix!.endLine).toBe(9);
  expect(title!.symbolClass).toBe('module');
  source.dispose();
});

test('a deeper first heading and setext headings keep document order', async () => {
  const source = new MarkdownStructureSource.Class();
  const document = makeDocument(
    ['### Orphan', 'body', '', 'Setext Title', '======', 'body'].join('\n'),
  );
  const result = await source.documentSymbols(document);
  expect(result!.symbols.map((symbol) => symbol.name)).toEqual([
    'Orphan',
    'Setext Title',
  ]);
  expect(result!.symbols[0]!.endLine).toBe(2);
  expect(result!.symbols[1]!.line).toBe(3);
  source.dispose();
});

test('a heading-shaped line inside a fenced code block is not a heading', async () => {
  const source = new MarkdownStructureSource.Class();
  const document = makeDocument(
    ['# Real', '```sh', '# comment, not a heading', '```', 'body'].join('\n'),
  );
  const result = await source.documentSymbols(document);
  expect(result!.symbols.map((symbol) => symbol.name)).toEqual(['Real']);
  source.dispose();
});

test('a markdown document with no headings answers an empty list, never null', async () => {
  const source = new MarkdownStructureSource.Class();
  const document = makeDocument('plain prose\n\nmore prose\n');
  const result = await source.documentSymbols(document);
  expect(result).not.toBeNull();
  expect(result!.symbols).toEqual([]);
  expect(source.structureNotice(document)).toBeNull();
  source.dispose();
});
