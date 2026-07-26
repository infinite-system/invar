#!/usr/bin/env bun
// SCROLL SMOOTHNESS INSTRUMENT — per-frame motion during ONE fast wheel glide, at the real PTY.
//
// The `gain` behavioural contract measures total DISPLACEMENT over five notches, which is a TIME
// integral of the momentum curve and therefore independent of how many frames deliver it. The same
// distance carried by fewer, larger steps is choppier while `gain` is untouched. This instrument
// measures the property `gain` cannot see: the SEQUENCE of viewport positions across every completed
// synchronized frame of one fast gesture, and hence the frame count, the per-frame delta
// distribution, and the peak velocity.
//
// The observed position is read from the EMULATOR GRID, not from the status file: the lowest visible
// `line NNNN content` index in a completed frame IS that frame's scrollTop, so every sample is
// exactly the position the user saw in that painted frame with no publish race.
//
// invariant: A fast glide crosses rows in many small steps (src/modules/ui/ui.invariants.md)
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// Only `PtyTestDriver` is imported from the harness: this instrument has to run UNCHANGED at older
// commits to attribute a regression, and `HarnessSmoke`'s status helpers changed signature in the
// window under study, so a call through them would fail at the very commits that need measuring. The
// status poll below is therefore local and depends on nothing but the published file.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessInput } from './HarnessInput';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

const FIXTURE_LINE_COUNT = 4000;
// A SATURATING burst: twelve notches is more than the ten a from-rest gain ramp needs to reach the
// velocity ceiling, so the glide spends most of its life at the top speed the app declares and the
// per-frame step size is then a direct reading of the frame cadence. Overridable because a shorter
// flick probes the ramp itself rather than the ceiling.
const WHEEL_NOTCHES_PER_GESTURE = Number(
  process.env.SMOOTHNESS_NOTCHES ?? '12',
);
// Trials, not samples of one trial: the fling that follows an idle app and the fling that follows a
// previous fling reach measurably different peak velocities, so the contract needs at least one of
// each and manual measurement wants a third to see which of the two a run landed on.
const GESTURE_REPEAT_COUNT = Number(process.env.SMOOTHNESS_GESTURES ?? '3');
const TERMINAL_COLUMNS = 120;
const TERMINAL_ROWS = 40;
const EDITOR_WHEEL_COLUMN = 80;
const EDITOR_WHEEL_ROW = 12;
// Rendering is demand-driven, so no frame arriving within this window IS the at-rest condition: while
// any glide runs the app holds a live render request and frames keep coming, and the request is
// dropped the moment every animation settles. The window only has to exceed one frame interval at
// `targetFps` (33ms) by enough margin that a loaded machine cannot fake quiescence.
const FRAME_ARRIVAL_TIMEOUT_MILLISECONDS = 700;

interface GestureFrameSample {
  readonly completedFrameCount: number;
  readonly byteArrivalTimestampMilliseconds: number;
  readonly observedByteCount: number;
  readonly scrollTop: number;
}

interface GestureMeasurement {
  readonly positions: readonly number[];
  readonly movingFrameCount: number;
  readonly observedFrameCount: number;
  readonly totalDistanceRows: number;
  readonly maximumFrameDeltaRows: number;
  readonly meanMovingFrameDeltaRows: number;
  readonly frameDeltaHistogram: Readonly<Record<string, number>>;
  readonly peakVelocityRowsPerSecond: number;
  readonly glideDurationMilliseconds: number;
  readonly framesPerSecond: number;
  // A real terminal converts bytes per frame into frame TIME: the emulator has to parse and paint
  // every byte before the next frame can land. Frame cost is therefore the quantity that turns into
  // "fewer, larger steps" outside the harness, where the emulator is not free.
  readonly meanFrameByteCount: number;
  readonly maximumFrameByteCount: number;
}

async function awaitStatusCondition(
  statusPath: string,
  conditionDescription: string,
  predicate: (status: Record<string, unknown>) => boolean,
  timeoutMilliseconds = 20_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMilliseconds;
  while (true) {
    try {
      if (
        predicate(
          JSON.parse(readFileSync(statusPath, 'utf8')) as Record<
            string,
            unknown
          >,
        )
      ) {
        return;
      }
    } catch {
      // The atomically published status file has not landed yet.
    }
    if (performance.now() >= deadline) {
      throw new Error(`Timed out waiting for ${conditionDescription}`);
    }
    await Bun.sleep(5);
  }
}

function visibleTopLineIndex(snapshot: HarnessSnapshot.Model): number | null {
  let lowestVisibleIndex: number | null = null;
  for (let row = 0; row < snapshot.rows; row++) {
    const match = /line (\d{4}) content/.exec(snapshot.rowText(row));
    if (!match) continue;
    const lineIndex = Number(match[1]);
    if (lowestVisibleIndex === null || lineIndex < lowestVisibleIndex) {
      lowestVisibleIndex = lineIndex;
    }
  }
  return lowestVisibleIndex;
}

function summarize(samples: readonly GestureFrameSample[]): GestureMeasurement {
  const positions = samples.map((sample) => sample.scrollTop);
  const frameDeltas: number[] = [];
  let peakVelocityRowsPerSecond = 0;
  for (let index = 1; index < samples.length; index++) {
    const deltaRows = positions[index]! - positions[index - 1]!;
    frameDeltas.push(deltaRows);
    const deltaMilliseconds =
      samples[index]!.byteArrivalTimestampMilliseconds -
      samples[index - 1]!.byteArrivalTimestampMilliseconds;
    if (deltaMilliseconds > 0) {
      peakVelocityRowsPerSecond = Math.max(
        peakVelocityRowsPerSecond,
        (deltaRows * 1000) / deltaMilliseconds,
      );
    }
  }
  const frameByteCounts: number[] = [];
  for (let index = 1; index < samples.length; index++) {
    frameByteCounts.push(
      samples[index]!.observedByteCount - samples[index - 1]!.observedByteCount,
    );
  }
  const movingFrameDeltas = frameDeltas.filter((deltaRows) => deltaRows !== 0);
  const frameDeltaHistogram: Record<string, number> = {};
  for (const deltaRows of frameDeltas) {
    const key = String(deltaRows);
    frameDeltaHistogram[key] = (frameDeltaHistogram[key] ?? 0) + 1;
  }
  const glideDurationMilliseconds =
    samples.length >= 2
      ? samples.at(-1)!.byteArrivalTimestampMilliseconds -
        samples[0]!.byteArrivalTimestampMilliseconds
      : 0;
  return {
    positions,
    movingFrameCount: movingFrameDeltas.length,
    observedFrameCount: samples.length,
    totalDistanceRows:
      positions.length >= 2 ? positions.at(-1)! - positions[0]! : 0,
    maximumFrameDeltaRows: frameDeltas.reduce(
      (largest, deltaRows) => Math.max(largest, deltaRows),
      0,
    ),
    meanMovingFrameDeltaRows:
      movingFrameDeltas.length === 0
        ? 0
        : movingFrameDeltas.reduce((sum, deltaRows) => sum + deltaRows, 0) /
          movingFrameDeltas.length,
    frameDeltaHistogram,
    peakVelocityRowsPerSecond,
    glideDurationMilliseconds,
    framesPerSecond:
      glideDurationMilliseconds > 0
        ? ((samples.length - 1) * 1000) / glideDurationMilliseconds
        : 0,
    meanFrameByteCount:
      frameByteCounts.length === 0
        ? 0
        : frameByteCounts.reduce((sum, byteCount) => sum + byteCount, 0) /
          frameByteCounts.length,
    maximumFrameByteCount: frameByteCounts.reduce(
      (largest, byteCount) => Math.max(largest, byteCount),
      0,
    ),
  };
}

// Demand-driven rendering makes "no frame arrives" the QUIESCENCE CONDITION, not a silence
// assumption: while any glide is active the app holds a live render request, so frames keep coming;
// the moment every animation settles the request is dropped and frame production stops. Draining
// until a frame wait expires therefore observes rest itself, and it observes it identically at every
// commit — unlike the `workspaceScrollMomentumAtRest` status field, which does not exist in the
// earlier builds this instrument also has to run against.
async function drainToQuiescence(driver: PtyTestDriver.Model): Promise<void> {
  while (true) {
    try {
      await driver.awaitNextCompletedFrameSnapshot(
        FRAME_ARRIVAL_TIMEOUT_MILLISECONDS,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(
          'Timed out waiting for the next complete synchronized frame',
        )
      ) {
        return;
      }
      throw error;
    }
  }
}

async function measureOneGesture(
  driver: PtyTestDriver.Model,
): Promise<GestureMeasurement> {
  const samples: GestureFrameSample[] = [];
  let nextFrame = driver.awaitNextCompletedFrameSnapshot(
    FRAME_ARRIVAL_TIMEOUT_MILLISECONDS,
  );
  // ONE write for the whole notch train. Written as separate writes the train straddles two input
  // regimes — the application either reads several notches in one chunk (their impulses compound
  // before any frame decays them) or reads them one at a time across frames (each impulse is decayed
  // before the next lands) — and the same 12-notch gesture then lands on one of three quantized
  // outcomes differing by ~35% in both distance and peak velocity. That spread is a property of how
  // the bytes happened to split, not of the build under test, so a single write removes it and the
  // measurement compares builds instead of comparing PTY chunk boundaries.
  driver.sendRawInputWithoutFrameExpectation(
    Array.from({ length: WHEEL_NOTCHES_PER_GESTURE }, () =>
      HarnessInput.Class.mouse({
        kind: 'wheel',
        column: EDITOR_WHEEL_COLUMN,
        row: EDITOR_WHEEL_ROW,
        direction: 'down',
      }),
    ).join(''),
  );
  while (true) {
    let completed: Awaited<typeof nextFrame>;
    try {
      completed = await nextFrame;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(
          'Timed out waiting for the next complete synchronized frame',
        )
      ) {
        break;
      }
      throw error;
    }
    const scrollTop = visibleTopLineIndex(completed.snapshot);
    if (scrollTop !== null) {
      samples.push({
        completedFrameCount: completed.completedFrame.completedFrameCount,
        byteArrivalTimestampMilliseconds:
          completed.completedFrame.byteArrivalTimestampMilliseconds,
        observedByteCount: completed.completedFrame.observedByteCount,
        scrollTop,
      });
    }
    nextFrame = driver.awaitNextCompletedFrameSnapshot(
      FRAME_ARRIVAL_TIMEOUT_MILLISECONDS,
    );
  }
  return summarize(samples);
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-scroll-smoothness-'));
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-scroll-smoothness-home-'),
);
const statusPath = join(homeDirectory, 'status.json');
await Bun.write(
  join(fixtureRoot, 'glide.txt'),
  Array.from(
    { length: FIXTURE_LINE_COUNT },
    (_unused, lineIndex) =>
      `line ${String(lineIndex).padStart(4, '0')} content\n`,
  ).join(''),
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: TERMINAL_COLUMNS,
  rows: TERMINAL_ROWS,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('glide.txt') !== null,
    20_000,
  );
  driver.sendKeysWithoutFrameExpectation('Enter');
  await driver.awaitGridCondition(
    'the glide fixture renders its first line in the editor',
    (snapshot) => snapshot.findText('line 0000 content') !== null,
    20_000,
  );
  // Focus the editor pane: a wheel over an unfocused editor can be swallowed before the glide
  // starts, which would measure the absence of a gesture rather than its smoothness.
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: EDITOR_WHEEL_COLUMN,
    row: EDITOR_WHEEL_ROW,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: EDITOR_WHEEL_COLUMN,
    row: EDITOR_WHEEL_ROW,
    button: 'left',
  });
  // The precondition the measurement actually needs is not "a focus field says editor" — it is that
  // the editor CONSUMES wheel input. Prove exactly that by moving the viewport with one notch, which
  // is a condition every build publishes, then return to the top for the first trial.
  driver.sendMouseWithoutFrameExpectation({
    kind: 'wheel',
    column: EDITOR_WHEEL_COLUMN,
    row: EDITOR_WHEEL_ROW,
    direction: 'down',
  });
  await awaitStatusCondition(
    statusPath,
    'the editor to consume wheel input before the glide is measured',
    (status) => Number(status.editorScrollTop) > 0,
  );

  const measurements: GestureMeasurement[] = [];
  for (
    let gestureIndex = 0;
    gestureIndex < GESTURE_REPEAT_COUNT;
    gestureIndex++
  ) {
    // Each gesture starts from a KNOWN resting position so trials are comparable: return to the top,
    // observe that the viewport IS at the top, and drain to quiescence so the next fling starts from
    // rest rather than inheriting the previous trial's velocity.
    driver.sendKeysWithoutFrameExpectation('Control+Home');
    await awaitStatusCondition(
      statusPath,
      'the viewport to be back at the top before the next gesture',
      (status) => Number(status.editorScrollTop) === 0,
    );
    await drainToQuiescence(driver);
    measurements.push(await measureOneGesture(driver));
  }

  const report = {
    commit: (await Bun.$`git rev-parse --short HEAD`.quiet().text()).trim(),
    wheelNotchesPerGesture: WHEEL_NOTCHES_PER_GESTURE,
    gestures: measurements,
  };
  console.log(JSON.stringify(report, null, 2));
  for (const [gestureIndex, measurement] of measurements.entries()) {
    console.error(
      `gesture ${gestureIndex + 1}: frames=${measurement.observedFrameCount} ` +
        `moving=${measurement.movingFrameCount} ` +
        `distance=${measurement.totalDistanceRows} ` +
        `maxDelta=${measurement.maximumFrameDeltaRows} ` +
        `meanDelta=${measurement.meanMovingFrameDeltaRows.toFixed(2)} ` +
        `peak=${measurement.peakVelocityRowsPerSecond.toFixed(0)}rows/s ` +
        `fps=${measurement.framesPerSecond.toFixed(1)} ` +
        `bytes/frame=${measurement.meanFrameByteCount.toFixed(0)} ` +
        `maxBytes=${measurement.maximumFrameByteCount}`,
    );
  }
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
