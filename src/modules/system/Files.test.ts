import { expect, test } from 'bun:test';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
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

test('verified replacement preserves mode and leaves no sibling file', async () => {
  const directory = mkdtempSync(
    Files.Class.join(tmpdir(), 'invar-files-replace-'),
  );
  const path = Files.Class.join(directory, 'source.txt');
  await Bun.write(path, 'before');
  chmodSync(path, 0o640);

  try {
    expect(
      Files.Class.replaceBytesIfUnchanged(
        path,
        new TextEncoder().encode('before'),
        new TextEncoder().encode('after'),
      ),
    ).toEqual({ replaced: true, reason: '' });
    expect(readFileSync(path, 'utf8')).toBe('after');
    expect(statSync(path).mode & 0o777).toBe(0o640);
    expect(readdirSync(directory)).toEqual(['source.txt']);

    expect(
      Files.Class.replaceBytesIfUnchanged(
        path,
        new TextEncoder().encode('stale'),
        new TextEncoder().encode('lost'),
      ),
    ).toEqual({ replaced: false, reason: 'changed' });
    expect(readFileSync(path, 'utf8')).toBe('after');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('verified replacement reports a read-only file without changing it', async () => {
  const directory = mkdtempSync(
    Files.Class.join(tmpdir(), 'invar-files-read-only-'),
  );
  const path = Files.Class.join(directory, 'source.txt');
  await Bun.write(path, 'before');
  chmodSync(path, 0o444);

  try {
    expect(
      Files.Class.replaceBytesIfUnchanged(
        path,
        new TextEncoder().encode('before'),
        new TextEncoder().encode('after'),
      ),
    ).toEqual({ replaced: false, reason: 'read-only' });
    expect(readFileSync(path, 'utf8')).toBe('before');
  } finally {
    chmodSync(path, 0o644);
    rmSync(directory, { recursive: true, force: true });
  }
});
