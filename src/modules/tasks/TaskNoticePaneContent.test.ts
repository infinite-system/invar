import { expect, test } from 'bun:test';
import { ThemePalettes } from '../theme/ThemePalettes';
import type { PaneRenderContext } from '../ui/PaneContent.interface';
import { TaskNoticePaneContent } from './TaskNoticePaneContent';

test('a task notice keeps its label, severity, and message visible', () => {
  const notice = new TaskNoticePaneContent.Class({
    identifier: 'task:%2Fworkspace:2:notice',
    label: 'Unsupported Process',
    message: 'unsupported type "process"',
    severity: 'error',
  });

  const projection = notice.render({
    palette: ThemePalettes.Class.DARK,
    width: 80,
    height: 12,
    focused: true,
  } as PaneRenderContext) as unknown as {
    chunks: Array<{ text: string }>;
  };

  expect(notice.kind).toBe('task-notice');
  expect(notice.instanceLabel).toBe('Unsupported Process');
  expect(projection.chunks.map((chunk) => chunk.text).join('')).toContain(
    'Error\n\n   Unsupported Process\n\n   unsupported type "process"',
  );
});
