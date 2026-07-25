import { expect, test } from 'bun:test';
import { PaneSplitters } from './PaneSplitters';

test('pane splitters remain constructible through their class seam', () => {
  expect(PaneSplitters.Class).toBeDefined();
});
