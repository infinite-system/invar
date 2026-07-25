import { expect, test } from 'bun:test';
import { CliStreamBackend } from './CliStreamBackend';

test('a disposed CLI backend ignores later sends', () => {
  const backend = new CliStreamBackend.Class({ claudePath: '/missing/claude' });
  const events: unknown[] = [];
  backend.onEvent((event) => events.push(event));

  backend.dispose();
  backend.send('ignored');

  expect(events).toEqual([]);
});
