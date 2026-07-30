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
    ],
    hoveredCommandIdentifier: null,
    hoveredAction: null,
    glyphVocabulary: ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode'),
    palette: ThemePalettes.Class.DARK,
  });
}

test('the tab bar paints and hit-tests workspace content spaces from one projection', () => {
  const projection = project(2);
  expect(projection.tabs.map((tab) => tab.identifier)).toEqual([
    'terminal-space',
    'database-space',
  ]);
  expect(PanelTabBar.Class.tabAtColumn(projection, 1)?.identifier).toBe(
    'terminal-space',
  );
  expect(
    projection.controls.some((control) => control.action === 'pane-list'),
  ).toBe(false);
  expect(projection.editorActions.map((action) => action.commandId)).toEqual([
    'view.toggleWordWrap',
    'editor.goToLine',
  ]);
  expect(
    PanelTabBar.Class.editorActionAtColumn(
      projection,
      projection.editorActions[0]?.startColumn ?? -1,
    )?.commandId,
  ).toBe('view.toggleWordWrap');
  expect(projection.tabs.at(-1)?.endColumn).toBe(
    projection.editorActions[0]?.startColumn,
  );
  expect(projection.editorActions.at(-1)?.endColumn).toBe(
    projection.leadingWidth,
  );
  expect(projection.leadingWidth + projection.dragWidth).toBe(
    projection.controls[0]?.startColumn ?? -1,
  );
});

test('the pane count chip appears only above two panes', () => {
  const projection = project(3);
  const chip = projection.controls.find(
    (control) => control.action === 'pane-list',
  );
  expect(chip).toBeDefined();
  expect(
    PanelTabBar.Class.controlAtColumn(projection, chip?.startColumn ?? -1)
      ?.action,
  ).toBe('pane-list');
});

test('editor actions truncate before tabs and the drag cell', () => {
  const projection = project(2, 26);
  expect(projection.tabs.length).toBe(2);
  expect(projection.editorActions).toEqual([]);
  expect(projection.dragWidth).toBe(1);
});

test('the drag span reserves one blank paint pad, and never its only cell', () => {
  const wide = project(2);
  expect(wide.dragWidth).toBeGreaterThan(1);
  expect(wide.dragLeadingPaintPadCells).toBe(1);

  // The pad is PAINT, so it comes out of the span's glyphs and never out of its width. The
  // leading run and the controls still meet the span exactly where they did without a pad.
  expect(wide.leadingWidth + wide.dragWidth + wide.controlWidth).toBe(80);

  // At the narrowest row the span is one cell. A pad there would blank the whole mark, so it
  // collapses to zero instead.
  const narrow = project(2, 26);
  expect(narrow.dragWidth).toBe(1);
  expect(narrow.dragLeadingPaintPadCells).toBe(0);
});
