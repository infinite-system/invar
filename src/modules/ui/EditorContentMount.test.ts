import { expect, test } from 'bun:test';
import { EditorContentMount } from './EditorContentMount';

test('editor content mounting remains constructible through its class seam', () => {
  expect(EditorContentMount.Class).toBeDefined();
});

test('the default editor supplies its document path to the editor-area shell', () => {
  const mount = new EditorContentMount.$Class({
    workspaceSet: {
      active: {
        editor: {
          hasDocument: { value: true },
          document: { path: '/project/source.ts' },
        },
      },
    },
  } as ConstructorParameters<typeof EditorContentMount.$Class>[0]);

  expect(mount.displayedPath).toBe('/project/source.ts');
});
