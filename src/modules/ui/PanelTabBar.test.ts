import { expect, test } from 'bun:test';
import { ThemeIcons } from '../theme/ThemeIcons';
import { ThemePalettes } from '../theme/ThemePalettes';
import { PanelTabBar } from './PanelTabBar';

function project(paneCount: number, width = 80) {
  return PanelTabBar.Class.project({
    width,
    spaces: [
      {
        identifier: 'terminal-space',
        label: 'Terminal',
        kind: 'terminal',
        contentIds: ['agent', 'terminal'],
        activeId: 'agent',
        layout: [],
        focusedIndex: 0,
      },
      {
        identifier: 'database-space',
        label: 'Database',
        kind: 'database',
        contentIds: ['database'],
        activeId: 'database',
        layout: [],
        focusedIndex: 0,
      },
    ],
    activeSpaceId: 'terminal-space',
    activeSpaceKind: 'terminal',
    paneCount,
    paneListExpanded: false,
    expanded: false,
    focused: true,
    hoveredTabIdentifier: null,
    editorActions: [
      {
        commandId: 'view.toggleWordWrap',
        title: 'View: Toggle Word Wrap',
        icon: '↵',
        toggled: false,
      },
      {
        commandId: 'editor.goToLine',
        title: 'Editor: Go to Line',
        icon: '↕',
        toggled: false,
      },
      {
        commandId: 'go.bottom',
        title: 'Go: Bottom of File',
        icon: '⇊',
        toggled: false,
      },
    ],
    hoveredCommandIdentifier: null,
    hoveredAction: null,
    glyphVocabulary: ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode'),
    glyphLevel: 'unicode',
    palette: ThemePalettes.Class.DARK,
  });
}

test('the editor frame owns actions while the panel rows own tabs and frame controls', () => {
  const projection = project(2);
  const editorFrame = PanelTabBar.Class.projectEditorFrameActions({
    width: 40,
    editorActions: [
      {
        commandId: 'view.toggleWordWrap',
        title: 'Wrap',
        icon: '↵',
        toggled: false,
      },
      {
        commandId: 'editor.goToLine',
        title: 'Line',
        icon: '↕',
        toggled: false,
      },
      {
        commandId: 'go.bottom',
        title: 'Bottom',
        icon: '⇊',
        toggled: false,
      },
    ],
    hoveredCommandIdentifier: null,
    palette: ThemePalettes.Class.DARK,
    frameBorderColor: ThemePalettes.Class.DARK.borderActive,
  });
  expect(editorFrame.editorActions.map((action) => action.commandId)).toEqual([
    'view.toggleWordWrap',
    'editor.goToLine',
    'go.bottom',
  ]);
  expect(projection.tabs.map((tab) => tab.identifier)).toEqual([
    'terminal-space',
    'database-space',
  ]);
  expect(projection.editorActions).toEqual([]);
  expect(projection.splitterLeadingWidth).toBe(0);
  expect(projection.tabs[0]?.startColumn).toBe(0);
  expect(projection.instancesToggle?.endColumn).toBe(78);
  expect(
    PanelTabBar.Class.spaceAddAtColumn(
      projection,
      projection.spaceAdd?.startColumn ?? -1,
    ),
  ).toBeDefined();
});

test('each container tab pads both sides of its close glyph and shares that hit geometry', () => {
  const projection = project(2);
  const text = projection.tabText.chunks.map((chunk) => chunk.text).join('');
  expect(text).toContain('Terminal ×');
  expect(text).toContain('Database ×');
  const close = projection.tabCloses[0]!;
  expect(text[close.startColumn - 1]).toBe(' ');
  expect(text[close.startColumn]).toBe('×');
  expect(text[close.endColumn]).toBe(' ');
  expect(
    PanelTabBar.Class.tabCloseAtColumn(projection, close.startColumn)
      ?.identifier,
  ).toBe('terminal-space');
});

test('narrow container labels use ellipses without changing painted hit bounds', () => {
  const projection = project(1, 30);
  const text = projection.tabText.chunks.map((chunk) => chunk.text).join('');
  expect(text).toBe(' Te… ×  Dat… × ');
  expect(projection.tabs.at(-1)?.endColumn).toBe(text.length);
  expect(projection.spaceAdd?.startColumn).toBe(text.length);
});

test('the splitter keeps only frame controls and the tab row always exposes instances', () => {
  const projection = project(2);
  expect(projection.controls.map((control) => control.action)).toEqual([
    'expand',
    'close',
  ]);
  expect(projection.spaceAdd?.tooltip).toBe('Add Plugin');
  expect(projection.instancesToggle?.tooltip).toBe('Show Instances');
  expect(projection.instancesToggle?.endColumn).toBe(78);
});

test('the drag span paints from the first cell inside its full hit width', () => {
  const projection = project(2, 26);
  expect(projection.dragWidth).toBeGreaterThan(1);
  expect(projection.dragLeadingPaintPadCells).toBe(0);
  expect(
    projection.splitterLeadingWidth +
      projection.dragWidth +
      projection.splitterControlWidth,
  ).toBe(26);
  expect(
    (projection.tabs.at(-1)?.endColumn ?? 0) +
      (26 - (projection.tabs.at(-1)?.endColumn ?? 0)),
  ).toBe(26);
});

test('the instances toggle owns its right pad and uses bounded superscript counts', () => {
  const projection = project(12);
  const text = projection.tabControlText.chunks
    .map((chunk) => chunk.text)
    .join('');

  expect(text).toContain('≡ ¹² ');
  expect(projection.instancesToggle?.endColumn).toBe(78);
  expect(
    PanelTabBar.Class.instancesToggleAtColumn(projection, 77),
  ).toBeDefined();
  expect(PanelTabBar.Class.instancesToggleAtColumn(projection, 78)).toBeNull();

  const capped = project(1000)
    .tabControlText.chunks.map((chunk) => chunk.text)
    .join('');
  expect(capped).toContain('≡ ⁹⁹⁹ ');
});
