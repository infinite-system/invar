import { expect, test } from 'bun:test';
import { CommandScoring } from './CommandScoring';

test('fuzzyScore matches subsequences and rejects non-matches', () => {
  expect(CommandScoring.Class.fuzzyScore('sv', 'File: Save')).toBeGreaterThanOrEqual(0);
  expect(CommandScoring.Class.fuzzyScore('save', 'File: Save')).toBeGreaterThanOrEqual(0);
  expect(CommandScoring.Class.fuzzyScore('xyz', 'File: Save')).toBe(-1);
  expect(CommandScoring.Class.fuzzyScore('', 'anything')).toBe(0);
});

test('tighter (adjacent) matches score lower than spread-out ones', () => {
  const adjacent = CommandScoring.Class.fuzzyScore('save', 'Save');
  const spread = CommandScoring.Class.fuzzyScore('save', 'Show a value everywhere');
  expect(adjacent).toBeLessThan(spread);
});
