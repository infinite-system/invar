import { expect, test } from 'bun:test';
import { ThemePalettes } from '../theme/ThemePalettes';
import type { WorkspaceSearchResult } from './WorkspaceSearchBackend';
import { WorkspaceSearchPaneRenderer } from './WorkspaceSearchPaneRenderer';
import { WorkspaceSearchWorkspace } from './WorkspaceSearchWorkspace';

function renderedText(styled: { chunks: unknown }): string {
  return (styled.chunks as { text: string }[])
    .map((chunk) => chunk.text)
    .join('');
}

test('the Search pane paints fields, toggles, groups, and previews', () => {
  const workspace = new WorkspaceSearchWorkspace.Class({
    workspaceRoot: () => '/workspace',
    openDocumentHandles: () => [],
  });
  const result: WorkspaceSearchResult = {
    relativePath: 'src/very/long/path/app.ts',
    absolutePath: '/workspace/src/very/long/path/app.ts',
    line: 13,
    startColumn: 2,
    endColumn: 5,
    startUtf16Offset: 20,
    endUtf16Offset: 23,
    matchedText: 'old',
    lineText: 'const oldValue = old;',
    replacementText: 'new',
  };
  workspace.resultTree.updateResults([result], false, true);

  const projection = WorkspaceSearchPaneRenderer.Class.render({
    workspace,
    palette: ThemePalettes.Class.DARK,
    width: 32,
    height: 20,
    focused: true,
    activeFocus: 'query',
    hoveredField: null,
    hoveredButton: null,
    pressedButton: null,
    foldOpenGlyph: 'v',
    foldClosedGlyph: '>',
    closeGlyph: 'x',
    ellipsisCell: '…',
    selectionRanges: [],
  });
  const text = renderedText(projection.text);

  expect(text).toContain('Search');
  expect(text).toContain('Replace');
  expect(text).toContain('Files to include');
  expect(text).toContain('Files to exclude');
  expect(text).toContain('Aa');
  expect(text).toContain('ab');
  expect(text).toContain('.*');
  expect(text).toContain('app.ts');
  expect(text).toContain('14 const oldValue');
  expect(text).toContain('→ new');
  expect(projection.fields).toHaveLength(4);
  expect(projection.fields.every((field) => field.endColumn === 32)).toBe(true);
  expect(projection.buttons.map((button) => button.action)).toEqual([
    'toggleCase',
    'toggleWholeWord',
    'toggleRegex',
    'toggleIgnoreFiles',
    'dismissMatch',
  ]);
  expect(
    projection.buttons
      .filter((button) => button.action !== 'dismissMatch')
      .every((button) => button.row === 4),
  ).toBe(true);
});
