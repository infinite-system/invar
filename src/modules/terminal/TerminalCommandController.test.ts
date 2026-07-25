import { expect, test } from 'bun:test';
import {
  TerminalCommandController,
  type TerminalCommandEvent,
  type TerminalCommandScheduler,
} from './TerminalCommandController';

class ControllableScheduler implements TerminalCommandScheduler {
  callbacks: Array<() => void> = [];

  setTimeout(callback: () => void): unknown {
    this.callbacks.push(callback);
    return callback;
  }

  clearTimeout(handle: unknown): void {
    this.callbacks = this.callbacks.filter((callback) => callback !== handle);
  }

  runAll(): void {
    while (this.callbacks.length > 0) this.callbacks.shift()?.();
  }
}

function controllerFixture(options: { idle?: boolean; reducedMotion?: boolean } = {}) {
  const writes: string[] = [];
  const events: TerminalCommandEvent[] = [];
  const scheduler = new ControllableScheduler();
  let idle = options.idle ?? true;
  let inputLine = '';
  const controller = new TerminalCommandController.Class({
    write: (data) => writes.push(data),
    submit: () => writes.push('\r'),
    isPromptIdle: () => idle,
    currentInputLine: () => inputLine,
    currentWorkingDirectory: () => '/workspace',
    typingSpeed: () => 40,
    reducedMotion: () => options.reducedMotion ?? false,
    random: () => 0.5,
    scheduler,
  });
  controller.onEvent((event) => events.push(event));
  return {
    controller,
    events,
    scheduler,
    writes,
    setIdle: (nextIdle: boolean) => {
      idle = nextIdle;
    },
    setInputLine: (nextInputLine: string) => {
      inputLine = nextInputLine;
    },
  };
}

test('staging sanitizes the full payload and never writes a newline', async () => {
  const fixture = controllerFixture();
  const completion = fixture.controller.stageTerminalCommand('printf one\nprintf two');
  fixture.scheduler.runAll();
  await completion;
  expect(fixture.writes.join('')).toBe(
    '\x1b[200~printf oneprintf two\x1b[201~',
  );
  expect(fixture.writes.join('')).not.toContain('\r');
  expect(fixture.events.at(-1)).toEqual({
    kind: 'staged',
    command: 'printf oneprintf two',
    currentWorkingDirectory: '/workspace',
  });
});

test('run emits Enter only after the complete bracketed paste', async () => {
  const fixture = controllerFixture();
  const completion = fixture.controller.runTerminalCommand('printf visible');
  fixture.scheduler.runAll();
  await completion;
  expect(fixture.writes.join('')).toBe(
    '\x1b[200~printf visible\x1b[201~\r',
  );
  expect(fixture.events.at(-1)?.kind).toBe('agent-executed');
});

test('a busy prompt queues and drains only after an idle notification', async () => {
  const fixture = controllerFixture({ idle: false, reducedMotion: true });
  expect(await fixture.controller.stageTerminalCommand('printf queued')).toEqual({
    state: 'queued',
    command: 'printf queued',
  });
  expect(fixture.writes).toEqual([]);
  expect(fixture.events[0]?.kind).toBe('pending');
  fixture.setIdle(true);
  fixture.controller.notifyTerminalChanged();
  expect(fixture.writes.join('')).toBe(
    '\x1b[200~printf queued\x1b[201~',
  );
});

test('user execution records an edit diff and Ctrl+C aborts animated run before Enter', async () => {
  const stagedFixture = controllerFixture({ reducedMotion: true });
  await stagedFixture.controller.stageTerminalCommand('printf original');
  stagedFixture.setInputLine('printf edited');
  stagedFixture.controller.handleUserInput('\r');
  expect(stagedFixture.events.at(-1)).toEqual({
    kind: 'user-edited-then-executed',
    command: 'printf original',
    executedCommand: 'printf edited',
  });

  const animatedFixture = controllerFixture();
  const abortedCompletion = animatedFixture.controller.runTerminalCommand('printf never-runs');
  expect(animatedFixture.controller.handleUserInput('\x03')).toBe(true);
  animatedFixture.scheduler.runAll();
  expect(await abortedCompletion).toEqual({
    state: 'aborted',
    command: 'printf never-runs',
  });
  expect(animatedFixture.writes.join('')).not.toContain('\r');
  expect(animatedFixture.events.at(-1)?.kind).toBe('aborted');
});
