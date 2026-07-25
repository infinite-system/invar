import { expect, test } from 'bun:test';
import { Logging } from './Logging';

test('the logger publishes its artifact path through the capability seam', () => {
  expect(Logging.Class.path).toBe('artifacts/tui.log');
});
