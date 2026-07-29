import { test, expect } from 'bun:test';
import { ref } from 'vue';
import { Reactive } from 'ivue';
import { TextCoordinates } from '../text/TextCoordinates';
import { ThemeIcons, type TableBorderGlyphSet } from '../theme/ThemeIcons';
import type {
  BlockRecord,
  TableCellRecord,
  TableColumnAlignment,
} from './MarkdownParser';
import { MarkdownPreview, type PreviewRow } from './MarkdownPreview';

const waitForTaskTurn = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

const createSource = (text: string) => {
  const revision = ref(1);
  const state = { text };
  return { revision, state, text: () => state.text };
};

test('empty blocks remain an overridable late-bound seam', () => {
  const replacementEmptyBlocks: readonly BlockRecord[] = Object.freeze([]);
  class $CustomMarkdownPreview extends MarkdownPreview.$Class {
    protected static override get $emptyBlocks(): readonly BlockRecord[] {
      return replacementEmptyBlocks;
    }
  }
  const CustomMarkdownPreview = Reactive($CustomMarkdownPreview);

  const preview = new CustomMarkdownPreview();
  expect(preview.blocks).toBe(replacementEmptyBlocks);
});

// invariant: Parsing starts only after opening (src/modules/markdown/markdown.invariants.md)
test('has no document or rows before open', () => {
  const preview = new MarkdownPreview.Class();
  expect(preview.active.value).toBe(false);
  expect(preview.document.value).toBe(null);
  expect(preview.blocks).toHaveLength(0);
  expect(
    preview.visibleRows(80, 10, ThemeIcons.Class.tableBordersFor('unicode')),
  ).toHaveLength(0);
});

// invariant: Preview rendering follows visible rows (src/modules/markdown/markdown.invariants.md)
test('renders only the visible window of rows', async () => {
  const body = Array.from(
    { length: 300 },
    (_, index) => `Paragraph number ${index}.`,
  ).join('\n\n');
  const preview = new MarkdownPreview.Class();
  preview.open(createSource(body), null, { debounceMs: 0 });
  await waitForTaskTurn();
  await waitForTaskTurn();

  const height = 5;
  const rows = preview.visibleRows(
    80,
    height,
    ThemeIcons.Class.tableBordersFor('unicode'),
  );
  expect(rows.length).toBe(height); // never the full document
  expect(preview.totalRows(80)).toBeGreaterThan(height);

  const texts = rows
    .filter((row) => row.block)
    .map((row) => row.block!.text.slice(row.textStart, row.textEnd));
  expect(texts[0]).toBe('Paragraph number 0.');

  // scrolling shifts the window without materializing more rows than the viewport
  preview.scrollTo(10, 80, height);
  const scrolled = preview.visibleRows(
    80,
    height,
    ThemeIcons.Class.tableBordersFor('unicode'),
  );
  expect(scrolled.length).toBe(height);
  expect(
    scrolled.some((row) => row.block?.text.includes('Paragraph number 0.')),
  ).toBe(false);
});

// invariant: Markdown panes keep independent find state (src/modules/markdown/markdown.invariants.md)
test('exposes the complete rendered row domain for preview find and selection mapping', async () => {
  const preview = new MarkdownPreview.Class();
  preview.open(
    createSource('# Rendered heading\n\nFirst paragraph.\n\nSecond paragraph.'),
    null,
    { debounceMs: 0 },
  );
  await waitForTaskTurn();
  await waitForTaskTurn();

  const allRows = preview.allRows(
    80,
    ThemeIcons.Class.tableBordersFor('unicode'),
  );
  expect(allRows.length).toBe(preview.totalRows(80));
  expect(allRows.map((row) => preview.textForRow(row)).join('\n')).toContain(
    'Rendered heading',
  );
  expect(
    allRows.map((row) => preview.textForRow(row)).join('\n'),
  ).not.toContain('# Rendered heading');
});

// invariant: Closing releases all preview work (src/modules/markdown/markdown.invariants.md)
test('close releases the document and leaves no active render effect', async () => {
  const source = createSource('# Live\n\nbody');
  const preview = new MarkdownPreview.Class();
  let renders = 0;
  const target = {
    requestRender: () => {
      renders++;
    },
  };
  preview.open(source, target, { debounceMs: 0 });
  await waitForTaskTurn();
  await waitForTaskTurn();
  expect(preview.active.value).toBe(true);
  const rendersWhileOpen = renders;

  // while open, a source revision change drives the coarse render effect
  source.state.text = '# Live\n\nedited';
  source.revision.value = 2;
  await waitForTaskTurn();
  await waitForTaskTurn();
  expect(renders).toBeGreaterThan(rendersWhileOpen);

  preview.close();
  expect(preview.active.value).toBe(false);
  expect(preview.document.value).toBe(null);
  expect(
    preview.visibleRows(80, 10, ThemeIcons.Class.tableBordersFor('unicode')),
  ).toHaveLength(0);

  // after close, further source edits trigger no render (the effect was stopped)
  const rendersAfterClose = renders;
  source.state.text = '# Live\n\nafter close';
  source.revision.value = 3;
  await waitForTaskTurn();
  await waitForTaskTurn();
  expect(renders).toBe(rendersAfterClose);
});

// invariant: Markdown presentation resolves through one stylesheet (src/modules/markdown/markdown.invariants.md)
test('body rows carry the stylesheet pane padding and headings pull extra air', async () => {
  const preview = new MarkdownPreview.Class();
  preview.open(
    createSource('First paragraph.\n\n## Section\n\nSecond paragraph.'),
    null,
    { debounceMs: 0 },
  );
  await waitForTaskTurn();
  await waitForTaskTurn();

  const rows = preview.allRows(60, ThemeIcons.Class.tableBordersFor('unicode'));
  const texts = rows.map((row) => preview.textForRow(row));
  expect(texts[0]).toBe(''); // pane top padding
  expect(texts[1]).toBe('  First paragraph.'); // left padding
  // two blank rows between a paragraph and an h2 (collapsed margin of 2)
  expect(texts.slice(2, 4)).toEqual(['', '']);
  expect(texts[4]).toBe('  Section');
});

test('the quote bar runs down every wrapped blockquote row', async () => {
  const preview = new MarkdownPreview.Class();
  preview.open(
    createSource(
      '> A quoted passage long enough to wrap onto several rows inside a narrow pane.',
    ),
    null,
    { debounceMs: 0 },
  );
  await waitForTaskTurn();
  await waitForTaskTurn();

  const quoteRows = preview
    .allRows(30, ThemeIcons.Class.tableBordersFor('unicode'))
    .filter((row) => row.role === 'quote');
  expect(quoteRows.length).toBeGreaterThan(1);
  for (const row of quoteRows) {
    expect(preview.textForRow(row).startsWith('  │ ')).toBe(true);
  }
});

test('list items sit single-spaced while the list still separates from paragraphs', async () => {
  const preview = new MarkdownPreview.Class();
  preview.open(
    createSource('Intro.\n\n- alpha\n- beta\n- gamma\n\nOutro.'),
    null,
    { debounceMs: 0 },
  );
  await waitForTaskTurn();
  await waitForTaskTurn();

  const texts = preview
    .allRows(60, ThemeIcons.Class.tableBordersFor('unicode'))
    .map((row) => preview.textForRow(row));
  const alphaIndex = texts.indexOf('  • alpha');
  expect(alphaIndex).toBeGreaterThan(0);
  expect(texts[alphaIndex + 1]).toBe('  • beta');
  expect(texts[alphaIndex + 2]).toBe('  • gamma');
  expect(texts[alphaIndex - 1]).toBe(''); // one blank between intro and the list
  expect(texts[alphaIndex + 3]).toBe(''); // one blank between the list and outro
});

test('code fence borders stay aligned on every row including continuations', async () => {
  const preview = new MarkdownPreview.Class();
  preview.open(
    createSource(
      '```ts\nconst shortLine = 1;\nconst aMuchLongerLineThatMustWrapAcrossRows = computeSomething(argument);\n```',
    ),
    null,
    { debounceMs: 0 },
  );
  await waitForTaskTurn();
  await waitForTaskTurn();

  const rows = preview.allRows(40, ThemeIcons.Class.tableBordersFor('unicode'));
  const codeRows = rows.filter((row) => row.role === 'codeContent');
  expect(codeRows.length).toBeGreaterThan(2);
  for (const row of codeRows) {
    const text = preview.textForRow(row);
    // left frame edge on every row, right frame edge on one shared column
    expect(text.startsWith('  │ ')).toBe(true);
    expect(text.endsWith(' │')).toBe(true);
    expect(TextCoordinates.Class.lineWidth(text)).toBe(38);
  }
});

test('prose wraps by display cells so CJK rows never overflow the pane', async () => {
  const preview = new MarkdownPreview.Class();
  preview.open(createSource('漢'.repeat(40)), null, { debounceMs: 0 });
  await waitForTaskTurn();
  await waitForTaskTurn();

  const width = 30;
  const rows = preview
    .allRows(width, ThemeIcons.Class.tableBordersFor('unicode'))
    .filter((row) => row.role === 'content');
  expect(rows.length).toBeGreaterThan(1);
  for (const row of rows) {
    expect(
      TextCoordinates.Class.lineWidth(preview.textForRow(row)),
    ).toBeLessThanOrEqual(width);
  }
});

test('table columns align in display cells with left center and right content', async () => {
  const preview = new MarkdownPreview.Class();
  preview.open(
    createSource(
      [
        '| Left | Center | Right |',
        '| :--- | :---: | ---: |',
        '| alpha | middle | 7 |',
        '| 漢字 | 🙂 é | 42 |',
      ].join('\n'),
    ),
    null,
    { debounceMs: 0 },
  );
  await waitForTaskTurn();
  await waitForTaskTurn();

  const rows = preview.visibleRows(
    38,
    10,
    ThemeIcons.Class.tableBordersFor('unicode'),
  );
  const tableRows = rows.filter((row) => row.role.startsWith('table'));
  const boundaryColumns = tableRows.map((row) =>
    TextCoordinates.Class.graphemes(preview.textForRow(row))
      .map((grapheme, graphemeIndex) => ({
        grapheme,
        column: TextCoordinates.Class.displayColumn(
          preview.textForRow(row),
          graphemeIndex,
        ),
      }))
      .filter(({ grapheme }) => grapheme === '│')
      .map(({ column }) => column),
  );

  // The stylesheet insets tables by the pane padding (left 2, right 2 at width 38 → inner 34).
  expect(boundaryColumns).toEqual([
    [2, 13, 24, 35],
    [],
    [2, 13, 24, 35],
    [2, 13, 24, 35],
  ]);
  expect(
    tableRows.map((row) =>
      TextCoordinates.Class.lineWidth(preview.textForRow(row)),
    ),
  ).toEqual([36, 36, 36, 36]);

  const bodyText = preview.textForRow(tableRows[2]!);
  expect(bodyText.indexOf('alpha')).toBe(4);
  expect(bodyText.indexOf('middle')).toBe(16);
  expect(bodyText.indexOf('7')).toBe(33);
});

test('table projection measures only visible rows at small and large scale', async () => {
  let materializedTableRowCount = 0;
  class $MeasuredMarkdownPreview extends MarkdownPreview.$Class {
    protected override tableContentRow(
      block: BlockRecord,
      blockIndex: number,
      cells: readonly TableCellRecord[],
      tableRowIndex: number,
      alignments: readonly TableColumnAlignment[],
      contentWidths: readonly number[],
      tableBorders: TableBorderGlyphSet,
    ): PreviewRow {
      materializedTableRowCount++;
      return super.tableContentRow(
        block,
        blockIndex,
        cells,
        tableRowIndex,
        alignments,
        contentWidths,
        tableBorders,
      );
    }
  }
  const MeasuredMarkdownPreview = Reactive($MeasuredMarkdownPreview);
  const materializedCounts: number[] = [];

  for (const bodyRowCount of [10, 1000]) {
    const tableRows = [
      '| Name | Value |',
      '| --- | ---: |',
      ...Array.from(
        { length: bodyRowCount },
        (_unused, rowIndex) => `| row ${rowIndex} | ${rowIndex} |`,
      ),
    ];
    const preview = new MeasuredMarkdownPreview();
    preview.open(createSource(tableRows.join('\n')), null, {
      debounceMs: 0,
    });
    await waitForTaskTurn();
    await waitForTaskTurn();

    materializedTableRowCount = 0;
    // top pane padding (1) + header + separator + body rows + trailing margin (1)
    expect(preview.totalRows(32)).toBe(bodyRowCount + 4);
    expect(materializedTableRowCount).toBe(0);
    preview.scrollTo(Math.max(0, bodyRowCount - 3), 32, 6);
    preview.visibleRows(32, 6, ThemeIcons.Class.tableBordersFor('unicode'));
    materializedCounts.push(materializedTableRowCount);
    preview.close();
  }

  expect(materializedCounts).toEqual([6, 6]);
});
