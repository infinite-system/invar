import { expect, test } from 'bun:test';
import { HoverCard } from './HoverCard';

test('hover card behavior remains constructible through its class seam', () => {
  expect(HoverCard.Class).toBeDefined();
});
