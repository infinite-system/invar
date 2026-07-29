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

test('child exit completes a codex turn even while stdout never closes', async () => {
  class ExitFirstCodexStreamBackend extends CodexStreamBackend.$Class {
    protected override spawn(_argumentsAfterExecutable: string[]) {
      return {
        stdout: {
          async *[Symbol.asyncIterator]() {
            await new Promise<void>(() => {});
          },
        },
        stderr: null,
        exited: Promise.resolve(0),
        kill: () => {},
      } as never;
    }
  }
  const backend = new ExitFirstCodexStreamBackend({
    codexPath: 'unused',
  });
  const events: unknown[] = [];
  backend.onEvent((event) => events.push(event));

  backend.send('hang');
  await Bun.sleep(0);

  expect(events).toContainEqual({
    kind: 'session-end',
    reason: 'completed',
  });
});
