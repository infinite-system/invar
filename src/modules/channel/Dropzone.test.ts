import { expect, test } from 'bun:test';
import {
  mkdtempSync,
  readdirSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { Dropzone } from './Dropzone';

async function* chunks(...values: string[]): AsyncIterable<Uint8Array> {
  for (const value of values) yield new TextEncoder().encode(value);
}

test('dropzone streams bytes to a content-addressed private file', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'invar-dropzone-'));
  const stored = await Dropzone.Class.store(
    'my file.txt',
    5,
    chunks('he', 'llo'),
    {
      directory,
      maximumByteCount: 100,
    },
  );
  expect(stored.sha256).toBe(
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  );
  expect(stored.path).toEndWith(`${stored.sha256}-my_file.txt`);
  expect(await Bun.file(stored.path).text()).toBe('hello');
  expect(statSync(stored.path).mode & 0o777).toBe(0o600);
});

test('dropzone age and size cleanup removes only owned regular files', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'invar-dropzone-clean-'));
  writeFileSync(join(directory, 'old'), '123456');
  writeFileSync(join(directory, 'new'), '123456');
  const oldDate = new Date(Date.now() - 10_000);
  utimesSync(join(directory, 'old'), oldDate, oldDate);
  await Dropzone.Class.clean(directory, 6, 1_000);
  expect(readdirSync(directory)).toEqual(['new']);
});

test('a new upload counts toward the size cap and evicts older cargo', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'invar-dropzone-cap-'));
  const first = await Dropzone.Class.store('first.txt', 6, chunks('first!'), {
    directory,
    maximumByteCount: 6,
  });
  const second = await Dropzone.Class.store('second.txt', 6, chunks('second'), {
    directory,
    maximumByteCount: 6,
  });
  expect(readdirSync(directory)).toEqual([basename(second.path)]);
  expect(Bun.file(first.path).size).toBe(0);
});
