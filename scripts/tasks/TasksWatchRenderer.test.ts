import { expect, test } from 'bun:test';
import { TasksWatchRenderer } from './TasksWatchRenderer';

test('the first dashboard frame enters the alternate screen inside DEC 2026', () => {
  const output = TasksWatchRenderer.Class.frame(
    [],
    ['INVAR TASKS', 'ready'],
    true,
  );
  expect(output.startsWith('\x1b[?2026h\x1b[?1049h\x1b[?25l\x1b[H')).toBe(true);
  expect(output).toContain('\x1b[1;1HINVAR TASKS\x1b[0K');
  expect(output).toContain('\x1b[2;1Hready\x1b[0K');
  expect(output.endsWith('\x1b[?2026l')).toBe(true);
  expect(output).not.toContain('\x1b[2J');
});

test('a diff frame writes only changed and removed rows', () => {
  const output = TasksWatchRenderer.Class.frame(
    ['INVAR TASKS', 'building', 'old tail'],
    ['INVAR TASKS', 'ready'],
    false,
  );
  expect(output).not.toContain('\x1b[1;1H');
  expect(output).toContain('\x1b[2;1Hready\x1b[0K');
  expect(output).toContain('\x1b[3;1H\x1b[0K');
  expect(output).not.toContain('building');
  expect(output).not.toContain('old tail');
});

test('an unchanged dashboard produces no terminal write', () => {
  expect(
    TasksWatchRenderer.Class.frame(
      ['INVAR TASKS', 'ready'],
      ['INVAR TASKS', 'ready'],
      false,
    ),
  ).toBe('');
});

test('screen restoration is one synchronized update', () => {
  expect(TasksWatchRenderer.Class.restoreScreen()).toBe(
    '\x1b[?2026h\x1b[?25h\x1b[?1049l\x1b[?2026l',
  );
});
