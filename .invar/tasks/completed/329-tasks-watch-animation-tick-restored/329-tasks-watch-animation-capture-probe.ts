#!/usr/bin/env bun
// This probe captures the real tasks:watch byte stream through a PTY after its initial data frame.
// Run it from the repository root:
//   bun .invar/tasks/in-progress/329-tasks-watch-animation-tick-restored/329-tasks-watch-animation-capture-probe.ts 100 30
// The output reports animation frame count, cadence, bytes per frame, bracket counts, fingerprints,
// full-clear count, and the idle renderer's write and timer counts. A healthy live capture has
// changing fingerprints, matched DEC 2026 brackets, bounded row diffs, and no task-tree data change.
import { join } from 'node:path';
import { Static } from 'ivue/extras';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';
import { TasksWatchRenderer } from '../../../../scripts/tasks/TasksWatchRenderer';
import { tasksTreeStamp } from '../../../../scripts/tasks/tasks-status';

class $TasksWatchAnimationCaptureProbe {
  protected static get REQUIRED_ANIMATION_FRAMES(): number {
    return 24;
  }

  static async main(argumentsList: readonly string[]): Promise<void> {
    const columns = this.positiveInteger(argumentsList[0], 100);
    const rows = this.positiveInteger(argumentsList[1], 30);
    const repositoryRoot = join(import.meta.dir, '../../../..');
    const tasksRoot = join(repositoryRoot, '.invar', 'tasks');
    const taskTreeStampBeforeCapture = tasksTreeStamp(tasksRoot);
    const driver = new PtyTestDriver.Class({
      workspaceRoot: repositoryRoot,
      repositoryRoot,
      columns,
      rows,
      command: ['bash', '-lc', 'exec bun scripts/tasks/tasks-status.ts watch'],
      retainFullOutput: true,
    });

    try {
      await driver.awaitSnapshot(
        (snapshot) => snapshot.findText('INVAR TASKS') !== null,
        10_000,
      );
      const observationStart = driver.completedFrameObservationCount;
      const previousObservedByteCount =
        driver.completedFrameObservationsSince(0).at(-1)?.completedFrame
          .observedByteCount ?? 0;
      const synchronizedBeginCountBefore =
        driver.outputSequenceCount('\x1b[?2026h');
      const synchronizedEndCountBefore =
        driver.outputSequenceCount('\x1b[?2026l');
      const fullClearCountBefore =
        driver.outputSequenceCount('\x1b[2J') +
        driver.outputSequenceCount('\x1b[0J');
      const alternateScreenEntryCountBefore =
        driver.outputSequenceCount('\x1b[?1049h');

      await driver.awaitOutputCondition(
        `${this.REQUIRED_ANIMATION_FRAMES} animation frames complete`,
        () =>
          driver.completedFrameObservationCount - observationStart >=
          this.REQUIRED_ANIMATION_FRAMES,
        5_000,
      );

      const observations =
        driver.completedFrameObservationsSince(observationStart);
      const frameByteCounts: number[] = [];
      let lastObservedByteCount = previousObservedByteCount;
      const motionFingerprints = new Set<string>();
      for (const observation of observations) {
        frameByteCounts.push(
          observation.completedFrame.observedByteCount - lastObservedByteCount,
        );
        lastObservedByteCount = observation.completedFrame.observedByteCount;
        const textRows = observation.snapshot.textRows();
        HarnessSmoke.Class.requireCondition(
          textRows.some((line) => line.includes('INVAR TASKS')),
          'every animation frame keeps the complete dashboard header',
        );
        const motionLine = textRows.find(
          (line) => line.includes('building') || line.includes('exploring'),
        );
        if (motionLine !== undefined) {
          motionFingerprints.add(motionLine.trim());
        }
      }

      const synchronizedBeginCount =
        driver.outputSequenceCount('\x1b[?2026h') -
        synchronizedBeginCountBefore;
      const synchronizedEndCount =
        driver.outputSequenceCount('\x1b[?2026l') - synchronizedEndCountBefore;
      const fullClearCount =
        driver.outputSequenceCount('\x1b[2J') +
        driver.outputSequenceCount('\x1b[0J') -
        fullClearCountBefore;
      const alternateScreenEntryCount =
        driver.outputSequenceCount('\x1b[?1049h') -
        alternateScreenEntryCountBefore;
      const firstTimestamp =
        observations[0]?.completedFrame.byteArrivalTimestampMilliseconds ?? 0;
      const lastTimestamp =
        observations.at(-1)?.completedFrame.byteArrivalTimestampMilliseconds ??
        firstTimestamp;
      const captureDurationMilliseconds = lastTimestamp - firstTimestamp;
      const framesPerSecond =
        observations.length > 1 && captureDurationMilliseconds > 0
          ? ((observations.length - 1) * 1_000) / captureDurationMilliseconds
          : 0;
      const minimumFrameBytes = Math.min(...frameByteCounts);
      const maximumFrameBytes = Math.max(...frameByteCounts);
      const taskTreeStampAfterCapture = tasksTreeStamp(tasksRoot);

      HarnessSmoke.Class.requireCondition(
        taskTreeStampAfterCapture === taskTreeStampBeforeCapture,
        'the task tree stays unchanged throughout the animation capture',
      );
      HarnessSmoke.Class.requireCondition(
        motionFingerprints.size > 1,
        `the live motion fingerprint advances (${motionFingerprints.size} distinct)`,
      );
      HarnessSmoke.Class.requireCondition(
        synchronizedBeginCount === observations.length &&
          synchronizedEndCount === observations.length,
        `each animation frame has one matched DEC 2026 bracket ` +
          `(${synchronizedBeginCount}/${synchronizedEndCount} for ${observations.length})`,
      );
      HarnessSmoke.Class.requireCondition(
        fullClearCount === 0,
        'animation frames emit no CSI full clear',
      );
      HarnessSmoke.Class.requireCondition(
        alternateScreenEntryCount === 0,
        'animation frames do not re-enter the alternate screen',
      );
      HarnessSmoke.Class.requireCondition(
        maximumFrameBytes < 2_048,
        `animation frame bytes stay bounded below 2,048 (${maximumFrameBytes})`,
      );

      const idleOutputs: string[] = [];
      let idleScheduledTimerCount = 0;
      const idleRenderer = new TasksWatchRenderer.Class({
        writeOutput: (output) => idleOutputs.push(output),
        nowMilliseconds: () => 0,
        scheduleTimer: () => {
          idleScheduledTimerCount += 1;
          return idleScheduledTimerCount as unknown as ReturnType<
            typeof setTimeout
          >;
        },
      });
      idleRenderer.renderDataFrame(['INVAR TASKS', 'ready'], null, true);
      idleOutputs.length = 0;
      idleRenderer.renderDataFrame(['INVAR TASKS', 'ready'], null, false);

      HarnessSmoke.Class.requireCondition(
        idleOutputs.length === 0,
        'the settled idle dashboard capture contains zero writes',
      );
      HarnessSmoke.Class.requireCondition(
        idleScheduledTimerCount === 0,
        'the settled idle dashboard schedules zero animation timers',
      );

      console.log(`geometry=${columns}x${rows}`);
      console.log(`animationFrames=${observations.length}`);
      console.log(`animationFps=${framesPerSecond.toFixed(1)}`);
      console.log(`frameBytes=${minimumFrameBytes}-${maximumFrameBytes}`);
      console.log(
        `dec2026Brackets=${synchronizedBeginCount}/${synchronizedEndCount}`,
      );
      console.log(`motionFingerprints=${motionFingerprints.size}`);
      console.log(`fullClears=${fullClearCount}`);
      console.log(`alternateScreenEntries=${alternateScreenEntryCount}`);
      console.log(
        `taskTreeChanged=${taskTreeStampAfterCapture !== taskTreeStampBeforeCapture}`,
      );
      console.log(`idleWrites=${idleOutputs.length}`);
      console.log(`idleAnimationTimers=${idleScheduledTimerCount}`);
    } finally {
      await driver.dispose();
    }
  }

  protected static positiveInteger(
    value: string | undefined,
    fallback: number,
  ): number {
    const parsedValue = Number(value ?? fallback);
    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      throw new Error(`Expected a positive integer, received ${String(value)}`);
    }
    return parsedValue;
  }
}

export namespace TasksWatchAnimationCaptureProbe {
  export const $Class = Static($TasksWatchAnimationCaptureProbe);
  export let Class = $Class;
}

await TasksWatchAnimationCaptureProbe.Class.main(process.argv.slice(2));
