import { expect, test } from 'bun:test';
import { OverlayLayer } from './OverlayLayer';

test('overlay projection remains constructible through its class seam', () => {
  expect(OverlayLayer.Class).toBeDefined();
});
