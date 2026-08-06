import { expect, test } from 'bun:test';
import { TextByteCoordinates } from '../text/TextByteCoordinates';
import { TextArena } from './TextArena';
import { TextPatch } from './TextPatch';
import { TextPatchApplication } from './TextPatchApplication';

test('one patch application orders edits and tracks shifted byte offsets', () => {
  const sourceText = 'α OLD\nβ OLD';
  const sourceBytes = TextByteCoordinates.Class.encode(sourceText);
  const arena = new TextArena.Class();
  const firstByteOffset = TextByteCoordinates.Class.encode('α ').byteLength;
  const secondByteOffset =
    TextByteCoordinates.Class.encode('α OLD\nβ ').byteLength;
  const firstPatch = TextPatch.Class.create(arena, sourceBytes, {
    path: '/one.txt',
    searchGeneration: 1,
    baselineByteOffset: firstByteOffset,
    removedBytes: TextByteCoordinates.Class.encode('OLD'),
    insertedBytes: TextByteCoordinates.Class.encode('FIRST'),
  });
  const secondPatch = TextPatch.Class.create(arena, sourceBytes, {
    path: '/one.txt',
    searchGeneration: 1,
    baselineByteOffset: secondByteOffset,
    removedBytes: TextByteCoordinates.Class.encode('OLD'),
    insertedBytes: TextByteCoordinates.Class.encode('SECOND'),
  });
  const verifiedPatches = [
    {
      patch: secondPatch,
      verification: secondPatch.verify(sourceBytes, 'apply'),
    },
    {
      patch: firstPatch,
      verification: firstPatch.verify(sourceBytes, 'apply'),
    },
  ];

  const application = TextPatchApplication.Class.apply(
    sourceBytes,
    verifiedPatches,
    'apply',
  );
  expect(TextByteCoordinates.Class.decode(application.bytes)).toBe(
    'α FIRST\nβ SECOND',
  );
  expect(application.finalByteOffsets.get(firstPatch)).toBe(firstByteOffset);
  expect(application.finalByteOffsets.get(secondPatch)).toBe(
    secondByteOffset + 2,
  );
  expect(
    TextPatchApplication.Class.textEdits(
      sourceBytes,
      verifiedPatches,
      'apply',
    ).map((edit) => edit.start),
  ).toEqual([
    { line: 1, column: 2 },
    { line: 0, column: 2 },
  ]);
});

test('one patch application rejects overlapping verified patches', () => {
  const sourceBytes = TextByteCoordinates.Class.encode('OLD');
  const arena = new TextArena.Class();
  const patch = TextPatch.Class.create(arena, sourceBytes, {
    path: '/one.txt',
    searchGeneration: 1,
    baselineByteOffset: 0,
    removedBytes: sourceBytes,
    insertedBytes: TextByteCoordinates.Class.encode('NEW'),
  });
  const verifiedPatch = {
    patch,
    verification: patch.verify(sourceBytes, 'apply'),
  };
  expect(() =>
    TextPatchApplication.Class.apply(
      sourceBytes,
      [verifiedPatch, verifiedPatch],
      'apply',
    ),
  ).toThrow('Verified text patches overlap.');
});
