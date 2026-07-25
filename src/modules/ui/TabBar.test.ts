import { expect, test } from 'bun:test';
import { TabBar } from './TabBar';

test('tab bar behavior remains constructible through its class seam', () => {
  expect(TabBar.Class).toBeDefined();
});
