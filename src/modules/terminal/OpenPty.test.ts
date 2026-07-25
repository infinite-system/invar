import { expect, test } from 'bun:test';
import { OpenPty } from './OpenPty';

test('the PTY resource publishes its plain construction seam', () => {
  expect(OpenPty.Class).toBe(OpenPty.$Class);
});
