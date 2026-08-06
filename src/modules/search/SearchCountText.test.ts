import { expect, test } from 'bun:test';
import { SearchCountText } from './SearchCountText';

test('search count text uses singular words only for one', () => {
  expect(SearchCountText.Class.resultSummary(0, 0)).toBe(
    '0 results in 0 files',
  );
  expect(SearchCountText.Class.resultSummary(1, 1)).toBe('1 result in 1 file');
  expect(SearchCountText.Class.resultSummary(2, 2)).toBe(
    '2 results in 2 files',
  );
  expect(SearchCountText.Class.itemNoun(0)).toBe('items');
  expect(SearchCountText.Class.itemNoun(1)).toBe('item');
  expect(SearchCountText.Class.itemNoun(2)).toBe('items');
});
