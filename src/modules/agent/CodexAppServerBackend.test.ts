import { expect, test } from 'bun:test';
import { CodexAppServerBackend } from './CodexAppServerBackend';

test('a disposed app-server backend ignores later sends', () => {
  const backend = new CodexAppServerBackend.Class({
    codexPath: '/missing/codex',
  });
  const events: unknown[] = [];
  backend.onEvent((event) => events.push(event));

  backend.dispose();
  backend.send('ignored');

  expect(events).toEqual([]);
});
