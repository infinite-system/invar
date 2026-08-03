// invariant: The source text editor is a pane content citizen (src/modules/ui/ui.invariants.md)
// invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md)
import { afterEach, expect, test } from 'bun:test';
import { BoxRenderable, StyledText, fg } from '@opentui/core';
import { createTestRenderer, type TestRenderer } from '@opentui/core/testing';
import { ref } from 'vue';
import { PaneProjection } from '../ui/PaneProjection';
import { SourceTextPaneContent } from './SourceTextPaneContent';
import type { PaneRenderContext } from '../ui/PaneContent.interface';

let renderer: TestRenderer | null = null;

afterEach(() => {
  renderer?.destroy();
  renderer = null;
});

const palette = {
  fg: '#ffffff',
  selection: '#334455',
  panel: '#111111',
  error: '#ff0000',
} as PaneRenderContext['palette'];

const region = {
  width: 40,
  height: 10,
  palette,
  glyphLevel: 'nerd',
  colorDepth: 'truecolor',
  focused: true,
} as PaneRenderContext;

function cells(text: string): StyledText {
  return new StyledText([fg('#ffffff')(text)]);
}

/** What a renderable is actually showing: a set `content` reads back as StyledText either way. */
function paintedText(content: unknown): string {
  const chunks = (content as { chunks?: { text: string }[] }).chunks;
  return chunks ? chunks.map((chunk) => chunk.text).join('') : String(content);
}

/** The paint calls in the order they happened — the ordering rule is the point of the seam. */
const paintTrace: string[] = [];

class StubController {
  visualRow = 2;
  visualColumn = 5;
  renderResult: { gutter: StyledText; code: StyledText } | null = {
    gutter: cells('1'),
    code: cells('source'),
  };
  renderEditor() {
    paintTrace.push('render');
    return this.renderResult;
  }
  applySelection() {
    paintTrace.push('applySelection');
  }
  visualPosition() {
    return { rowIndex: this.visualRow, column: this.visualColumn };
  }
  tickDrag() {
    return true;
  }
}

/** Only what the seam reads: a document, a cursor, a viewport, folds, and a contributed title. */
function createWorkspaceSet(overrides: {
  hasDocument?: boolean;
  activeFileIsImage?: boolean;
  title?: { text: string; color: string } | null;
  hasSelection?: boolean;
}) {
  const focusEditorCalls = { count: 0 };
  const copiedCharacterCount = 12;
  const workspaceSet = {
    active: {
      activeFileIsImage: overrides.activeFileIsImage ?? false,
      focusEditor: () => {
        focusEditorCalls.count += 1;
      },
      editorContributions: { title: () => overrides.title ?? null },
      editor: {
        document: { lineCount: 120, path: '/w/file.ts', revision: ref(3) },
        hasDocument: ref(overrides.hasDocument ?? true),
        hasSelection: overrides.hasSelection ?? false,
        cursor: { line: ref(9), col: ref(4) },
        viewport: { scrollTop: ref(0), scrollLeft: ref(0) },
        foldRevision: ref(1),
        copySelection: async () => copiedCharacterCount,
      },
    },
    get activeEditor() {
      return this.active.editor;
    },
  };
  return { workspaceSet, focusEditorCalls, copiedCharacterCount };
}

class TestSourceTextPaneContent extends SourceTextPaneContent.$Class {
  // Declared without an initializer on purpose: a subclass field initializer runs AFTER the base
  // constructor, so `= null` here would erase what the override already assigned.
  declare stubController: StubController;
  protected override createController() {
    this.stubController = new StubController();
    return this.stubController as never;
  }
  get gutter() {
    return this.gutterBody;
  }
  get code() {
    return this.codeBody;
  }
}

async function createPane(
  overrides: Parameters<typeof createWorkspaceSet>[0] & {
    rasterCells?: string | null;
  } = {},
) {
  const setup = await createTestRenderer({ width: 100, height: 30 });
  renderer = setup.renderer;
  const slot = new BoxRenderable(setup.renderer, {
    id: 'editor-area',
    width: 60,
    height: 20,
    flexDirection: 'row',
  });
  setup.renderer.root.add(slot);
  const world = createWorkspaceSet(overrides);
  const rasterRegions: unknown[] = [];
  const released = { count: 0 };
  const pane = new TestSourceTextPaneContent({
    renderer: setup.renderer,
    slot,
    workspaceSet: world.workspaceSet as never,
    findBar: {} as never,
    settings: {} as never,
    theme: {} as never,
    frameAttribution: {} as never,
    tooltip: {} as never,
    readPalette: () => palette,
    viewportRows: () => 20,
    viewportColumns: () => 60,
    focusSourceEditor: () => {},
    hover: { pointAt: () => {}, clear: () => {}, pointerOffSymbol: () => {} },
    rasterProjection: (rasterRegion) => {
      rasterRegions.push(rasterRegion);
      return overrides.rasterCells ?? null;
    },
    releaseSourceTextViews: () => {
      released.count += 1;
    },
  });
  paintTrace.length = 0;
  return { pane, slot, rasterRegions, released, ...world };
}

test('the source text pane publishes the native surface, so the host paints no cells for it', async () => {
  const { pane } = await createPane();

  expect(PaneProjection.Class.paint(pane, region)).toBeNull();
  expect(PaneProjection.Class.requireNativeSurface(pane)).toBe(pane);
  // It has no `render`: exactly one projection surface, and this one is native.
  expect((pane as { render?: unknown }).render).toBeUndefined();
});

test('paint sets the content and THEN applies the selection, in one pass', async () => {
  const { pane } = await createPane();

  pane.paint(region);

  expect(paintTrace).toEqual(['render', 'applySelection']);
  expect(paintedText(pane.gutter.content)).toBe('1');
  expect(paintedText(pane.code.content)).toBe('source');
});

test('a document-less pane paints the empty state and still applies the selection', async () => {
  const { pane } = await createPane();
  pane.stubController.renderResult = null;

  pane.paint(region);

  expect(paintTrace).toEqual(['render', 'applySelection']);
  expect(paintedText(pane.gutter.content)).toBe('');
  expect(paintedText(pane.code.content)).toContain('Invar');
});

test('a raster document projects through the same surface with no gutter and no render', async () => {
  const { pane, rasterRegions } = await createPane({
    activeFileIsImage: true,
    rasterCells: 'half-blocks',
  });

  pane.paint(region);

  // The source render never ran: the raster projection answered for these cells.
  expect(paintTrace).toEqual(['applySelection']);
  expect(paintedText(pane.gutter.content)).toBe('');
  expect(paintedText(pane.code.content)).toBe('half-blocks');
  expect(rasterRegions).toHaveLength(1);
  expect(rasterRegions[0]).toMatchObject({ columns: 40, rows: 10 });
});

test('the caret anchor is screen-relative, and absent without a document or over a raster', async () => {
  const { pane } = await createPane();
  pane.paint(region);

  const anchor = pane.caretAnchor();
  expect(anchor).toEqual({
    column: Number(pane.code.x) + 5,
    row: Number(pane.code.y) + 2,
  });

  const documentLess = await createPane({ hasDocument: false });
  expect(documentLess.pane.caretAnchor()).toBeNull();

  const raster = await createPane({ activeFileIsImage: true });
  expect(raster.pane.caretAnchor()).toBeNull();
});

test('the pane publishes the shared copy surface a terminal publishes', async () => {
  const { pane, copiedCharacterCount } = await createPane({
    hasSelection: true,
  });

  const selectionPort = pane.capability<{
    hasSelection(): boolean;
    copySelection(): Promise<number>;
  }>('text-selection');

  expect(selectionPort?.hasSelection()).toBe(true);
  expect(await selectionPort?.copySelection()).toBe(copiedCharacterCount);
  expect(pane.capability('nothing-like-this')).toBeNull();
});

test('the title and its colour come from the contribution, not from the host', async () => {
  const plain = await createPane();
  expect(plain.pane.title).toBe('');
  expect(plain.pane.titleColor).toBeUndefined();

  const contributed = await createPane({
    title: { text: 'file.ts ●', color: '#ffcc00' },
  });
  expect(contributed.pane.title).toBe('file.ts ●');
  expect(contributed.pane.titleColor).toBe('#ffcc00');
});

test('dispose releases the views it showed and unmounts the surfaces it mounted', async () => {
  const { pane, slot, released } = await createPane();
  expect(slot.getChildren()).toHaveLength(2);

  pane.dispose();

  expect(released.count).toBe(1);
  expect(slot.getChildren()).toHaveLength(0);
});

test('the drag auto-scroll tick reaches the controller through the seam method', async () => {
  const { pane } = await createPane();

  expect(pane.tickScroll(0.016)).toBe(true);
});
