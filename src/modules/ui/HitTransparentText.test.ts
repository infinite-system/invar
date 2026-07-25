import { expect, test } from 'bun:test';
import { HitTransparentText } from './HitTransparentText';

test('hit-transparent text remains constructible through its class seam', () => {
  expect(HitTransparentText.Class).toBeDefined();
});
