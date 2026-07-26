import { expect, test } from 'bun:test';
import { FileTreeWorkspace } from './FileTreeWorkspace';

test('turns a selected file into the host document-opening capability', () => {
  let openedPath = '';
  let editorFocusCount = 0;
  const workspace = new FileTreeWorkspace.Class({
    openFileInTab: (path: string) => {
      openedPath = path;
    },
    focusEditor: () => {
      editorFocusCount += 1;
    },
  } as never);
  (
    workspace.tree as unknown as {
      rowsRef: { value: typeof workspace.tree.rows };
    }
  ).rowsRef.value = [
    {
      name: 'file.ts',
      path: '/workspace/file.ts',
      isDir: false,
      depth: 0,
      expanded: false,
    },
  ];

  expect(workspace.activateSelected()).toEqual({
    opened: '/workspace/file.ts',
  });
  expect(openedPath).toBe('/workspace/file.ts');
  expect(editorFocusCount).toBe(1);
});
