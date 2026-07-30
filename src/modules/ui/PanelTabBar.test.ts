import { expect, test } from 'bun:test';
import { ThemeIcons } from '../theme/ThemeIcons';
import { ThemePalettes } from '../theme/ThemePalettes';
import { PanelTabBar } from './PanelTabBar';

function project(paneCount: number) {
  return PanelTabBar.Class.project({
    width: 80,
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
