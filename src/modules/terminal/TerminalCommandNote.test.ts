import { expect, test } from 'bun:test';
import { TerminalCommandNote } from './TerminalCommandNote';

test('every command event kind states where it ran and what it did', () => {
  expect(
    TerminalCommandNote.Class.textFor({
      kind: 'staged',
      command: 'ls -la',
      currentWorkingDirectory: '/srv/project',
    }),
  ).toBe(
    'terminal command staged at /srv/project — edit it, press Enter to execute, or Ctrl+C to reject: ls -la',
  );
  expect(
    TerminalCommandNote.Class.textFor({
      kind: 'replaced-then-staged',
      command: 'ls -la',
      replacedCommand: 'ls -l',
      currentWorkingDirectory: '/srv/project',
    }),
  ).toBe(
    'terminal command replaced-then-staged at /srv/project\n- ls -l\n+ ls -la',
  );
  expect(
    TerminalCommandNote.Class.textFor({
      kind: 'user-edited-then-executed',
      command: 'ls -l',
      executedCommand: 'ls -la',
    }),
  ).toBe('terminal command user-edited-then-executed\n- ls -l\n+ ls -la');
  expect(
    TerminalCommandNote.Class.textFor({
      kind: 'rejected',
      command: 'rm -rf /',
    }),
  ).toBe('terminal command rejected with Ctrl+C: rm -rf /');
});

test('a missing working directory is named rather than left blank', () => {
  // An unknown cwd must still read as a sentence — a blank would look like a rendering bug.
  expect(
    TerminalCommandNote.Class.textFor({
      kind: 'agent-executed',
      command: 'bun test',
      currentWorkingDirectory: '',
    }),
  ).toBe('terminal command agent-executed at unknown cwd: bun test');
  expect(
    TerminalCommandNote.Class.textFor({
      kind: 'pending',
      command: 'bun test',
      execution: 'stage',
      currentWorkingDirectory: '',
    }),
  ).toBe(
    'terminal command pending at unknown cwd — waiting for an idle prompt: bun test',
  );
});
