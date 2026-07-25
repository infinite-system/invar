import { describe, expect, test } from 'bun:test';
import { FileTree } from '../workspace/FileTree';
import { FileTreePaneContent } from './FileTreePaneContent';

describe('FileTreePaneContent', () => {
  test('publishes the generic pane identity and preserves pointer activation', () => {
    const tree = new FileTree.Class();
    (
      tree as unknown as {
        rowsRef: { value: typeof tree.rows };
      }
    ).rowsRef.value = [
      {
        name: 'folder',
        path: '/workspace/folder',
        isDir: true,
        depth: 0,
        expanded: false,
      },
      {
        name: 'file.ts',
        path: '/workspace/file.ts',
        isDir: false,
        depth: 0,
        expanded: false,
      },
    ];
    let activationCount = 0;
    const pane = new FileTreePaneContent.Class({
      workspaceSet: {
        active: {
          tree,
          focus: { value: 'files' },
          focusFiles: () => {},
          haltTreeScroll: () => {},
          activate: () => {
            activationCount += 1;
            return {};
          },
          impulseTreeScroll: () => {},
          impulseTreeHorizontalScroll: () => {},
        },
      } as never,
      icon: () => 'f',
      scrollbarThicknessCells: () => 1,
    });

    expect(pane.id).toBe('files');
    expect(pane.title).toBe('Files');
    expect(pane.onPointerDown(0, 1)).toBe(true);
    expect(tree.selectedIndex.value).toBe(1);
    expect(activationCount).toBe(1);
  });

  test('owns the file-tree viewport geometry through the pane resize seam', () => {
    const tree = new FileTree.Class();
    const pane = new FileTreePaneContent.Class({
      workspaceSet: {
        active: {
          tree,
        },
      } as never,
      icon: () => 'f',
      scrollbarThicknessCells: () => 2,
    });

    pane.onResize(20, 8);

    expect(tree.viewportWidth.value).toBe(18);
    expect(tree.viewportHeight.value).toBe(8);
  });
});
