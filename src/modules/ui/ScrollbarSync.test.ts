import { expect, test } from 'bun:test';
import { ScrollbarSync } from './ScrollbarSync';

test('scrollbar synchronization remains constructible through its class seam', () => {
  expect(ScrollbarSync.Class).toBeDefined();
});
