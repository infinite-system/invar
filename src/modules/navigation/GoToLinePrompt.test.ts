import { describe, expect, test } from 'bun:test';
import { GoToLinePrompt } from './GoToLinePrompt';

describe('GoToLinePrompt', () => {
  test('accepts line and line:column input', () => {
    const prompt = new GoToLinePrompt.Class();

    prompt.show();
    prompt.append('7');
    expect(prompt.parse()).toEqual({ line: 7, column: 1 });

    prompt.input.setValue('12:34');
    expect(prompt.parse()).toEqual({ line: 12, column: 34 });
  });

  test('rejects malformed and zero positions without closing', () => {
    const prompt = new GoToLinePrompt.Class();
    prompt.show();

    for (const input of ['', 'abc', '1:', ':2', '0', '1:0', '1:2:3']) {
      prompt.input.setValue(input);
      expect(prompt.parse()).toBeNull();
      expect(prompt.open.value).toBe(true);
      expect(prompt.notice.value).toBe('Enter a line or line:column');
    }
  });
});
