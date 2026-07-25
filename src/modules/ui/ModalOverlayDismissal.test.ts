import { expect, test } from 'bun:test';
import { ModalOverlayDismissal } from './ModalOverlayDismissal';

test('modal outside dismissal publishes one shared construction seam', () => {
  expect(ModalOverlayDismissal.Class).toBeDefined();
});
