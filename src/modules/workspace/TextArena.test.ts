import { expect, test } from 'bun:test';
import { TextArena, type TextArenaSlice } from './TextArena';

test('an arena stores UTF-8 bytes and protects them from caller mutation', () => {
  const arena = new TextArena.Class();
  const slice = arena.store('A🙂B');
  expect(arena.text(slice)).toBe('A🙂B');
  expect(arena.byteLength).toBe(new TextEncoder().encode('A🙂B').byteLength);
  const callerBytes = arena.bytes(slice);
  callerBytes[0] = 'Z'.charCodeAt(0);
  expect(arena.text(slice)).toBe('A🙂B');
});

test('interning repeated replacement text retains one copy', () => {
  const arena = new TextArena.Class();
  const first = arena.intern('shared replacement');
  const second = arena.intern('shared replacement');
  expect(second).toBe(first);
  expect(arena.byteLength).toBe(
    new TextEncoder().encode('shared replacement').byteLength,
  );
});

test('the one-copy check rejects a planted second replacement copy', () => {
  const replacement = new TextEncoder().encode('shared replacement');
  const arena = new TextArena.Class();
  const first = arena.store(replacement);
  const plantedSecondCopy = arena.store(replacement);

  const requireOneStoredCopy = (slices: readonly TextArenaSlice[]): void => {
    const uniqueLocations = new Set(
      slices.map(
        (slice) => `${slice.slabIndex}:${slice.byteOffset}:${slice.byteLength}`,
      ),
    );
    if (uniqueLocations.size !== 1) {
      throw new Error('Replacement bytes were stored more than once.');
    }
  };

  expect(() => requireOneStoredCopy([first, plantedSecondCopy])).toThrow(
    'Replacement bytes were stored more than once.',
  );
});
