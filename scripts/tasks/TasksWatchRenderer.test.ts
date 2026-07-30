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

test('a live animation advances from its own 60 FPS clock without a data tick', () => {
  let nowMilliseconds = 0;
  let scheduledCallback: (() => void) | null = null;
  let scheduledTimerCount = 0;
  const scheduledDelays: number[] = [];
  const outputs: string[] = [];
  const animationRows = [{ rowIndex: 1, line: 'spinner-0' }];
  const renderer = new TasksWatchRenderer.Class({
    writeOutput: (output) => outputs.push(output),
    nowMilliseconds: () => nowMilliseconds,
    scheduleTimer: (callback, delayMilliseconds) => {
      scheduledCallback = callback;
      scheduledDelays.push(delayMilliseconds);
      scheduledTimerCount += 1;
      return scheduledTimerCount as unknown as ReturnType<typeof setTimeout>;
    },
  });

  renderer.renderDataFrame(
    ['stable header', 'spinner-0', 'stable footer'],
    (animationFrame) => {
      animationRows[0]!.line = `spinner-${animationFrame}`;
      return animationRows;
    },
    true,
  );
  outputs.length = 0;

  expect(scheduledDelays).toEqual([17]);
  nowMilliseconds = 17;
  const firstAnimationCallback = scheduledCallback as unknown as () => void;
  scheduledCallback = null;
  firstAnimationCallback();

  expect(renderer.animationFrame).toBe(1);
  expect(outputs).toEqual([
    '\x1b[?2026h\x1b[H\x1b[2;1Hspinner-1\x1b[0K\x1b[?2026l',
  ]);
  expect(outputs[0]).not.toContain('stable header');
  expect(outputs[0]).not.toContain('stable footer');
  expect(scheduledDelays).toEqual([17, 17]);
});

test('a delayed animation callback skips missed frames and never queues them', () => {
  let nowMilliseconds = 0;
  let scheduledCallback: (() => void) | null = null;
  let scheduledTimerCount = 0;
  const outputs: string[] = [];
  const animationRows = [{ rowIndex: 0, line: 'spinner-0' }];
  const renderer = new TasksWatchRenderer.Class({
    writeOutput: (output) => outputs.push(output),
    nowMilliseconds: () => nowMilliseconds,
    scheduleTimer: (callback) => {
      scheduledCallback = callback;
      scheduledTimerCount += 1;
      return scheduledTimerCount as unknown as ReturnType<typeof setTimeout>;
    },
  });

  renderer.renderDataFrame(
    ['spinner-0'],
    (animationFrame) => {
      animationRows[0]!.line = `spinner-${animationFrame}`;
      return animationRows;
    },
    true,
  );
  outputs.length = 0;
  nowMilliseconds = 117;
  const delayedAnimationCallback = scheduledCallback as unknown as () => void;
  scheduledCallback = null;
  delayedAnimationCallback();

  expect(renderer.animationFrame).toBe(7);
  expect(outputs).toHaveLength(1);
  expect(outputs[0]).toContain('spinner-7');
  expect(outputs[0]).not.toContain('spinner-1');
  expect(scheduledTimerCount).toBe(2);
});

test('an idle dashboard schedules no animation wake and writes nothing', () => {
  let scheduledTimerCount = 0;
  const outputs: string[] = [];
  const renderer = new TasksWatchRenderer.Class({
    writeOutput: (output) => outputs.push(output),
    nowMilliseconds: () => 0,
    scheduleTimer: () => {
      scheduledTimerCount += 1;
      return scheduledTimerCount as unknown as ReturnType<typeof setTimeout>;
    },
  });

  renderer.renderDataFrame(['stable header', 'ready'], null, true);
  outputs.length = 0;
  renderer.renderDataFrame(['stable header', 'ready'], null, false);

  expect(scheduledTimerCount).toBe(0);
  expect(outputs).toEqual([]);
});

test('one animation row has bounded output at a large dashboard scale', () => {
  const previousLines = Array.from(
    { length: 100_000 },
    (_, rowIndex) => `stable-${rowIndex}`,
  );
  const output = TasksWatchRenderer.Class.animationFrameOutput(previousLines, [
    { rowIndex: 99_999, line: 'spinner-next' },
  ]);

  expect(output).toBe(
    '\x1b[?2026h\x1b[H\x1b[100000;1Hspinner-next\x1b[0K\x1b[?2026l',
  );
  expect(new TextEncoder().encode(output).length).toBeLessThan(64);
  expect(output).not.toContain('\x1b[2J');
});

test('screen restoration is one synchronized update', () => {
  expect(TasksWatchRenderer.Class.restoreScreen()).toBe(
    '\x1b[?2026h\x1b[?25h\x1b[?1049l\x1b[?2026l',
  );
});
