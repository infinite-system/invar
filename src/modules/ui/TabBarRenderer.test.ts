import { expect, test } from 'bun:test';
import { TabBarRenderer } from './TabBarRenderer';

test('tab bar rendering remains available through its static class seam', () => {
  expect(TabBarRenderer.Class.renderBuffer).toBeFunction();
});
