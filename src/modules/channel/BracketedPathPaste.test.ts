import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BracketedPathPaste } from './BracketedPathPaste';

test('existing local path paste uploads and never forwards the local path', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'invar-path-paste-'));
  const localPath = join(directory, 'local file.txt');
  writeFileSync(localPath, 'cargo');
  const forwarded: Uint8Array[] = [];
  const uploads: string[] = [];
  const parser = new BracketedPathPaste.Class(
    (bytes) => forwarded.push(bytes.slice()),
    async (path) => {
      uploads.push(path);
      return '/remote/dropzone/file.txt';
    },
  );
  const input = new TextEncoder().encode(
    `before\u001b[200~'${localPath}'\u001b[201~after`,
  );
  for (const byte of input) await parser.push(new Uint8Array([byte]));
  parser.flush();
  const output = Buffer.concat(
    forwarded.map((bytes) => Buffer.from(bytes)),
  ).toString();
  expect(uploads).toEqual([localPath]);
  expect(output).toBe(
    "before\u001b[200~'/remote/dropzone/file.txt'\u001b[201~after",
  );
  expect(output).not.toContain(localPath);
});

test('ordinary bytes and non-path paste remain byte exact', async () => {
  const input = new TextEncoder().encode(
    'x\u001b[200~not-a-local-path\u001b[201~\u001b]52;c;YQ==\u0007',
  );
  const forwarded: Uint8Array[] = [];
  const parser = new BracketedPathPaste.Class(
    (bytes) => forwarded.push(bytes.slice()),
    async () => {
      throw new Error('upload must not run');
    },
  );
  await parser.push(input);
  parser.flush();
  expect(Buffer.concat(forwarded.map((bytes) => Buffer.from(bytes)))).toEqual(
    Buffer.from(input),
  );
});

test('multiple usable paths share one shell-quoted paste form', () => {
  expect(
    BracketedPathPaste.Class.shellQuotedPaths([
      '/tmp/first file.txt',
      "/tmp/second'file.txt",
    ]),
  ).toBe("'/tmp/first file.txt' '/tmp/second'\"'\"'file.txt'");
});

test('a standalone Escape flushes at the event-loop boundary', async () => {
  const forwarded: Uint8Array[] = [];
  const parser = new BracketedPathPaste.Class(
    (bytes) => forwarded.push(bytes.slice()),
    async () => '',
  );
  await parser.push(new Uint8Array([0x1b]));
  expect(forwarded).toHaveLength(0);
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(forwarded).toEqual([new Uint8Array([0x1b])]);
});
