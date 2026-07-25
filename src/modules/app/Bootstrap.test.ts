import { expect, test } from 'bun:test';
import { Bootstrap } from './Bootstrap';

test('boot is published through the static capability seam', () => {
  expect(Bootstrap.Class.boot).toBeFunction();
});
