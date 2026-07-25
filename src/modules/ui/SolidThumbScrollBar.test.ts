import { expect, test } from 'bun:test';
import { SolidThumbScrollBar } from './SolidThumbScrollBar';

test('solid-thumb scrollbars remain constructible through their class seam', () => {
  expect(SolidThumbScrollBar.Class).toBeDefined();
});
