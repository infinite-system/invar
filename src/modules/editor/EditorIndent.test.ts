// Indentation as document arithmetic: the detected indent unit, the per-line string ops, and the
// Editor gestures Tab / Shift+Tab dispatch to. No render layer involved.
import { test, expect, afterEach } from 'bun:test';
import { EditorIndent } from './EditorIndent';
import { Editor } from './Editor';
import { Clock } from '../system/Clock';

afterEach(() => Clock.Class.freeze(null));

function openWith(text: string): Editor.Instance {
  const editor = new Editor.Class();
  editor.document.loadFromText(text, 'test.ts');
  editor.hasDocument.value = true;
  editor.cursor.set(0, 0);
  return editor;
}

const lines = (editor: Editor.Instance): string[] =>
  Array.from({ length: editor.document.lineCount }, (_unused, index) =>
    editor.document.line(index),
  );

test('a tab-indented file keeps tabs', () => {
  expect(
    EditorIndent.Class.detectIndentUnit(['function a() {', '\treturn 1;', '}']),
  ).toBe('\t');
});

test('the space step is the SMALLEST positive leading-space run observed', () => {
  expect(
    EditorIndent.Class.detectIndentUnit([
      'a', //
      '    b',
      '  c',
      '      d',
    ]),
  ).toBe('  ');
  expect(EditorIndent.Class.detectIndentUnit(['a', '    b', '        c'])).toBe(
    '    ',
  );
});

test('a document with no indentation at all falls back to two spaces', () => {
  expect(EditorIndent.Class.detectIndentUnit(['a', 'b', ''])).toBe('  ');
  expect(EditorIndent.Class.detectIndentUnit([])).toBe('  ');
});

test('a whitespace-only line is not read as an indent level', () => {
  expect(EditorIndent.Class.detectIndentUnit(['a', ' ', '    b'])).toBe('    ');
});

test('outdentLine removes at most one unit and never a real character', () => {
  expect(EditorIndent.Class.outdentLine('      x', '  ')).toBe('    x');
  expect(EditorIndent.Class.outdentLine(' x', '  ')).toBe('x');
  expect(EditorIndent.Class.outdentLine('x', '  ')).toBe('x');
  expect(EditorIndent.Class.outdentLine('\t\tx', '\t')).toBe('\tx');
  expect(EditorIndent.Class.outdentLine('  x', '\t')).toBe('x');
});

test('Tab with no selection inserts one indent unit AT THE CARET', () => {
  const editor = openWith('const a = 1;\n  const b = 2;');
  editor.cursor.set(0, 5); // mid-line
  editor.indent();
  expect(lines(editor)[0]).toBe('const   a = 1;');
  expect(editor.cursor.col.value).toBe(7);
});

test('Tab with a selection indents every selected line and keeps the selection', () => {
  const editor = openWith('  one\n  two\n  three\n  four');
  editor.cursor.set(0, 2);
  editor.cursor.setAnchorHere();
  editor.cursor.set(2, 3);
  editor.indent();
  expect(lines(editor)).toEqual(['    one', '    two', '    three', '  four']);
  expect(editor.cursor.line.value).toBe(2);
  expect(editor.cursor.col.value).toBe(5); // moved by the same delta as its line
  expect(editor.cursor.anchor.value).toEqual({ line: 0, col: 4 });
  expect(editor.cursor.hasSelection).toBe(true);
});

test('Shift+Tab with a selection outdents every selected line', () => {
  // The file's own step is two spaces (the smallest positive run), so one gesture removes two.
  const editor = openWith('  head\n    one\n    two\nthree');
  editor.cursor.set(1, 4);
  editor.cursor.setAnchorHere();
  editor.cursor.set(2, 5);
  editor.outdent();
  expect(lines(editor)).toEqual(['  head', '  one', '  two', 'three']);
});

test('Shift+Tab with no selection outdents the caret line only', () => {
  const editor = openWith('  head\n    two');
  editor.cursor.set(1, 6);
  editor.outdent();
  expect(lines(editor)).toEqual(['  head', '  two']);
  expect(editor.cursor.line.value).toBe(1);
  expect(editor.cursor.col.value).toBe(4);
});

test('indenting a block leaves fully empty lines alone (no trailing whitespace)', () => {
  const editor = openWith('  one\n\n  two');
  editor.cursor.set(0, 0);
  editor.cursor.setAnchorHere();
  editor.cursor.set(2, 5);
  editor.indent();
  expect(lines(editor)).toEqual(['    one', '', '    two']);
});

test('each gesture is ONE undo step that restores the whole block', () => {
  const editor = openWith('  one\n  two');
  editor.cursor.set(0, 0);
  editor.cursor.setAnchorHere();
  editor.cursor.set(1, 5);
  editor.indent();
  expect(lines(editor)).toEqual(['    one', '    two']);
  editor.performUndo();
  expect(lines(editor)).toEqual(['  one', '  two']);
});

test('a read-only buffer refuses both gestures', () => {
  const editor = openWith('  one');
  editor.readOnly.value = true;
  editor.indent();
  editor.outdent();
  expect(lines(editor)).toEqual(['  one']);
});
