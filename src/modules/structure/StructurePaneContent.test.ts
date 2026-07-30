import { describe, expect, test } from 'bun:test';
import { ref } from 'vue';
import { ProviderRegistry } from '../plugins/ProviderRegistry';
import { DocumentLifecycle } from '../workspace/DocumentLifecycle';
import type { Workspace } from '../workspace/Workspace';
import { StructureOutline } from './StructureOutline';
import { StructurePaneContent } from './StructurePaneContent';
import type { StructureWorkspace } from './StructureWorkspace';
import { ThemeIcons, type SymbolMarkSet } from '../theme/ThemeIcons';
import { ThemePalettes } from '../theme/ThemePalettes';
import { ContextMenu } from '../ui/ContextMenu';

function renderedText(styled: { chunks: unknown }): string {
  return (styled.chunks as { text: string }[])
    .map((chunk) => chunk.text)
    .join('');
}

function makeOutline(): StructureOutline.Model {
  const workspace = {
    documentLifecycle: new DocumentLifecycle.Class(),
    providers: new ProviderRegistry.Class(),
    activeDocumentHandle: null,
  } as unknown as Workspace.Model;
  return new StructureOutline.Class(workspace, () => true);
}

function seedRows(outline: StructureOutline.Model): void {
  outline.rows.value = [
    {
      depth: 0,
      name: 'Widget',
      symbolClass: 'type',
      line: 0,
      column: 6,
      endLine: 4,
    },
    {
      depth: 1,
      name: 'render',
      symbolClass: 'callable',
      line: 1,
      column: 2,
      endLine: 2,
    },
  ];
  outline.status.value = 'ready';
}

function makePane(
  outline: StructureOutline.Model,
  activations: { count: number },
  depthState: { value: number; writes: number[] } = {
    value: 1,
    writes: [],
  },
) {
  const workspaceFocus = ref<'editor' | 'primaryPane'>('editor');
  const contextMenu = new ContextMenu.Class();
  const pane = new StructurePaneContent.Class(
    {
      workspaceSet: {
        activeWorkspaceIndex: ref(0),
        active: {
          focus: workspaceFocus,
          focusPrimaryPane: () => {
            workspaceFocus.value = 'primaryPane';
          },
        },
      },
      rightDockHost: { focused: ref(true), blur: () => {} },
      settings: { scrollbarThickness: ref(1) },
      theme: { glyphLevel: ref('unicode') },
      contextMenu,
      overlayCoordinator: {
        openExclusiveOverlay: (_name: string, openOverlay: () => void): void =>
          openOverlay(),
      },
      renderer: { width: 120, height: 40 },
      requestRender: () => {},
    } as never,
    () =>
      ({
        outline,
        haltVerticalScroll: () => {},
        activateSelected: () => {
          activations.count += 1;
          return true;
        },
      }) as unknown as StructureWorkspace.Model,
    () => depthState.value,
    (depth) => {
      depthState.value = depth;
      depthState.writes.push(depth);
    },
  );
  return { pane, workspaceFocus, contextMenu, depthState };
}

describe('StructurePaneContent', () => {
  test('publishes pane identity and activates a clicked symbol row', () => {
    const outline = makeOutline();
    seedRows(outline);
    const activations = { count: 0 };
    const { pane, workspaceFocus } = makePane(outline, activations);
    expect(pane.id).toBe('structure');
    expect(pane.title).toBe('Structure');
    expect(pane.keybindingContext).toBe('structure');
    expect(pane.activityAction).toBe('view.showStructure');
    expect(pane.onPointerDown(0, 0)).toBe(true);
    expect(activations.count).toBe(0);
    expect(pane.onPointerDown(0, 2)).toBe(true);
    expect(outline.selectedIndex.value).toBe(1);
    expect(
      (
        pane as unknown as {
          foldControlColumn(rowIndex: number): number;
        }
      ).foldControlColumn(1),
    ).toBe(2);
    // Focus stays host-owned in the right dock: the click activates without touching the
    // workspace's primary-pane focus model.
    expect(workspaceFocus.value).toBe('editor');
    expect(activations.count).toBe(1);
    // A click below the last row selects nothing and consumes nothing.
    expect(pane.onPointerDown(0, 9)).toBe(false);
    expect(activations.count).toBe(1);
    outline.dispose();
  });

  test('owns viewport geometry through the generic pane resize seam', () => {
    const outline = makeOutline();
    const { pane } = makePane(outline, { count: 0 });
    pane.onResize(30, 12);
    expect(outline.viewportHeight.value).toBe(11);
    expect(outline.viewportWidth.value).toBe(29);
    expect(pane.scrollViewportRows).toBe(11);
    expect(pane.scrollbarRowOffset).toBe(1);
    outline.dispose();
  });

  test('renders symbol rows through the one mark table, with the outline window', () => {
    const outline = makeOutline();
    seedRows(outline);
    const { pane } = makePane(outline, { count: 0 });
    const rendered = renderedText(
      pane.render({
        width: 30,
        height: 10,
        palette: ThemePalettes.Class.DARK,
        glyphLevel: 'unicode',
        colorDepth: 'truecolor',
        focused: true,
      }),
    );
    const marks: SymbolMarkSet = ThemeIcons.Class.symbolMarksFor('unicode');
    expect(rendered).toContain(ThemeIcons.Class.findIconsFor('unicode').search);
    expect(rendered).toContain(
      ThemeIcons.Class.glyphFor('unicode', 'structureDepth'),
    );
    expect(rendered).toContain(`${marks.type} Widget`);
    expect(rendered).not.toContain('Widget :1');
    expect(rendered).toContain(`  ${marks.callable} render`);
    expect(rendered).not.toContain('render :2');
    outline.dispose();
  });

  test('every empty state names itself — a blank structure pane is impossible', () => {
    const outline = makeOutline();
    const { pane } = makePane(outline, { count: 0 });
    const renderContext = {
      width: 30,
      height: 10,
      palette: ThemePalettes.Class.DARK,
      glyphLevel: 'unicode' as const,
      colorDepth: 'truecolor' as const,
      focused: true,
    };
    outline.status.value = 'no-document';
    expect(renderedText(pane.render(renderContext))).toContain(
      'No file is open',
    );
    outline.status.value = 'unavailable';
    outline.notice.value = 'No installed source answers for this file type.';
    const unavailable = renderedText(pane.render(renderContext));
    expect(unavailable).toContain('No structure available');
    expect(unavailable).toContain('file type');
    outline.status.value = 'ready';
    outline.notice.value = null;
    expect(renderedText(pane.render(renderContext))).toContain(
      'No symbols in this file',
    );
    outline.insertFilterText('missing');
    expect(renderedText(pane.render(renderContext))).toContain(
      'No matching symbols',
    );
    outline.dispose();
  });

  test('typing and the shared text-input port edit the live filter', () => {
    const outline = makeOutline();
    seedRows(outline);
    const { pane } = makePane(outline, { count: 0 });
    expect(
      pane.handleKey({
        name: 'w',
        sequence: 'w',
        ctrl: false,
        meta: false,
        option: false,
        shift: false,
      } as never),
    ).toBe(true);
    expect(outline.filterInput.value).toBe('w');
    pane.applyInputAction('backspace');
    expect(outline.filterInput.value).toBe('');
    expect(pane.handlePaste('Wid')).toBe(true);
    expect(outline.filterInput.value).toBe('Wid');
    expect(
      pane.handleKey({
        name: 'space',
        sequence: ' ',
        ctrl: false,
        meta: false,
        option: false,
        shift: false,
      } as never),
    ).toBe(true);
    expect(outline.filterInput.value).toBe('Wid ');
    outline.dispose();
  });

  test('the filter-row gear selects the same default depth exposed by the pane', () => {
    const outline = makeOutline();
    seedRows(outline);
    const depthState = { value: 1, writes: [] as number[] };
    const { pane, contextMenu } = makePane(outline, { count: 0 }, depthState);
    pane.render({
      width: 30,
      height: 10,
      palette: ThemePalettes.Class.DARK,
      glyphLevel: 'unicode',
      colorDepth: 'truecolor',
      focused: true,
    });

    expect(pane.tooltipAt(27, 0)).toContain('Default symbol depth: 1');
    expect(
      pane.onPointerDown(27, 0, {
        screenColumn: 80,
        screenRow: 4,
        button: 0,
        modifiers: { alt: false, shift: false, ctrl: false },
      }),
    ).toBe(true);
    expect(contextMenu.open.value).toBe(true);
    expect(contextMenu.items.value.map((item) => item.label)).toEqual([
      'Depth 0',
      'Depth 1',
      'Depth 2',
      'Depth 3',
      'Depth 4',
      'Depth 5',
      'Depth 6',
      'Depth 7',
      'Depth 8',
    ]);
    expect(contextMenu.items.value.map((item) => item.active ?? false)).toEqual(
      [false, true, false, false, false, false, false, false, false],
    );
    expect(contextMenu.selectedIndex.value).toBe(1);

    contextMenu.runAt(4);
    expect(contextMenu.open.value).toBe(false);
    expect(depthState).toEqual({ value: 4, writes: [4] });
    outline.dispose();
  });
});
