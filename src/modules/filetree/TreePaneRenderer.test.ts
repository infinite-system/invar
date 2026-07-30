import { expect, test } from 'bun:test';
import { ThemePalettes } from '../theme/ThemePalettes';
import type { FileTree } from './FileTree';
import { TreePaneRenderer } from './TreePaneRenderer';

test('tree pane rendering remains available through its static class seam', () => {
  expect(TreePaneRenderer.Class.render).toBeFunction();
});

test('tree row starts advance one cell at every nested level', () => {
  const tree = {
    rows: Array.from({ length: 4 }, (_unusedValue, depth) => ({
      name: `level${depth}`,
      path: `/level${depth}`,
      isDir: false,
      depth,
      expanded: false,
    })),
    selectedIndex: { value: 0 },
    hoveredIndex: { value: -1 },
    scrollLeft: { value: 0 },
  } as unknown as FileTree.Instance;
  const rendered = TreePaneRenderer.Class.render({
    tree,
    filesFocused: false,
    palette: ThemePalettes.Class.DARK,
    icon: () => '·',
    height: 4,
    innerWidth: 30,
    viewportWidth: 29,
    windowTop: 0,
  });
  const rows = (rendered.chunks as { text: string }[])
    .map((chunk) => chunk.text)
    .join('')
    .split('\n');

  expect(rows.map((row) => row.indexOf('·'))).toEqual([1, 2, 3, 4]);
});
