#!/usr/bin/env bun
// This probe measures how FAST the tasks:watch gradients move, in wall-clock time.
//
// It drives the real `bun scripts/tasks/tasks-status.ts watch` inside a PTY, against a
// throwaway FIXTURE ledger (never this repository's real task tree and never a real agent).
// It watches one live motion row and records the moment its painted appearance changes.
// The appearance is the row's glyph plus every foreground colour in it, so a pure colour
// step counts as motion even when no letter changes.
//
// Run it from the repository root:
//   bun .invar/tasks/in-progress/348-tasks-watch-gradients-retuned-60fps/348-tasks-watch-motion-cadence-probe.ts
//   bun .invar/tasks/.../348-tasks-watch-motion-cadence-probe.ts <captureSeconds> <columns> <rows>
//
// How to read the output:
//   motionStepMilliseconds=<median>   wall-clock time one gradient step holds on screen.
//                                     The design speed is 166.7 ms (six steps a second).
//                                     A smaller number means the gradient runs too fast.
//   motionSpeedRatioAgainstDesign=<n> 1.00x is the design speed. 9.96x was the #348 defect.
//   motionCycleSeconds=<n>            time until the row's appearance repeats. A building row
//                                     repeats every 12 steps (~2.0 s); an exploring row every
//                                     24, because its 8 glyphs and its 6 colours only agree
//                                     after 24 steps (~4.0 s).
//   distinctAppearances=<n>           how many different painted appearances were seen.
//   animationFramesPerSecond=<n>      EMITTED frames a second, not timer ticks: an animation
//                                     frame whose row is unchanged writes nothing at all. Once
//                                     the step is time-based this equals the motion step rate,
//                                     which is the write cost the fix removes.
//   paintFramesPerMotionStep=<n>      emitted frames per gradient step. A value above 1 means
//                                     frames are written that carry no motion.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Static } from 'ivue/extras';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';
import type { HarnessSnapshot } from '../../../../scripts/harness/HarnessSnapshot';

class $TasksWatchMotionCadenceProbe {
  /** The design speed the gradient tables were written for: twelve breath steps in about two seconds. */
  protected static get DESIGN_MOTION_STEP_MILLISECONDS(): number {
    return 1_000 / 6;
  }

  static async main(argumentsList: readonly string[]): Promise<void> {
    const captureSeconds = this.positiveNumber(argumentsList[0], 6);
    const columns = this.positiveNumber(argumentsList[1], 110);
    const rows = this.positiveNumber(argumentsList[2], 30);
    const repositoryRoot = join(import.meta.dir, '../../../..');
    const fixtureTasksRoot = this.writeFixtureLedger();

    const driver = new PtyTestDriver.Class({
      workspaceRoot: repositoryRoot,
      repositoryRoot,
      columns,
      rows,
      environment: {
        INVAR_TASKS_ROOT: fixtureTasksRoot,
        COLORTERM: 'truecolor',
      },
      command: [
        'bash',
        '-lc',
        `exec bun ${join(repositoryRoot, 'scripts', 'tasks', 'tasks-status.ts')} watch`,
      ],
    });

    try {
      await driver.awaitSnapshot(
        (snapshot) => this.motionRowIndex(snapshot) !== null,
        20_000,
      );
      const observationStart = driver.completedFrameObservationCount;
      await driver.awaitOutputCondition(
        `${captureSeconds} seconds of animation frames arrive`,
        () => {
          const observations =
            driver.completedFrameObservationsSince(observationStart);
          const first = observations[0];
          const last = observations.at(-1);
          if (first === undefined || last === undefined) return false;
          return (
            last.completedFrame.byteArrivalTimestampMilliseconds -
              first.completedFrame.byteArrivalTimestampMilliseconds >=
            captureSeconds * 1_000
          );
        },
        captureSeconds * 1_000 + 20_000,
      );

      const observations =
        driver.completedFrameObservationsSince(observationStart);
      const appearances = new Set<string>();
      const stepHoldMilliseconds: number[] = [];
      let previousAppearance: string | null = null;
      let previousChangeTimestamp: number | null = null;
      let paintFrameCount = 0;
      let paintFramesSinceChange = 0;
      const paintFramesPerStep: number[] = [];
      const cycleAppearances: string[] = [];
      let firstAppearanceRepeatMilliseconds: number | null = null;
      let firstAppearance: string | null = null;
      let firstAppearanceTimestamp = 0;

      for (const observation of observations) {
        const rowIndex = this.motionRowIndex(observation.snapshot);
        if (rowIndex === null) continue;
        paintFrameCount += 1;
        paintFramesSinceChange += 1;
        const appearance = this.motionAppearance(
          observation.snapshot,
          rowIndex,
        );
        const timestamp =
          observation.completedFrame.byteArrivalTimestampMilliseconds;
        if (appearance === previousAppearance) continue;
        appearances.add(appearance);
        if (previousChangeTimestamp !== null) {
          stepHoldMilliseconds.push(timestamp - previousChangeTimestamp);
          paintFramesPerStep.push(paintFramesSinceChange);
        }
        if (firstAppearance === null) {
          firstAppearance = appearance;
          firstAppearanceTimestamp = timestamp;
        } else if (
          appearance === firstAppearance &&
          firstAppearanceRepeatMilliseconds === null
        ) {
          firstAppearanceRepeatMilliseconds =
            timestamp - firstAppearanceTimestamp;
        }
        if (firstAppearanceRepeatMilliseconds === null) {
          cycleAppearances.push(appearance);
        }
        previousAppearance = appearance;
        previousChangeTimestamp = timestamp;
        paintFramesSinceChange = 0;
      }

      const captureMilliseconds =
        (observations.at(-1)?.completedFrame.byteArrivalTimestampMilliseconds ??
          0) -
        (observations[0]?.completedFrame.byteArrivalTimestampMilliseconds ?? 0);
      const animationFramesPerSecond =
        captureMilliseconds > 0
          ? ((observations.length - 1) * 1_000) / captureMilliseconds
          : 0;
      const medianStepMilliseconds = this.median(stepHoldMilliseconds);
      const medianPaintFramesPerStep = this.median(paintFramesPerStep);

      console.log(`captureSeconds=${(captureMilliseconds / 1_000).toFixed(2)}`);
      console.log(`animationFrames=${observations.length}`);
      console.log(
        `animationFramesPerSecond=${animationFramesPerSecond.toFixed(1)}`,
      );
      console.log(`paintFramesObserved=${paintFrameCount}`);
      console.log(`motionSteps=${stepHoldMilliseconds.length}`);
      console.log(
        `motionStepMilliseconds=${medianStepMilliseconds.toFixed(1)} ` +
          `(design ${this.DESIGN_MOTION_STEP_MILLISECONDS.toFixed(1)})`,
      );
      console.log(
        `paintFramesPerMotionStep=${medianPaintFramesPerStep.toFixed(1)}`,
      );
      console.log(`distinctAppearances=${appearances.size}`);
      console.log(
        `cycleStepsBeforeRepeat=${
          firstAppearanceRepeatMilliseconds === null
            ? 'not-yet-repeated'
            : cycleAppearances.length
        }`,
      );
      console.log(
        `motionCycleSeconds=${
          firstAppearanceRepeatMilliseconds === null
            ? 'not-yet-repeated'
            : (firstAppearanceRepeatMilliseconds / 1_000).toFixed(2)
        }`,
      );
      console.log(
        `motionSpeedRatioAgainstDesign=${(
          this.DESIGN_MOTION_STEP_MILLISECONDS /
          Math.max(1, medianStepMilliseconds)
        ).toFixed(2)}x`,
      );
    } finally {
      await driver.dispose();
      rmSync(join(fixtureTasksRoot, '..'), { recursive: true, force: true });
    }
  }

  /** The live row that carries the gradient word — the one row tasks:watch animates. */
  protected static motionRowIndex(
    snapshot: HarnessSnapshot.Model,
  ): number | null {
    const textRows = snapshot.textRows();
    for (let rowIndex = 0; rowIndex < textRows.length; rowIndex += 1) {
      const line = textRows[rowIndex] ?? '';
      if (line.includes('building') || line.includes('exploring')) {
        return rowIndex;
      }
    }
    return null;
  }

  /** Glyphs plus every foreground colour on the row: a pure colour step still counts as motion. */
  protected static motionAppearance(
    snapshot: HarnessSnapshot.Model,
    rowIndex: number,
  ): string {
    return snapshot
      .rowCells(rowIndex)
      .map((cell) => `${cell.characters}:${cell.foreground}`)
      .join('|');
  }

  protected static writeFixtureLedger(): string {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'invar-348-motion-probe-'));
    const tasksRoot = join(fixtureRoot, 'tasks');
    for (const state of ['active', 'in-progress', 'completed', 'retired']) {
      mkdirSync(join(tasksRoot, state), { recursive: true });
    }
    const folder = join(
      tasksRoot,
      'in-progress',
      '999-tasks-watch-motion-fixture',
    );
    mkdirSync(folder, { recursive: true });
    Bun.write(
      join(folder, 'task-999-tasks-watch-motion-fixture.md'),
      [
        '# Task watch motion fixture',
        '',
        'State: IN-PROGRESS',
        'Engine: codex',
        'Model: fixture',
        'Effort: high',
        '',
      ].join('\n'),
    );
    return tasksRoot;
  }

  protected static median(values: readonly number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort(
      (leftValue, rightValue) => leftValue - rightValue,
    );
    const middleIndex = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? (sorted[middleIndex] ?? 0)
      : ((sorted[middleIndex - 1] ?? 0) + (sorted[middleIndex] ?? 0)) / 2;
  }

  protected static positiveNumber(
    value: string | undefined,
    fallback: number,
  ): number {
    const parsedValue = Number(value ?? fallback);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      throw new Error(`Expected a positive number, received ${String(value)}`);
    }
    return parsedValue;
  }
}

export namespace TasksWatchMotionCadenceProbe {
  export const $Class = Static($TasksWatchMotionCadenceProbe);
  export let Class = $Class;
}

await TasksWatchMotionCadenceProbe.Class.main(process.argv.slice(2));
