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

test('child exit completes a CLI turn even while stdout never closes', async () => {
  class ExitFirstCliStreamBackend extends CliStreamBackend.$Class {
    protected override spawn(_argumentsAfterExecutable: string[]) {
      return {
        stdout: {
          async *[Symbol.asyncIterator]() {
            await new Promise<void>(() => {});
          },
        },
        stderr: null,
        exited: Promise.resolve(17),
        kill: () => {},
      } as never;
    }
  }
  const backend = new ExitFirstCliStreamBackend({
    claudePath: 'unused',
  });
  const events: unknown[] = [];
  backend.onEvent((event) => events.push(event));

  backend.send('hang');
  await Bun.sleep(0);

  expect(events).toContainEqual({ kind: 'session-end', reason: 'error' });
});

test('the CLI spawn appends the workspace IBR file prompt', async () => {
  const capturedArguments: string[][] = [];
  class CapturingCliStreamBackend extends CliStreamBackend.$Class {
    protected override spawn(argumentsAfterExecutable: string[]) {
      capturedArguments.push(argumentsAfterExecutable);
      return {
        stdout: {
          async *[Symbol.asyncIterator]() {},
        },
        stderr: null,
        exited: Promise.resolve(0),
        kill: () => {},
      } as never;
    }
  }
  const backend = new CapturingCliStreamBackend({
    claudePath: 'unused',
    ibrFoundationPath: '/workspace/.claude/skills/ibr/IBR.md',
  });

  backend.send('hello');
  await Bun.sleep(0);

  expect(capturedArguments[0]).toContain('--append-system-prompt-file');
  const flagIndex = capturedArguments[0]!.indexOf(
    '--append-system-prompt-file',
  );
  expect(capturedArguments[0]?.[flagIndex + 1]).toBe(
    '/workspace/.claude/skills/ibr/IBR.md',
  );
});

test('the CLI spawn omits the IBR flag when the workspace has no file', async () => {
  let capturedArguments: string[] = [];
  class CapturingCliStreamBackend extends CliStreamBackend.$Class {
    protected override spawn(argumentsAfterExecutable: string[]) {
      capturedArguments = argumentsAfterExecutable;
      return {
        stdout: {
          async *[Symbol.asyncIterator]() {},
        },
        stderr: null,
        exited: Promise.resolve(0),
        kill: () => {},
      } as never;
    }
  }
  const backend = new CapturingCliStreamBackend({
    claudePath: 'unused',
  });

  backend.send('hello');
  await Bun.sleep(0);

  expect(capturedArguments).not.toContain('--append-system-prompt-file');
});
