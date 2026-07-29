import { expect, test } from 'bun:test';
import type { FindInBufferMatch } from '../search/FindInBuffer';
import { Clipboard } from '../system/Clipboard';
import { Editor } from './Editor';
import { ReadOnlyTextBuffer } from './ReadOnlyTextBuffer';

test('read-only text buffer composes grapheme-safe selection copy and find targeting', async () => {
  const textBuffer = new ReadOnlyTextBuffer.Class();
  textBuffer.openText('preview.md', 'a😀b\nsecond');
  textBuffer.cursor.set(0, 1);
  textBuffer.cursor.setAnchorHere();
  textBuffer.cursor.set(1, 3);

  let copiedText = '';
  const originalCopyDescriptor = Object.getOwnPropertyDescriptor(
    Clipboard.Class,
    'copy',
  );
  Object.defineProperty(Clipboard.Class, 'copy', {
    configurable: true,
    value: async (text: string) => {
      copiedText = text;
      return true;
    },
  });

  try {
    expect(textBuffer.selectionText()).toBe('😀b\nsec');
    expect(await textBuffer.copySelection()).toBe(7);
    expect(copiedText).toBe('😀b\nsec');
  } finally {
    if (originalCopyDescriptor) {
      Object.defineProperty(Clipboard.Class, 'copy', originalCopyDescriptor);
    } else {
      delete (Clipboard.Class as { copy?: unknown }).copy;
    }
  }

  const revealState: { match: FindInBufferMatch | null } = { match: null };
  const findTarget = textBuffer.findTarget(
    'markdown-preview:preview.md',
    (match) => {
      revealState.match = match;
    },
  );
  const expectedMatch = { line: 1, startColumn: 0, endColumn: 3 };
  findTarget.revealMatch(expectedMatch);

  expect(findTarget.identifier).toBe('markdown-preview:preview.md');
  expect(findTarget.document).toBe(textBuffer.document);
  expect(findTarget.replaceAllowed).toBe(false);
  expect(revealState.match).toEqual(expectedMatch);
});

test('read-only text buffer excludes editing and undo while Editor extends it', () => {
  const textBuffer = new ReadOnlyTextBuffer.Class();
  const editor = new Editor.Class();

  expect('insertText' in textBuffer).toBe(false);
  expect('performUndo' in textBuffer).toBe(false);
  expect('save' in textBuffer).toBe(false);
  expect(editor).toBeInstanceOf(ReadOnlyTextBuffer.$Class);
  expect('insertText' in editor).toBe(true);
  expect('performUndo' in editor).toBe(true);
});
