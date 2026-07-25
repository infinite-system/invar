import { expect, test } from 'bun:test';
import { ScrollableTextViewport } from './ScrollableTextViewport';

test('scrollable text viewport remains constructible through its class seam', () => {
  expect(ScrollableTextViewport.Class).toBeDefined();
});
