import { expect, test } from 'bun:test';
import { FindBarRenderer } from './FindBarRenderer';

test('find bar rendering remains available through its static class seam', () => {
  expect(FindBarRenderer.Class.render).toBeFunction();
});
