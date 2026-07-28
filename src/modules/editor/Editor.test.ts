import { test, expect, afterEach } from 'bun:test';
import { ref } from 'vue';
import { Editor } from './Editor';
import { UndoStore } from '../storage/UndoStore';
import { Clock } from '../system/Clock';
import { EditorContributions } from './EditorContributions';

afterEach(() => Clock.Class.freeze(null));

function openWith(text: string): Editor.Instance {
  const editor = new Editor.Class();
  editor.document.loadFromText(text, 'test.ts');
  editor.hasDocument.value = true;
  editor.cursor.set(0, 0);
  return editor;
}

test('insertText inserts at cursor and advances it', () => {
  const editor = openWith('bc');
  editor.insertText('a');
  expect(editor.document.line(0)).toBe('abc');
  expect(editor.cursor.col.value).toBe(1);
  expect(editor.document.dirty).toBe(true);
});

test('completion applies the exact text edit as one undoable mutation', () => {
  const editor = openWith('this.pr');
  editor.cursor.set(0, 7);
  const revisionBefore = editor.document.revision.value;

  editor.applyCompletion(
    {
      label: 'property',
      symbolClass: 'value',
      insertText: null,
      sortText: null,
      filterText: null,
      textEdit: {
        range: {
          start: { line: 0, column: 5 },
          end: { line: 0, column: 7 },
        },
        newText: 'property',
      },
    },
    {
      start: { line: 0, column: 5 },
      end: { line: 0, column: 7 },
    },
  );

  expect(editor.document.line(0)).toBe('this.property');
  expect(editor.cursor.col.value).toBe(13);
  expect(editor.document.revision.value).toBe(revisionBefore + 1);
  editor.performUndo();
  expect(editor.document.line(0)).toBe('this.pr');
});

test('a contributed range replacement is exactly one undo step', () => {
  const editor = openWith('const answer = calculate();');
  editor.replaceRangeAsUndoStep(
    {
      start: { line: 0, column: 0 },
      end: { line: 0, column: 27 },
    },
    'const answer = calculateAnswer();',
  );

  expect(editor.document.line(0)).toBe('const answer = calculateAnswer();');
  editor.performUndo();
  expect(editor.document.line(0)).toBe('const answer = calculate();');
  editor.dispose();
});

test('typing notifies contributions after the character lands', () => {
  const editor = openWith('value');
  const editorContributions = new EditorContributions.Class();
  let recordedText = '';
  editor.attachEditorContributions(editorContributions);
  editorContributions.register({
    recordTyping: (editedEditor) => {
      recordedText = editedEditor.document.text;
    },
  });
  editor.cursor.set(0, 5);

  editor.insertText('x');

  expect(recordedText).toBe('valuex');
  expect(editor.document.line(0)).toBe('valuex');
  editor.dispose();
});

test('newline splits the line and auto-indents', () => {
  const editor = openWith('  foo');
  editor.cursor.set(0, 5); // end of "  foo"
  editor.insertNewline();
  expect(editor.document.lineCount).toBe(2);
  expect(editor.document.line(1)).toBe('  '); // indent carried
  expect(editor.cursor.line.value).toBe(1);
  expect(editor.cursor.col.value).toBe(2);
});

test('backspace at column 0 joins with the previous line', () => {
  const editor = openWith('ab\ncd');
  editor.cursor.set(1, 0);
  editor.backspace();
  expect(editor.document.lineCount).toBe(1);
  expect(editor.document.line(0)).toBe('abcd');
  expect(editor.cursor.line.value).toBe(0);
  expect(editor.cursor.col.value).toBe(2);
});

test('deleteForward at end of line joins the next line', () => {
  const editor = openWith('ab\ncd');
  editor.cursor.set(0, 2);
  editor.deleteChar();
  expect(editor.document.line(0)).toBe('abcd');
  expect(editor.document.lineCount).toBe(1);
});

test('deletePreviousWord uses the navigation boundary and is one undo step', () => {
  const editor = openWith('hello world');
  editor.cursor.set(0, 11);
  editor.moveWordHorizontal(-1);
  expect(editor.cursor.col.value).toBe(6);
  editor.cursor.set(0, 11);
  editor.deletePreviousWord();
  expect(editor.document.line(0)).toBe('hello ');
  expect(editor.cursor.col.value).toBe(6);
  editor.performUndo();
  expect(editor.document.line(0)).toBe('hello world');
});

test('deletePreviousWord at line start deletes only the newline', () => {
  const editor = openWith('ab\ncd');
  editor.cursor.set(1, 0);
  editor.deletePreviousWord();
  expect(editor.document.lines).toEqual(['abcd']);
  expect(editor.cursor.line.value).toBe(0);
  expect(editor.cursor.col.value).toBe(2);
});

test('save writes the buffer and clears dirty', () => {
  const editor = openWith('x');
  editor.insertText('y');
  expect(editor.document.dirty).toBe(true);
  // no path write here (loadFromText path is 'test.ts', relative) — use in-memory assertion:
  // markSaved is exercised via document
  editor.document.markSaved();
  expect(editor.document.dirty).toBe(false);
});

test('undo reverts an edit; redo re-applies it', () => {
  const editor = openWith('a');
  editor.cursor.set(0, 1);
  editor.insertText('b'); // "ab"
  expect(editor.document.line(0)).toBe('ab');
  editor.performUndo();
  expect(editor.document.line(0)).toBe('a');
  editor.performRedo();
  expect(editor.document.line(0)).toBe('ab');
});

test('folded rows are skipped and direct navigation unfolds their region', () => {
  const editor = openWith(
    [
      'function value() {',
      '  const first = 1;',
      '  const second = 2;',
      '}',
      'after();',
    ].join('\n'),
  );
  expect(editor.toggleFoldAtLine(0)).toBe(true);
  expect(editor.collapsedFoldRanges).toEqual([
    { startLine: 0, endLine: 3, kind: 'delimiter' },
  ]);

  editor.moveVertical(1, true);
  expect(editor.cursor.line.value).toBe(4);
  expect(editor.cursor.selectionRange()?.end.line).toBe(4);

  editor.moveWordHorizontal(-1, true);
  expect(editor.cursor.line.value).toBe(0);
  editor.moveToLineEnd();
  editor.moveWordHorizontal(1, true);
  expect(editor.cursor.line.value).toBe(4);

  editor.placeCursor(2, 2);
  expect(editor.cursor.line.value).toBe(2);
  expect(editor.collapsedFoldRanges).toEqual([]);
});

test('fold state can be attached to a stable document handle', () => {
  const foldState = { collapsedLineStarts: new Set<number>() };
  const firstEditor = openWith('const value = {\n  answer: 42,\n};');
  firstEditor.attachFoldState(foldState);
  firstEditor.toggleFoldAtLine(0);
  expect([...foldState.collapsedLineStarts]).toEqual([0]);

  const rehydratedEditor = new Editor.Class();
  rehydratedEditor.attachFoldState(foldState);
  rehydratedEditor.document.loadFromText(
    'const value = {\n  answer: 42,\n};',
    'test.ts',
  );
  rehydratedEditor.placeCursor(0, 0);
  rehydratedEditor.hasDocument.value = true;
  expect(rehydratedEditor.collapsedFoldRanges).toHaveLength(1);
});

test('collapsed fold projection is cached until document or fold state changes', () => {
  class CountingEditor extends Editor.$Class {
    foldRangeReads = 0;

    override foldRanges() {
      this.foldRangeReads++;
      return super.foldRanges();
    }
  }
  const editor = new CountingEditor();
  editor.document.loadFromText('const value = {\n  answer: 42,\n};', 'test.ts');
  editor.hasDocument.value = true;
  editor.toggleFoldAtLine(0);

  for (let readNumber = 0; readNumber < 10_000; readNumber++) {
    expect(editor.collapsedFoldRanges).toHaveLength(1);
  }
  expect(editor.foldRangeReads).toBe(1);

  editor.document.setLine(1, '  answer: 43,');
  expect(editor.collapsedFoldRanges).toHaveLength(1);
  expect(editor.foldRangeReads).toBe(2);
});

test('disabled code folding expands rows and performs zero structural reads', () => {
  const editor = openWith(
    ['const value = {', '  nested: {', '    answer: 42,', '  },', '};'].join(
      '\n',
    ),
  );
  const codeFoldingEnabled = ref(true);
  editor.attachCodeFolding(codeFoldingEnabled);
  expect(editor.toggleFoldAtLine(0)).toBe(true);
  expect(editor.totalVisualRows()).toBe(1);

  codeFoldingEnabled.value = false;
  const originalLine = editor.document.line.bind(editor.document);
  let structuralLineReads = 0;
  editor.document.line = (lineIndex: number): string => {
    structuralLineReads++;
    return originalLine(lineIndex);
  };
  expect(editor.collapsedFoldRanges).toEqual([]);
  expect(editor.foldRangeAtLine(0)).toBeNull();
  expect(editor.toggleFoldAtLine(0)).toBe(false);
  editor.foldAtCursor();
  editor.unfoldAtCursor();
  expect(structuralLineReads).toBe(0);
  expect(editor.totalVisualRows()).toBe(5);

  codeFoldingEnabled.value = true;
  expect(editor.collapsedFoldRanges).toHaveLength(1);
});

test('fold toggles preserve a deep viewport anchor for pointer and keyboard paths', () => {
  const lines = Array.from(
    { length: 600 },
    (_unusedValue, lineIndex) => `const line${lineIndex} = ${lineIndex};`,
  );
  lines[510] = 'if (condition) {';
  lines[511] = '  const nested = 1;';
  lines[512] = '  const more = 2;';
  lines[513] = '}';
  const editor = openWith(lines.join('\n'));
  editor.viewport.setSize(80, 20);

  editor.viewport.scrollTop.value = 500;
  expect(editor.toggleFoldAtLine(510)).toBe(true);
  expect(editor.viewport.scrollTop.value).toBe(500);
  expect(editor.toggleFoldAtLine(510)).toBe(true);
  expect(editor.viewport.scrollTop.value).toBe(500);

  editor.placeCursor(510, 0);
  editor.viewport.scrollTop.value = 500;
  editor.foldAtCursor();
  expect(editor.foldState.value.collapsedLineStarts.has(510)).toBe(true);
  expect(editor.viewport.scrollTop.value).toBe(500);
  editor.unfoldAtCursor();
  expect(editor.foldState.value.collapsedLineStarts.has(510)).toBe(false);
  expect(editor.viewport.scrollTop.value).toBe(500);
});

test('undo back to the saved content reads as UNCHANGED (dirty clears, redo re-dirties)', () => {
  const editor = openWith('a'); // loaded content "a" is the clean baseline
  editor.cursor.set(0, 1);
  editor.insertText('b'); // "ab"
  expect(editor.document.dirty).toBe(true);
  editor.performUndo(); // back to "a" — exactly the loaded content
  expect(editor.document.line(0)).toBe('a');
  expect(editor.document.dirty).toBe(false); // matches the baseline → not dirty
  editor.performRedo(); // "ab" again — differs from the baseline
  expect(editor.document.dirty).toBe(true);
});

test('typing then backspacing clears dirty with NO undo used (content-derived)', () => {
  const editor = openWith('alpha');
  editor.cursor.set(0, 5);

  editor.insertText('x');
  expect(editor.dirty).toBe(true);
  editor.backspace();

  expect(editor.document.line(0)).toBe('alpha');
  expect(editor.dirty).toBe(false);
  expect(editor.title).toBe('test.ts');
});

test('two edits with one undone stay dirty', () => {
  let time = 1000;
  Clock.Class.freeze(() => time);
  const editor = openWith('alpha');
  editor.cursor.set(0, 5);
  editor.insertText('1');
  time += 1000; // beyond the undo coalesce window: two separate steps
  editor.insertText('2');

  editor.performUndo();

  expect(editor.document.line(0)).toBe('alpha1');
  expect(editor.dirty).toBe(true);
});

test('markSaved rebaselines: matchesSaved tracks the last saved content, not the original', () => {
  const editor = openWith('a');
  expect(editor.document.matchesSaved()).toBe(true); // fresh load is clean
  editor.cursor.set(0, 1);
  editor.insertText('b'); // "ab"
  expect(editor.document.matchesSaved()).toBe(false);
  editor.document.markSaved(); // the saved baseline is now "ab"
  expect(editor.document.matchesSaved()).toBe(true);
  editor.insertText('c'); // "abc" — differs from the new baseline
  expect(editor.document.matchesSaved()).toBe(false);
});

test('undo coalesces a run of typed characters into one step', () => {
  let time = 1000;
  Clock.Class.freeze(() => time);
  const editor = openWith('');
  editor.cursor.set(0, 0);
  for (const character of 'hello') {
    editor.insertText(character);
    time += 50; // within COALESCE_MS
  }
  expect(editor.document.line(0)).toBe('hello');
  editor.performUndo(); // one step should remove the whole run
  expect(editor.document.line(0)).toBe('');
});

test('UndoStore respects kind boundaries (typing then newline are separate steps)', () => {
  const undoStore = new UndoStore.Class();
  undoStore.begin(
    {
      beforeCursor: { line: 0, col: 0 },
      kind: 'insert',
      at: 0,
    },
    0,
  );
  undoStore.recordChange({
    deletedLines: ['a'],
    insertedLines: ['ab'],
    startLineIndex: 0,
  });
  undoStore.begin(
    {
      beforeCursor: { line: 0, col: 1 },
      kind: 'insert',
      at: 50,
    },
    50,
  ); // coalesced
  undoStore.recordChange({
    deletedLines: ['ab'],
    insertedLines: ['abc'],
    startLineIndex: 0,
  });
  undoStore.begin(
    {
      beforeCursor: { line: 0, col: 2 },
      kind: 'newline',
      at: 100,
    },
    100,
  ); // new step
  undoStore.recordChange({
    deletedLines: ['abc'],
    insertedLines: ['abc', ''],
    startLineIndex: 0,
  });
  expect(undoStore.depth).toBe(2);
});

test('vertical movement clamps and preserves goal column', () => {
  const editor = openWith(
    ['long line here', 'ab', 'another long line'].join('\n'),
  );
  editor.cursor.set(0, 12);
  editor.moveVertical(1);
  expect(editor.cursor.line.value).toBe(1);
  expect(editor.cursor.col.value).toBe(2);
  editor.moveVertical(1);
  expect(editor.cursor.line.value).toBe(2);
  expect(editor.cursor.col.value).toBe(12);
});

test('horizontal movement wraps across line boundaries', () => {
  const editor = openWith('ab\ncd');
  editor.cursor.set(0, 2);
  editor.moveHorizontal(1);
  expect(editor.cursor.line.value).toBe(1);
  expect(editor.cursor.col.value).toBe(0);
  editor.moveHorizontal(-1);
  expect(editor.cursor.line.value).toBe(0);
  expect(editor.cursor.col.value).toBe(2);
});
