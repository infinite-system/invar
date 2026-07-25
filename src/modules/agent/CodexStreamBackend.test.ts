import { expect, test } from 'bun:test';
import { CodexStreamBackend } from './CodexStreamBackend';

test('a disposed codex stream backend ignores later sends', () => {
  const backend = new CodexStreamBackend.Class({ codexPath: '/missing/codex' });
  const events: unknown[] = [];
  backend.onEvent((event) => events.push(event));

  backend.dispose();
  backend.send('ignored');

  expect(events).toEqual([]);
});
