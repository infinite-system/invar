import { expect, test } from 'bun:test';
import { TasksWatchRenderer } from './TasksWatchRenderer';
import {
  TASKS_BUILDING_BREATH_FRAMES,
  TASKS_MOTION_STEP_MILLISECONDS,
  TASKS_MOTION_STEPS_PER_SECOND,
  tasksMotionStepAtElapsed,
} from './tasks-status';

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

test('data rows are clipped to terminal columns before diffing', () => {
  const outputs: string[] = [];
  const renderer = new TasksWatchRenderer.Class({
    writeOutput: (output) => outputs.push(output),
    terminalColumns: () => 12,
  });

  renderer.renderDataFrame(
    ['stable', '\x1b[31m123456789012PHANTOM-TAIL\x1b[0m'],
    null,
    true,
  );
  expect(outputs[0]).toContain('\x1b[2;1H\x1b[31m123456789012\x1b[0m\x1b[0K');
  expect(outputs[0]).not.toContain('PHANTOM-TAIL');

  outputs.length = 0;
  renderer.renderDataFrame(
    ['stable', '\x1b[31m123456789012DIFFERENT-HIDDEN-TAIL\x1b[0m'],
    null,
    false,
  );
  expect(outputs).toEqual([]);
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
    (animationElapsedMilliseconds) => {
      animationRows[0]!.line = `spinner-${Math.round(animationElapsedMilliseconds)}`;
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
  expect(renderer.animationElapsedMilliseconds).toBeCloseTo(1_000 / 60, 6);
  expect(outputs).toEqual([
    '\x1b[?2026h\x1b[H\x1b[2;1Hspinner-17\x1b[0K\x1b[?2026l',
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
    (animationElapsedMilliseconds) => {
      animationRows[0]!.line = `spinner-${Math.round(animationElapsedMilliseconds)}`;
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
  expect(outputs).toEqual([
    '\x1b[?2026h\x1b[H\x1b[1;1Hspinner-117\x1b[0K\x1b[?2026l',
  ]);
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

test('the motion phase is a pure function of elapsed time', () => {
  expect(TASKS_MOTION_STEPS_PER_SECOND).toBe(6);
  expect(TASKS_MOTION_STEP_MILLISECONDS).toBeCloseTo(166.667, 3);
  expect(tasksMotionStepAtElapsed(0)).toBe(0);
  expect(tasksMotionStepAtElapsed(166)).toBe(0);
  expect(tasksMotionStepAtElapsed(167)).toBe(1);
  expect(tasksMotionStepAtElapsed(1_000)).toBe(6);
  expect(tasksMotionStepAtElapsed(2_000)).toBe(12);
  // Twelve breath frames in about two seconds: the speed the tables were drawn for.
  expect(
    2_000 /
      (TASKS_BUILDING_BREATH_FRAMES.length * TASKS_MOTION_STEP_MILLISECONDS),
  ).toBeCloseTo(1, 6);
  // Both polarities: time never runs backwards into a negative step, and an
  // absent clock reads as the first step rather than as NaN.
  expect(tasksMotionStepAtElapsed(-1_000)).toBe(0);
  expect(tasksMotionStepAtElapsed(Number.NaN)).toBe(0);
});

test('the motion phase at a moment is the same at 30 FPS and at 60 FPS', () => {
  const observationSeconds = 4;
  const phaseAtSampleRate = (framesPerSecond: number): Map<number, number> => {
    const frameMilliseconds = 1_000 / framesPerSecond;
    const phaseByTimestamp = new Map<number, number>();
    for (
      let animationFrame = 0;
      animationFrame <= framesPerSecond * observationSeconds;
      animationFrame += 1
    ) {
      const elapsedMilliseconds = animationFrame * frameMilliseconds;
      phaseByTimestamp.set(
        elapsedMilliseconds,
        tasksMotionStepAtElapsed(elapsedMilliseconds),
      );
    }
    return phaseByTimestamp;
  };

  const phaseAtThirty = phaseAtSampleRate(30);
  const phaseAtSixty = phaseAtSampleRate(60);
  const phaseAtOneHundredTwenty = phaseAtSampleRate(120);

  // Every moment the slower rate observes, the faster rates paint identically.
  for (const [elapsedMilliseconds, phase] of phaseAtThirty) {
    expect(phaseAtSixty.get(elapsedMilliseconds)).toBe(phase);
    expect(phaseAtOneHundredTwenty.get(elapsedMilliseconds)).toBe(phase);
  }
  // And the animation covers the same distance whatever the sampling: doubling
  // the frame rate must add smoothness, never speed.
  const highestPhase = (phases: Map<number, number>): number =>
    Math.max(...phases.values());
  expect(highestPhase(phaseAtSixty)).toBe(highestPhase(phaseAtThirty));
  expect(highestPhase(phaseAtOneHundredTwenty)).toBe(
    highestPhase(phaseAtThirty),
  );
  expect(highestPhase(phaseAtThirty)).toBe(24);
});

test('the animation row content depends on the clock, not on the frame ordinal', () => {
  const paintedPhasesAtFrameRate = (
    framesPerSecond: number,
  ): Array<[number, number]> => {
    let nowMilliseconds = 0;
    let scheduledCallback: (() => void) | null = null;
    const frameMilliseconds = 1_000 / framesPerSecond;
    const painted: Array<[number, number]> = [];
    const renderer = new TasksWatchRenderer.Class({
      writeOutput: () => {},
      nowMilliseconds: () => nowMilliseconds,
      scheduleTimer: (callback) => {
        scheduledCallback = callback;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
    });
    renderer.renderDataFrame(
      ['phase-0'],
      (animationElapsedMilliseconds) => [
        {
          rowIndex: 0,
          line: `phase-${tasksMotionStepAtElapsed(animationElapsedMilliseconds)}`,
        },
      ],
      true,
    );
    for (
      let animationFrame = 1;
      animationFrame <= framesPerSecond * 2;
      animationFrame += 1
    ) {
      nowMilliseconds = animationFrame * frameMilliseconds;
      const dueCallback = scheduledCallback as unknown as () => void;
      scheduledCallback = null;
      dueCallback();
      painted.push([
        nowMilliseconds,
        tasksMotionStepAtElapsed(renderer.animationElapsedMilliseconds),
      ]);
    }
    return painted;
  };

  const paintedAtThirty = paintedPhasesAtFrameRate(30);
  const paintedAtSixty = new Map(paintedPhasesAtFrameRate(60));

  expect(paintedAtThirty.length).toBe(60);
  expect(paintedAtSixty.size).toBe(120);
  for (const [elapsedMilliseconds, phase] of paintedAtThirty) {
    expect(paintedAtSixty.get(elapsedMilliseconds)).toBe(phase);
  }
  // One breath, twelve steps, in the two seconds both rates observed.
  expect(paintedAtThirty.at(-1)?.[1]).toBe(TASKS_BUILDING_BREATH_FRAMES.length);
});

test('screen restoration is one synchronized update', () => {
  expect(TasksWatchRenderer.Class.restoreScreen()).toBe(
    '\x1b[?2026h\x1b[?25h\x1b[?1049l\x1b[?2026l',
  );
});
