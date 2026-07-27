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
// invariant: A same-direction notch never slows a live glide (src/modules/ui/ui.invariants.md)
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Timing-sensitive smokes run on a machine-wide quiet lock (scripts/harness/harness.invariants.md)
// invariant: Async-published state is always awaited (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
// Only the PTY driver, input encoder, snapshot type, and quiet lock are imported from the harness.
// `HarnessSmoke`'s status helpers changed signature in the historical window, so the status poll
// below stays local and depends on nothing but the published file. Historical measurements port the
// one missing completed-frame snapshot method into the disposable reference tree.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
const FIXTURE_SHAPES = (process.env.SMOOTHNESS_FIXTURES ?? 'flat')
  .split(',')
  .map((fixtureShapeText) => fixtureShapeText.trim())
  .filter(
    (fixtureShapeText): fixtureShapeText is FixtureShape =>
      fixtureShapeText === 'flat' || fixtureShapeText === 'fold-dense',
  );
const CODE_FOLDING_MODES = (process.env.SMOOTHNESS_CODE_FOLDING ?? 'on')
  .split(',')
  .map((codeFoldingModeText) => codeFoldingModeText.trim())
  .filter(
    (codeFoldingModeText): codeFoldingModeText is CodeFoldingMode =>
      codeFoldingModeText === 'on' || codeFoldingModeText === 'off',
  );
const VERSION_CONTROL_MARKS_ENABLED =
  process.env.SMOOTHNESS_VERSION_CONTROL_MARKS !== 'off';
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
const CONTINUATION_DELAY_MILLISECONDS = (
  process.env.SMOOTHNESS_CONTINUATION_DELAYS ?? '200,250,300'
)
  .split(',')
  .map((delayText) => Number(delayText.trim()))
  .filter((delayMilliseconds) => delayMilliseconds > 150);
const DEPTH_GESTURE_TARGET_ROWS = Number(
  process.env.SMOOTHNESS_DEPTH_GESTURE_ROWS ?? '1000',
);
const DEPTH_REFERENCE_FRAMES_PER_SECOND = Number(
  process.env.SMOOTHNESS_DEPTH_REFERENCE_FPS ?? 'NaN',
);
const DEPTH_CHECKPOINT_TARGETS = [75_000] as const;
const DEPTH_CHECKPOINT_FIXTURE_MINIMUM_LINES = 80_000;
const DEPTH_CHECKPOINT_FPS_FLOOR = 28;
const DEPTH_GESTURE_REFRESH_FRAME_INTERVAL = 6;
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
type FixtureShape = 'flat' | 'fold-dense';
type CodeFoldingMode = 'on' | 'off';

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
  readonly editorFrameAttribution: EditorFrameAttributionMeasurement | null;
}

interface SurfaceMeasurement {
  readonly surface: ScrollSurface;
  readonly fixtureShape: FixtureShape;
  readonly codeFolding: CodeFoldingMode;
  readonly indentGuides: true;
  readonly versionControlMarks: boolean;
  readonly fixtureLineCount: number;
  readonly gestures: readonly GestureMeasurement[];
  readonly continuationBoundaries: readonly ContinuationBoundaryMeasurement[];
  readonly depthCheckpoints: readonly DepthCheckpointMeasurement[];
  readonly depthCheckpointWallClockMilliseconds: number;
}

interface ContinuationBoundaryMeasurement {
  readonly requestedDelayMilliseconds: number;
  readonly actualDelayMilliseconds: number;
  readonly preBoundaryFrameCount: number;
  readonly boundaryFrameCount: number;
  readonly preBoundaryRowsCrossed: number;
  readonly boundaryRowsCrossed: number;
}

interface DepthCheckpointMeasurement {
  readonly targetDepthLine: number;
  readonly actualStartLine: number;
  readonly actualEndLine: number;
  readonly rowsTravelled: number;
  readonly observedFrameCount: number;
  readonly movingFrameCount: number;
  readonly durationMilliseconds: number;
  readonly framesPerSecond: number;
  readonly ratioToReference: number;
}

interface EditorFrameCounts {
  readonly documentLineReads: number;
  readonly foldProjectionLookups: number;
  readonly wrapProjectionLookups: number;
  readonly layoutComputations: number;
}

interface EditorFrameAttributionTotals extends EditorFrameCounts {
  readonly completedFrameCount: number;
}

interface EditorFrameAttributionMeasurement extends EditorFrameCounts {
  readonly completedFrameCount: number;
  readonly documentLineReadsPerFrame: number;
  readonly foldProjectionLookupsPerFrame: number;
  readonly wrapProjectionLookupsPerFrame: number;
  readonly layoutComputationsPerFrame: number;
}

interface EditorScaleInvarianceMeasurement {
  readonly baselineFixtureLineCount: number;
  readonly comparisonFixtureLineCount: number;
  readonly baseline: EditorFrameAttributionMeasurement;
  readonly comparison: EditorFrameAttributionMeasurement;
  readonly ratios: EditorFrameCounts;
}

async function awaitStatusCondition(
  statusPath: string,
  conditionDescription: string,
  predicate: (status: Record<string, unknown>) => boolean,
  timeoutMilliseconds = 20_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMilliseconds;
  let lastObservedStatus: Record<string, unknown> | undefined;
  while (true) {
    try {
      lastObservedStatus = JSON.parse(
        readFileSync(statusPath, 'utf8'),
      ) as Record<string, unknown>;
      if (predicate(lastObservedStatus)) return;
    } catch {
      // The atomically published status file has not landed yet.
    }
    if (performance.now() >= deadline) {
      const lastObservedStatusText =
        lastObservedStatus === undefined
          ? '<no status object was observed>'
          : JSON.stringify(lastObservedStatus, null, 2);
      throw new Error(
        `Timed out waiting for ${conditionDescription} at ${statusPath}\n` +
          `Last observed status:\n${lastObservedStatusText}`,
      );
    }
    await Bun.sleep(5);
  }
}

function readEditorFrameAttributionTotals(
  statusPath: string,
): EditorFrameAttributionTotals {
  const status = JSON.parse(readFileSync(statusPath, 'utf8')) as Record<
    string,
    unknown
  >;
  const attribution = status.editorFrameAttribution as
    { totals?: Partial<EditorFrameAttributionTotals> } | undefined;
  const totals = attribution?.totals;
  const values = [
    totals?.completedFrameCount,
    totals?.documentLineReads,
    totals?.foldProjectionLookups,
    totals?.wrapProjectionLookups,
    totals?.layoutComputations,
  ];
  if (!values.every((value) => Number.isInteger(value) && Number(value) >= 0)) {
    throw new Error(
      `editor frame attribution is absent or malformed at ${statusPath}`,
    );
  }
  return {
    completedFrameCount: Number(totals?.completedFrameCount),
    documentLineReads: Number(totals?.documentLineReads),
    foldProjectionLookups: Number(totals?.foldProjectionLookups),
    wrapProjectionLookups: Number(totals?.wrapProjectionLookups),
    layoutComputations: Number(totals?.layoutComputations),
  };
}

function editorFrameAttributionDelta(
  before: EditorFrameAttributionTotals,
  after: EditorFrameAttributionTotals,
): EditorFrameAttributionMeasurement {
  const completedFrameCount =
    after.completedFrameCount - before.completedFrameCount;
  const documentLineReads = after.documentLineReads - before.documentLineReads;
  const foldProjectionLookups =
    after.foldProjectionLookups - before.foldProjectionLookups;
  const wrapProjectionLookups =
    after.wrapProjectionLookups - before.wrapProjectionLookups;
  const layoutComputations =
    after.layoutComputations - before.layoutComputations;
  if (completedFrameCount <= 0) {
    throw new Error('editor gesture completed no attributed frames');
  }
  return {
    completedFrameCount,
    documentLineReads,
    foldProjectionLookups,
    wrapProjectionLookups,
    layoutComputations,
    documentLineReadsPerFrame: documentLineReads / completedFrameCount,
    foldProjectionLookupsPerFrame: foldProjectionLookups / completedFrameCount,
    wrapProjectionLookupsPerFrame: wrapProjectionLookups / completedFrameCount,
    layoutComputationsPerFrame: layoutComputations / completedFrameCount,
  };
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
  editorFrameAttribution: EditorFrameAttributionMeasurement | null,
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
    editorFrameAttribution,
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
  statusPath: string,
  surface: ScrollSurface,
): Promise<GestureMeasurement> {
  const samples: GestureFrameSample[] = [];
  const editorFrameAttributionBefore =
    surface === 'editor' ? readEditorFrameAttributionTotals(statusPath) : null;
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
  const editorFrameAttribution =
    editorFrameAttributionBefore === null
      ? null
      : editorFrameAttributionDelta(
          editorFrameAttributionBefore,
          readEditorFrameAttributionTotals(statusPath),
        );
  return summarize(
    samples,
    inputWrittenTimestampMilliseconds,
    editorFrameAttribution,
  );
}

async function measureContinuationBoundary(
  driver: PtyTestDriver.Model,
  requestedDelayMilliseconds: number,
): Promise<ContinuationBoundaryMeasurement> {
  const samples: GestureFrameSample[] = [];
  const firstGestureTimestampMilliseconds = performance.now();
  driver.sendRawInputWithoutFrameExpectation(
    wheelInput('down', WHEEL_NOTCHES_PER_GESTURE),
  );
  while (true) {
    const completed = await driver.awaitNextCompletedFrameSnapshot(
      FRAME_ARRIVAL_TIMEOUT_MILLISECONDS,
    );
    const scrollTop = visibleTopLineIndex(completed.snapshot);
    if (scrollTop === null) continue;
    const sample: GestureFrameSample = {
      completedFrameCount: completed.completedFrame.completedFrameCount,
      byteArrivalTimestampMilliseconds:
        completed.completedFrame.byteArrivalTimestampMilliseconds,
      observedByteCount: completed.completedFrame.observedByteCount,
      scrollTop,
    };
    samples.push(sample);
    if (samples.length < 2) continue;
    const previousSample = samples.at(-2)!;
    const preBoundaryRowsCrossed = sample.scrollTop - previousSample.scrollTop;
    const elapsedMilliseconds =
      performance.now() - firstGestureTimestampMilliseconds;
    if (
      elapsedMilliseconds < requestedDelayMilliseconds ||
      preBoundaryRowsCrossed <= 0
    ) {
      continue;
    }

    const secondGestureTimestampMilliseconds = performance.now();
    driver.sendRawInputWithoutFrameExpectation(wheelInput('down', 1));
    const boundaryFrame = await driver.awaitNextCompletedFrameSnapshot(
      FRAME_ARRIVAL_TIMEOUT_MILLISECONDS,
    );
    const boundaryScrollTop = visibleTopLineIndex(boundaryFrame.snapshot);
    if (boundaryScrollTop === null) {
      throw new Error(
        `continuation boundary frame ` +
          `${boundaryFrame.completedFrame.completedFrameCount} did not ` +
          `contain the fixture`,
      );
    }
    return {
      requestedDelayMilliseconds,
      actualDelayMilliseconds:
        secondGestureTimestampMilliseconds - firstGestureTimestampMilliseconds,
      preBoundaryFrameCount: sample.completedFrameCount,
      boundaryFrameCount: boundaryFrame.completedFrame.completedFrameCount,
      preBoundaryRowsCrossed,
      boundaryRowsCrossed: boundaryScrollTop - sample.scrollTop,
    };
  }
}

function assertContinuationBoundaries(
  measurements: readonly ContinuationBoundaryMeasurement[],
): void {
  const failures = measurements.filter(
    (measurement) =>
      measurement.boundaryRowsCrossed < measurement.preBoundaryRowsCrossed,
  );
  if (failures.length === 0) return;
  const failureDescriptions = failures.map(
    (measurement) =>
      `frame ${measurement.boundaryFrameCount} ` +
      `${measurement.preBoundaryRowsCrossed}->` +
      `${measurement.boundaryRowsCrossed} rows at ` +
      `${measurement.actualDelayMilliseconds.toFixed(1)}ms ` +
      `(requested ${measurement.requestedDelayMilliseconds}ms)`,
  );
  throw new Error(
    `live-glide continuation slowed at boundary: ` +
      failureDescriptions.join('; '),
  );
}

function printContinuationBoundary(
  surface: ScrollSurface,
  measurement: ContinuationBoundaryMeasurement,
): void {
  console.error(
    `${surface} continuation requested=` +
      `${measurement.requestedDelayMilliseconds}ms ` +
      `actual=${measurement.actualDelayMilliseconds.toFixed(1)}ms ` +
      `frames=${measurement.preBoundaryFrameCount}->` +
      `${measurement.boundaryFrameCount} ` +
      `rows=${measurement.preBoundaryRowsCrossed}->` +
      `${measurement.boundaryRowsCrossed}`,
  );
}

async function jumpEditorToDepth(
  driver: PtyTestDriver.Model,
  statusPath: string,
  targetDepthLine: number,
): Promise<number> {
  if (targetDepthLine === 0) {
    driver.sendKeysWithoutFrameExpectation('Control+Home');
    await awaitStatusCondition(
      statusPath,
      'the depth-0 setup jump to reach the document origin',
      (status) => Number(status.editorScrollTop) === 0,
    );
  } else {
    const targetLineMarker = `line ${String(targetDepthLine).padStart(6, '0')} content`;
    driver.sendKeysWithoutFrameExpectation('Control+f');
    await awaitStatusCondition(
      statusPath,
      `Find to open before the depth-${targetDepthLine} jump`,
      (status) => status.findOpen === true,
    );
    driver.sendKeysWithoutFrameExpectation(
      ...Array.from({ length: targetLineMarker.length }, () => 'Backspace'),
    );
    driver.sendText(targetLineMarker);
    await awaitStatusCondition(
      statusPath,
      `Find to navigate directly to depth ${targetDepthLine}`,
      (status) =>
        Number(status.cursorLineIndex) === targetDepthLine &&
        Number(status.findMatchCount) === 1,
    );
    driver.sendKeysWithoutFrameExpectation('Escape');
    await awaitStatusCondition(
      statusPath,
      `Find to close after the depth-${targetDepthLine} jump`,
      (status) => status.findOpen === false,
    );
  }
  await drainToQuiescence(driver);
  const actualStartLine = visibleTopLineIndex(driver.snapshot());
  if (actualStartLine === null) {
    throw new Error(
      `Depth-${targetDepthLine} jump settled without a visible fixture line`,
    );
  }
  return actualStartLine;
}

async function measureDepthCheckpoint(
  driver: PtyTestDriver.Model,
  targetDepthLine: number,
  actualStartLine: number,
): Promise<Omit<DepthCheckpointMeasurement, 'ratioToReference'>> {
  const samples: GestureFrameSample[] = [];
  const targetEndLine = actualStartLine + DEPTH_GESTURE_TARGET_ROWS;
  driver.sendRawInputWithoutFrameExpectation(
    wheelInput('down', WHEEL_NOTCHES_PER_GESTURE),
  );
  while (true) {
    const completed = await driver.awaitNextCompletedFrameSnapshot(
      FRAME_ARRIVAL_TIMEOUT_MILLISECONDS,
    );
    const scrollTop = visibleTopLineIndex(completed.snapshot);
    if (scrollTop === null) continue;
    samples.push({
      completedFrameCount: completed.completedFrame.completedFrameCount,
      byteArrivalTimestampMilliseconds:
        completed.completedFrame.byteArrivalTimestampMilliseconds,
      observedByteCount: completed.completedFrame.observedByteCount,
      scrollTop,
    });
    if (scrollTop >= targetEndLine) break;
    if (samples.length % DEPTH_GESTURE_REFRESH_FRAME_INTERVAL === 0) {
      driver.sendRawInputWithoutFrameExpectation(
        wheelInput('down', WHEEL_NOTCHES_PER_GESTURE),
      );
    }
  }
  const firstSample = samples[0];
  const finalSample = samples.at(-1);
  if (!firstSample || !finalSample) {
    throw new Error(`Depth-${targetDepthLine} produced no frame samples`);
  }
  const durationMilliseconds =
    finalSample.byteArrivalTimestampMilliseconds -
    firstSample.byteArrivalTimestampMilliseconds;
  let movingFrameCount = 0;
  let previousScrollTop = actualStartLine;
  for (const sample of samples) {
    if (sample.scrollTop !== previousScrollTop) movingFrameCount++;
    previousScrollTop = sample.scrollTop;
  }
  return {
    targetDepthLine,
    actualStartLine,
    actualEndLine: finalSample.scrollTop,
    rowsTravelled: finalSample.scrollTop - actualStartLine,
    observedFrameCount: samples.length,
    movingFrameCount,
    durationMilliseconds,
    framesPerSecond:
      durationMilliseconds > 0
        ? ((samples.length - 1) * 1000) / durationMilliseconds
        : 0,
  };
}

async function measureDepthCheckpoints(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<DepthCheckpointMeasurement[]> {
  const checkpointsWithoutRatios: Array<
    Omit<DepthCheckpointMeasurement, 'ratioToReference'>
  > = [];
  for (const targetDepthLine of DEPTH_CHECKPOINT_TARGETS) {
    const actualStartLine = await jumpEditorToDepth(
      driver,
      statusPath,
      targetDepthLine,
    );
    checkpointsWithoutRatios.push(
      await measureDepthCheckpoint(driver, targetDepthLine, actualStartLine),
    );
  }
  return checkpointsWithoutRatios.map((checkpoint) => ({
    ...checkpoint,
    ratioToReference:
      checkpoint.framesPerSecond / DEPTH_REFERENCE_FRAMES_PER_SECOND,
  }));
}

function assertDepthCheckpointFloors(
  caseLabel: string,
  checkpoints: readonly DepthCheckpointMeasurement[],
): void {
  for (const targetDepthLine of DEPTH_CHECKPOINT_TARGETS) {
    const checkpoint = checkpoints.find(
      (candidate) => candidate.targetDepthLine === targetDepthLine,
    );
    if (!checkpoint) {
      throw new Error(
        `${caseLabel} depth-${targetDepthLine} checkpoint is missing`,
      );
    }
    if (checkpoint.framesPerSecond < DEPTH_CHECKPOINT_FPS_FLOOR) {
      throw new Error(
        `${caseLabel} depth-${targetDepthLine} checkpoint ` +
          `${checkpoint.framesPerSecond.toFixed(1)} FPS is below ` +
          `${DEPTH_CHECKPOINT_FPS_FLOOR} FPS`,
      );
    }
  }
}

function proveDepthCheckpointFloorCanFail(): string {
  const syntheticCheckpoints = DEPTH_CHECKPOINT_TARGETS.map(
    (targetDepthLine): DepthCheckpointMeasurement => ({
      targetDepthLine,
      actualStartLine: targetDepthLine,
      actualEndLine: targetDepthLine + DEPTH_GESTURE_TARGET_ROWS,
      rowsTravelled: DEPTH_GESTURE_TARGET_ROWS,
      observedFrameCount: 100,
      movingFrameCount: 100,
      durationMilliseconds: 3_300,
      framesPerSecond: 27,
      ratioToReference: 0.9,
    }),
  );
  try {
    assertDepthCheckpointFloors('positive-control', syntheticCheckpoints);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('depth-75000') && message.includes('27.0 FPS')) {
      return message;
    }
    throw new Error(
      `Depth floor positive control failed with the wrong red: ${message}`,
    );
  }
  throw new Error('Depth floor positive control did not fail');
}

function aggregateEditorFrameAttribution(
  surfaceMeasurement: SurfaceMeasurement,
): EditorFrameAttributionMeasurement {
  const attributions = surfaceMeasurement.gestures.map(
    (gesture) => gesture.editorFrameAttribution,
  );
  if (
    attributions.length === 0 ||
    attributions.some((attribution) => attribution === null)
  ) {
    throw new Error(
      `${surfaceMeasurement.fixtureLineCount}-line editor gesture ` +
        `has no frame attribution`,
    );
  }
  const totals = attributions.reduce(
    (sum, attribution) => ({
      completedFrameCount:
        sum.completedFrameCount + attribution!.completedFrameCount,
      documentLineReads: sum.documentLineReads + attribution!.documentLineReads,
      foldProjectionLookups:
        sum.foldProjectionLookups + attribution!.foldProjectionLookups,
      wrapProjectionLookups:
        sum.wrapProjectionLookups + attribution!.wrapProjectionLookups,
      layoutComputations:
        sum.layoutComputations + attribution!.layoutComputations,
    }),
    {
      completedFrameCount: 0,
      documentLineReads: 0,
      foldProjectionLookups: 0,
      wrapProjectionLookups: 0,
      layoutComputations: 0,
    },
  );
  return {
    ...totals,
    documentLineReadsPerFrame:
      totals.documentLineReads / totals.completedFrameCount,
    foldProjectionLookupsPerFrame:
      totals.foldProjectionLookups / totals.completedFrameCount,
    wrapProjectionLookupsPerFrame:
      totals.wrapProjectionLookups / totals.completedFrameCount,
    layoutComputationsPerFrame:
      totals.layoutComputations / totals.completedFrameCount,
  };
}

function assertEditorFrameWorkPerFrameEquality(
  baseline: EditorFrameAttributionMeasurement,
  comparison: EditorFrameAttributionMeasurement,
  comparisonFixtureLineCount: number,
  baselineFixtureLineCount: number,
): EditorFrameCounts {
  const countFields = [
    ['documentLineReads', 'document-line reads'],
    ['foldProjectionLookups', 'fold projection lookups'],
    ['wrapProjectionLookups', 'wrap projection lookups'],
    ['layoutComputations', 'layout computations'],
  ] as const;
  const ratios = {
    documentLineReads: 0,
    foldProjectionLookups: 0,
    wrapProjectionLookups: 0,
    layoutComputations: 0,
  };
  for (const [countField, countLabel] of countFields) {
    const baselineCount = baseline[countField];
    const comparisonCount = comparison[countField];
    if (baselineCount <= 0 || comparisonCount <= 0) {
      throw new Error(
        `scale-invariance ${countLabel} did not observe a positive count`,
      );
    }
    const numerator = comparisonCount * baseline.completedFrameCount;
    const denominator = baselineCount * comparison.completedFrameCount;
    const ratio = numerator / denominator;
    ratios[countField] = ratio;
    if (numerator !== denominator) {
      throw new Error(
        `scale-invariance ${countLabel}-per-frame ratio ` +
          `${comparisonFixtureLineCount}/${baselineFixtureLineCount}=` +
          `${ratio.toFixed(6)}, expected exact 1 ` +
          `(counts ${comparisonCount}/${comparison.completedFrameCount} ` +
          `vs ${baselineCount}/${baseline.completedFrameCount})`,
      );
    }
  }
  return ratios;
}

function measureEditorScaleInvariance(
  measurements: readonly SurfaceMeasurement[],
): EditorScaleInvarianceMeasurement | null {
  const editorCases = measurements.filter(
    (measurement) =>
      measurement.surface === 'editor' &&
      measurement.fixtureShape === 'flat' &&
      measurement.codeFolding === 'on',
  );
  const baselineCase = editorCases.find(
    (measurement) => measurement.fixtureLineCount === 2_000,
  );
  const comparisonCase = editorCases.find(
    (measurement) => measurement.fixtureLineCount === 100_000,
  );
  if (!baselineCase || !comparisonCase) return null;
  const baseline = aggregateEditorFrameAttribution(baselineCase);
  const comparison = aggregateEditorFrameAttribution(comparisonCase);
  return {
    baselineFixtureLineCount: baselineCase.fixtureLineCount,
    comparisonFixtureLineCount: comparisonCase.fixtureLineCount,
    baseline,
    comparison,
    ratios: assertEditorFrameWorkPerFrameEquality(
      baseline,
      comparison,
      comparisonCase.fixtureLineCount,
      baselineCase.fixtureLineCount,
    ),
  };
}

function proveEditorScaleInvarianceCanFail(): string {
  const baseline: EditorFrameAttributionMeasurement = {
    completedFrameCount: 10,
    documentLineReads: 20_000,
    foldProjectionLookups: 400,
    wrapProjectionLookups: 20,
    layoutComputations: 10,
    documentLineReadsPerFrame: 2_000,
    foldProjectionLookupsPerFrame: 40,
    wrapProjectionLookupsPerFrame: 2,
    layoutComputationsPerFrame: 1,
  };
  const documentScaleCost: EditorFrameAttributionMeasurement = {
    ...baseline,
    documentLineReads: 1_000_000,
    documentLineReadsPerFrame: 100_000,
  };
  try {
    assertEditorFrameWorkPerFrameEquality(
      baseline,
      documentScaleCost,
      100_000,
      2_000,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('document-line reads-per-frame ratio') &&
      message.includes('50.000000')
    ) {
      return message;
    }
    throw new Error(
      `Scale-invariance positive control produced the wrong red: ${message}`,
    );
  }
  throw new Error('Scale-invariance positive control did not fail');
}

function printDepthCheckpointTable(
  surfaceMeasurement: SurfaceMeasurement,
): void {
  if (surfaceMeasurement.depthCheckpoints.length === 0) return;
  console.error(
    `depth checkpoints: ${surfaceMeasurement.fixtureShape} ` +
      `${surfaceMeasurement.fixtureLineCount}-line editor`,
  );
  console.error(
    '| target depth | actual start | rows travelled | FPS | ' +
      'ratio to 100k top | floor |',
  );
  console.error('| ---: | ---: | ---: | ---: | ---: | :---: |');
  for (const checkpoint of surfaceMeasurement.depthCheckpoints) {
    console.error(
      `| ${checkpoint.targetDepthLine} | ${checkpoint.actualStartLine} | ` +
        `${checkpoint.rowsTravelled} | ` +
        `${checkpoint.framesPerSecond.toFixed(1)} | ` +
        `${checkpoint.ratioToReference.toFixed(3)} | PASS |`,
    );
  }
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

function flatFixtureLines(fixtureLineCount: number): string[] {
  // Keep this axis genuinely flat: a size fixture with no structural fold ranges.
  return Array.from({ length: fixtureLineCount }, (_unusedValue, lineIndex) => {
    return `line ${String(lineIndex).padStart(6, '0')} content`;
  });
}

function fixtureLineMarker(lineIndex: number, suffix: string): string {
  return `line ${String(lineIndex).padStart(6, '0')} content ${suffix}`;
}

function foldDenseGroup(firstLineIndex: number): string[] {
  const lines: string[] = [];
  const pushLine = (lineText: string): void => {
    lines.push(
      lineText.replace(
        '$marker',
        fixtureLineMarker(firstLineIndex + lines.length, 'dependency'),
      ),
    );
  };

  pushLine('  { "$marker": {');
  for (let nestingIndex = 0; nestingIndex < 8; nestingIndex++) {
    const indentation = '  '.repeat(nestingIndex + 2);
    pushLine(
      `${indentation}"$marker-${String(nestingIndex).padStart(2, '0')}": {`,
    );
  }
  pushLine(`${'  '.repeat(10)}"$marker-versions": [`);
  pushLine(`${'  '.repeat(11)}{ "$marker-resolved": {`);
  pushLine(`${'  '.repeat(12)}"$marker-integrity": "sha512-fixture"`);
  pushLine(`${'  '.repeat(11)}}, "$marker-optional": true`);
  pushLine(`${'  '.repeat(10)}}, "$marker-peer"`);
  pushLine(`${'  '.repeat(9)}], "$marker-dev": false`);
  for (let nestingIndex = 8; nestingIndex > 0; nestingIndex--) {
    pushLine(`${'  '.repeat(nestingIndex)}}, "$marker-sibling": true`);
  }
  pushLine('  }, "$marker-package": true },');
  return lines;
}

function foldDenseFixtureLines(fixtureLineCount: number): string[] {
  const lines = [`{ "${fixtureLineMarker(0, 'packages')}": [`];
  const finalLineCount = 1;
  while (
    lines.length + foldDenseGroup(lines.length).length + finalLineCount <=
    fixtureLineCount
  ) {
    lines.push(...foldDenseGroup(lines.length));
  }
  while (lines.length + finalLineCount < fixtureLineCount) {
    lines.push(`  "${fixtureLineMarker(lines.length, 'long-key-run')}",`);
  }
  lines.push(`  "${fixtureLineMarker(lines.length, 'final-entry')}" ] }`);
  return lines;
}

function fixtureLines(
  fixtureLineCount: number,
  fixtureShape: FixtureShape,
): string[] {
  return fixtureShape === 'fold-dense'
    ? foldDenseFixtureLines(fixtureLineCount)
    : flatFixtureLines(fixtureLineCount);
}

async function buildFixture(
  fixtureRoot: string,
  fixtureLineCount: number,
  surface: ScrollSurface,
  fixtureShape: FixtureShape,
): Promise<string> {
  const fixtureExtension = fixtureShape === 'fold-dense' ? 'json' : 'txt';
  const fixtureName = fixtureShape === 'fold-dense' ? 'dense' : 'flat';
  const fixtureFileName =
    `${fixtureName}-${String(fixtureLineCount).padStart(6, '0')}.` +
    fixtureExtension;
  const fixturePath = join(fixtureRoot, fixtureFileName);
  const lines = fixtureLines(fixtureLineCount, fixtureShape);
  await Bun.write(fixturePath, `${lines.join('\n')}\n`);
  // Quick Open uses ripgrep when available and Git as its fallback. Every
  // fixture is a one-file repository so either enumerator proves the same
  // single activatable result instead of depending on the host PATH.
  runGit(fixtureRoot, ['init', '-q']);
  runGit(fixtureRoot, ['config', 'user.name', 'scroll-smoothness']);
  runGit(fixtureRoot, [
    'config',
    'user.email',
    'scroll-smoothness@example.test',
  ]);
  runGit(fixtureRoot, ['add', fixtureFileName]);
  runGit(fixtureRoot, ['commit', '-qm', 'base']);
  if (
    surface === 'editor' &&
    (fixtureShape === 'flat' || !VERSION_CONTROL_MARKS_ENABLED)
  ) {
    return fixtureFileName;
  }
  // The fold-dense editor case deliberately carries version-control gutter marks together with
  // indentation and fold controls. The edits stay inside JSON string values, preserving the
  // structural positive control while placing a mark inside the instrument's fast window and
  // bounding the 100k fixture to 1,000 diff blocks.
  if (surface === 'editor') {
    for (
      let changedLineIndex = 25;
      changedLineIndex < fixtureLineCount;
      changedLineIndex += 100
    ) {
      lines[changedLineIndex] = (lines[changedLineIndex] ?? '').replace(
        ' content ',
        ' content changed-',
      );
    }
    await Bun.write(fixturePath, `${lines.join('\n')}\n`);
    return fixtureFileName;
  }

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
    driver.sendKeysWithoutFrameExpectation('Control+p');
    await driver.awaitGridCondition(
      'quick open to receive the glide fixture name',
      (snapshot) => snapshot.findText('Go to File') !== null,
      60_000,
    );
    driver.sendText(fixtureFileName);
    // The Files pane already shows this name behind Quick Open, so grid text
    // cannot prove that asynchronous enumeration produced an activatable row.
    await awaitStatusCondition(
      statusPath,
      'quick open to select the exact glide fixture',
      (status) =>
        status.quickOpenOpen === true &&
        status.quickOpenQuery === fixtureFileName &&
        Number(status.quickOpenMatches) === 1 &&
        Number(status.quickOpenSelected) === 0,
      60_000,
    );
    driver.sendKeysWithoutFrameExpectation('Enter');
    await awaitStatusCondition(
      statusPath,
      'quick open to activate the exact glide fixture',
      (status) =>
        typeof status.activeBuffer === 'string' &&
        status.activeBuffer.endsWith(fixtureFileName),
      60_000,
    );
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
  fixtureShape: FixtureShape,
  codeFolding: CodeFoldingMode,
): Promise<SurfaceMeasurement> {
  const shouldMeasureDepthCheckpoints =
    surface === 'editor' &&
    fixtureLineCount >= DEPTH_CHECKPOINT_FIXTURE_MINIMUM_LINES &&
    fixtureShape === 'fold-dense' &&
    codeFolding === 'on' &&
    VERSION_CONTROL_MARKS_ENABLED;
  const shouldMeasureContinuationBoundaries =
    surface === 'editor' &&
    fixtureLineCount === 2_000 &&
    fixtureShape === 'flat' &&
    codeFolding === 'on';
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-scroll-smoothness-'));
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-scroll-smoothness-home-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  const fixtureFileName = await buildFixture(
    fixtureRoot,
    fixtureLineCount,
    surface,
    fixtureShape,
  );
  const userSettingsDirectory = join(homeDirectory, '.config', 'invar');
  mkdirSync(userSettingsDirectory, { recursive: true });
  await Bun.write(
    join(userSettingsDirectory, 'settings.json'),
    JSON.stringify({
      'editor.codeFolding': codeFolding === 'on',
      showIndentGuides: true,
    }),
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
    if (surface === 'editor') {
      await awaitStatusCondition(
        statusPath,
        `editor.codeFolding to load as ${codeFolding}`,
        (status) => status.codeFolding === (codeFolding === 'on'),
        60_000,
      );
    }
    if (
      surface === 'editor' &&
      fixtureShape === 'fold-dense' &&
      VERSION_CONTROL_MARKS_ENABLED
    ) {
      await driver.awaitGridCondition(
        'version-control gutter marks to join folds and indent guides',
        (snapshot) => {
          const changedLinePosition = snapshot.findText(
            'line 000025 content changed-',
          );
          return (
            changedLinePosition !== null &&
            snapshot
              .rowText(changedLinePosition.row)
              .slice(0, changedLinePosition.column)
              .includes('▎')
          );
        },
        60_000,
      );
    }
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
    const continuationBoundaries: ContinuationBoundaryMeasurement[] = [];
    let depthCheckpoints: DepthCheckpointMeasurement[] = [];
    let depthCheckpointWallClockMilliseconds = 0;
    if (shouldMeasureDepthCheckpoints) {
      const depthCheckpointStartMilliseconds = performance.now();
      depthCheckpoints = await measureDepthCheckpoints(driver, statusPath);
      depthCheckpointWallClockMilliseconds =
        performance.now() - depthCheckpointStartMilliseconds;
      assertDepthCheckpointFloors(
        `${fixtureShape} ${fixtureLineCount}-line editor`,
        depthCheckpoints,
      );
    } else {
      if (shouldMeasureContinuationBoundaries) {
        for (const delayMilliseconds of CONTINUATION_DELAY_MILLISECONDS) {
          await driveSurfaceToTop(driver, statusPath, surface);
          await drainToQuiescence(driver);
          const continuationBoundary = await measureContinuationBoundary(
            driver,
            delayMilliseconds,
          );
          continuationBoundaries.push(continuationBoundary);
          printContinuationBoundary(surface, continuationBoundary);
        }
        assertContinuationBoundaries(continuationBoundaries);
      }
      for (
        let gestureIndex = 0;
        gestureIndex < GESTURE_REPEAT_COUNT;
        gestureIndex++
      ) {
        await driveSurfaceToTop(driver, statusPath, surface);
        await drainToQuiescence(driver);
        gestures.push(await measureOneGesture(driver, statusPath, surface));
      }
    }
    return {
      surface,
      fixtureShape,
      codeFolding,
      indentGuides: true,
      versionControlMarks:
        surface === 'editor' &&
        fixtureShape === 'fold-dense' &&
        VERSION_CONTROL_MARKS_ENABLED,
      fixtureLineCount,
      gestures,
      continuationBoundaries,
      depthCheckpoints,
      depthCheckpointWallClockMilliseconds,
    };
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
if (FIXTURE_SHAPES.length === 0) {
  throw new Error('SMOOTHNESS_FIXTURES must name flat, fold-dense, or both');
}
if (CODE_FOLDING_MODES.length === 0) {
  throw new Error('SMOOTHNESS_CODE_FOLDING must name on, off, or both');
}
if (
  !Number.isInteger(DEPTH_GESTURE_TARGET_ROWS) ||
  DEPTH_GESTURE_TARGET_ROWS < 1_000 ||
  DEPTH_GESTURE_TARGET_ROWS > 5_000
) {
  throw new Error(
    'SMOOTHNESS_DEPTH_GESTURE_ROWS must be an integer from 1000 to 5000',
  );
}
const depthCheckpointRequested =
  SURFACES.includes('editor') &&
  FIXTURE_SHAPES.includes('fold-dense') &&
  CODE_FOLDING_MODES.includes('on') &&
  VERSION_CONTROL_MARKS_ENABLED &&
  FIXTURE_LINE_COUNTS.some(
    (fixtureLineCount) =>
      fixtureLineCount >= DEPTH_CHECKPOINT_FIXTURE_MINIMUM_LINES,
  );
if (
  depthCheckpointRequested &&
  (!Number.isFinite(DEPTH_REFERENCE_FRAMES_PER_SECOND) ||
    DEPTH_REFERENCE_FRAMES_PER_SECOND <= 0)
) {
  throw new Error(
    'SMOOTHNESS_DEPTH_REFERENCE_FPS must name the measured 100k top FPS',
  );
}
const foldDensePositiveControl = foldDenseFixtureLines(101);
const parsedFoldDensePositiveControl = JSON.parse(
  foldDensePositiveControl.join('\n'),
) as unknown;
if (
  foldDensePositiveControl.length !== 101 ||
  typeof parsedFoldDensePositiveControl !== 'object' ||
  parsedFoldDensePositiveControl === null ||
  Array.isArray(parsedFoldDensePositiveControl)
) {
  throw new Error('fold-dense fixture positive control failed');
}
const depthCheckpointFloorPositiveControl = proveDepthCheckpointFloorCanFail();
console.error(
  `depth-floor positive control RED (expected): ` +
    depthCheckpointFloorPositiveControl,
);
const editorScaleInvariancePositiveControl =
  proveEditorScaleInvarianceCanFail();
console.error(
  `scale-invariance positive control RED (expected): ` +
    editorScaleInvariancePositiveControl,
);

const measurementRunStartMilliseconds = performance.now();
const surfaceMeasurements: SurfaceMeasurement[] = [];
for (const fixtureLineCount of FIXTURE_LINE_COUNTS) {
  for (const fixtureShape of FIXTURE_SHAPES) {
    for (const codeFolding of CODE_FOLDING_MODES) {
      for (const surface of SURFACES) {
        console.error(
          `measuring case: ${surface} ${fixtureShape} ` +
            `folding-${codeFolding} ${fixtureLineCount} lines`,
        );
        const surfaceMeasurement = await measureSurface(
          surface,
          fixtureLineCount,
          fixtureShape,
          codeFolding,
        );
        surfaceMeasurements.push(surfaceMeasurement);
        printDepthCheckpointTable(surfaceMeasurement);
        for (const [
          gestureIndex,
          measurement,
        ] of surfaceMeasurement.gestures.entries()) {
          console.error(
            `${surface} ${fixtureShape} folding-${codeFolding} ` +
              `${fixtureLineCount} lines gesture ${gestureIndex + 1}: ` +
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
              `maxBytes=${measurement.maximumFrameByteCount}` +
              (measurement.editorFrameAttribution
                ? ` lineReads/frame=` +
                  `${measurement.editorFrameAttribution.documentLineReadsPerFrame.toFixed(3)} ` +
                  `foldLookups/frame=` +
                  `${measurement.editorFrameAttribution.foldProjectionLookupsPerFrame.toFixed(3)} ` +
                  `wrapLookups/frame=` +
                  `${measurement.editorFrameAttribution.wrapProjectionLookupsPerFrame.toFixed(3)} ` +
                  `layout/frame=` +
                  `${measurement.editorFrameAttribution.layoutComputationsPerFrame.toFixed(3)}`
                : ''),
          );
        }
      }
    }
  }
}

const wallClockMilliseconds =
  performance.now() - measurementRunStartMilliseconds;
const depthCheckpointWallClockMilliseconds = surfaceMeasurements.reduce(
  (sum, measurement) => sum + measurement.depthCheckpointWallClockMilliseconds,
  0,
);
const editorScaleInvariance = measureEditorScaleInvariance(surfaceMeasurements);
if (editorScaleInvariance) {
  console.error(
    `scale-invariance counts: ` +
      `${editorScaleInvariance.baselineFixtureLineCount} lines vs ` +
      `${editorScaleInvariance.comparisonFixtureLineCount} lines`,
  );
  console.error(
    '| lines | frames | document reads/frame | fold lookups/frame | ' +
      'wrap lookups/frame | layout computations/frame |',
  );
  console.error('| ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [lineCount, attribution] of [
    [
      editorScaleInvariance.baselineFixtureLineCount,
      editorScaleInvariance.baseline,
    ],
    [
      editorScaleInvariance.comparisonFixtureLineCount,
      editorScaleInvariance.comparison,
    ],
  ] as const) {
    console.error(
      `| ${lineCount} | ${attribution.completedFrameCount} | ` +
        `${attribution.documentLineReadsPerFrame.toFixed(3)} | ` +
        `${attribution.foldProjectionLookupsPerFrame.toFixed(3)} | ` +
        `${attribution.wrapProjectionLookupsPerFrame.toFixed(3)} | ` +
        `${attribution.layoutComputationsPerFrame.toFixed(3)} |`,
    );
  }
}
const report = {
  commit: (await Bun.$`git rev-parse --short HEAD`.quiet().text()).trim(),
  wheelNotchesPerGesture: WHEEL_NOTCHES_PER_GESTURE,
  depthGestureTargetRows: DEPTH_GESTURE_TARGET_ROWS,
  depthCheckpointFpsFloor: DEPTH_CHECKPOINT_FPS_FLOOR,
  depthReferenceFramesPerSecond: Number.isFinite(
    DEPTH_REFERENCE_FRAMES_PER_SECOND,
  )
    ? DEPTH_REFERENCE_FRAMES_PER_SECOND
    : null,
  depthCheckpointFloorPositiveControl,
  editorScaleInvariancePositiveControl,
  editorScaleInvariance,
  wallClockMilliseconds,
  depthCheckpointWallClockMilliseconds,
  depthCheckpointWallClockFraction:
    wallClockMilliseconds > 0
      ? depthCheckpointWallClockMilliseconds / wallClockMilliseconds
      : 0,
  cases: surfaceMeasurements,
};
console.log(JSON.stringify(report, null, 2));
