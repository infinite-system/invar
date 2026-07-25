import { expect, test } from 'bun:test';
import { OpenPtyBackend } from './OpenPtyBackend';

test('the live backend publishes its plain construction seam', () => {
  expect(OpenPtyBackend.Class).toBe(OpenPtyBackend.$Class);
});
