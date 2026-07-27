import { test, expect } from 'bun:test';
import { ref } from 'vue';
import { Reactive } from 'ivue';
import { EditorCoordinates } from '../editor/EditorCoordinates';
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
    EditorCoordinates.Class.graphemes(preview.textForRow(row))
      .map((grapheme, graphemeIndex) => ({
        grapheme,
        column: EditorCoordinates.Class.displayColumn(
          preview.textForRow(row),
          graphemeIndex,
        ),
      }))
      .filter(({ grapheme }) => grapheme === '│')
      .map(({ column }) => column),
  );

  expect(boundaryColumns).toEqual([
    [0, 13, 25, 37],
    [],
    [0, 13, 25, 37],
    [0, 13, 25, 37],
  ]);
  expect(
    tableRows.map((row) =>
      EditorCoordinates.Class.lineWidth(preview.textForRow(row)),
    ),
  ).toEqual([38, 38, 38, 38]);

  const bodyText = preview.textForRow(tableRows[2]!);
  expect(bodyText.indexOf('alpha')).toBe(2);
  expect(bodyText.indexOf('middle')).toBe(16);
  expect(bodyText.indexOf('7')).toBe(35);
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
    expect(preview.totalRows(32)).toBe(bodyRowCount + 3);
    expect(materializedTableRowCount).toBe(0);
    preview.scrollTo(Math.max(0, bodyRowCount - 3), 32, 6);
    preview.visibleRows(32, 6, ThemeIcons.Class.tableBordersFor('unicode'));
    materializedCounts.push(materializedTableRowCount);
    preview.close();
  }

  expect(materializedCounts).toEqual([5, 5]);
});
