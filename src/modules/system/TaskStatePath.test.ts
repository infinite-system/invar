import { expect, test } from 'bun:test';
import { TaskStatePath } from './TaskStatePath';

test('task state paths keep the task folder and file tail across state alternatives', () => {
  const movedPath =
    '/workspace/.invar/tasks/active/291-task-links-survive-state-moves/report-291-task-links-survive-state-moves.md';

  expect(TaskStatePath.Class.match(movedPath)).toEqual({
    prefix: '/workspace/',
    state: 'active',
    taskFolderName: '291-task-links-survive-state-moves',
    taskRelativePath: 'report-291-task-links-survive-state-moves.md',
  });
  expect(TaskStatePath.Class.alternateStatePaths(movedPath)).toEqual([
    '/workspace/.invar/tasks/in-progress/291-task-links-survive-state-moves/report-291-task-links-survive-state-moves.md',
    '/workspace/.invar/tasks/completed/291-task-links-survive-state-moves/report-291-task-links-survive-state-moves.md',
    '/workspace/.invar/tasks/retired/291-task-links-survive-state-moves/report-291-task-links-survive-state-moves.md',
  ]);
});

test('paths outside a shaped task-state folder have no state alternatives', () => {
  expect(
    TaskStatePath.Class.alternateStatePaths(
      '/workspace/src/task-291-task-links-survive-state-moves.md',
    ),
  ).toEqual([]);
  expect(
    TaskStatePath.Class.alternateStatePaths(
      '/workspace/.invar/tasks/active/not-a-number/task.md',
    ),
  ).toEqual([]);
  expect(
    TaskStatePath.Class.alternateStatePaths(
      '/workspace/.invar/tasks/archive/291-task-links-survive-state-moves/task.md',
    ),
  ).toEqual([]);
});
