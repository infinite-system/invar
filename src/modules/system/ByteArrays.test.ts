import { expect, test } from 'bun:test';
import { ByteArrays } from './ByteArrays';

test('byte equality compares length and every byte', () => {
  expect(ByteArrays.Class.equal(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(
    true,
  );
  expect(ByteArrays.Class.equal(Uint8Array.of(1, 2), Uint8Array.of(1))).toBe(
    false,
  );
  expect(ByteArrays.Class.equal(Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(
    false,
  );
});
