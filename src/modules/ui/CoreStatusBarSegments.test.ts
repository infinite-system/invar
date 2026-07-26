import { expect, test } from 'bun:test';
import { CoreStatusBarSegments } from './CoreStatusBarSegments';

test('core status segments remain a standalone contribution', () => {
  expect(typeof CoreStatusBarSegments.Class.segments).toBe('function');
});
