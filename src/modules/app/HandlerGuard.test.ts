import { expect, test } from 'bun:test';
import { HandlerGuard } from './HandlerGuard';

test('a throw inside a guarded handler is isolated and recover still runs', () => {
  let recovered = false;
  HandlerGuard.Class.run(
    'focus',
    () => {
      throw new Error('mid-handler failure');
    },
    () => {
      recovered = true;
    },
  );

  expect(recovered).toBe(true);
});
