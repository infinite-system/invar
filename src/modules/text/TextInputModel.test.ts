import { describe, expect, test } from 'bun:test';
import { TextInputModel } from './TextInputModel';

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
});
