import { afterEach, describe, expect, test } from 'bun:test';
import { Clipboard } from '../system/Clipboard';
import { TextInputModel } from './TextInputModel';

afterEach(() => {
  Clipboard.Class.setOsc52Emitter(null);
  Clipboard.Class.setToolForTest(null);
});

describe('TextInputModel', () => {
  test('caret arithmetic clamps at both extremes', () => {
    const input = new TextInputModel.Class('abc');
    expect(input.caret.value).toBe(3);
    expect(input.moveRight()).toBe(false);
    expect(input.caret.value).toBe(3);

    input.moveHome();
    expect(input.caret.value).toBe(0);
    expect(input.moveLeft()).toBe(false);
    expect(input.caret.value).toBe(0);
  });

  test('insertion happens at the grapheme caret and flattens line breaks', () => {
    const input = new TextInputModel.Class('ac');
    input.moveLeft();
    input.insert('b\n');
    expect(input.value).toBe('ab c');
    expect(input.caret.value).toBe(3);
    expect(input.valueBeforeCaret).toBe('ab ');
    expect(input.valueAfterCaret).toBe('c');
  });

  test('backspace and forward delete remove whole emoji clusters', () => {
    const input = new TextInputModel.Class('a👨‍👩‍👧‍👦b');
    input.moveLeft();
    input.backspace();
    expect(input.value).toBe('ab');
    expect(input.caret.value).toBe(1);

    input.setValue('ae\u0301b', 1);
    input.deleteForward();
    expect(input.value).toBe('ab');
    expect(input.caret.value).toBe(1);
  });

  test('word motion and deletion share punctuation CJK and emoji boundaries', () => {
    const punctuation = new TextInputModel.Class('alpha... beta');
    punctuation.moveWordLeft();
    punctuation.deletePreviousWord();
    expect(punctuation.value).toBe('alphabeta');

    const cjk = new TextInputModel.Class('漢字 かな');
    cjk.moveHome();
    cjk.deleteNextWord();
    expect(cjk.value).toBe('かな');
    expect(cjk.caret.value).toBe(0);

    const emoji = new TextInputModel.Class('😀😀 next');
    emoji.moveHome();
    emoji.deleteNextWord();
    expect(emoji.value).toBe('next');
    expect(emoji.caret.value).toBe(0);
  });

  test('delete next word is inert at end of buffer', () => {
    const input = new TextInputModel.Class('done');
    expect(input.deleteNextWord()).toBe(false);
    expect(input.value).toBe('done');
    expect(input.caret.value).toBe(4);
  });

  test('delete line and clear reset both text and caret', () => {
    const input = new TextInputModel.Class('clear me');
    input.moveWordLeft();
    expect(input.deleteLine()).toBe(true);
    expect(input.value).toBe('');
    expect(input.caret.value).toBe(0);

    input.setValue('again');
    input.clear();
    expect(input.value).toBe('');
    expect(input.caret.value).toBe(0);
  });

  test('shift movement selects from one fixed anchor in either direction', () => {
    const input = new TextInputModel.Class('alpha beta');
    expect(input.apply('selectLeft')).toBe(true);
    expect(input.apply('selectLeft')).toBe(true);
    expect(input.selectionRange()).toEqual({ start: 8, end: 10 });
    expect(input.selectedText()).toBe('ta');

    expect(input.apply('selectWordLeft')).toBe(true);
    expect(input.selectionRange()).toEqual({ start: 6, end: 10 });
    expect(input.selectedText()).toBe('beta');

    expect(input.apply('selectRight')).toBe(true);
    expect(input.selectionRange()).toEqual({ start: 7, end: 10 });
    expect(input.selectedText()).toBe('eta');
  });

  test('plain movement clears selection and select all uses the same range', () => {
    const input = new TextInputModel.Class('one two');
    input.apply('selectHome');
    expect(input.selectedText()).toBe('one two');
    input.apply('moveRight');
    expect(input.hasSelection).toBe(false);
    expect(input.caret.value).toBe(1);

    expect(input.apply('selectAll')).toBe(true);
    expect(input.selectionRange()).toEqual({ start: 0, end: 7 });
    expect(input.selectedText()).toBe('one two');
  });

  test('every edit replaces only the active selection and then collapses it', () => {
    const insertInput = new TextInputModel.Class('alpha beta');
    insertInput.apply('selectWordLeft');
    insertInput.insert('gamma');
    expect(insertInput.value).toBe('alpha gamma');
    expect(insertInput.caret.value).toBe(11);
    expect(insertInput.hasSelection).toBe(false);

    for (const action of [
      'backspace',
      'deleteForward',
      'deletePreviousWord',
      'deleteNextWord',
    ] as const) {
      const input = new TextInputModel.Class('alpha beta');
      input.apply('selectWordLeft');
      input.apply(action);
      expect(input.value).toBe('alpha ');
      expect(input.caret.value).toBe(6);
      expect(input.hasSelection).toBe(false);
    }
  });

  test('copy emits exactly the selected graphemes and unselected copy is inert', async () => {
    const emittedSequences: string[] = [];
    Clipboard.Class.setToolForTest(null);
    Clipboard.Class.setOsc52Emitter((sequence) => {
      emittedSequences.push(sequence);
      return true;
    });
    const input = new TextInputModel.Class('a👨‍👩‍👧‍👦b');

    expect(await input.copySelection()).toBe(0);
    expect(emittedSequences).toEqual([]);

    input.apply('selectLeft');
    input.apply('selectLeft');
    expect(input.selectedText()).toBe('👨‍👩‍👧‍👦b');
    expect(await input.copySelection()).toBe('👨‍👩‍👧‍👦b'.length);
    expect(emittedSequences).toEqual([
      `\x1b]52;c;${Buffer.from('👨‍👩‍👧‍👦b', 'utf8').toString('base64')}\x07`,
    ]);
  });
});
