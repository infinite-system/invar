import { expect, test } from 'bun:test';
import { TerminalCommandSanitizer } from './TerminalCommandSanitizer';

test('removes CRLF before any terminal command bytes are written', () => {
  expect(TerminalCommandSanitizer.Class.sanitize('printf first\r\nprintf second')).toBe(
    'printf firstprintf second',
  );
});

test('removes lone carriage returns and newlines', () => {
  expect(TerminalCommandSanitizer.Class.sanitize('one\rtwo\nthree')).toBe('onetwothree');
});

test('removes embedded terminal escape sequences and remaining control bytes', () => {
  expect(
    TerminalCommandSanitizer.Class.sanitize(
      'printf \x1b[31mred\x1b[0m\x1b]0;forged-title\x07\tend',
    ),
  ).toBe('printf redend');
});
