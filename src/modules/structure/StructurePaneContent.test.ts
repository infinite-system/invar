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
) {
  const workspaceFocus = ref<'editor' | 'primaryPane'>('editor');
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
      primaryDockHost: { focused: ref(true) },
      settings: { scrollbarThickness: ref(1) },
      theme: { glyphLevel: ref('unicode') },
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
  );
  return { pane, workspaceFocus };
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
    expect(pane.onPointerDown(0, 1)).toBe(true);
    expect(outline.selectedIndex.value).toBe(1);
    expect(workspaceFocus.value).toBe('primaryPane');
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
    expect(outline.viewportHeight.value).toBe(12);
    expect(outline.viewportWidth.value).toBe(29);
    expect(pane.scrollViewportRows).toBe(12);
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
    expect(rendered).toContain(`${marks.type} Widget :1`);
    expect(rendered).toContain(`  ${marks.callable} render :2`);
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
    outline.dispose();
  });
});
