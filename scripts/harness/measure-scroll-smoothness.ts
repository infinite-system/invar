#!/usr/bin/env bun
// SCROLL SMOOTHNESS INSTRUMENT — per-frame motion during ONE fast wheel glide, at the real PTY.
//
// The `gain` behavioural contract measures total DISPLACEMENT over five notches, which is a TIME
// integral of the momentum curve and therefore independent of how many frames deliver it. The same
// distance carried by fewer, larger steps is choppier while `gain` is untouched. This instrument
// measures the property `gain` cannot see: the SEQUENCE of viewport positions across every completed
// synchronized frame of one fast gesture, and hence the frame count, the per-frame delta
// distribution, and the peak velocity. Burst mode counts completed frames
// and their gaps while rapid input continues to arrive, exposing a wedged
// render loop that eventual motion would hide.
//
// The observed position is read from the EMULATOR GRID, not from the status file: the lowest visible
// `line NNNN content` index in a completed frame IS that frame's scrollTop, so every sample is
// exactly the position the user saw in that painted frame with no publish race.
//
// invariant: A fast glide crosses rows in many small steps (src/modules/ui/ui.invariants.md)
// invariant: Same-direction notches accumulate until the glide ceiling (src/modules/ui/ui.invariants.md)
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Blocking gate verdicts use ordering and counts (scripts/harness/harness.invariants.md)
// invariant: Async-published state is always awaited (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
// Only the PTY driver, input encoder, snapshot type, and quiet lock are imported from the harness.
// `HarnessSmoke`'s status helpers changed signature in the historical window, so the status poll
// below stays local and depends on nothing but the published file. A historical build without the
// published momentum-rest field cannot support this instrument: its final painted grid does not
// distinguish active momentum from rest, so no observable condition can replace a silence guess.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessInput } from './HarnessInput';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

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

const APPLICATION_REPOSITORY_ROOT =
  process.env.SMOOTHNESS_REPOSITORY_ROOT ?? process.cwd();

const VERTICAL_FLING_CEILING = Number(
  process.env.SMOOTHNESS_VERTICAL_FLING_CEILING ?? '220',
);

const MAXIMUM_GLIDE_DURATION_MILLISECONDS = Number(
  process.env.SMOOTHNESS_MAXIMUM_GLIDE_DURATION ?? '900',
);

const GLIDE_CAP_EASING_DURATION_MILLISECONDS = 900;

// Bootstrap caps every animation integration step at 100 milliseconds. A
// delayed frame can therefore carry up to this much motion; target FPS is not
// a maximum frame duration.
const MAXIMUM_ANIMATION_DELTA_TIME_SECONDS = Number(
  process.env.SMOOTHNESS_MAXIMUM_ANIMATION_DELTA_TIME_SECONDS ?? '0.1',
);

// A hard human flick: twelve notches creates a sustained fast segment without relying on PTY write
// splitting. The accumulation probe repeats this exact physical gesture; the ordinary smoothness
// cases use it to expose per-frame cadence and distance. Overridable for shorter-ramp probes.
const WHEEL_NOTCHES_PER_GESTURE = Number(
  process.env.SMOOTHNESS_NOTCHES ?? '12',
);

const ACCUMULATION_FLICK_COUNT = Number(
  process.env.SMOOTHNESS_ACCUMULATION_FLICKS ?? '3',
);

const ACCUMULATION_PAUSE_MILLISECONDS = Number(
  process.env.SMOOTHNESS_ACCUMULATION_PAUSE ?? '200',
);

const CONTINUOUS_INPUT_BURST_DURATIONS_MILLISECONDS = (
  process.env.SMOOTHNESS_BURST_DURATIONS ?? ''
)
  .split(',')
  .map((durationText) => Number(durationText.trim()))
  .filter(
    (durationMilliseconds) =>
      Number.isInteger(durationMilliseconds) && durationMilliseconds > 0,
  );

const CONTINUOUS_INPUT_WINDOW_MILLISECONDS = Number(
  process.env.SMOOTHNESS_BURST_WINDOW ?? '100',
);

const CONTINUOUS_INPUT_NOTCHES_PER_WINDOW = Number(
  process.env.SMOOTHNESS_BURST_NOTCHES ?? '12',
);

const CONTINUOUS_INPUT_FRAME_PROGRESS_REQUIRED =
  process.env.SMOOTHNESS_REQUIRE_FRAME_PROGRESS === '1';

const CONTINUOUS_INPUT_COALESCING_REQUIRED =
  process.env.SMOOTHNESS_REQUIRE_INPUT_COALESCING === '1';

// Trials, not samples of one trial: the fling that follows an idle app and the fling that follows a
// previous fling reach measurably different peak velocities, so the contract needs at least one of
// each and manual measurement wants a third to see which of the two a run landed on.
const GESTURE_REPEAT_COUNT = Number(process.env.SMOOTHNESS_GESTURES ?? '3');

const MINIMUM_GLIDE_MOVING_FRAME_COUNT = 10;

const DEFAULT_CONTINUATION_MINIMUM_MOVING_FRAME_COUNTS = [
  Math.ceil(MINIMUM_GLIDE_MOVING_FRAME_COUNT / 2),
  MINIMUM_GLIDE_MOVING_FRAME_COUNT,
];

const CONTINUATION_MINIMUM_MOVING_FRAME_COUNTS = (
  process.env.SMOOTHNESS_CONTINUATION_MINIMUM_MOVING_FRAMES ??
  DEFAULT_CONTINUATION_MINIMUM_MOVING_FRAME_COUNTS.join(',')
)
  .split(',')
  .map((frameCountText) => Number(frameCountText.trim()))
  .filter(
    (movingFrameCount) =>
      Number.isInteger(movingFrameCount) && movingFrameCount > 0,
  );

const DEPTH_GESTURE_TARGET_ROWS = Number(
  process.env.SMOOTHNESS_DEPTH_GESTURE_ROWS ?? '1000',
);

const DEPTH_REFERENCE_FRAMES_PER_SECOND = Number(
  process.env.SMOOTHNESS_DEPTH_REFERENCE_FPS ?? 'NaN',
);

const DEPTH_CHECKPOINT_TARGETS = [75_000] as const;

const DEPTH_CHECKPOINT_FIXTURE_MINIMUM_LINES = 80_000;

const DEPTH_CHECKPOINT_FPS_CANARY = 28;

const DEPTH_GESTURE_REFRESH_FRAME_INTERVAL = 6;

const DEPTH_GESTURE_EXACT_ROW_MAXIMUM_CORRECTIONS = Math.ceil(
  VERTICAL_FLING_CEILING * MAXIMUM_ANIMATION_DELTA_TIME_SECONDS,
);

const TERMINAL_COLUMNS = 120;

const TERMINAL_ROWS = 40;

const EDITOR_WHEEL_COLUMN = 80;

const EDITOR_WHEEL_ROW = 12;

// Preserve the existing continuous-input deadline margin while observing the published rest state.
const CONTINUOUS_INPUT_REST_TIMEOUT_MARGIN_MILLISECONDS = 700;

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
  readonly singleNotch: SingleNotchMeasurement;
  readonly gestures: readonly GestureMeasurement[];
  readonly accumulationFlicks: readonly AccumulationFlickMeasurement[];
  readonly continuationBoundaries: readonly ContinuationBoundaryMeasurement[];
  readonly continuousInputBursts: readonly ContinuousInputBurstMeasurement[];
  readonly depthCheckpoints: readonly DepthCheckpointMeasurement[];
  readonly depthCheckpointWallClockMilliseconds: number;
}

interface SingleNotchMeasurement {
  readonly appliedImpulseCount: number;
  readonly rowsTravelled: number;
}

interface ContinuousInputBurstMeasurement {
  readonly requestedDurationMilliseconds: number;
  readonly actualInputDurationMilliseconds: number;
  readonly inputEventCount: number;
  readonly appliedImpulseCount: number;
  readonly inputEventsPerSecond: number;
  readonly projectionPassCount: number;
  readonly rowsTravelled: number;
  readonly rowCrossingSequence: readonly number[];
  readonly maximumFrameDeltaRows: number;
  readonly inputWindowFrameCounts: readonly number[];
  readonly completedFrameGapSequenceMilliseconds: readonly number[];
  readonly maximumConsecutiveZeroFrameWindows: number;
  readonly maximumFrameStarvationMilliseconds: number;
  readonly inputToFirstCompletedFrameMilliseconds: number | null;
  readonly finalInputToNextCompletedFrameMilliseconds: number | null;
}

function continuousInputCoalescingFailure(
  surfaceMeasurements: readonly SurfaceMeasurement[],
): string | null {
  const burstCases = surfaceMeasurements.filter(
    (measurement) => measurement.continuousInputBursts.length === 1,
  );
  if (
    burstCases.length !== 4 ||
    new Set(burstCases.map((measurement) => measurement.surface)).size !== 2 ||
    new Set(burstCases.map((measurement) => measurement.fixtureLineCount))
      .size !== 2
  ) {
    return (
      `rapid-input coalescing expected editor and diff at two scales; ` +
      `received ${burstCases.length} cases`
    );
  }
  for (const measurement of burstCases) {
    const burst = measurement.continuousInputBursts[0]!;
    if (burst.appliedImpulseCount !== burst.inputEventCount) {
      return (
        `${measurement.surface} ${measurement.fixtureLineCount}-line ` +
        `rapid input applied ${burst.appliedImpulseCount}/` +
        `${burst.inputEventCount} wheel impulses`
      );
    }
    if (burst.projectionPassCount >= burst.inputEventCount) {
      return (
        `${measurement.surface} ${measurement.fixtureLineCount}-line ` +
        `rapid input ran ${burst.projectionPassCount} projection passes ` +
        `for ${burst.inputEventCount} wheel events`
      );
    }
  }
  for (const surface of ['editor', 'diff'] as const) {
    const surfaceCases = burstCases
      .filter((measurement) => measurement.surface === surface)
      .sort(
        (firstMeasurement, secondMeasurement) =>
          firstMeasurement.fixtureLineCount -
          secondMeasurement.fixtureLineCount,
      );
    const baselineBurst = surfaceCases[0]!.continuousInputBursts[0]!;
    const largeBurst = surfaceCases[1]!.continuousInputBursts[0]!;
    const maximumOneFrameTravelRows = Math.ceil(
      VERTICAL_FLING_CEILING * MAXIMUM_ANIMATION_DELTA_TIME_SECONDS,
    );
    if (
      Math.abs(baselineBurst.rowsTravelled - largeBurst.rowsTravelled) >
      maximumOneFrameTravelRows
    ) {
      return (
        `${surface} rapid-input travel changed with document scale: ` +
        `${surfaceCases[0]!.fixtureLineCount} lines travelled ` +
        `${baselineBurst.rowsTravelled} rows, ` +
        `${surfaceCases[1]!.fixtureLineCount} lines travelled ` +
        `${largeBurst.rowsTravelled} rows; one-frame budget is ` +
        `${maximumOneFrameTravelRows} rows from ` +
        `${VERTICAL_FLING_CEILING} rows/s * ` +
        `${MAXIMUM_ANIMATION_DELTA_TIME_SECONDS}s maximum animation step`
      );
    }
  }
  return null;
}

function proveContinuousInputCoalescingCanFail(): string {
  const badBurst: ContinuousInputBurstMeasurement = {
    requestedDurationMilliseconds: 1_050,
    actualInputDurationMilliseconds: 1_050,
    inputEventCount: 150,
    appliedImpulseCount: 150,
    inputEventsPerSecond: 142.9,
    projectionPassCount: 150,
    rowsTravelled: 384,
    rowCrossingSequence: [],
    maximumFrameDeltaRows: 0,
    inputWindowFrameCounts: [],
    completedFrameGapSequenceMilliseconds: [],
    maximumConsecutiveZeroFrameWindows: 0,
    maximumFrameStarvationMilliseconds: 0,
    inputToFirstCompletedFrameMilliseconds: null,
    finalInputToNextCompletedFrameMilliseconds: null,
  };
  const badCases = (['editor', 'diff'] as const).flatMap((surface) =>
    [2_000, 100_000].map((fixtureLineCount): SurfaceMeasurement => ({
      surface,
      fixtureShape: 'fold-dense',
      codeFolding: 'on',
      indentGuides: true,
      versionControlMarks: surface === 'editor',
      fixtureLineCount,
      singleNotch: {
        appliedImpulseCount: 1,
        rowsTravelled: 1,
      },
      gestures: [],
      accumulationFlicks: [],
      continuationBoundaries: [],
      continuousInputBursts: [badBurst],
      depthCheckpoints: [],
      depthCheckpointWallClockMilliseconds: 0,
    })),
  );
  const failure = continuousInputCoalescingFailure(badCases);
  if (!failure) {
    throw new Error('rapid-input coalescing positive control did not fail');
  }
  return failure;
}

function proveContinuousInputScaleTravelCanFail(): string {
  const maximumOneFrameTravelRows = Math.ceil(
    VERTICAL_FLING_CEILING * MAXIMUM_ANIMATION_DELTA_TIME_SECONDS,
  );
  const makeBurst = (
    rowsTravelled: number,
  ): ContinuousInputBurstMeasurement => ({
    requestedDurationMilliseconds: 900,
    actualInputDurationMilliseconds: 1_030,
    inputEventCount: 150,
    appliedImpulseCount: 150,
    inputEventsPerSecond: 145.6,
    projectionPassCount: 58,
    rowsTravelled,
    rowCrossingSequence: [],
    maximumFrameDeltaRows: 0,
    inputWindowFrameCounts: [],
    completedFrameGapSequenceMilliseconds: [],
    maximumConsecutiveZeroFrameWindows: 0,
    maximumFrameStarvationMilliseconds: 0,
    inputToFirstCompletedFrameMilliseconds: null,
    finalInputToNextCompletedFrameMilliseconds: null,
  });
  const cases = (['editor', 'diff'] as const).flatMap((surface) =>
    [2_000, 100_000].map((fixtureLineCount): SurfaceMeasurement => ({
      surface,
      fixtureShape: 'fold-dense',
      codeFolding: 'on',
      indentGuides: true,
      versionControlMarks: surface === 'editor',
      fixtureLineCount,
      singleNotch: {
        appliedImpulseCount: 1,
        rowsTravelled: 1,
      },
      gestures: [],
      accumulationFlicks: [],
      continuationBoundaries: [],
      continuousInputBursts: [
        makeBurst(
          fixtureLineCount === 2_000
            ? 400
            : 400 + maximumOneFrameTravelRows + 1,
        ),
      ],
      depthCheckpoints: [],
      depthCheckpointWallClockMilliseconds: 0,
    })),
  );
  const failure = continuousInputCoalescingFailure(cases);
  if (!failure || !failure.includes('travel changed with document scale')) {
    throw new Error('rapid-input scale-travel positive control did not fail');
  }
  return failure;
}

interface AccumulationFlickMeasurement {
  readonly flickIndex: number;
  readonly precedingCompletedFrameCount: number;
  readonly actualPauseBeforeMilliseconds: number | null;
  readonly rowCrossingSequence: readonly number[];
  readonly peakRowsCrossedPerFrame: number;
  readonly peakTwoFrameRowsCrossed: number;
  readonly peakFourFrameRowsCrossed: number;
  readonly peakVelocityRowsPerSecond: number;
}

interface ContinuationBoundaryMeasurement {
  readonly minimumMovingFrameCount: number;
  readonly actualDelayMilliseconds: number;
  readonly observedMovingFrameCount: number;
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
  readonly exactRowCorrectionCount: number;
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
  scrollTopBeforeInput: number,
): GestureMeasurement {
  const positions = samples.map((sample) => sample.scrollTop);
  const frameDeltas =
    samples.length === 0
      ? []
      : [
          samples[0]!.scrollTop - scrollTopBeforeInput,
          ...samples
            .slice(1)
            .map(
              (sample, sampleIndex) =>
                sample.scrollTop - samples[sampleIndex]!.scrollTop,
            ),
        ];
  let peakVelocityRowsPerSecond = 0;
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const previousTimestampMilliseconds =
      sampleIndex === 0
        ? inputWrittenTimestampMilliseconds
        : samples[sampleIndex - 1]!.byteArrivalTimestampMilliseconds;
    const deltaMilliseconds =
      samples[sampleIndex]!.byteArrivalTimestampMilliseconds -
      previousTimestampMilliseconds;
    if (deltaMilliseconds > 0) {
      peakVelocityRowsPerSecond = Math.max(
        peakVelocityRowsPerSecond,
        (frameDeltas[sampleIndex]! * 1000) / deltaMilliseconds,
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
  const sustainedFastFrameEndIndex = frameDeltas
    .slice(1)
    .reduce(
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
      positions.length === 0 ? 0 : positions.at(-1)! - scrollTopBeforeInput,
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

async function drainToQuiescence(
  statusPath: string,
  surface: ScrollSurface,
): Promise<void> {
  const restStatusField = animationRestStatusField(surface);
  await awaitStatusCondition(
    statusPath,
    `${surface} scrolling to reach its published rest state`,
    (status) => status[restStatusField] === true,
  );
}

async function measureOneGesture(
  driver: PtyTestDriver.Model,
  statusPath: string,
  surface: ScrollSurface,
): Promise<GestureMeasurement> {
  const samples: GestureFrameSample[] = [];
  const scrollTopBeforeInput = visibleTopLineIndex(driver.snapshot());
  if (scrollTopBeforeInput === null) {
    throw new Error(
      `${surface} gesture started without a visible fixture line`,
    );
  }
  const editorFrameAttributionBefore =
    surface === 'editor' ? readEditorFrameAttributionTotals(statusPath) : null;
  const restStatusField = animationRestStatusField(surface);
  // ONE write for the whole notch train. Written as separate writes the train straddles two input
  // regimes — the application either reads several notches in one chunk (their impulses compound
  // before any frame decays them) or reads them one at a time across frames (each impulse is decayed
  // before the next lands) — and the same 12-notch gesture then lands on one of three quantized
  // outcomes differing by ~35% in both distance and peak velocity. That spread is a property of how
  // the bytes happened to split, not of the build under test, so a single write removes it and the
  // measurement compares builds instead of comparing PTY chunk boundaries.
  let inputWrittenTimestampMilliseconds = 0;
  const completedFrameObservations =
    await driver.collectCompletedFrameObservationsUntil({
      conditionDescription: `${surface} gesture moves and reaches published momentum rest`,
      condition: () => {
        const status = JSON.parse(readFileSync(statusPath, 'utf8')) as Record<
          string,
          unknown
        >;
        return (
          Number(status[scrollStatusField(surface)] ?? 0) >
            scrollTopBeforeInput && status[restStatusField] === true
        );
      },
      performAction: () => {
        inputWrittenTimestampMilliseconds = performance.now();
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
      },
      timeoutMilliseconds: 30_000,
    });
  for (const completed of completedFrameObservations) {
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
    scrollTopBeforeInput,
  );
}

async function measureContinuationBoundary(
  driver: PtyTestDriver.Model,
  minimumMovingFrameCount: number,
): Promise<ContinuationBoundaryMeasurement> {
  const samples: GestureFrameSample[] = [];
  let observedMovingFrameCount = 0;
  let firstGestureTimestampMilliseconds = 0;
  let secondGestureTimestampMilliseconds = 0;
  let preBoundarySample: GestureFrameSample | null = null;
  let preBoundaryRowsCrossed = 0;
  let boundarySample: GestureFrameSample | null = null;
  await driver.collectCompletedFrameObservationsUntil({
    conditionDescription:
      `continuation minimumMovingFrames=${minimumMovingFrameCount} ` +
      'observes the first frame after its follow-on input',
    condition: () => boundarySample !== null,
    performAction: () => {
      firstGestureTimestampMilliseconds = performance.now();
      driver.sendRawInputWithoutFrameExpectation(
        wheelInput('down', WHEEL_NOTCHES_PER_GESTURE),
      );
    },
    observeFrame: (completed) => {
      const scrollTop = visibleTopLineIndex(completed.snapshot);
      if (scrollTop === null) return;
      const sample: GestureFrameSample = {
        completedFrameCount: completed.completedFrame.completedFrameCount,
        byteArrivalTimestampMilliseconds:
          completed.completedFrame.byteArrivalTimestampMilliseconds,
        observedByteCount: completed.completedFrame.observedByteCount,
        scrollTop,
      };
      samples.push(sample);
      if (preBoundarySample) {
        boundarySample = sample;
        return;
      }
      if (samples.length < 2) return;
      const previousSample = samples.at(-2)!;
      const rowsCrossed = sample.scrollTop - previousSample.scrollTop;
      if (rowsCrossed <= 0) return;
      observedMovingFrameCount++;
      if (
        observedMovingFrameCount < minimumMovingFrameCount ||
        rowsCrossed !== 1
      ) {
        return;
      }
      preBoundarySample = sample;
      preBoundaryRowsCrossed = rowsCrossed;
      secondGestureTimestampMilliseconds = performance.now();
      driver.sendRawInputWithoutFrameExpectation(wheelInput('down', 1));
    },
    timeoutMilliseconds: 30_000,
  });
  const observedPreBoundarySample =
    preBoundarySample as GestureFrameSample | null;
  const observedBoundarySample = boundarySample as GestureFrameSample | null;
  if (!observedPreBoundarySample || !observedBoundarySample) {
    throw new Error(
      `continuation minimumMovingFrames=${minimumMovingFrameCount} ` +
        'did not observe its boundary samples',
    );
  }
  return {
    minimumMovingFrameCount,
    actualDelayMilliseconds:
      secondGestureTimestampMilliseconds - firstGestureTimestampMilliseconds,
    observedMovingFrameCount,
    preBoundaryFrameCount: observedPreBoundarySample.completedFrameCount,
    boundaryFrameCount: observedBoundarySample.completedFrameCount,
    preBoundaryRowsCrossed,
    boundaryRowsCrossed:
      observedBoundarySample.scrollTop - observedPreBoundarySample.scrollTop,
  };
}

async function measureAccumulationPattern(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<AccumulationFlickMeasurement[]> {
  const flickMeasurements = Array.from(
    { length: ACCUMULATION_FLICK_COUNT },
    (_unusedValue, flickIndex): AccumulationFlickMeasurement => ({
      flickIndex: flickIndex + 1,
      precedingCompletedFrameCount: 0,
      actualPauseBeforeMilliseconds: null,
      rowCrossingSequence: [],
      peakRowsCrossedPerFrame: 0,
      peakTwoFrameRowsCrossed: 0,
      peakFourFrameRowsCrossed: 0,
      peakVelocityRowsPerSecond: 0,
    }),
  );
  const mutableFlickMeasurements = flickMeasurements as Array<{
    flickIndex: number;
    precedingCompletedFrameCount: number;
    actualPauseBeforeMilliseconds: number | null;
    rowCrossingSequence: number[];
    peakRowsCrossedPerFrame: number;
    peakTwoFrameRowsCrossed: number;
    peakFourFrameRowsCrossed: number;
    peakVelocityRowsPerSecond: number;
  }>;
  const flickTimestampsMilliseconds: number[] = [];
  let activeFlickIndex = 0;
  let previousScrollTop = 0;
  let previousFrameTimestampMilliseconds = performance.now();

  const sendFlick = (precedingCompletedFrameCount: number): void => {
    const flickTimestampMilliseconds = performance.now();
    mutableFlickMeasurements[activeFlickIndex]!.precedingCompletedFrameCount =
      precedingCompletedFrameCount;
    if (activeFlickIndex > 0) {
      mutableFlickMeasurements[
        activeFlickIndex
      ]!.actualPauseBeforeMilliseconds =
        flickTimestampMilliseconds -
        flickTimestampsMilliseconds[activeFlickIndex - 1]!;
    }
    flickTimestampsMilliseconds.push(flickTimestampMilliseconds);
    driver.sendRawInputWithoutFrameExpectation(
      wheelInput('down', WHEEL_NOTCHES_PER_GESTURE),
    );
  };

  await driver.collectCompletedFrameObservationsUntil({
    conditionDescription:
      'all accumulation flicks are delivered and momentum reaches rest',
    condition: () => {
      const status = JSON.parse(readFileSync(statusPath, 'utf8')) as Record<
        string,
        unknown
      >;
      return (
        activeFlickIndex + 1 >= ACCUMULATION_FLICK_COUNT &&
        status.workspaceScrollMomentumAtRest === true
      );
    },
    performAction: () => sendFlick(0),
    observeFrame: (completed) => {
      const scrollTop = visibleTopLineIndex(completed.snapshot);
      if (scrollTop === null) return;
      const rowsCrossed = scrollTop - previousScrollTop;
      const frameTimestampMilliseconds =
        completed.completedFrame.byteArrivalTimestampMilliseconds;
      const frameDurationMilliseconds =
        frameTimestampMilliseconds - previousFrameTimestampMilliseconds;
      if (rowsCrossed > 0) {
        const activeMeasurement = mutableFlickMeasurements[activeFlickIndex]!;
        const previousRowsCrossed =
          activeMeasurement.rowCrossingSequence.at(-1) ?? 0;
        activeMeasurement.rowCrossingSequence.push(rowsCrossed);
        activeMeasurement.peakRowsCrossedPerFrame = Math.max(
          activeMeasurement.peakRowsCrossedPerFrame,
          rowsCrossed,
        );
        activeMeasurement.peakTwoFrameRowsCrossed = Math.max(
          activeMeasurement.peakTwoFrameRowsCrossed,
          previousRowsCrossed + rowsCrossed,
        );
        const latestFourFrameRowsCrossed = activeMeasurement.rowCrossingSequence
          .slice(-4)
          .reduce(
            (totalRowsCrossed, frameRowsCrossed) =>
              totalRowsCrossed + frameRowsCrossed,
            0,
          );
        activeMeasurement.peakFourFrameRowsCrossed = Math.max(
          activeMeasurement.peakFourFrameRowsCrossed,
          latestFourFrameRowsCrossed,
        );
        if (frameDurationMilliseconds > 0) {
          activeMeasurement.peakVelocityRowsPerSecond = Math.max(
            activeMeasurement.peakVelocityRowsPerSecond,
            (rowsCrossed * 1000) / frameDurationMilliseconds,
          );
        }
      }
      previousScrollTop = scrollTop;
      previousFrameTimestampMilliseconds = frameTimestampMilliseconds;

      if (
        activeFlickIndex + 1 < ACCUMULATION_FLICK_COUNT &&
        performance.now() - flickTimestampsMilliseconds[activeFlickIndex]! >=
          ACCUMULATION_PAUSE_MILLISECONDS
      ) {
        activeFlickIndex++;
        sendFlick(completed.completedFrame.completedFrameCount);
      }
    },
    timeoutMilliseconds: 30_000,
  });
  return flickMeasurements;
}

async function measureContinuousInputBurst(
  driver: PtyTestDriver.Model,
  statusPath: string,
  surface: ScrollSurface,
  requestedDurationMilliseconds: number,
): Promise<ContinuousInputBurstMeasurement> {
  const statusBefore = JSON.parse(readFileSync(statusPath, 'utf8')) as Record<
    string,
    unknown
  >;
  const scrollTopBefore = Number(statusBefore[scrollStatusField(surface)] ?? 0);
  const impulseCountField =
    surface === 'editor'
      ? 'editorVerticalScrollImpulseCount'
      : 'diffVerticalScrollImpulseCount';
  const frameAttributionBefore = readEditorFrameAttributionTotals(statusPath);
  const inputWindowCount = Math.ceil(
    requestedDurationMilliseconds / CONTINUOUS_INPUT_WINDOW_MILLISECONDS,
  );
  const inputEventCount =
    inputWindowCount * CONTINUOUS_INPUT_NOTCHES_PER_WINDOW;
  const restStatusField = animationRestStatusField(surface);
  const inputWindowStartsMilliseconds: number[] = [];
  const completedFrameTimestampsMilliseconds: number[] = [];
  const observedScrollTops = [scrollTopBefore];
  let inputComplete = false;
  let inputEndTimestampMilliseconds = 0;
  await driver.collectCompletedFrameObservationsUntil({
    conditionDescription: `${surface} continuous input completes and momentum reaches rest`,
    condition: () => {
      const status = JSON.parse(readFileSync(statusPath, 'utf8')) as Record<
        string,
        unknown
      >;
      return (
        inputComplete &&
        Number(status[impulseCountField] ?? 0) >= inputEventCount &&
        status[restStatusField] === true
      );
    },
    performAction: () =>
      new Promise<void>((resolveInputProducer) => {
        const writeInputWindow = (): void => {
          inputWindowStartsMilliseconds.push(performance.now());
          driver.sendRawInputWithoutFrameExpectation(
            wheelInput('down', CONTINUOUS_INPUT_NOTCHES_PER_WINDOW),
          );
          if (inputWindowStartsMilliseconds.length >= inputWindowCount) {
            inputEndTimestampMilliseconds =
              inputWindowStartsMilliseconds.at(-1)! +
              CONTINUOUS_INPUT_WINDOW_MILLISECONDS;
            inputComplete = true;
            resolveInputProducer();
          }
        };
        writeInputWindow();
        if (inputWindowCount <= 1) return;
        const inputInterval = setInterval(() => {
          writeInputWindow();
          if (inputWindowStartsMilliseconds.length >= inputWindowCount) {
            clearInterval(inputInterval);
          }
        }, CONTINUOUS_INPUT_WINDOW_MILLISECONDS);
      }),
    observeFrame: (completed) => {
      completedFrameTimestampsMilliseconds.push(
        completed.completedFrame.byteArrivalTimestampMilliseconds,
      );
      const observedScrollTop = visibleTopLineIndex(completed.snapshot);
      if (observedScrollTop !== null)
        observedScrollTops.push(observedScrollTop);
    },
    timeoutMilliseconds:
      requestedDurationMilliseconds +
      CONTINUOUS_INPUT_REST_TIMEOUT_MARGIN_MILLISECONDS,
  });
  const statusAfter = JSON.parse(readFileSync(statusPath, 'utf8')) as Record<
    string,
    unknown
  >;
  const appliedImpulseCount = Number(statusAfter[impulseCountField] ?? 0);
  const projectionPassCount =
    readEditorFrameAttributionTotals(statusPath).completedFrameCount -
    frameAttributionBefore.completedFrameCount;
  const rowsTravelled =
    Number(statusAfter[scrollStatusField(surface)] ?? 0) - scrollTopBefore;
  const rowCrossingSequence = observedScrollTops
    .slice(1)
    .map(
      (observedScrollTop, observedScrollTopIndex) =>
        observedScrollTop - observedScrollTops[observedScrollTopIndex]!,
    )
    .filter((rowsCrossed) => rowsCrossed !== 0);

  const inputStartTimestampMilliseconds = inputWindowStartsMilliseconds[0]!;
  const inputWindowFrameCounts = inputWindowStartsMilliseconds.map(
    (windowStartTimestampMilliseconds, windowIndex) => {
      const windowEndTimestampMilliseconds =
        inputWindowStartsMilliseconds[windowIndex + 1] ??
        inputEndTimestampMilliseconds;
      return completedFrameTimestampsMilliseconds.filter(
        (frameTimestampMilliseconds) =>
          frameTimestampMilliseconds >= windowStartTimestampMilliseconds &&
          frameTimestampMilliseconds < windowEndTimestampMilliseconds,
      ).length;
    },
  );
  const completedFramesDuringInput =
    completedFrameTimestampsMilliseconds.filter(
      (frameTimestampMilliseconds) =>
        frameTimestampMilliseconds >= inputStartTimestampMilliseconds &&
        frameTimestampMilliseconds < inputEndTimestampMilliseconds,
    );
  const completedFrameGapSequenceMilliseconds: number[] = [];
  let previousBoundaryTimestampMilliseconds = inputStartTimestampMilliseconds;
  for (const frameTimestampMilliseconds of completedFramesDuringInput) {
    completedFrameGapSequenceMilliseconds.push(
      frameTimestampMilliseconds - previousBoundaryTimestampMilliseconds,
    );
    previousBoundaryTimestampMilliseconds = frameTimestampMilliseconds;
  }
  completedFrameGapSequenceMilliseconds.push(
    inputEndTimestampMilliseconds - previousBoundaryTimestampMilliseconds,
  );

  let consecutiveZeroFrameWindows = 0;
  let maximumConsecutiveZeroFrameWindows = 0;
  let currentFrameStarvationMilliseconds = 0;
  let maximumFrameStarvationMilliseconds = 0;
  for (
    let windowIndex = 0;
    windowIndex < inputWindowFrameCounts.length;
    windowIndex++
  ) {
    if (inputWindowFrameCounts[windowIndex]! > 0) {
      consecutiveZeroFrameWindows = 0;
      currentFrameStarvationMilliseconds = 0;
      continue;
    }
    consecutiveZeroFrameWindows++;
    const windowStartTimestampMilliseconds =
      inputWindowStartsMilliseconds[windowIndex]!;
    const windowEndTimestampMilliseconds =
      inputWindowStartsMilliseconds[windowIndex + 1] ??
      inputEndTimestampMilliseconds;
    currentFrameStarvationMilliseconds +=
      windowEndTimestampMilliseconds - windowStartTimestampMilliseconds;
    maximumConsecutiveZeroFrameWindows = Math.max(
      maximumConsecutiveZeroFrameWindows,
      consecutiveZeroFrameWindows,
    );
    maximumFrameStarvationMilliseconds = Math.max(
      maximumFrameStarvationMilliseconds,
      currentFrameStarvationMilliseconds,
    );
  }
  const firstCompletedFrameTimestampMilliseconds =
    completedFrameTimestampsMilliseconds.find(
      (frameTimestampMilliseconds) =>
        frameTimestampMilliseconds >= inputStartTimestampMilliseconds,
    );
  const firstCompletedFrameAfterInputTimestampMilliseconds =
    completedFrameTimestampsMilliseconds.find(
      (frameTimestampMilliseconds) =>
        frameTimestampMilliseconds >= inputEndTimestampMilliseconds,
    );
  return {
    requestedDurationMilliseconds,
    actualInputDurationMilliseconds:
      inputEndTimestampMilliseconds - inputStartTimestampMilliseconds,
    inputEventCount,
    appliedImpulseCount,
    inputEventsPerSecond: Number(
      (
        (inputEventCount * 1000) /
        (inputEndTimestampMilliseconds - inputStartTimestampMilliseconds)
      ).toFixed(1),
    ),
    projectionPassCount,
    rowsTravelled,
    rowCrossingSequence,
    maximumFrameDeltaRows: Math.max(
      0,
      ...rowCrossingSequence.map((rowsCrossed) => Math.abs(rowsCrossed)),
    ),
    inputWindowFrameCounts,
    completedFrameGapSequenceMilliseconds:
      completedFrameGapSequenceMilliseconds.map((gapMilliseconds) =>
        Number(gapMilliseconds.toFixed(1)),
      ),
    maximumConsecutiveZeroFrameWindows,
    maximumFrameStarvationMilliseconds: Number(
      maximumFrameStarvationMilliseconds.toFixed(1),
    ),
    inputToFirstCompletedFrameMilliseconds:
      firstCompletedFrameTimestampMilliseconds === undefined
        ? null
        : Number(
            (
              firstCompletedFrameTimestampMilliseconds -
              inputStartTimestampMilliseconds
            ).toFixed(1),
          ),
    finalInputToNextCompletedFrameMilliseconds:
      firstCompletedFrameAfterInputTimestampMilliseconds === undefined
        ? null
        : Number(
            (
              firstCompletedFrameAfterInputTimestampMilliseconds -
              inputEndTimestampMilliseconds
            ).toFixed(1),
          ),
  };
}

function printAccumulationPattern(
  surface: ScrollSurface,
  measurements: readonly AccumulationFlickMeasurement[],
): void {
  for (const measurement of measurements) {
    const pauseDescription =
      measurement.actualPauseBeforeMilliseconds === null
        ? 'from-rest'
        : `${measurement.actualPauseBeforeMilliseconds.toFixed(1)}ms`;
    console.error(
      `${surface} accumulation flick=${measurement.flickIndex} ` +
        `precedingFrame=${measurement.precedingCompletedFrameCount} ` +
        `pause=${pauseDescription} ` +
        `peakFrame=${measurement.peakRowsCrossedPerFrame} ` +
        `peakTwoFrames=${measurement.peakTwoFrameRowsCrossed} ` +
        `peakFourFrames=${measurement.peakFourFrameRowsCrossed} ` +
        `peak=${measurement.peakVelocityRowsPerSecond.toFixed(0)}rows/s ` +
        `sequence=${measurement.rowCrossingSequence.join(',')}`,
    );
  }
}

function assertContinuationBoundaries(
  measurements: readonly ContinuationBoundaryMeasurement[],
): void {
  const failure = continuationBoundaryFailure(measurements);
  if (!failure) return;
  throw new Error(failure);
}

function continuationBoundaryFailure(
  measurements: readonly ContinuationBoundaryMeasurement[],
): string | null {
  const failureDescriptions = measurements.flatMap((measurement) => {
    const placementFailures: string[] = [];
    if (
      measurement.observedMovingFrameCount < measurement.minimumMovingFrameCount
    ) {
      placementFailures.push(
        `observed ${measurement.observedMovingFrameCount}/` +
          `${measurement.minimumMovingFrameCount} moving frames`,
      );
    }
    if (measurement.preBoundaryRowsCrossed !== 1) {
      placementFailures.push(
        `pre-boundary crossed ${measurement.preBoundaryRowsCrossed} rows`,
      );
    }
    if (
      measurement.boundaryRowsCrossed >= measurement.preBoundaryRowsCrossed &&
      placementFailures.length === 0
    ) {
      return [];
    }
    const placementSuffix =
      placementFailures.length === 0
        ? ''
        : `; invalid placement: ${placementFailures.join(', ')}`;
    return [
      `frame ${measurement.boundaryFrameCount} ` +
        `${measurement.preBoundaryRowsCrossed}->` +
        `${measurement.boundaryRowsCrossed} rows at ` +
        `${measurement.actualDelayMilliseconds.toFixed(1)}ms after ` +
        `${measurement.observedMovingFrameCount} moving frames ` +
        `(minimum ${measurement.minimumMovingFrameCount})` +
        placementSuffix,
    ];
  });
  if (failureDescriptions.length === 0) return null;
  return (
    `live-glide continuation boundary failed: ` + failureDescriptions.join('; ')
  );
}

function proveContinuationBoundaryCanFail(): string {
  const failure = continuationBoundaryFailure([
    {
      minimumMovingFrameCount: 6,
      actualDelayMilliseconds: 200,
      observedMovingFrameCount: 6,
      preBoundaryFrameCount: 14,
      boundaryFrameCount: 15,
      preBoundaryRowsCrossed: 3,
      boundaryRowsCrossed: 2,
    },
  ]);
  if (!failure) {
    throw new Error('live-glide continuation positive control did not fail');
  }
  return failure;
}

function printContinuationBoundary(
  surface: ScrollSurface,
  measurement: ContinuationBoundaryMeasurement,
): void {
  console.error(
    `${surface} continuation minimumMovingFrames=` +
      `${measurement.minimumMovingFrameCount} ` +
      `observedMovingFrames=${measurement.observedMovingFrameCount} ` +
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
  await drainToQuiescence(statusPath, 'editor');
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
  statusPath: string,
  targetDepthLine: number,
  actualStartLine: number,
): Promise<Omit<DepthCheckpointMeasurement, 'ratioToReference'>> {
  const samples: GestureFrameSample[] = [];
  const targetEndLine = actualStartLine + DEPTH_GESTURE_TARGET_ROWS;
  await driver.collectCompletedFrameObservationsUntil({
    conditionDescription: `the depth-${targetDepthLine} drive reaches line ${targetEndLine}`,
    condition: (snapshot) =>
      (visibleTopLineIndex(snapshot) ?? -1) >= targetEndLine,
    performAction: () => {
      driver.sendRawInputWithoutFrameExpectation(
        wheelInput('down', WHEEL_NOTCHES_PER_GESTURE),
      );
    },
    observeFrame: (completed) => {
      const scrollTop = visibleTopLineIndex(completed.snapshot);
      if (scrollTop === null) return;
      samples.push({
        completedFrameCount: completed.completedFrame.completedFrameCount,
        byteArrivalTimestampMilliseconds:
          completed.completedFrame.byteArrivalTimestampMilliseconds,
        observedByteCount: completed.completedFrame.observedByteCount,
        scrollTop,
      });
      if (
        scrollTop < targetEndLine &&
        samples.length % DEPTH_GESTURE_REFRESH_FRAME_INTERVAL === 0
      ) {
        driver.sendRawInputWithoutFrameExpectation(
          wheelInput('down', WHEEL_NOTCHES_PER_GESTURE),
        );
      }
    },
    timeoutMilliseconds: 30_000,
  });
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
  await drainToQuiescence(statusPath, 'editor');
  let exactEndLine = visibleTopLineIndex(driver.snapshot());
  if (exactEndLine === null) {
    throw new Error(
      `Depth-${targetDepthLine} halt produced no visible fixture line`,
    );
  }
  let exactRowCorrectionCount = 0;
  for (
    ;
    exactEndLine !== targetEndLine &&
    exactRowCorrectionCount < DEPTH_GESTURE_EXACT_ROW_MAXIMUM_CORRECTIONS;
    exactRowCorrectionCount++
  ) {
    const correctionDirection = exactEndLine < targetEndLine ? 'down' : 'up';
    const distanceBeforeCorrection = Math.abs(exactEndLine - targetEndLine);
    driver.sendRawInputWithoutFrameExpectation(
      wheelInput(correctionDirection, 1),
    );
    await awaitStatusCondition(
      statusPath,
      `the depth-${targetDepthLine} exact-row correction ${exactRowCorrectionCount + 1} ` +
        `to move closer with one ${correctionDirection} wheel impulse and reach rest`,
      (status) =>
        Math.abs(Number(status.editorScrollTop) - targetEndLine) <
          distanceBeforeCorrection &&
        status.workspaceScrollMomentumAtRest === true,
    );
    await driver.awaitGridCondition(
      `the depth-${targetDepthLine} exact-row correction ${exactRowCorrectionCount + 1} ` +
        `to paint a row closer to line ${targetEndLine}`,
      (snapshot) => {
        const candidateEndLine = visibleTopLineIndex(snapshot);
        if (candidateEndLine === null) return false;
        return (
          Math.abs(candidateEndLine - targetEndLine) < distanceBeforeCorrection
        );
      },
    );
    exactEndLine = visibleTopLineIndex(driver.snapshot());
    if (exactEndLine === null) {
      throw new Error(
        `Depth-${targetDepthLine} correction produced no visible fixture line`,
      );
    }
  }
  if (exactEndLine !== targetEndLine) {
    throw new Error(
      `Depth-${targetDepthLine} could not stop at commanded line ${targetEndLine}; ` +
        `stopped at ${exactEndLine} after at most ` +
        `${DEPTH_GESTURE_EXACT_ROW_MAXIMUM_CORRECTIONS} one-notch corrections`,
    );
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
    actualEndLine: exactEndLine,
    rowsTravelled: exactEndLine - actualStartLine,
    exactRowCorrectionCount,
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
      await measureDepthCheckpoint(
        driver,
        statusPath,
        targetDepthLine,
        actualStartLine,
      ),
    );
  }
  const checkpoints = checkpointsWithoutRatios.map((checkpoint) => ({
    ...checkpoint,
    ratioToReference:
      checkpoint.framesPerSecond / DEPTH_REFERENCE_FRAMES_PER_SECOND,
  }));
  assertDepthCheckpointRows('measured', checkpoints);
  return checkpoints;
}

function assertDepthCheckpointRows(
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
    const measuredRowsTravelled =
      checkpoint.actualEndLine - checkpoint.actualStartLine;
    if (
      checkpoint.rowsTravelled !== DEPTH_GESTURE_TARGET_ROWS ||
      measuredRowsTravelled !== DEPTH_GESTURE_TARGET_ROWS
    ) {
      throw new Error(
        `${caseLabel} depth-${targetDepthLine} checkpoint stopped after ` +
          `${measuredRowsTravelled} rows and reported ` +
          `${checkpoint.rowsTravelled}; commanded ` +
          `${DEPTH_GESTURE_TARGET_ROWS}`,
      );
    }
  }
}

function proveDepthCheckpointRowsCanFail(): string {
  const syntheticCheckpoints = DEPTH_CHECKPOINT_TARGETS.map(
    (targetDepthLine): DepthCheckpointMeasurement => ({
      targetDepthLine,
      actualStartLine: targetDepthLine,
      actualEndLine: targetDepthLine + DEPTH_GESTURE_TARGET_ROWS - 1,
      rowsTravelled: DEPTH_GESTURE_TARGET_ROWS - 1,
      exactRowCorrectionCount: 0,
      observedFrameCount: 100,
      movingFrameCount: 100,
      durationMilliseconds: 3_300,
      framesPerSecond: 30,
      ratioToReference: 1,
    }),
  );
  try {
    assertDepthCheckpointRows('positive-control', syntheticCheckpoints);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('depth-75000') &&
      message.includes('999 rows') &&
      message.includes('commanded 1000')
    ) {
      return message;
    }
    throw new Error(
      `Depth row-count positive control failed with the wrong red: ${message}`,
    );
  }
  throw new Error('Depth row-count positive control did not fail');
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
    '| target depth | actual start | rows travelled | corrections | FPS | ' +
      'ratio to 100k top | cadence canary |',
  );
  console.error('| ---: | ---: | ---: | ---: | ---: | ---: | :---: |');
  for (const checkpoint of surfaceMeasurement.depthCheckpoints) {
    const cadenceCanary =
      checkpoint.framesPerSecond >= DEPTH_CHECKPOINT_FPS_CANARY
        ? 'meets'
        : 'misses';
    console.error(
      `| ${checkpoint.targetDepthLine} | ${checkpoint.actualStartLine} | ` +
        `${checkpoint.rowsTravelled} | ` +
        `${checkpoint.exactRowCorrectionCount} | ` +
        `${checkpoint.framesPerSecond.toFixed(1)} | ` +
        `${checkpoint.ratioToReference.toFixed(3)} | ${cadenceCanary} |`,
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

function animationRestStatusField(surface: ScrollSurface): string {
  return surface === 'editor'
    ? 'workspaceScrollMomentumAtRest'
    : 'contributedSurfaceAnimationAtRest';
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
    await driver.awaitGridCondition(
      'the editor grid paints the document origin before the next gesture',
      (snapshot) => visibleTopLineIndex(snapshot) === 0,
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
      await driver.awaitGridCondition(
        'the diff grid paints the document origin before the next gesture',
        (snapshot) => visibleTopLineIndex(snapshot) === 0,
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
  const shouldMeasureAccumulationPattern =
    surface === 'editor' &&
    fixtureShape === 'flat' &&
    codeFolding === 'on' &&
    ACCUMULATION_FLICK_COUNT > 0;
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
      verticalFlingCeiling: VERTICAL_FLING_CEILING,
      maximumGlideDurationMilliseconds: MAXIMUM_GLIDE_DURATION_MILLISECONDS,
      showIndentGuides: true,
    }),
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    repositoryRoot: APPLICATION_REPOSITORY_ROOT,
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
        (status) =>
          status.codeFolding === undefined ||
          status.codeFolding === (codeFolding === 'on'),
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
    const impulseCountField =
      surface === 'editor'
        ? 'editorVerticalScrollImpulseCount'
        : 'diffVerticalScrollImpulseCount';
    const restStatusField = animationRestStatusField(surface);
    const statusBeforeSingleNotch = JSON.parse(
      readFileSync(statusPath, 'utf8'),
    ) as Record<string, unknown>;
    const scrollTopBeforeSingleNotch = Number(
      statusBeforeSingleNotch[statusField] ?? 0,
    );
    const impulseCountBeforeSingleNotch = Number(
      statusBeforeSingleNotch[impulseCountField] ?? 0,
    );
    driver.sendMouseWithoutFrameExpectation({
      kind: 'wheel',
      column: EDITOR_WHEEL_COLUMN,
      row: EDITOR_WHEEL_ROW,
      direction: 'down',
    });
    await awaitStatusCondition(
      statusPath,
      `the ${surface} surface to consume wheel input before measurement`,
      (status) =>
        Number(status[impulseCountField]) ===
          impulseCountBeforeSingleNotch + 1 && status[restStatusField] === true,
      60_000,
    );
    const statusAfterSingleNotch = JSON.parse(
      readFileSync(statusPath, 'utf8'),
    ) as Record<string, unknown>;
    const singleNotch = {
      appliedImpulseCount:
        Number(statusAfterSingleNotch[impulseCountField]) -
        impulseCountBeforeSingleNotch,
      rowsTravelled:
        Number(statusAfterSingleNotch[statusField]) -
        scrollTopBeforeSingleNotch,
    };

    const gestures: GestureMeasurement[] = [];
    let accumulationFlicks: AccumulationFlickMeasurement[] = [];
    const continuationBoundaries: ContinuationBoundaryMeasurement[] = [];
    const continuousInputBursts: ContinuousInputBurstMeasurement[] = [];
    let depthCheckpoints: DepthCheckpointMeasurement[] = [];
    let depthCheckpointWallClockMilliseconds = 0;
    if (CONTINUOUS_INPUT_BURST_DURATIONS_MILLISECONDS.length > 0) {
      const burstDurationsMilliseconds =
        CONTINUOUS_INPUT_BURST_DURATIONS_MILLISECONDS;
      for (const burstDurationMilliseconds of burstDurationsMilliseconds) {
        await driveSurfaceToTop(driver, statusPath, surface);
        await drainToQuiescence(statusPath, surface);
        const continuousInputBurst = await measureContinuousInputBurst(
          driver,
          statusPath,
          surface,
          burstDurationMilliseconds,
        );
        continuousInputBursts.push(continuousInputBurst);
        if (CONTINUOUS_INPUT_FRAME_PROGRESS_REQUIRED) {
          const starvedInputWindowIndex =
            continuousInputBurst.inputWindowFrameCounts.findIndex(
              (completedFrameCount) => completedFrameCount === 0,
            );
          if (starvedInputWindowIndex >= 0) {
            throw new Error(
              `${surface} ${fixtureShape} ${fixtureLineCount}-line burst ` +
                `emitted zero completed frames in input window ` +
                `${starvedInputWindowIndex + 1}; counts=[` +
                `${continuousInputBurst.inputWindowFrameCounts.join(',')}]`,
            );
          }
        }
        const completedFrameGapSequence =
          continuousInputBurst.completedFrameGapSequenceMilliseconds.join(',');
        console.error(
          `${surface} ${fixtureShape} ${fixtureLineCount} lines ` +
            `${burstDurationMilliseconds}ms burst windows=` +
            `[${continuousInputBurst.inputWindowFrameCounts.join(',')}] ` +
            `events=${continuousInputBurst.inputEventCount} ` +
            `impulses=${continuousInputBurst.appliedImpulseCount} ` +
            `rate=${continuousInputBurst.inputEventsPerSecond}/s ` +
            `projections=${continuousInputBurst.projectionPassCount} ` +
            `rows=${continuousInputBurst.rowsTravelled} ` +
            `gaps=[${completedFrameGapSequence}] starvation=` +
            `${continuousInputBurst.maximumFrameStarvationMilliseconds}ms`,
        );
      }
    } else if (shouldMeasureDepthCheckpoints) {
      const depthCheckpointStartMilliseconds = performance.now();
      depthCheckpoints = await measureDepthCheckpoints(driver, statusPath);
      depthCheckpointWallClockMilliseconds =
        performance.now() - depthCheckpointStartMilliseconds;
    } else {
      if (shouldMeasureAccumulationPattern) {
        await driveSurfaceToTop(driver, statusPath, surface);
        await drainToQuiescence(statusPath, surface);
        accumulationFlicks = await measureAccumulationPattern(
          driver,
          statusPath,
        );
        printAccumulationPattern(surface, accumulationFlicks);
      }
      if (shouldMeasureContinuationBoundaries) {
        for (const minimumMovingFrameCount of CONTINUATION_MINIMUM_MOVING_FRAME_COUNTS) {
          await driveSurfaceToTop(driver, statusPath, surface);
          await drainToQuiescence(statusPath, surface);
          const continuationBoundary = await measureContinuationBoundary(
            driver,
            minimumMovingFrameCount,
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
        await drainToQuiescence(statusPath, surface);
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
      singleNotch,
      gestures,
      accumulationFlicks,
      continuationBoundaries,
      continuousInputBursts,
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
  !Number.isInteger(ACCUMULATION_FLICK_COUNT) ||
  ACCUMULATION_FLICK_COUNT < 0
) {
  throw new Error(
    'SMOOTHNESS_ACCUMULATION_FLICKS must be a non-negative integer',
  );
}

if (
  !Number.isInteger(CONTINUOUS_INPUT_WINDOW_MILLISECONDS) ||
  CONTINUOUS_INPUT_WINDOW_MILLISECONDS <= 0
) {
  throw new Error(
    'SMOOTHNESS_BURST_WINDOW must be a positive integer number of milliseconds',
  );
}

if (
  !Number.isInteger(CONTINUOUS_INPUT_NOTCHES_PER_WINDOW) ||
  CONTINUOUS_INPUT_NOTCHES_PER_WINDOW <= 0
) {
  throw new Error('SMOOTHNESS_BURST_NOTCHES must be a positive integer');
}

if (
  !Number.isFinite(MAXIMUM_ANIMATION_DELTA_TIME_SECONDS) ||
  MAXIMUM_ANIMATION_DELTA_TIME_SECONDS <= 0
) {
  throw new Error(
    'SMOOTHNESS_MAXIMUM_ANIMATION_DELTA_TIME_SECONDS must be positive',
  );
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
  CONTINUOUS_INPUT_BURST_DURATIONS_MILLISECONDS.length === 0 &&
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

const depthCheckpointRowsPositiveControl = proveDepthCheckpointRowsCanFail();

console.error(
  `depth-row-count positive control RED (expected): ` +
    depthCheckpointRowsPositiveControl,
);

const editorScaleInvariancePositiveControl =
  proveEditorScaleInvarianceCanFail();

console.error(
  `scale-invariance positive control RED (expected): ` +
    editorScaleInvariancePositiveControl,
);

const continuousInputCoalescingPositiveControl =
  proveContinuousInputCoalescingCanFail();

console.error(
  `rapid-input coalescing positive control RED (expected): ` +
    continuousInputCoalescingPositiveControl,
);

const continuousInputScaleTravelPositiveControl =
  proveContinuousInputScaleTravelCanFail();

console.error(
  `rapid-input scale-travel positive control RED (expected): ` +
    continuousInputScaleTravelPositiveControl,
);

const continuationBoundaryPositiveControl = proveContinuationBoundaryCanFail();

console.error(
  `live-glide continuation positive control RED (expected): ` +
    continuationBoundaryPositiveControl,
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

const continuousInputCoalescingFailureMessage =
  continuousInputCoalescingFailure(surfaceMeasurements);

if (
  CONTINUOUS_INPUT_COALESCING_REQUIRED &&
  continuousInputCoalescingFailureMessage
) {
  throw new Error(continuousInputCoalescingFailureMessage);
}

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
  commit: (
    await Bun.$`git -C ${APPLICATION_REPOSITORY_ROOT} rev-parse --short HEAD`
      .quiet()
      .text()
  ).trim(),
  applicationRepositoryRoot: APPLICATION_REPOSITORY_ROOT,
  verticalFlingCeiling: VERTICAL_FLING_CEILING,
  maximumGlideDurationMilliseconds: MAXIMUM_GLIDE_DURATION_MILLISECONDS,
  glideCapEasingDurationMilliseconds: GLIDE_CAP_EASING_DURATION_MILLISECONDS,
  maximumAnimationDeltaTimeSeconds: MAXIMUM_ANIMATION_DELTA_TIME_SECONDS,
  maximumAnimationFrameTravelRows: Math.ceil(
    VERTICAL_FLING_CEILING * MAXIMUM_ANIMATION_DELTA_TIME_SECONDS,
  ),
  wheelNotchesPerGesture: WHEEL_NOTCHES_PER_GESTURE,
  accumulationFlickCount: ACCUMULATION_FLICK_COUNT,
  accumulationPauseMilliseconds: ACCUMULATION_PAUSE_MILLISECONDS,
  continuousInputBurstDurationsMilliseconds:
    CONTINUOUS_INPUT_BURST_DURATIONS_MILLISECONDS,
  continuousInputWindowMilliseconds: CONTINUOUS_INPUT_WINDOW_MILLISECONDS,
  continuousInputNotchesPerWindow: CONTINUOUS_INPUT_NOTCHES_PER_WINDOW,
  continuousInputFrameProgressRequired:
    CONTINUOUS_INPUT_FRAME_PROGRESS_REQUIRED,
  continuousInputCoalescingRequired: CONTINUOUS_INPUT_COALESCING_REQUIRED,
  continuousInputCoalescingPositiveControl,
  continuousInputScaleTravelPositiveControl,
  continuousInputCoalescingFailure: continuousInputCoalescingFailureMessage,
  continuationMinimumMovingFrameCounts:
    CONTINUATION_MINIMUM_MOVING_FRAME_COUNTS,
  minimumGlideMovingFrameCount: MINIMUM_GLIDE_MOVING_FRAME_COUNT,
  continuationBoundaryPositiveControl,
  targetFramesPerSecond: 30,
  depthGestureTargetRows: DEPTH_GESTURE_TARGET_ROWS,
  depthCheckpointFpsCanary: DEPTH_CHECKPOINT_FPS_CANARY,
  depthReferenceFramesPerSecond: Number.isFinite(
    DEPTH_REFERENCE_FRAMES_PER_SECOND,
  )
    ? DEPTH_REFERENCE_FRAMES_PER_SECOND
    : null,
  depthCheckpointRowsPositiveControl,
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
