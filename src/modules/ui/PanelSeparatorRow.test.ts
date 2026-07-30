import { expect, test } from 'bun:test';
import type { Palette } from '../theme/ThemePalettes';
import { ThemeIcons } from '../theme/ThemeIcons';
import {
  PanelSeparatorRow,
  type PanelSeparatorEditorAction,
} from './PanelSeparatorRow';

const palette = {
  accent: '#00ffff',
  fg: '#eeeeee',
  dim: '#777777',
  selection: '#333333',
  cursorLine: '#111111',
} as Palette;

const editorActions: readonly PanelSeparatorEditorAction[] = [
  {
    commandId: 'view.toggleWordWrap',
    title: 'View: Toggle Word Wrap',
    icon: 'w',
    toggled: false,
  },
  {
    commandId: 'editor.goToLine',
    title: 'Editor: Go to Line',
    icon: 'g',
    toggled: false,
  },
];

function project(width: number) {
  return PanelSeparatorRow.Class.project({
    width,
    editorActions,
    hoveredCommandId: null,
    hoveredPanelAction: null,
    panelFocused: false,
    panelExpanded: false,
    glyphVocabulary: ThemeIcons.Class.interfaceGlyphVocabularyFor('ascii'),
    palette,
  });
}

test('separator row keeps one drag cell and truncates whole editor actions first', () => {
  for (let width = 1; width <= 80; width += 1) {
    const projection = project(width);
    expect(projection.dragWidth).toBeGreaterThanOrEqual(1);
    expect(
      projection.actionWidth + projection.dragWidth + projection.controlWidth,
    ).toBe(width);
    expect(projection.actionWidth % 3).toBe(0);
    expect(projection.dragStartColumn).toBe(projection.actionWidth);
    expect(projection.controlStartColumn).toBe(
      projection.actionWidth + projection.dragWidth,
    );
  }

  expect(project(18).actionSegments.map((action) => action.commandId)).toEqual([
    'view.toggleWordWrap',
    'editor.goToLine',
  ]);
  expect(project(10).actionSegments).toEqual([]);
  expect(project(10).dragWidth).toBe(1);
  expect(project(10).controlWidth).toBe(9);
});

test('editor-action paint and hit testing use the same projected segments', () => {
  const projection = project(63);
  expect(projection.actionText.chunks.map((chunk) => chunk.text).join('')).toBe(
    '\u00a0w\u00a0\u00a0g\u00a0',
  );
  for (const action of projection.actionSegments) {
    expect(
      PanelSeparatorRow.Class.actionSegmentAtColumn(
        projection,
        action.startColumn,
      )?.commandId,
    ).toBe(action.commandId);
    expect(
      PanelSeparatorRow.Class.actionSegmentAtColumn(
        projection,
        action.endColumn - 1,
      )?.commandId,
    ).toBe(action.commandId);
  }
});
