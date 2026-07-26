import { test, expect } from 'bun:test';
import { TextDocument } from './TextDocument';

class CountingTextDocument extends TextDocument.$Class {
  measurementCount = 0;

  protected override measureLineDisplayWidth(line: string): number {
    this.measurementCount += 1;
    return super.measureLineDisplayWidth(line);
  }
}

/** Instrument for the dirty query's cost: counts the FULL content hashes a run of `dirty` reads
 *  actually performs, so "the cheap facts rejected it" is measured rather than assumed. */
class SignatureCountingTextDocument extends TextDocument.$Class {
  signatureComputationCount = 0;

  protected override contentSignature(): string {
    this.signatureComputationCount += 1;
    return super.contentSignature();
  }
}

test('TextDocument splits text into lines and stamps a revision', () => {
  const document = new TextDocument.Class();
  const revisionBefore = document.revision.value;
  document.loadFromText('a\nb\nc');
  expect(document.lineCount).toBe(3);
  expect(document.line(1)).toBe('b');
  expect(document.revision.value).toBeGreaterThan(revisionBefore);
  expect(document.dirty).toBe(false);
});

test('TextDocument.slice returns only the requested window (flyweight read)', () => {
  const document = new TextDocument.Class();
  document.loadFromText(
    Array.from({ length: 1000 }, (_, index) => `line ${index}`).join('\n'),
  );
  const window = document.slice(500, 5);
  expect(window).toEqual([
    'line 500',
    'line 501',
    'line 502',
    'line 503',
    'line 504',
  ]);
});

test('TextDocument mutation marks dirty and bumps revision', () => {
  const document = new TextDocument.Class();
  document.loadFromText('x');
  const revisionBefore = document.revision.value;
  document.setLine(0, 'y');
  expect(document.line(0)).toBe('y');
  expect(document.dirty).toBe(true);
  expect(document.revision.value).toBeGreaterThan(revisionBefore);
  document.markSaved();
  expect(document.dirty).toBe(false);
});

test('replaceRange applies a multiline edit with one revision bump', () => {
  const document = new TextDocument.Class();
  document.loadFromText('alpha\nbeta');
  const revisionBefore = document.revision.value;

  const end = document.replaceRange(
    { line: 0, col: 2 },
    { line: 1, col: 2 },
    'X\nY',
  );

  expect(document.snapshot()).toEqual(['alX', 'Yta']);
  expect(end).toEqual({ line: 1, col: 1 });
  expect(document.revision.value).toBe(revisionBefore + 1);
});

test('TextDocument maintains the full-document display width through localized edits', () => {
  const document = new TextDocument.Class();
  document.loadFromText('short\n中\twide\nmedium');
  expect(document.maximumLineWidth).toBe(8);

  document.setLine(1, 'x');
  expect(document.maximumLineWidth).toBe(6);
  document.insertLine(1, 'longest line');
  expect(document.maximumLineWidth).toBe(12);
  document.removeLine(1);
  expect(document.maximumLineWidth).toBe(6);
  document.replaceAll(['tiny', 'a much wider replacement']);
  expect(document.maximumLineWidth).toBe(24);
  document.restore(['restored']);
  expect(document.maximumLineWidth).toBe(8);
});

test('TextDocument maintains serialized content length without joining its lines', () => {
  const document = new TextDocument.Class();
  document.loadFromText('alpha\r\nbeta\r\ngamma');
  expect(document.contentLength).toBe('alpha\r\nbeta\r\ngamma'.length);

  document.setLine(1, 'a much longer beta');
  expect(document.contentLength).toBe(
    'alpha\r\na much longer beta\r\ngamma'.length,
  );
  document.insertLine(1, 'inserted');
  expect(document.contentLength).toBe(
    'alpha\r\ninserted\r\na much longer beta\r\ngamma'.length,
  );
  document.removeLine(2);
  expect(document.contentLength).toBe('alpha\r\ninserted\r\ngamma'.length);
});

test('TextDocument measures only viable full-document width candidates', () => {
  const document = new CountingTextDocument();
  const lines = Array.from({ length: 500 }, (_unused, lineIndex) =>
    lineIndex === 399
      ? '中'.repeat(60)
      : lineIndex === 0
        ? 'x'.repeat(100)
        : `short line ${lineIndex}`,
  );
  document.loadFromText(lines.join('\n'));
  expect(document.maximumLineWidth).toBe(120);
  expect(document.measurementCount).toBe(2);

  document.setLine(399, '界'.repeat(80));
  expect(document.maximumLineWidth).toBe(160);
  expect(document.measurementCount).toBe(4);
});

test('an edit sequence that cancels out reads as clean with no undo involved', () => {
  const document = new TextDocument.Class();
  document.loadFromText('alpha\nbeta');

  // Type a character, then delete it — the user's exact case.
  document.insertInline(0, 5, 'x');
  expect(document.dirty).toBe(true);
  document.deleteBackward(0, 6);
  expect(document.dirty).toBe(false);

  // Delete a whole line and retype it identically.
  document.removeLine(1);
  expect(document.dirty).toBe(true);
  document.insertLine(1, 'beta');
  expect(document.dirty).toBe(false);

  // Cut a range and paste it back in place.
  const cutText = document.sliceRange({ line: 0, col: 1 }, { line: 1, col: 2 });
  document.deleteRange({ line: 0, col: 1 }, { line: 1, col: 2 });
  expect(document.dirty).toBe(true);
  document.insertMultiline(0, 1, cutText);
  expect(document.dirty).toBe(false);
});

test('swapping two lines reads as DIRTY (the content check is order-sensitive)', () => {
  const document = new TextDocument.Class();
  document.loadFromText('alpha\nbeta\ngamma');

  document.replaceAll(['beta', 'alpha', 'gamma']);

  // Same line count and same total length: only an order-sensitive content check can catch this.
  expect(document.lineCount).toBe(3);
  expect(document.dirty).toBe(true);
  document.replaceAll(['alpha', 'beta', 'gamma']);
  expect(document.dirty).toBe(false);
});

test('markSaved rebaselines the content check without bumping the revision', () => {
  const document = new TextDocument.Class();
  document.loadFromText('alpha');
  document.insertInline(0, 5, '!');
  const revisionBeforeSave = document.revision.value;

  document.markSaved();

  expect(document.dirty).toBe(false);
  expect(document.revision.value).toBe(revisionBeforeSave);
  document.deleteBackward(0, 6); // back to the ORIGINAL load content, not the saved one
  expect(document.line(0)).toBe('alpha');
  expect(document.dirty).toBe(true);
  document.insertInline(0, 5, '!'); // back to the SAVED content
  expect(document.dirty).toBe(false);
});

test('the dirty query hashes only when clean is plausible, never per frame', () => {
  const document = new SignatureCountingTextDocument();
  const lines = Array.from(
    { length: 20_000 },
    (_unusedValue, lineIndex) =>
      `  const someIdentifier${lineIndex} = ${lineIndex};`,
  );
  document.loadFromText(lines.join('\n'));

  // Typing forward: the total length differs from the baseline, so no read hashes anything — and
  // 10,000 per-frame reads across the run cost one memo comparison each.
  document.signatureComputationCount = 0;
  let dirtyFrameCount = 0;
  for (const character of 'hello') {
    document.insertInline(0, 0, character);
    for (let frame = 0; frame < 2000; frame += 1) {
      if (document.dirty) dirtyFrameCount += 1;
    }
  }
  expect(dirtyFrameCount).toBe(10_000);
  expect(document.signatureComputationCount).toBe(0);

  // Deleting back to the baseline length is the one moment the answer can flip, so it is the one
  // moment a hash runs — exactly once, however many frames read the result.
  document.deleteBackward(0, 5);
  document.deleteBackward(0, 4);
  document.deleteBackward(0, 3);
  document.deleteBackward(0, 2);
  expect(document.signatureComputationCount).toBe(0); // still shorter than the baseline
  document.deleteBackward(0, 1);
  let cleanFrameCount = 0;
  for (let frame = 0; frame < 2000; frame += 1) {
    if (!document.dirty) cleanFrameCount += 1;
  }
  expect(cleanFrameCount).toBe(2000);
  expect(document.signatureComputationCount).toBe(1);
});

test('the derived answer agrees with a whole-text comparison after every op kind', () => {
  // The cheap facts are MAINTAINED state, and maintained state can drift. This walks a deterministic
  // op sequence over every mutator and asserts the O(1)-fronted answer equals the naive
  // `text !== savedText` answer at every step — which fails loudly if the running length ever drifts.
  const document = new TextDocument.Class();
  document.loadFromText('alpha\nbeta\ngamma\ndelta');
  let savedText = document.text;
  let pseudoRandomState = 20260726;
  const nextIndex = (limit: number): number => {
    pseudoRandomState = (pseudoRandomState * 1103515245 + 12345) % 2147483648;
    return Math.floor((pseudoRandomState / 2147483648) * limit);
  };
  let disagreementCount = 0;

  for (let step = 0; step < 400; step += 1) {
    const lineIndex = nextIndex(document.lineCount);
    const columnIndex = nextIndex(document.line(lineIndex).length + 1);
    switch (step % 10) {
      case 0:
        document.insertInline(lineIndex, columnIndex, 'q');
        break;
      case 1:
        document.deleteBackward(lineIndex, columnIndex);
        break;
      case 2:
        document.splitLine(lineIndex, columnIndex);
        break;
      case 3:
        document.deleteForward(lineIndex, columnIndex);
        break;
      case 4:
        document.insertMultiline(lineIndex, columnIndex, 'one\ntwo');
        break;
      case 5:
        document.deleteRange(
          { line: lineIndex, col: 0 },
          { line: lineIndex, col: columnIndex },
        );
        break;
      case 6:
        document.removeLine(lineIndex);
        break;
      case 7:
        document.insertLine(lineIndex, 'inserted');
        break;
      case 8:
        document.setLine(lineIndex, `rewritten ${step}`);
        break;
      default:
        // Undo-shaped restore, a save, and a wholesale replace all reach the baseline machinery.
        if (step % 30 === 9) {
          document.markSaved();
          savedText = document.text;
        } else if (step % 20 === 9) {
          document.replaceAll(document.snapshot().slice(0, 3));
        } else {
          document.restore(document.snapshot().reverse());
        }
        break;
    }
    if (document.dirty !== (document.text !== savedText))
      disagreementCount += 1;
  }

  expect(disagreementCount).toBe(0);
  document.replaceAll(savedText.split('\n'));
  expect(document.dirty).toBe(false);
});
