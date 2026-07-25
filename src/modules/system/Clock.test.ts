import { expect, test } from 'bun:test';
import { Clock } from './Clock';

test('freeze replaces and restores the time source through the capability seam', () => {
  try {
    Clock.Class.freeze(() => 1234);
    expect(Clock.Class.now()).toBe(1234);
  } finally {
    Clock.Class.freeze(null);
  }
});
