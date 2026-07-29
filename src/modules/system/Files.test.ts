import { expect, test } from 'bun:test';
import { Files } from './Files';

test('confineToRoot accepts descendants and rejects traversal', () => {
  const workspaceRoot = Files.Class.join('/tmp', 'invar-files-test');
  expect(Files.Class.confineToRoot(workspaceRoot, 'src/file.ts')).toBe(
    Files.Class.join(workspaceRoot, 'src/file.ts'),
  );
  expect(Files.Class.confineToRoot(workspaceRoot, '../outside')).toBeNull();
});

test('listNamesResult distinguishes an unreadable path from an empty directory', () => {
  const missingDirectory = Files.Class.join(
    '/tmp',
    'invar-files-test-path-that-does-not-exist',
  );

  expect(Files.Class.listNamesResult(missingDirectory).ok).toBe(false);
});

test('resolveFrom keeps absolute paths and resolves relative paths from the supplied base', () => {
  expect(Files.Class.resolveFrom('/workspace', 'data/catalog.sqlite')).toBe(
    '/workspace/data/catalog.sqlite',
  );
  expect(Files.Class.resolveFrom('/workspace', '/data/catalog.sqlite')).toBe(
    '/data/catalog.sqlite',
  );
});
