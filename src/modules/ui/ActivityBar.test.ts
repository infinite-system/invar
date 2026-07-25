import { expect, test } from 'bun:test';
import { ActivityBar } from './ActivityBar';

test('activity bar behavior remains constructible through its class seam', () => {
  expect(ActivityBar.Class).toBeDefined();
});
