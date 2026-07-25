import { expect, test } from 'bun:test';
import { ScrollGesture } from './ScrollGesture';

test('scroll gestures remain available through their static class seam', () => {
  expect(ScrollGesture.Class.wheelStep).toBeFunction();
});
