import { afterEach, beforeEach, expect, test } from 'bun:test';
import {
  mkdtempSync as makeTemporaryDirectorySync,
  rmSync as removeSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir as temporaryDirectory } from 'node:os';
import { join } from 'node:path';
import { Workspace } from '../workspace/Workspace';
import { EditorSourceTextViewProviderFactory } from './EditorSourceTextViewProviderFactory';
import { EditorNavigationHistoryContribution } from './EditorNavigationHistoryContribution';

let workspaceDirectory = '';

beforeEach(() => {
  workspaceDirectory = makeTemporaryDirectorySync(
    join(temporaryDirectory(), 'invar-editor-history-'),
  );
});

afterEach(() => {
  removeSync(workspaceDirectory, { recursive: true, force: true });
});

test('the source editor restores its document and cursor through opaque history', () => {
  const alphaPath = join(workspaceDirectory, 'alpha.ts');
  const betaPath = join(workspaceDirectory, 'beta.ts');
  writeFileSync(alphaPath, 'zero\none\ntwo\n');
  writeFileSync(betaPath, 'beta\n');
  const workspace = new Workspace.Class({
    createSourceTextViews: () =>
      EditorSourceTextViewProviderFactory.Class.create(),
  });
  const contribution = new EditorNavigationHistoryContribution.Class(workspace);
  workspace.openFileInTab(alphaPath);
  workspace.editor.placeCursor(0, 3);
  workspace.recordCurrentViewState();
  expect(workspace.navigationHistory.size).toBe(1);
  workspace.editor.placeCursor(2, 2);
  workspace.openFileInTab(betaPath);

  expect(workspace.navigationHistory.back()).toBe(true);
  expect(workspace.editor.document.path).toBe(alphaPath);
  expect(workspace.editor.cursor.line.value).toBe(2);
  expect(workspace.editor.cursor.col.value).toBe(2);
  contribution.disposed();
});
