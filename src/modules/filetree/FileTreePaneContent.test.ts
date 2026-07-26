import { describe, expect, test } from 'bun:test';
import { ref } from 'vue';
import { FileTree } from './FileTree';
import { FileTreePaneContent } from './FileTreePaneContent';

describe('FileTreePaneContent', () => {
  test('publishes pane identity and preserves pointer activation', () => {
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
    const workspaceFocus = ref<'editor' | 'primaryPane'>('editor');
    const pane = new FileTreePaneContent.Class(
      {
        workspaceSet: {
          activeWorkspaceIndex: ref(0),
          active: {
            focus: workspaceFocus,
            focusPrimaryPane: () => {
              workspaceFocus.value = 'primaryPane';
            },
          },
        },
        primaryDockHost: { focused: ref(true) },
        settings: { scrollbarThickness: ref(1) },
        theme: {
          glyph: () => 'F',
          icon: () => 'f',
        },
        requestRender: () => {},
      } as never,
      () =>
        ({
          tree,
          haltVerticalScroll: () => {},
          activateSelected: () => {
            activationCount += 1;
            return {};
          },
        }) as never,
    );

    expect(pane.id).toBe('files');
    expect(pane.keybindingContext).toBe('files');
    expect(pane.onPointerDown(0, 1)).toBe(true);
    expect(tree.selectedIndex.value).toBe(1);
    expect(workspaceFocus.value).toBe('primaryPane');
    expect(activationCount).toBe(1);
  });

  test('owns viewport geometry through the generic pane resize seam', () => {
    const tree = new FileTree.Class();
    const pane = new FileTreePaneContent.Class(
      {
        workspaceSet: {
          activeWorkspaceIndex: ref(0),
          active: {
            focus: ref('primaryPane'),
            focusPrimaryPane: () => {},
          },
        },
        primaryDockHost: { focused: ref(true) },
        settings: { scrollbarThickness: ref(2) },
        theme: {
          glyph: () => 'F',
          icon: () => 'f',
        },
        requestRender: () => {},
      } as never,
      () => ({ tree }) as never,
    );

    pane.onResize(20, 8);

    expect(tree.viewportWidth.value).toBe(18);
    expect(tree.viewportHeight.value).toBe(8);
    expect(pane.scrollViewportColumns).toBe(18);
    expect(pane.scrollViewportRows).toBe(8);
  });
});
