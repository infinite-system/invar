import { test, expect } from 'bun:test';
import { TextDocument } from './TextDocument';

class CountingTextDocument extends TextDocument.$Class {
  measurementCount = 0;

  protected override measureLineDisplayWidth(line: string): number {
    this.measurementCount += 1;
    return super.measureLineDisplayWidth(line);
  }
}

test('TextDocument splits text into lines and stamps a revision', () => {
  const document = new TextDocument.Class();
  const revisionBefore = document.revision.value;
  document.loadFromText('a\nb\nc');
  expect(document.lineCount).toBe(3);
  expect(document.line(1)).toBe('b');
  expect(document.revision.value).toBeGreaterThan(revisionBefore);
  expect(document.dirty.value).toBe(false);
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
  expect(document.dirty.value).toBe(true);
  expect(document.revision.value).toBeGreaterThan(revisionBefore);
  document.markSaved();
  expect(document.dirty.value).toBe(false);
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
