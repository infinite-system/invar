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
// invariant: Timing-sensitive smokes run on a machine-wide quiet lock (scripts/harness/harness.invariants.md)
// Only the PTY driver, input encoder, snapshot type, and quiet lock are imported from the harness.
// `HarnessSmoke`'s status helpers changed signature in the historical window, so the status poll
// below stays local and depends on nothing but the published file. Historical measurements port the
// one missing completed-frame snapshot method into the disposable reference tree.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessInput } from './HarnessInput';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';
import { QuietLock } from './QuietLock';

const quietLockExitCode = await QuietLock.Class.rerunEntryPointQuietExclusive(
  'measure-scroll-smoothness',
  import.meta.path,
);
if (quietLockExitCode !== null) process.exit(quietLockExitCode);

const FIXTURE_LINE_COUNTS = (
  process.env.SMOOTHNESS_LINE_COUNTS ?? '2000,26635,100000'
)
  .split(',')
  .map((lineCountText) => Number(lineCountText.trim()))
  .filter((lineCount) => Number.isInteger(lineCount) && lineCount >= 100);
const SURFACES = (process.env.SMOOTHNESS_SURFACES ?? 'editor,diff')
  .split(',')
  .map((surfaceText) => surfaceText.trim())
  .filter(
    (surfaceText): surfaceText is ScrollSurface =>
      surfaceText === 'editor' || surfaceText === 'diff',
  );
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

type ScrollSurface = 'editor' | 'diff';

interface GestureFrameSample {
  readonly completedFrameCount: number;
  readonly byteArrivalTimestampMilliseconds: number;
  readonly observedByteCount: number;
  readonly scrollTop: number;
}

interface GestureMeasurement {
  readonly positions: readonly number[];
  readonly inputToFirstFrameMilliseconds: number;
  readonly movingFrameCount: number;
  readonly observedFrameCount: number;
  readonly totalDistanceRows: number;
  readonly maximumFrameDeltaRows: number;
  readonly meanMovingFrameDeltaRows: number;
  readonly frameDeltaHistogram: Readonly<Record<string, number>>;
  readonly peakVelocityRowsPerSecond: number;
  readonly glideDurationMilliseconds: number;
  readonly framesPerSecond: number;
  readonly sustainedFastFramesPerSecond: number;
  // A real terminal converts bytes per frame into frame TIME: the emulator has to parse and paint
  // every byte before the next frame can land. Frame cost is therefore the quantity that turns into
  // "fewer, larger steps" outside the harness, where the emulator is not free.
  readonly meanFrameByteCount: number;
  readonly maximumFrameByteCount: number;
}

interface SurfaceMeasurement {
  readonly surface: ScrollSurface;
  readonly fixtureLineCount: number;
  readonly gestures: readonly GestureMeasurement[];
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
    const match = /line (\d{6}) content/.exec(snapshot.rowText(row));
    if (!match) continue;
    const lineIndex = Number(match[1]);
    if (lowestVisibleIndex === null || lineIndex < lowestVisibleIndex) {
      lowestVisibleIndex = lineIndex;
    }
  }
  return lowestVisibleIndex;
}

function summarize(
  samples: readonly GestureFrameSample[],
  inputWrittenTimestampMilliseconds: number,
): GestureMeasurement {
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
  // Below two rows per completed frame, cell-grid quantization naturally produces unchanged render
  // ticks and slower row-crossing intervals. The fast segment ends at the final >=2-row crossing,
  // so its cadence measures the renderer while motion is fast enough to change every frame.
  const sustainedFastFrameEndIndex = frameDeltas.reduce(
    (lastFastFrameIndex, deltaRows, frameDeltaIndex) =>
      Math.abs(deltaRows) >= 2 ? frameDeltaIndex + 1 : lastFastFrameIndex,
    0,
  );
  const sustainedFastDurationMilliseconds =
    sustainedFastFrameEndIndex > 0
      ? samples[sustainedFastFrameEndIndex]!.byteArrivalTimestampMilliseconds -
        samples[0]!.byteArrivalTimestampMilliseconds
      : 0;
  return {
    positions,
    inputToFirstFrameMilliseconds:
      samples.length === 0
        ? 0
        : samples[0]!.byteArrivalTimestampMilliseconds -
          inputWrittenTimestampMilliseconds,
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
    sustainedFastFramesPerSecond:
      sustainedFastDurationMilliseconds > 0
        ? (sustainedFastFrameEndIndex * 1000) /
          sustainedFastDurationMilliseconds
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

// Demand-driven rendering makes "no frame arrives" the QUIESCENCE CONDITION,
// not a silence assumption: while any glide is active the app cadence requests
// frames; the moment every animation settles the cadence stops. Draining until
// a frame wait expires therefore observes rest itself, and it observes it
// identically at every commit — unlike the `workspaceScrollMomentumAtRest`
// status field, which does not exist in historical builds this measures.
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
  const inputWrittenTimestampMilliseconds = performance.now();
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
  return summarize(samples, inputWrittenTimestampMilliseconds);
}

function runGit(repositoryRoot: string, commandArguments: string[]): void {
  const result = Bun.spawnSync(['git', ...commandArguments], {
    cwd: repositoryRoot,
    stdout: 'ignore',
    stderr: 'pipe',
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        ([environmentVariableName, environmentVariableValue]) =>
          environmentVariableValue !== undefined &&
          !environmentVariableName.startsWith('GIT_'),
      ),
    ) as Record<string, string>,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${commandArguments.join(' ')} failed: ` +
        new TextDecoder().decode(result.stderr),
    );
  }
}

function fixtureLines(fixtureLineCount: number): string[] {
  // Short plain-text rows keep terminal-byte cost below the 30 FPS budget. Every third indentation
  // transition still produces a fold range, so editor frames exercise document-scale fold metadata.
  return Array.from({ length: fixtureLineCount }, (_unusedValue, lineIndex) => {
    const lineMarker = `line ${String(lineIndex).padStart(6, '0')} content`;
    return lineIndex % 3 === 1 ? ` ${lineMarker}` : lineMarker;
  });
}

async function buildFixture(
  fixtureRoot: string,
  fixtureLineCount: number,
  surface: ScrollSurface,
): Promise<string> {
  const fixtureFileName = `glide-${String(fixtureLineCount).padStart(6, '0')}.txt`;
  const fixturePath = join(fixtureRoot, fixtureFileName);
  const lines = fixtureLines(fixtureLineCount);
  await Bun.write(fixturePath, `${lines.join('\n')}\n`);
  if (surface === 'editor') return fixtureFileName;

  runGit(fixtureRoot, ['init', '-q']);
  runGit(fixtureRoot, ['config', 'user.name', 'scroll-smoothness']);
  runGit(fixtureRoot, [
    'config',
    'user.email',
    'scroll-smoothness@example.test',
  ]);
  runGit(fixtureRoot, ['add', fixtureFileName]);
  runGit(fixtureRoot, ['commit', '-qm', 'base']);
  // Regularly separated edits make the diff carry up to 1,000 change blocks at 100k lines. The
  // comparison still opens quickly, while per-frame ruler or active-block scans remain observable.
  for (
    let changedLineIndex = 5;
    changedLineIndex < fixtureLineCount;
    changedLineIndex += 100
  ) {
    lines[changedLineIndex] = `${lines[changedLineIndex]} changed`;
  }
  await Bun.write(fixturePath, `${lines.join('\n')}\n`);
  return fixtureFileName;
}

async function openSurface(
  driver: PtyTestDriver.Model,
  statusPath: string,
  fixtureFileName: string,
  surface: ScrollSurface,
): Promise<void> {
  await driver.awaitGridCondition(
    `${fixtureFileName} is visible before opening the ${surface} surface`,
    (snapshot) => snapshot.findText(fixtureFileName) !== null,
    60_000,
  );
  if (surface === 'editor') {
    driver.sendKeysWithoutFrameExpectation('Enter');
    await driver.awaitGridCondition(
      'the glide fixture renders its first line in the editor',
      (snapshot) => snapshot.findText('line 000000 content') !== null,
      60_000,
    );
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
    return;
  }

  driver.sendKeysWithoutFrameExpectation('Control+g');
  await awaitStatusCondition(
    statusPath,
    'the Git pane to own focus before opening the diff',
    (status) => status.focus === 'git',
    60_000,
  );
  driver.sendKeysWithoutFrameExpectation('o');
  await awaitStatusCondition(
    statusPath,
    'the side-by-side diff to become active',
    (status) => status.showingDiff === true,
    60_000,
  );
  await driver.awaitGridCondition(
    'the side-by-side diff renders both versions of the first fixture line',
    (snapshot) =>
      snapshot.findText('Base (HEAD)') !== null &&
      snapshot.findText('Current (working)') !== null &&
      snapshot.findText('line 000000 content') !== null,
    60_000,
  );
}

function scrollStatusField(surface: ScrollSurface): string {
  return surface === 'editor' ? 'editorScrollTop' : 'diffScrollTop';
}

function wheelInput(direction: 'up' | 'down', notchCount: number): string {
  return Array.from({ length: notchCount }, () =>
    HarnessInput.Class.mouse({
      kind: 'wheel',
      column: EDITOR_WHEEL_COLUMN,
      row: EDITOR_WHEEL_ROW,
      direction,
    }),
  ).join('');
}

async function driveSurfaceToTop(
  driver: PtyTestDriver.Model,
  statusPath: string,
  surface: ScrollSurface,
): Promise<void> {
  const statusField = scrollStatusField(surface);
  if (surface === 'editor') {
    driver.sendKeysWithoutFrameExpectation('Control+Home');
    await awaitStatusCondition(
      statusPath,
      'the editor viewport to return to the top before the next gesture',
      (status) => Number(status[statusField]) === 0,
    );
    return;
  }
  for (let driveAttempt = 1; driveAttempt <= 20; driveAttempt++) {
    driver.sendRawInputWithoutFrameExpectation(wheelInput('up', 12));
    try {
      await awaitStatusCondition(
        statusPath,
        'the diff viewport to return to the top before the next gesture',
        (status) => Number(status[statusField]) === 0,
        1_000,
      );
      return;
    } catch (error) {
      if (driveAttempt === 20) throw error;
    }
  }
}

async function measureSurface(
  surface: ScrollSurface,
  fixtureLineCount: number,
): Promise<SurfaceMeasurement> {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-scroll-smoothness-'));
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-scroll-smoothness-home-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  const fixtureFileName = await buildFixture(
    fixtureRoot,
    fixtureLineCount,
    surface,
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: TERMINAL_COLUMNS,
    rows: TERMINAL_ROWS,
    homeDirectory,
    environment: { TUI_STATUS_PATH: statusPath },
  });
  try {
    await openSurface(driver, statusPath, fixtureFileName, surface);
    const statusField = scrollStatusField(surface);
    driver.sendMouseWithoutFrameExpectation({
      kind: 'wheel',
      column: EDITOR_WHEEL_COLUMN,
      row: EDITOR_WHEEL_ROW,
      direction: 'down',
    });
    await awaitStatusCondition(
      statusPath,
      `the ${surface} surface to consume wheel input before measurement`,
      (status) => Number(status[statusField]) > 0,
      60_000,
    );

    const gestures: GestureMeasurement[] = [];
    for (
      let gestureIndex = 0;
      gestureIndex < GESTURE_REPEAT_COUNT;
      gestureIndex++
    ) {
      await driveSurfaceToTop(driver, statusPath, surface);
      await drainToQuiescence(driver);
      gestures.push(await measureOneGesture(driver));
    }
    return { surface, fixtureLineCount, gestures };
  } finally {
    await driver.dispose();
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(homeDirectory, { recursive: true, force: true });
  }
}

if (FIXTURE_LINE_COUNTS.length === 0) {
  throw new Error('SMOOTHNESS_LINE_COUNTS must name at least one line count');
}
if (SURFACES.length === 0) {
  throw new Error('SMOOTHNESS_SURFACES must name editor, diff, or both');
}

const surfaceMeasurements: SurfaceMeasurement[] = [];
for (const fixtureLineCount of FIXTURE_LINE_COUNTS) {
  for (const surface of SURFACES) {
    const surfaceMeasurement = await measureSurface(surface, fixtureLineCount);
    surfaceMeasurements.push(surfaceMeasurement);
    for (const [
      gestureIndex,
      measurement,
    ] of surfaceMeasurement.gestures.entries()) {
      console.error(
        `${surface} ${fixtureLineCount} lines gesture ${gestureIndex + 1}: ` +
          `frames=${measurement.observedFrameCount} ` +
          `firstFrame=${measurement.inputToFirstFrameMilliseconds.toFixed(3)}ms ` +
          `moving=${measurement.movingFrameCount} ` +
          `distance=${measurement.totalDistanceRows} ` +
          `maxDelta=${measurement.maximumFrameDeltaRows} ` +
          `meanDelta=${measurement.meanMovingFrameDeltaRows.toFixed(2)} ` +
          `peak=${measurement.peakVelocityRowsPerSecond.toFixed(0)}rows/s ` +
          `fps=${measurement.framesPerSecond.toFixed(1)} ` +
          `fastFps=${measurement.sustainedFastFramesPerSecond.toFixed(1)} ` +
          `bytes/frame=${measurement.meanFrameByteCount.toFixed(0)} ` +
          `maxBytes=${measurement.maximumFrameByteCount}`,
      );
    }
  }
}

const report = {
  commit: (await Bun.$`git rev-parse --short HEAD`.quiet().text()).trim(),
  wheelNotchesPerGesture: WHEEL_NOTCHES_PER_GESTURE,
  cases: surfaceMeasurements,
};
console.log(JSON.stringify(report, null, 2));
