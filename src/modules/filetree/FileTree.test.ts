import { test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ref } from 'vue';
import { FileTree } from './FileTree';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'ftree-'));
  writeFileSync(join(root, 'a.ts'), 'export const a = 1;');
  writeFileSync(join(root, 'b.md'), '# b');
  mkdirSync(join(root, 'sub'));
  writeFileSync(join(root, 'sub', 'c.ts'), 'export const c = 3;');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

test('root lists directories first, then files, alphabetical', () => {
  const tree = new FileTree.Class();
  tree.open(root);
  const names = tree.rows.map((row) => row.name);
  expect(names).toEqual(['sub', 'a.ts', 'b.md']);
});

test('expanding a directory reveals its children indented, cost only on expand', () => {
  const tree = new FileTree.Class();
  tree.open(root);
  expect(tree.rows.length).toBe(3); // sub collapsed — child not materialized
  tree.setSelection(0); // 'sub'
  const result = tree.activateSelected();
  expect(result).toEqual({ toggled: true });
  const rows = tree.rows;
  expect(rows.length).toBe(4);
  const child = rows.find((row) => row.name === 'c.ts');
  expect(child?.depth).toBe(1);
  expect(tree.contentWidth).toBe(8);
});

test('activating a file returns its path to open', () => {
  const tree = new FileTree.Class();
  tree.open(root);
  tree.setSelection(1); // 'a.ts'
  const result = tree.activateSelected();
  expect(result).toHaveProperty('openFile');
  expect((result as { openFile: string }).openFile.endsWith('a.ts')).toBe(true);
});

test('selection movement clamps to bounds', () => {
  const tree = new FileTree.Class();
  tree.open(root);
  tree.moveSelection(-5);
  expect(tree.selectedIndex.value).toBe(0);
  tree.moveSelection(100);
  expect(tree.selectedIndex.value).toBe(tree.rows.length - 1);
});

test('revealing a path expands ancestors, selects the file, and centers it', () => {
  const tree = new FileTree.Class();
  tree.open(root);
  tree.viewportHeight.value = 1;

  expect(tree.revealPath(join(root, 'sub', 'c.ts'))).toBe(true);
  expect(tree.rows.map((row) => row.name)).toEqual([
    'sub',
    'c.ts',
    'a.ts',
    'b.md',
  ]);
  expect(tree.selected?.path).toBe(join(root, 'sub', 'c.ts'));
  expect(tree.scrollTop.value).toBe(1);
});

test('revealing centers in the viewport and clamps at the tree ends', () => {
  const centerRoot = mkdtempSync(join(tmpdir(), 'ftree-center-'));
  try {
    for (let fileIndex = 0; fileIndex < 12; fileIndex += 1) {
      writeFileSync(
        join(centerRoot, `file-${String(fileIndex).padStart(2, '0')}.ts`),
        `${fileIndex}\n`,
      );
    }
    const tree = new FileTree.Class();
    tree.open(centerRoot);
    tree.viewportHeight.value = 5;

    expect(tree.revealPath(join(centerRoot, 'file-07.ts'))).toBe(true);
    expect(tree.selectedIndex.value).toBe(7);
    expect(tree.scrollTop.value).toBe(5);

    expect(tree.revealPath(join(centerRoot, 'file-11.ts'))).toBe(true);
    expect(tree.scrollTop.value).toBe(7);
  } finally {
    rmSync(centerRoot, { recursive: true, force: true });
  }
});

test('revealing a filtered hidden file is a safe no-op', () => {
  const hiddenRoot = mkdtempSync(join(tmpdir(), 'ftree-hidden-'));
  try {
    mkdirSync(join(hiddenRoot, '.private'));
    writeFileSync(join(hiddenRoot, '.private', 'secret.ts'), 'secret\n');
    writeFileSync(join(hiddenRoot, 'visible.ts'), 'visible\n');
    const showHiddenFiles = ref(false);
    const tree = new FileTree.Class(showHiddenFiles);
    tree.open(hiddenRoot);
    const originalRows = tree.rows.map((row) => row.path);

    expect(tree.revealPath(join(hiddenRoot, '.private', 'secret.ts'))).toBe(
      false,
    );
    expect(tree.rows.map((row) => row.path)).toEqual(originalRows);
    expect(tree.selectedIndex.value).toBe(0);
    showHiddenFiles.value = true;
    expect(tree.rows.find((row) => row.name === '.private')?.expanded).toBe(
      false,
    );
  } finally {
    rmSync(hiddenRoot, { recursive: true, force: true });
  }
});
