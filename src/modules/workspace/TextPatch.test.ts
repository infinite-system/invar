import { expect, test } from 'bun:test';
import { TextArena } from './TextArena';
import { TextPatch } from './TextPatch';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

test('a patch verifies exact apply, undo, and redo premises', () => {
  const arena = new TextArena.Class();
  const source = encode('before OLD after');
  const patch = TextPatch.Class.create(arena, source, {
    path: '/one.txt',
    searchGeneration: 7,
    baselineByteOffset: 'before '.length,
    removedBytes: encode('OLD'),
    insertedBytes: encode('NEW'),
  });
  const applyVerification = patch.verify(source, 'apply');
  expect(applyVerification).toEqual({
    kind: 'exact',
    byteOffset: 'before '.length,
  });
  patch.accept(applyVerification, 'apply');

  const applied = encode('before NEW after');
  expect(patch.verify(applied, 'undo')).toEqual({
    kind: 'exact',
    byteOffset: 'before '.length,
  });
  patch.accept(patch.verify(applied, 'undo'), 'undo');
  expect(patch.verify(source, 'redo')).toEqual({
    kind: 'exact',
    byteOffset: 'before '.length,
  });
});

test('an unrelated insertion above a patch relocates one exact context', () => {
  const arena = new TextArena.Class();
  const source = encode(`${'a'.repeat(64)}OLD${'b'.repeat(64)}`);
  const patch = TextPatch.Class.create(arena, source, {
    path: '/one.txt',
    searchGeneration: 1,
    baselineByteOffset: 64,
    removedBytes: encode('OLD'),
    insertedBytes: encode('NEW'),
  });
  expect(
    patch.verify(encode(`prefix:${new TextDecoder().decode(source)}`), 'apply'),
  ).toEqual({
    kind: 'relocated',
    byteOffset: 71,
  });
});

test('changed exact context drifts instead of trusting an unchanged subject', () => {
  const arena = new TextArena.Class();
  const source = encode(`${'a'.repeat(64)}OLD${'b'.repeat(64)}`);
  const patch = TextPatch.Class.create(arena, source, {
    path: '/one.txt',
    searchGeneration: 1,
    baselineByteOffset: 64,
    removedBytes: encode('OLD'),
    insertedBytes: encode('NEW'),
  });
  const drifted = encode(`${'a'.repeat(63)}zOLD${'b'.repeat(64)}`);
  expect(patch.verify(drifted, 'apply')).toEqual({ kind: 'drifted' });
});

test('duplicate exact contexts are ambiguous instead of guessed', () => {
  const arena = new TextArena.Class();
  const exactSequence = `${'a'.repeat(64)}OLD${'b'.repeat(64)}`;
  const patch = TextPatch.Class.create(arena, encode(exactSequence), {
    path: '/one.txt',
    searchGeneration: 1,
    baselineByteOffset: 64,
    removedBytes: encode('OLD'),
    insertedBytes: encode('NEW'),
  });
  expect(
    patch.verify(encode(`prefix:${exactSequence}:${exactSequence}`), 'apply'),
  ).toEqual({ kind: 'ambiguous' });
});

test('a file group verifies every neighboring patch against one unchanged source', () => {
  const arena = new TextArena.Class();
  const source = encode('first OLD middle OLD last');
  const first = TextPatch.Class.create(arena, source, {
    path: '/one.txt',
    searchGeneration: 1,
    baselineByteOffset: 6,
    removedBytes: encode('OLD'),
    insertedBytes: encode('NEW'),
  });
  const second = TextPatch.Class.create(arena, source, {
    path: '/one.txt',
    searchGeneration: 1,
    baselineByteOffset: 17,
    removedBytes: encode('OLD'),
    insertedBytes: encode('NEW'),
  });
  expect(TextPatch.Class.verifyGroup(source, [first, second], 'apply')).toEqual(
    [
      { kind: 'exact', byteOffset: 6 },
      { kind: 'exact', byteOffset: 17 },
    ],
  );
});

test('byte offsets and line endings stay exact across UTF-8 text', () => {
  const arena = new TextArena.Class();
  const prefix = encode('🙂\r\n');
  const source = encode('🙂\r\nOLD\r\nlast');
  const patch = TextPatch.Class.create(arena, source, {
    path: '/unicode.txt',
    searchGeneration: 1,
    baselineByteOffset: prefix.byteLength,
    removedBytes: encode('OLD'),
    insertedBytes: encode('NEW'),
  });
  expect(patch.baselineByteOffset).toBe(6);
  expect(patch.verify(source, 'apply')).toEqual({
    kind: 'exact',
    byteOffset: 6,
  });
  expect(arena.text(patch.beforeContextSlice)).toBe('🙂\r\n');
  expect(arena.text(patch.afterContextSlice)).toBe('\r\nlast');
});
