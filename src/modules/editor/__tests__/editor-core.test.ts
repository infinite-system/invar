import { test, expect } from 'bun:test';
import { TextDocument } from '../TextDocument';
import { Viewport } from '../Viewport';
import { Editor } from '../Editor';

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
  document.loadFromText(Array.from({ length: 1000 }, (_, index) => `line ${index}`).join('\n'));
  const window = document.slice(500, 5);
  expect(window).toEqual(['line 500', 'line 501', 'line 502', 'line 503', 'line 504']);
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

test('TextDocument maintains the full-document display width through localized edits', () => {
  const document = new TextDocument.Class();
  document.setMaximumLineWidthTrackingEnabled(true);
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

test('TextDocument measures only viable width candidates and does no width work while disabled', () => {
  const document = new CountingTextDocument();
  const lines = Array.from(
    { length: 500 },
    (_unused, lineIndex) => lineIndex === 399
      ? '中'.repeat(60)
      : lineIndex === 0
        ? 'x'.repeat(100)
        : `short line ${lineIndex}`,
  );
  document.loadFromText(lines.join('\n'));
  expect(document.measurementCount).toBe(0);
  expect(document.maximumLineWidth).toBe(0);

  document.setMaximumLineWidthTrackingEnabled(true);
  expect(document.maximumLineWidth).toBe(120);
  expect(document.measurementCount).toBe(2);

  document.setMaximumLineWidthTrackingEnabled(false);
  document.setLine(399, '界'.repeat(80));
  expect(document.maximumLineWidth).toBe(0);
  expect(document.measurementCount).toBe(2);

  document.setMaximumLineWidthTrackingEnabled(true);
  expect(document.maximumLineWidth).toBe(160);
  expect(document.measurementCount).toBe(4);
});

test('Editor gates the exact horizontal extent with word-wrap mode', () => {
  const editor = new Editor.Class();
  editor.document.loadFromText(`short\n${'x'.repeat(80)}`);
  expect(editor.document.maximumLineWidth).toBe(80);

  editor.toggleWordWrap();
  editor.document.setLine(1, 'x'.repeat(120));
  expect(editor.document.maximumLineWidth).toBe(0);

  editor.toggleWordWrap();
  expect(editor.document.maximumLineWidth).toBe(120);
});

test('Viewport keeps a target line within the window', () => {
  const viewport = new Viewport.Class();
  viewport.setSize(80, 10);
  viewport.scrollToLine(50, 100);
  expect(viewport.firstVisible).toBeLessThanOrEqual(50);
  expect(viewport.firstVisible + 10).toBeGreaterThan(50);
  viewport.scrollToLine(0, 100);
  expect(viewport.firstVisible).toBe(0);
});

test('Viewport never scrolls past the last page', () => {
  const viewport = new Viewport.Class();
  viewport.setSize(80, 10);
  viewport.scrollBy(1000, 30);
  expect(viewport.firstVisible).toBe(20); // 30 - 10
});

test('Editor vertical movement clamps and preserves goal column', () => {
  const editor = new Editor.Class();
  editor.document.loadFromText(['long line here', 'ab', 'another long line'].join('\n'));
  editor.hasDocument.value = true;
  editor.cursor.set(0, 12);
  editor.moveVertical(1); // to short line 'ab' (len 2)
  expect(editor.cursor.line.value).toBe(1);
  expect(editor.cursor.col.value).toBe(2); // clamped to line length
  editor.moveVertical(1); // to long line — goal column restored
  expect(editor.cursor.line.value).toBe(2);
  expect(editor.cursor.col.value).toBe(12);
});

test('Editor horizontal movement wraps across line boundaries', () => {
  const editor = new Editor.Class();
  editor.document.loadFromText('ab\ncd');
  editor.hasDocument.value = true;
  editor.cursor.set(0, 2); // end of first line
  editor.moveHorizontal(1); // wrap to start of next line
  expect(editor.cursor.line.value).toBe(1);
  expect(editor.cursor.col.value).toBe(0);
  editor.moveHorizontal(-1); // wrap back to end of first line
  expect(editor.cursor.line.value).toBe(0);
  expect(editor.cursor.col.value).toBe(2);
});
