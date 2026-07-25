import { expect, test } from 'bun:test';
import { OverlayCloseButton } from './OverlayCloseButton';

test('overlay close controls publish one shared construction seam', () => {
  expect(OverlayCloseButton.Class).toBeDefined();
});
