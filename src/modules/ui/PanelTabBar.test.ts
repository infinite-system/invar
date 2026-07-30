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
    palette: ThemePalettes.Class.DARK,
  });
}

test('one projection places editor actions on the splitter row and containers on the tab row', () => {
  const projection = project(2);
  expect(projection.editorActions.map((action) => action.commandId)).toEqual([
    'view.toggleWordWrap',
    'editor.goToLine',
    'go.bottom',
  ]);
  expect(projection.tabs.map((tab) => tab.identifier)).toEqual([
    'terminal-space',
    'database-space',
  ]);
  expect(projection.splitterLeadingWidth).toBe(9);
  expect(projection.tabs[0]?.startColumn).toBe(0);
  expect(projection.spaceAdd?.endColumn).toBe(80);
  expect(
    PanelTabBar.Class.spaceAddAtColumn(
      projection,
      projection.spaceAdd?.startColumn ?? -1,
    ),
  ).toBeDefined();
});

test('each container tab paints one blank cell before its close glyph and shares that hit geometry', () => {
  const projection = project(2);
  const text = projection.tabText.chunks.map((chunk) => chunk.text).join('');
  expect(text).toContain('Terminal ×');
  expect(text).toContain('Database ×');
  const close = projection.tabCloses[0]!;
  expect(text[close.startColumn - 1]).toBe(' ');
  expect(text[close.startColumn]).toBe('×');
  expect(
    PanelTabBar.Class.tabCloseAtColumn(projection, close.startColumn)
      ?.identifier,
  ).toBe('terminal-space');
});

test('narrow container labels use ellipses without changing painted hit bounds', () => {
  const projection = project(1, 14);
  const text = projection.tabText.chunks.map((chunk) => chunk.text).join('');
  expect(text).toBe(' T… × Da… ×');
  expect(projection.tabs.at(-1)?.endColumn).toBe(text.length);
  expect(projection.spaceAdd?.startColumn).toBe(text.length);
});

test('the list and pane add controls appear for a multi-window terminal container', () => {
  const projection = project(2);
  expect(projection.controls.map((control) => control.action)).toEqual([
    'pane-list',
    'pane-add',
    'expand',
    'close',
  ]);
});

test('the drag span keeps its paint pad and exact total width on both rows', () => {
  const projection = project(2, 26);
  expect(projection.dragWidth).toBeGreaterThan(1);
  expect(projection.dragLeadingPaintPadCells).toBe(1);
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
