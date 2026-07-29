import { expect, test } from 'bun:test';
import { TerminalCommandTyping } from './TerminalCommandTyping';

test('higher typing speed shortens the total duration', () => {
  const command = 'printf terminal';
  const graphemes = TerminalCommandTyping.Class.plan(
    command,
    10,
    () => 0.5,
  ).graphemes;
  const slow = TerminalCommandTyping.Class.delays(graphemes, 10, () => 0.5);
  const fast = TerminalCommandTyping.Class.delays(graphemes, 100, () => 0.5);
  expect(fast.reduce((sum, delay) => sum + delay, 0)).toBeLessThan(
    slow.reduce((sum, delay) => sum + delay, 0),
  );
});

test('long commands accelerate to the duration cap', () => {
  const command = 'x'.repeat(1_000);
  const delays = TerminalCommandTyping.Class.plan(command, 5, () => 0.5).delays;
  expect(delays).toHaveLength(command.length);
  expect(delays.reduce((sum, delay) => sum + delay, 0)).toBeCloseTo(1_500, 6);
});

test('cadence includes deterministic human-like jitter without changing the cap', () => {
  const randomValues = [0, 1, 0.25, 0.75];
  let randomIndex = 0;
  const delays = TerminalCommandTyping.Class.delays(
    ['a', ' ', 'b', '!'],
    2,
    () => randomValues[randomIndex++ % randomValues.length]!,
  );
  expect(new Set(delays.map((delay) => delay.toFixed(3))).size).toBeGreaterThan(
    1,
  );
  expect(delays.reduce((sum, delay) => sum + delay, 0)).toBeCloseTo(1_500, 6);
});

test('one typing plan keeps delay and write iteration aligned on grapheme clusters', () => {
  const plan = TerminalCommandTyping.Class.plan('🦊✨👩‍💻e\u0301', 40, () => 0.5);
  expect(plan.graphemes).toEqual(['🦊', '✨', '👩‍💻', 'e\u0301']);
  expect(plan.delays).toHaveLength(plan.graphemes.length);
});
