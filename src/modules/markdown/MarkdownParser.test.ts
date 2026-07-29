import { test, expect } from 'bun:test';
import { MarkdownParser, type BlockRecord } from './MarkdownParser';

const parse = (source: string, revision = 0): readonly BlockRecord[] =>
  new MarkdownParser.Class().parse(source, revision).blocks;

const kinds = (source: string) => parse(source).map((block) => block.kind);

test('empty packed arrays remain an overridable late-bound seam', () => {
  const replacementEmptyNumbers = Object.freeze([17]);
  const replacementEmptyStrings = Object.freeze(['replacement']);
  class CustomMarkdownParser extends MarkdownParser.$Class {
    protected static override get $emptyNumbers(): readonly number[] {
      return replacementEmptyNumbers;
    }

    protected static override get $emptyStrings(): readonly string[] {
      return replacementEmptyStrings;
    }
  }

  const [horizontalRule] = new CustomMarkdownParser().parse('---').blocks;
  expect(horizontalRule!.spans).toBe(replacementEmptyNumbers);
  expect(horizontalRule!.links).toBe(replacementEmptyStrings);
});

test('parses a heading with level', () => {
  const [atx] = parse('## Title here');
  expect(atx!.kind).toBe('heading');
  expect(atx!.level).toBe(2);
  expect(atx!.text).toBe('Title here');

  // setext underline form
  const setext = parse('Big Title\n=========');
  expect(setext[0]!.kind).toBe('heading');
  expect(setext[0]!.level).toBe(1);
  expect(setext[0]!.text).toBe('Big Title');
});

test('parses a paragraph as a single joined block', () => {
  const blocks = parse('one line\ntwo line\nthree');
  expect(blocks).toHaveLength(1);
  expect(blocks[0]!.kind).toBe('paragraph');
  expect(blocks[0]!.text).toBe('one line two line three');
});

test('preserves consecutive metadata fields while prose still reflows', () => {
  const [metadataFields] = parse(
    'State: IN-PROGRESS\nCreated: 2026-07-29\nEngine: codex',
  );
  expect(metadataFields!.kind).toBe('paragraph');
  expect(metadataFields!.text).toBe(
    'State: IN-PROGRESS\nCreated: 2026-07-29\nEngine: codex',
  );

  const [prose] = parse(
    'A normal prose paragraph can wrap in its source.\nIts authored newline is not semantic.',
  );
  expect(prose!.text).toBe(
    'A normal prose paragraph can wrap in its source. Its authored newline is not semantic.',
  );
});

test('parses ordered and unordered list items with markers', () => {
  const bullets = parse('- first\n- second\n  - nested');
  // a container 'list' block plus one 'listitem' per row
  expect(bullets[0]!.kind).toBe('list');
  const items = bullets.filter((block) => block.kind === 'listitem');
  expect(items.map((item) => item.text)).toEqual(['first', 'second', 'nested']);
  expect(items[0]!.marker).toBe('•');
  expect(items[2]!.level).toBe(2); // two-space indent → depth 2

  const ordered = parse('1. one\n2. two').filter(
    (block) => block.kind === 'listitem',
  );
  expect(ordered.map((item) => item.marker)).toEqual(['1.', '2.']);
});

test('parses a fenced code block with language', () => {
  const [code] = parse('```ts\nconst x = 1;\nconst y = 2;\n```');
  expect(code!.kind).toBe('code');
  expect(code!.language).toBe('ts');
  expect(code!.text).toBe('const x = 1;\nconst y = 2;');
  // code content is verbatim: no inline spans harvested
  expect(code!.spans).toHaveLength(0);
});

test('parses a blockquote reflowing hard-wrapped lines like a paragraph', () => {
  const [quote] = parse('> quoted line\n> second quote');
  expect(quote!.kind).toBe('blockquote');
  expect(quote!.text).toBe('quoted line second quote');
});

test('a blank quoted line separates quote paragraphs', () => {
  const [quote] = parse('> first paragraph\n>\n> second paragraph');
  expect(quote!.kind).toBe('blockquote');
  expect(quote!.text).toBe('first paragraph\n\nsecond paragraph');
});

test('parses table cells and column alignment without painting syntax', () => {
  const [table] = parse(
    '| a | middle | z |\n| :--- | :---: | ---: |\n| 1 | `two` | 3 |',
  );
  expect(table!.kind).toBe('table');
  expect(table!.table?.alignments).toEqual(['left', 'center', 'right']);
  expect(table!.table?.rows.map((row) => row.map((cell) => cell.text))).toEqual(
    [
      ['a', 'middle', 'z'],
      ['1', 'two', '3'],
    ],
  );
  expect(table!.table?.rows[1]![1]!.spans).toEqual([
    0,
    3,
    MarkdownParser.Class.inlineStyles.code,
    0,
  ]);
});

test('malformed tables remain visible paragraph text', () => {
  const [missingSeparator] = parse('| a | b |\n| one | two |');
  expect(missingSeparator!.kind).toBe('paragraph');
  expect(missingSeparator!.text).toContain('| a | b |');
  expect(missingSeparator!.text).toContain('| one | two |');

  const [ragged] = parse('| a | b |\n| --- | --- |\n| one | two | extra |');
  expect(ragged!.kind).toBe('paragraph');
  expect(ragged!.text).toContain('| --- | --- |');
  expect(ragged!.text).toContain('| one | two | extra |');
});

test('parses a horizontal rule', () => {
  expect(kinds('---')).toEqual(['hr']);
});

test('packs inline emphasis strong code and link into flat spans', () => {
  const [paragraph] = parse(
    'A **bold**, *em*, `code` and a [link](https://x.y).',
  );
  expect(paragraph!.kind).toBe('paragraph');
  // markup is stripped from the rendered text
  expect(paragraph!.text).toBe('A bold, em, code and a link.');
  // spans are packed 4 ints per run: [start, end, style, linkIndexPlusOne] — never token objects
  expect(paragraph!.spans.length % 4).toBe(0);
  const runs = [];
  for (let spanIndex = 0; spanIndex < paragraph!.spans.length; spanIndex += 4) {
    runs.push({
      text: paragraph!.text.slice(
        paragraph!.spans[spanIndex]!,
        paragraph!.spans[spanIndex + 1]!,
      ),
      style: paragraph!.spans[spanIndex + 2]!,
      link: paragraph!.spans[spanIndex + 3]!,
    });
  }
  expect(runs).toEqual([
    { text: 'bold', style: MarkdownParser.Class.inlineStyles.strong, link: 0 },
    { text: 'em', style: MarkdownParser.Class.inlineStyles.emphasis, link: 0 },
    { text: 'code', style: MarkdownParser.Class.inlineStyles.code, link: 0 },
    { text: 'link', style: MarkdownParser.Class.inlineStyles.link, link: 1 },
  ]);
  expect(paragraph!.links).toEqual(['https://x.y']);
});

test('a block record is a plain object with no reactive members', () => {
  const paragraph = parse('plain text')[0]!;
  // every own value is a primitive, a plain array, or a plain range object — no Ref (.value getter)
  const record = paragraph as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (value && typeof value === 'object') {
      expect('value' in (value as object)).toBe(false); // not a Vue Ref
    }
  }
});

test('stamps block source ranges and preserves the revision', () => {
  const result = new MarkdownParser.Class().parse('# H\n\npara', 42);
  expect(result.revision).toBe(42);
  const [heading, paragraph] = result.blocks;
  expect(heading!.range.startLine).toBe(0);
  expect(heading!.range.startOffset).toBe(0);
  // paragraph begins after '# H\n\n' → offset 5, line 2
  expect(paragraph!.range.startLine).toBe(2);
  expect(paragraph!.range.startOffset).toBe(5);
});
