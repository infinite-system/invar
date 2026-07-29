import { expect, test } from 'bun:test';
import type { KeyEvent } from '@opentui/core';
import { TextInputKey } from './TextInputKey';

function key(sequence: string, modifiers: Partial<KeyEvent> = {}): KeyEvent {
  return {
    name: sequence,
    sequence,
    ctrl: false,
    meta: false,
    option: false,
    shift: false,
    ...modifiers,
  } as KeyEvent;
}

test('typed-character classification accepts one printable grapheme', () => {
  expect(TextInputKey.Class.isTypedCharacter(key('a'))).toBe(true);
  expect(TextInputKey.Class.isTypedCharacter(key('😀'))).toBe(true);
});

test('typed-character classification rejects modifiers, controls, and several graphemes', () => {
  expect(TextInputKey.Class.isTypedCharacter(key('a', { ctrl: true }))).toBe(
    false,
  );
  expect(TextInputKey.Class.isTypedCharacter(key('\n'))).toBe(false);
  expect(TextInputKey.Class.isTypedCharacter(key('ab'))).toBe(false);
  expect(TextInputKey.Class.isTypedCharacter(key(''))).toBe(false);
});
