#!/usr/bin/env bun
// Default mode measures a tiny-file edit for the always-run gate. Set
// INPUT_BYTE_FLUSH_MODE=scale-edit measures the flat 2k–1M scale axis.
// INPUT_BYTE_FLUSH_MODE=nested-fold-edit measures the independent 554k/970k
// and unfolded/folded axes with the 138,622-line shared nested fixture span.
//
// Scale edit boundary: immediately before the input byte is written to the PTY
// master -> arrival of the first complete DEC 2026 frame whose emulator grid
// contains the cumulative edit. It INCLUDES input routing, undo capture,
// document/index mutation, reactive projection, painting, and frame emission.
// It EXCLUDES fixture generation, navigation to the target line, filesystem
// saving, terminal-display latency after bytes reach the PTY master, and
// language-server work (the isolated setting suppresses LSP for every size).
// Peak resident memory is sampled from process VmHWM immediately after first
// content paint, before excluded target navigation can raise the high-water
// mark.
// invariant: Latency measurements name their observation boundary (scripts/harness/harness.invariants.md)
// invariant: Blocking gate verdicts use ordering and counts (scripts/harness/harness.invariants.md)
// invariant: Soft duration reports use a machine-wide quiet lock (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';
import { InputByteFlushVerdict } from './InputByteFlushVerdict';
import { PtyTestDriver } from './PtyTestDriver';
import { QuietLock } from './QuietLock';

const repositoryRoot =
  process.env.INPUT_BYTE_FLUSH_REPOSITORY_ROOT ?? process.cwd();

if (process.env.INPUT_BYTE_FLUSH_MODE === 'nested-fold-edit') {
  const quietLockExitCode = await QuietLock.Class.rerunEntryPointQuietExclusive(
    'nested-fold-edit-frame-measurement',
    import.meta.path,
  );
  if (quietLockExitCode === null) {
    await measureNestedFoldEditing();
    process.exit(0);
  }
  process.exit(quietLockExitCode);
}

if (process.env.INPUT_BYTE_FLUSH_MODE === 'scale-edit') {
  const quietLockExitCode = await QuietLock.Class.rerunEntryPointQuietExclusive(
    'large-file-edit-frame-measurement',
    import.meta.path,
  );
  if (quietLockExitCode === null) {
    await measureScaleEditing();
    process.exit(0);
  }
  process.exit(quietLockExitCode);
}

const latencySampleCount = Number(process.env.LATENCY_SAMPLE_COUNT ?? 20);
const measurementRoot = mkdtempSync(join(tmpdir(), 'invar-byte-flush-'));
const isolatedHomeDirectory = join(measurementRoot, 'home');
const isolatedWorkspaceRoot = join(measurementRoot, 'workspace');
mkdirSync(isolatedHomeDirectory, { recursive: true });
mkdirSync(isolatedWorkspaceRoot, { recursive: true });
await Bun.write(
  join(isolatedWorkspaceRoot, 'latency.txt'),
  'abcdefghijklmnopqrstuvwxyz\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: isolatedWorkspaceRoot,
  repositoryRoot,
  columns: 120,
  rows: 40,
  homeDirectory: isolatedHomeDirectory,
});

try {
  await driver.awaitSnapshot(
    (snapshot) => snapshot.text().includes('latency.txt'),
    15_000,
  );
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.text().includes('abcdefghijklmnopqrstuvwxyz'),
    10_000,
  );

  for (let warmupPressNumber = 1; warmupPressNumber <= 3; warmupPressNumber++) {
    driver.sendKeys('Right');
    await driver.awaitScreenChange();
  }

  const initialPrefix = 'abc';
  const initialSuffix = 'defghijklmnopqrstuvwxyz';
  const byteArrivalLatencySamples: number[] = [];
  const snapshotReadyLatencySamples: number[] = [];
  const postArrivalOracleLatencySamples: number[] = [];
  const frameByteCounts: number[] = [];
  let previousCompletedFrameObservedByteCount: number | null = null;

  for (let pressNumber = 1; pressNumber <= latencySampleCount; pressNumber++) {
    const expectedLine =
      initialPrefix + 'x'.repeat(pressNumber) + initialSuffix;
    const measurement = await driver.sendKeysAndAwaitGridConditionByteArrival(
      ['x'],
      `inserted glyph ${pressNumber} to appear in the editor`,
      (snapshot) => snapshot.text().includes(expectedLine),
      3_000,
    );
    const orderingFailure =
      InputByteFlushVerdict.Class.firstFrameOrderingFailure(
        measurement.completedFramesUntilCondition,
      );
    if (orderingFailure) {
      throw new Error(
        InputByteFlushVerdict.Class.drivenBehaviourFailureMessage(
          orderingFailure,
        ),
      );
    }
    await driver.awaitScreenChange(3_000);
    if (!driver.snapshot().text().includes(expectedLine)) {
      throw new Error(
        InputByteFlushVerdict.Class.drivenBehaviourFailureMessage(
          `Measured glyph ${pressNumber} was absent after quiescence`,
        ),
      );
    }
    const snapshotReadyTimestampMilliseconds = performance.now();

    byteArrivalLatencySamples.push(
      measurement.inputToFrameByteArrivalMilliseconds,
    );
    snapshotReadyLatencySamples.push(
      snapshotReadyTimestampMilliseconds -
        measurement.inputWrittenTimestampMilliseconds,
    );
    postArrivalOracleLatencySamples.push(
      snapshotReadyTimestampMilliseconds -
        measurement.completedFrame.byteArrivalTimestampMilliseconds,
    );
    if (previousCompletedFrameObservedByteCount !== null) {
      frameByteCounts.push(
        measurement.completedFrame.observedByteCount -
          previousCompletedFrameObservedByteCount,
      );
    }
    previousCompletedFrameObservedByteCount =
      measurement.completedFrame.observedByteCount;
    await Bun.sleep(100);
  }

  const byteArrivalPercentiles = percentiles(byteArrivalLatencySamples);
  const snapshotReadyPercentiles = percentiles(snapshotReadyLatencySamples);
  const postArrivalOraclePercentiles = percentiles(
    postArrivalOracleLatencySamples,
  );
  const medianFrameByteCount = percentile(frameByteCounts, 0.5);

  console.log('Input latency measurement boundaries');
  console.log(
    `  input write start -> DEC 2026 end-marker byte arrival: ` +
      `p50 ${byteArrivalPercentiles.p50.toFixed(3)} ms, ` +
      `p95 ${byteArrivalPercentiles.p95.toFixed(3)} ms`,
  );
  console.log(
    `  input write start -> settled TerminalEmulator snapshot: ` +
      `p50 ${snapshotReadyPercentiles.p50.toFixed(3)} ms, ` +
      `p95 ${snapshotReadyPercentiles.p95.toFixed(3)} ms`,
  );
  console.log(
    `  marker byte arrival -> settled TerminalEmulator snapshot: ` +
      `p50 ${postArrivalOraclePercentiles.p50.toFixed(3)} ms, ` +
      `p95 ${postArrivalOraclePercentiles.p95.toFixed(3)} ms`,
  );
  console.log(
    `input-byte-flush samples=${latencySampleCount} ` +
      `glyph-first-frame=${latencySampleCount}/${latencySampleCount} ` +
      `byte-arrival-p50=${byteArrivalPercentiles.p50.toFixed(3)}ms ` +
      `byte-arrival-p95=${byteArrivalPercentiles.p95.toFixed(3)}ms ` +
      `snapshot-ready-p50=${snapshotReadyPercentiles.p50.toFixed(3)}ms ` +
      `post-arrival-oracle-p50=${postArrivalOraclePercentiles.p50.toFixed(3)}ms ` +
      `median-frame-bytes=${medianFrameByteCount} ` +
      `boundary=input-write→DEC-2026-end-marker-byte-arrival`,
  );
} catch (error) {
  const failureDetails = error instanceof Error ? error.message : String(error);
  console.error(
    InputByteFlushVerdict.Class.measurementFailureMessage(failureDetails),
  );
  process.exitCode = 1;
} finally {
  await driver.dispose();
  rmSync(measurementRoot, { recursive: true, force: true });
}

function percentiles(samples: readonly number[]): { p50: number; p95: number } {
  return {
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
  };
}

function percentile(samples: readonly number[], fraction: number): number {
  if (samples.length === 0)
    throw new Error('Cannot calculate a percentile without samples');
  const sortedSamples = [...samples].sort(
    (firstSample, secondSample) => firstSample - secondSample,
  );
  const sampleIndex = Math.max(
    0,
    Math.min(
      sortedSamples.length - 1,
      Math.ceil(sortedSamples.length * fraction) - 1,
    ),
  );
  const sample = sortedSamples[sampleIndex];
  if (sample === undefined)
    throw new Error(`Missing percentile sample at index ${sampleIndex}`);
  return sample;
}

async function measureNestedFoldEditing(): Promise<void> {
  requireAcquiredQuietLock();
  const lineCounts = [554_490, 970_356] as const;
  const sessionCount = positiveIntegerFromEnvironment(
    'NESTED_FOLD_EDIT_SESSION_COUNT',
    2,
  );
  const burstLength = positiveIntegerFromEnvironment(
    'NESTED_FOLD_EDIT_BURST_LENGTH',
    8,
  );
  const controlBurstLength = Math.min(
    burstLength,
    positiveIntegerFromEnvironment('NESTED_FOLD_EDIT_CONTROL_BURST_LENGTH', 3),
  );
  const measurementRoot = mkdtempSync(
    join(tmpdir(), 'invar-nested-fold-edit-'),
  );
  const fixtureRootByLineCount = new Map<number, string>();

  try {
    for (const lineCount of lineCounts) {
      const fixtureRoot = join(measurementRoot, String(lineCount));
      generateNestedWorkspace(fixtureRoot, lineCount);
      fixtureRootByLineCount.set(lineCount, fixtureRoot);
    }
    const caseOrder = [
      { collapsed: true, lineCount: 970_356 },
      { collapsed: false, lineCount: 554_490 },
      { collapsed: false, lineCount: 970_356 },
      { collapsed: true, lineCount: 554_490 },
    ] as const;
    const measurements: NestedFoldCaseMeasurement[] = [];
    for (const measuredCase of caseOrder) {
      const fixtureRoot = fixtureRootByLineCount.get(measuredCase.lineCount);
      if (!fixtureRoot) {
        throw new Error(
          `Missing generated ${measuredCase.lineCount}-line nested fixture`,
        );
      }
      const sessions: NestedFoldEditingSession[] = [];
      for (
        let sessionNumber = 1;
        sessionNumber <= sessionCount;
        sessionNumber++
      ) {
        sessions.push(
          await measureNestedFoldEditingSession({
            burstLength,
            collapsed: measuredCase.collapsed,
            fixtureRoot,
            forceFullRebuild: false,
            lineCount: measuredCase.lineCount,
            sessionNumber,
          }),
        );
      }
      measurements.push({
        collapsed: measuredCase.collapsed,
        distribution: nestedFoldDistribution(sessions),
        lineCount: measuredCase.lineCount,
        sessions,
        toggleDistributions: measuredCase.collapsed
          ? {
              collapse: nestedFoldToggleDistribution(sessions, 'collapse'),
              expand: nestedFoldToggleDistribution(sessions, 'expand'),
            }
          : null,
      });
    }

    const controlFixtureRoot = fixtureRootByLineCount.get(554_490);
    if (!controlFixtureRoot) {
      throw new Error('Missing generated 554490-line nested fixture');
    }
    const controlSessions: NestedFoldEditingSession[] = [];
    for (
      let sessionNumber = 1;
      sessionNumber <= sessionCount;
      sessionNumber++
    ) {
      controlSessions.push(
        await measureNestedFoldEditingSession({
          burstLength: controlBurstLength,
          collapsed: true,
          fixtureRoot: controlFixtureRoot,
          forceFullRebuild: true,
          lineCount: 554_490,
          sessionNumber,
        }),
      );
    }
    const baselineCase = measurements.find(
      (measurement) =>
        measurement.lineCount === 554_490 && measurement.collapsed,
    );
    if (!baselineCase) {
      throw new Error('Missing 554490-line folded baseline');
    }
    const baselineMedianMilliseconds = baselineCase.distribution.p50;
    const controlDistribution = nestedFoldDistribution(controlSessions);
    const movementMultiple =
      controlDistribution.p50 / baselineMedianMilliseconds;
    if (movementMultiple < 10) {
      throw new Error(
        'Nested-fold edit positive control did not move the median by an ' +
          `order of magnitude: baseline ${baselineMedianMilliseconds} ms, ` +
          `forced ${controlDistribution.p50} ms, ` +
          `${movementMultiple.toFixed(2)}x`,
      );
    }

    console.log(
      JSON.stringify(
        {
          boundary: {
            end:
              'first complete DEC 2026 frame whose emulator grid contains ' +
              'the cumulative edit',
            excludes: [
              'fixture generation',
              'file opening and initial fold discovery',
              'fold toggle',
              'filesystem saving',
              'terminal display after frame bytes reach the PTY master',
              'language-server work (isolated 1 KB suppression limit)',
            ],
            includes: [
              'real PTY input routing',
              'undo capture',
              'document, fold-cache, and wrap-index mutation',
              'reactive projection',
              'paint and frame emission',
            ],
            start: 'immediately before the edit byte is written to the PTY',
          },
          toggleBoundary: {
            end:
              'first complete DEC 2026 frame whose emulator grid shows the ' +
              'requested folded or expanded state',
            excludes: [
              'fixture generation',
              'file opening and initial fold discovery',
              'filesystem saving',
              'terminal display after frame bytes reach the PTY master',
              'language-server work (isolated 1 KB suppression limit)',
            ],
            includes: [
              'real PTY chord input routing',
              'fold-state and wrap-index mutation',
              'reactive projection',
              'paint and frame emission',
            ],
            start:
              'immediately before the first chord byte is written to the PTY',
          },
          burstLength,
          fixture:
            'scripts/make-nested-fold-fixture.ts at 554,490 and 970,356 ' +
            'requested lines; folded cases collapse group0000 (138,622 lines)',
          forcedFullRebuildPositiveControl: {
            baselineMedianMilliseconds,
            controlBurstLength,
            controlDistribution,
            controlSessions,
            movementMultiple,
            requirement:
              'the pre-fix document rebuild moves the 554,490-line folded ' +
              'median by at least 10x',
            satisfied: true,
          },
          generatedAt: new Date().toISOString(),
          measurements,
          quietLock: {
            holderName: process.env.INVAR_QUIET_LOCK_HOLDER_NAME,
            mode: process.env.INVAR_QUIET_LOCK_MODE,
            state: process.env.INVAR_QUIET_LOCK_STATE,
            waitMilliseconds: process.env.INVAR_QUIET_LOCK_WAIT_MILLISECONDS,
          },
          repositoryRoot,
        },
        null,
        2,
      ),
    );
  } finally {
    rmSync(measurementRoot, { recursive: true, force: true });
  }
}

async function measureNestedFoldEditingSession(
  options: NestedFoldEditingSessionOptions,
): Promise<NestedFoldEditingSession> {
  const isolatedHomeDirectory = mkdtempSync(
    join(
      tmpdir(),
      `invar-nested-fold-home-${options.lineCount}-` +
        `${options.collapsed ? 'folded' : 'unfolded'}-`,
    ),
  );
  const settingsDirectory = join(isolatedHomeDirectory, '.config', 'invar');
  mkdirSync(settingsDirectory, { recursive: true });
  await Bun.write(
    join(settingsDirectory, 'settings.json'),
    `${JSON.stringify({ lspFileSizeLimitKb: 1 })}\n`,
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: options.fixtureRoot,
    repositoryRoot,
    columns: 120,
    rows: 40,
    homeDirectory: isolatedHomeDirectory,
    command: options.forceFullRebuild
      ? [
          process.execPath,
          'run',
          '--preload',
          join(
            repositoryRoot,
            'scripts/harness/force-editor-wrap-full-rebuild.ts',
          ),
          'src/main.ts',
          options.fixtureRoot,
        ]
      : undefined,
  });
  try {
    await openNestedFixture(driver);
    let collapseToggle: NestedFoldToggleSample | null = null;
    if (options.collapsed) {
      driver.sendMouse({
        kind: 'press',
        column: 50,
        row: 7,
        button: 'left',
      });
      driver.sendMouse({
        kind: 'release',
        column: 50,
        row: 7,
        button: 'left',
      });
      await driver.awaitSnapshot(
        (snapshot) => snapshot.findText('Ln 2,') !== null,
        15_000,
      );
      collapseToggle = await measureNestedFoldToggle(
        driver,
        ['Control+k', '['],
        'the 138,622-line group0000 fold is visible',
        (snapshot) => snapshot.findText('138624') !== null,
      );
    } else {
      driver.sendMouse({
        kind: 'press',
        column: 50,
        row: 6,
        button: 'left',
      });
      driver.sendMouse({
        kind: 'release',
        column: 50,
        row: 6,
        button: 'left',
      });
    }
    const samples = await measureEditingBurstWithLoad(
      driver,
      '~',
      options.burstLength,
    );
    const expandToggle = options.collapsed
      ? await measureNestedFoldToggle(
          driver,
          ['Control+l', ']'],
          'the first child of group0000 is visible after expansion',
          (snapshot) => snapshot.findText('group0000_00') !== null,
        )
      : null;
    return {
      collapsed: options.collapsed,
      collapseToggle,
      expandToggle,
      forceFullRebuild: options.forceFullRebuild,
      lineCount: options.lineCount,
      samples,
      sessionNumber: options.sessionNumber,
    };
  } finally {
    await driver.dispose();
    rmSync(isolatedHomeDirectory, { recursive: true, force: true });
  }
}

async function measureNestedFoldToggle(
  driver: PtyTestDriver.Model,
  keys: readonly string[],
  description: string,
  condition: Parameters<
    PtyTestDriver.Model['sendKeysAndAwaitGridConditionByteArrival']
  >[2],
): Promise<NestedFoldToggleSample> {
  const currentLoadAverage = loadavg();
  const measurement = await driver.sendKeysAndAwaitGridConditionByteArrival(
    keys,
    description,
    condition,
    60_000,
  );
  return {
    completedFramesUntilToggle: measurement.completedFramesUntilCondition,
    inputToPaintMilliseconds: measurement.inputToFrameByteArrivalMilliseconds,
    loadAverage: {
      fifteenMinutes: currentLoadAverage[2] ?? Number.NaN,
      fiveMinutes: currentLoadAverage[1] ?? Number.NaN,
      oneMinute: currentLoadAverage[0] ?? Number.NaN,
    },
  };
}

async function openNestedFixture(driver: PtyTestDriver.Model): Promise<void> {
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('nested.json') !== null,
    30_000,
  );
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Go to File') !== null,
    15_000,
  );
  driver.sendText('nested.json');
  await driver.awaitGridCondition(
    'Quick Open lists nested.json as the selected candidate',
    (snapshot) => textOccurrenceCount(snapshot.text(), 'nested.json') >= 2,
    30_000,
  );
  driver.sendKeys('Enter');
  await driver.awaitGridCondition(
    'the generated nested JSON first group is painted',
    (snapshot) => snapshot.findText('group0000') !== null,
    60_000,
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Large file — language') !== null,
    15_000,
  );
}

async function measureEditingBurstWithLoad(
  driver: PtyTestDriver.Model,
  insertedCharacter: string,
  burstLength: number,
): Promise<readonly NestedFoldEditSample[]> {
  driver.sendKeys(insertedCharacter);
  await driver.awaitScreenChange(15_000);
  const samples: NestedFoldEditSample[] = [];
  for (let pressNumber = 1; pressNumber <= burstLength; pressNumber++) {
    const expectedSuffix = insertedCharacter.repeat(pressNumber + 1);
    const currentLoadAverage = loadavg();
    const measurement = await driver.sendKeysAndAwaitGridConditionByteArrival(
      [insertedCharacter],
      `nested edit contains suffix ${expectedSuffix}`,
      (snapshot) => snapshot.text().includes(expectedSuffix),
      60_000,
    );
    samples.push({
      completedFramesUntilEdit: measurement.completedFramesUntilCondition,
      inputToPaintMilliseconds: measurement.inputToFrameByteArrivalMilliseconds,
      loadAverage: {
        fifteenMinutes: currentLoadAverage[2] ?? Number.NaN,
        fiveMinutes: currentLoadAverage[1] ?? Number.NaN,
        oneMinute: currentLoadAverage[0] ?? Number.NaN,
      },
      pressNumber,
    });
  }
  return samples;
}

function nestedFoldDistribution(
  sessions: readonly NestedFoldEditingSession[],
): NestedFoldDistribution {
  const samples = sessions.flatMap((session) =>
    session.samples.map((sample) => sample.inputToPaintMilliseconds),
  );
  return {
    maximum: Math.max(...samples),
    minimum: Math.min(...samples),
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    sampleCount: samples.length,
  };
}

function nestedFoldToggleDistribution(
  sessions: readonly NestedFoldEditingSession[],
  direction: 'collapse' | 'expand',
): NestedFoldDistribution {
  const samples = sessions.map((session) => {
    const sample =
      direction === 'collapse' ? session.collapseToggle : session.expandToggle;
    if (sample === null) {
      throw new Error(`Missing ${direction} toggle sample in folded session`);
    }
    return sample.inputToPaintMilliseconds;
  });
  return {
    maximum: Math.max(...samples),
    minimum: Math.min(...samples),
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    sampleCount: samples.length,
  };
}

function generateNestedWorkspace(fixtureRoot: string, lineCount: number): void {
  mkdirSync(fixtureRoot, { recursive: true });
  const generation = Bun.spawnSync(
    [
      process.execPath,
      'scripts/make-nested-fold-fixture.ts',
      '--lines',
      String(lineCount),
      '--output',
      join(fixtureRoot, 'nested.json'),
    ],
    {
      cwd: repositoryRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  if (generation.exitCode !== 0) {
    throw new Error(
      `Nested fixture generation failed for ${lineCount} lines: ` +
        new TextDecoder().decode(generation.stderr),
    );
  }
}

async function measureScaleEditing(): Promise<void> {
  requireAcquiredQuietLock();
  const lineCounts = [1_000_000, 500_000, 100_000, 20_000, 2_000] as const;
  const sessionCount = positiveIntegerFromEnvironment(
    'SCALE_EDIT_SESSION_COUNT',
    3,
  );
  const burstLength = positiveIntegerFromEnvironment(
    'SCALE_EDIT_BURST_LENGTH',
    30,
  );
  const positiveControlBurstLength = Math.min(
    burstLength,
    positiveIntegerFromEnvironment('SCALE_EDIT_CONTROL_BURST_LENGTH', 3),
  );
  const scaleMeasurementRoot = mkdtempSync(join(tmpdir(), 'invar-scale-edit-'));
  const fixtureRootByLineCount = new Map<number, string>();

  try {
    for (const lineCount of lineCounts) {
      const fixtureRoot = join(scaleMeasurementRoot, String(lineCount));
      generateScaleWorkspace(fixtureRoot, lineCount);
      fixtureRootByLineCount.set(lineCount, fixtureRoot);
    }

    const measurements: ScaleLineCountMeasurement[] = [];
    for (const lineCount of lineCounts) {
      const fixtureRoot = fixtureRootByLineCount.get(lineCount);
      if (fixtureRoot === undefined) {
        throw new Error(`Missing generated ${lineCount}-line fixture`);
      }
      const sessions: ScaleEditingSession[] = [];
      for (
        let sessionNumber = 1;
        sessionNumber <= sessionCount;
        sessionNumber++
      ) {
        assertNoTypeScriptGoProcess(
          `${lineCount}-line session ${sessionNumber} before launch`,
        );
        sessions.push(
          await measureScaleEditingSession({
            burstLength,
            fixtureRoot,
            forceFullRebuild: false,
            lineCount,
            sessionNumber,
          }),
        );
      }
      measurements.push({ lineCount, sessions });
    }

    const fiveHundredThousandFixture = fixtureRootByLineCount.get(500_000);
    if (fiveHundredThousandFixture === undefined) {
      throw new Error('Missing generated 500000-line fixture');
    }
    const forcedFullRebuildSessions: ScaleEditingSession[] = [];
    for (
      let sessionNumber = 1;
      sessionNumber <= sessionCount;
      sessionNumber++
    ) {
      assertNoTypeScriptGoProcess(
        `forced-full-rebuild session ${sessionNumber} before launch`,
      );
      forcedFullRebuildSessions.push(
        await measureScaleEditingSession({
          burstLength: positiveControlBurstLength,
          fixtureRoot: fiveHundredThousandFixture,
          forceFullRebuild: true,
          lineCount: 500_000,
          sessionNumber,
        }),
      );
    }

    const fiveHundredThousandIncrementalSamples = measurements
      .find((measurement) => measurement.lineCount === 500_000)
      ?.sessions.flatMap((session) => session.middleInputToPaintMilliseconds);
    if (fiveHundredThousandIncrementalSamples === undefined) {
      throw new Error('Missing 500000-line incremental samples');
    }
    const forcedFullRebuildSamples = forcedFullRebuildSessions.flatMap(
      (session) => session.middleInputToPaintMilliseconds,
    );
    const incrementalMedianMilliseconds = percentile(
      fiveHundredThousandIncrementalSamples,
      0.5,
    );
    const forcedFullRebuildMedianMilliseconds = percentile(
      forcedFullRebuildSamples,
      0.5,
    );
    const movementMultiple =
      forcedFullRebuildMedianMilliseconds / incrementalMedianMilliseconds;
    if (movementMultiple < 10) {
      throw new Error(
        'Large-file edit positive control did not move the 500k median by ' +
          `an order of magnitude: incremental ` +
          `${incrementalMedianMilliseconds.toFixed(3)} ms, forced ` +
          `${forcedFullRebuildMedianMilliseconds.toFixed(3)} ms, ` +
          `${movementMultiple.toFixed(2)}x`,
      );
    }

    console.log(
      JSON.stringify(
        {
          boundary: {
            end:
              'first complete DEC 2026 frame whose emulator grid contains ' +
              'the cumulative edit',
            excludes: [
              'fixture generation',
              'navigation to the target line',
              'filesystem saving',
              'terminal display after frame bytes reach the PTY master',
              'language-server work (isolated 1 KB suppression limit)',
            ],
            includes: [
              'real PTY input routing',
              'undo capture',
              'document and wrap-index mutation',
              'reactive projection',
              'paint and frame emission',
            ],
            start: 'immediately before the edit byte is written to the PTY',
          },
          burstLength,
          fixture:
            'scripts/make-scale-workspace.ts; edits target a generated line ' +
            'near the middle and, at 500k/1M, WIDEST-LINE-CHAMPION',
          forcedFullRebuildPositiveControl: {
            burstLength: positiveControlBurstLength,
            forcedFullRebuildMedianMilliseconds,
            forcedFullRebuildSessions,
            incrementalMedianMilliseconds,
            movementMultiple,
            requirement:
              'forced pre-fix wrap-index rebuild moves the 500k median by ' +
              'at least 10x',
            satisfied: true,
          },
          generatedAt: new Date().toISOString(),
          measurements,
          quietLock: {
            holderName: process.env.INVAR_QUIET_LOCK_HOLDER_NAME,
            mode: process.env.INVAR_QUIET_LOCK_MODE,
            state: process.env.INVAR_QUIET_LOCK_STATE,
            waitMilliseconds: process.env.INVAR_QUIET_LOCK_WAIT_MILLISECONDS,
          },
          repositoryRoot,
        },
        null,
        2,
      ),
    );
  } finally {
    rmSync(scaleMeasurementRoot, { recursive: true, force: true });
  }
}

async function measureScaleEditingSession(
  options: ScaleEditingSessionOptions,
): Promise<ScaleEditingSession> {
  const isolatedHomeDirectory = mkdtempSync(
    join(
      tmpdir(),
      `invar-scale-home-${options.lineCount}-` +
        `${options.forceFullRebuild ? 'control' : 'normal'}-`,
    ),
  );
  const settingsDirectory = join(isolatedHomeDirectory, '.config', 'invar');
  mkdirSync(settingsDirectory, { recursive: true });
  await Bun.write(
    join(settingsDirectory, 'settings.json'),
    `${JSON.stringify({ lspFileSizeLimitKb: 1 })}\n`,
  );
  const projectSettingsDirectory = join(options.fixtureRoot, '.invar');
  mkdirSync(projectSettingsDirectory, { recursive: true });
  await Bun.write(
    join(projectSettingsDirectory, 'settings.json'),
    `${JSON.stringify({ lspFileSizeLimitKb: 1 })}\n`,
  );
  const launchStartedMilliseconds = performance.now();
  const driver = new PtyTestDriver.Class({
    workspaceRoot: options.fixtureRoot,
    repositoryRoot,
    columns: 120,
    rows: 40,
    homeDirectory: isolatedHomeDirectory,
    command: options.forceFullRebuild
      ? [
          process.execPath,
          'run',
          '--preload',
          join(
            repositoryRoot,
            'scripts/harness/force-editor-wrap-full-rebuild.ts',
          ),
          'src/main.ts',
          options.fixtureRoot,
        ]
      : undefined,
  });

  try {
    const launchFinishedMilliseconds = await openGeneratedHugeFile(driver);
    const launchPeakResidentBytes = peakResidentBytes(driver.processId);
    const middleLineIndex = middleMeasurementLineIndex(options.lineCount);
    await navigateToGeneratedLine(driver, middleLineIndex);
    const middleBurst = await measureEditingBurst(
      driver,
      '~',
      options.burstLength,
      `middle line ${middleLineIndex + 1}`,
    );
    const championBurst =
      options.lineCount >= 250_000
        ? await measureChampionBurst(driver, options.burstLength)
        : null;
    assertNoTypeScriptGoProcess(
      `${options.lineCount}-line session ${options.sessionNumber} ` +
        'while measured app is alive',
    );
    return {
      championCompletedFramesUntilEdit:
        championBurst?.completedFramesUntilEdit ?? null,
      championInputToPaintMilliseconds:
        championBurst?.inputToPaintMilliseconds ?? null,
      championLoadAverages: championBurst?.loadAverages ?? null,
      forceFullRebuild: options.forceFullRebuild,
      launchToFirstPaintMilliseconds:
        launchFinishedMilliseconds - launchStartedMilliseconds,
      middleCompletedFramesUntilEdit: middleBurst.completedFramesUntilEdit,
      middleInputToPaintMilliseconds: middleBurst.inputToPaintMilliseconds,
      middleLoadAverages: middleBurst.loadAverages,
      middleLineIndex,
      peakResidentBytes: launchPeakResidentBytes,
      processId: driver.processId,
      sessionNumber: options.sessionNumber,
    };
  } finally {
    await driver.dispose();
    rmSync(isolatedHomeDirectory, { recursive: true, force: true });
  }
}

async function openGeneratedHugeFile(
  driver: PtyTestDriver.Model,
): Promise<number> {
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('huge.ts') !== null,
    30_000,
  );
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Go to File') !== null,
    15_000,
  );
  driver.sendText('huge.ts');
  await driver.awaitGridCondition(
    'Quick Open lists huge.ts as the selected candidate',
    (snapshot) => textOccurrenceCount(snapshot.text(), 'huge.ts') >= 2,
    30_000,
  );
  const firstPaintMeasurement =
    await driver.sendKeysAndAwaitGridConditionByteArrival(
      ['Enter'],
      'the generated first line is painted in the editor',
      (snapshot) => snapshot.findText('ScaleRecord0000000') !== null,
      60_000,
    );
  driver.sendKeys('Control+Shift+j');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('[Files]') === null,
    15_000,
  );
  await driver.awaitSnapshot(
    (snapshot) =>
      snapshot.findText('Large file — language features off') !== null,
    15_000,
  );
  return firstPaintMeasurement.completedFrame.byteArrivalTimestampMilliseconds;
}

async function navigateToGeneratedLine(
  driver: PtyTestDriver.Model,
  lineIndex: number,
): Promise<void> {
  const marker = String(lineIndex).padStart(7, '0');
  driver.sendKeys('Control+f');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Find') !== null,
    15_000,
  );
  driver.sendPaste(marker);
  await driver.awaitGridCondition(
    `Find resolves generated line marker ${marker}`,
    (snapshot) =>
      snapshot.findText(marker) !== null &&
      snapshot.findText('1 of 1') !== null,
    60_000,
  );
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText(`Ln ${lineIndex + 1},`) !== null,
    15_000,
  );
  driver.sendKeys('Escape');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('╭─Find') === null,
    15_000,
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText(`Ln ${lineIndex + 1},`) !== null,
    15_000,
  );
  driver.sendKeys('Down');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText(`Ln ${lineIndex + 2},`) !== null,
    15_000,
  );
  driver.sendKeys('Up');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText(`Ln ${lineIndex + 1},`) !== null,
    15_000,
  );
  driver.sendKeys('End');
  await driver.awaitScreenChange(15_000);
}

async function measureChampionBurst(
  driver: PtyTestDriver.Model,
  burstLength: number,
): Promise<EditingBurstMeasurement> {
  driver.sendKeys('Control+f');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Find') !== null,
    15_000,
  );
  driver.sendKeys(
    'Backspace',
    'Backspace',
    'Backspace',
    'Backspace',
    'Backspace',
    'Backspace',
    'Backspace',
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('1 of 1') === null,
    15_000,
  );
  driver.sendPaste('WIDEST-LINE-CHAMPION');
  await driver.awaitGridCondition(
    'Find resolves WIDEST-LINE-CHAMPION',
    (snapshot) =>
      snapshot.findText('WIDEST-LINE-CHAMPION') !== null &&
      snapshot.findText('1 of 1') !== null,
    60_000,
  );
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Ln 250000,') !== null,
    15_000,
  );
  driver.sendKeys('Escape');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('╭─Find') === null,
    15_000,
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Ln 250000,') !== null,
    15_000,
  );
  driver.sendKeys('Down');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Ln 250001,') !== null,
    15_000,
  );
  driver.sendKeys('Up');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Ln 250000,') !== null,
    15_000,
  );
  driver.sendKeys('End');
  await driver.awaitScreenChange(15_000);
  return measureEditingBurst(driver, '!', burstLength, 'WIDEST-LINE-CHAMPION');
}

async function measureEditingBurst(
  driver: PtyTestDriver.Model,
  insertedCharacter: string,
  burstLength: number,
  targetDescription: string,
): Promise<EditingBurstMeasurement> {
  driver.sendKeys(insertedCharacter);
  await driver.awaitScreenChange(15_000);
  const samples: number[] = [];
  const completedFramesUntilEdit: number[] = [];
  const loadAverages: LoadAverageMeasurement[] = [];
  for (let pressNumber = 1; pressNumber <= burstLength; pressNumber++) {
    const expectedSuffix = insertedCharacter.repeat(pressNumber + 1);
    const currentLoadAverage = loadavg();
    const measurement = await driver.sendKeysAndAwaitGridConditionByteArrival(
      [insertedCharacter],
      `${targetDescription} contains suffix ${expectedSuffix}`,
      (snapshot) => snapshot.text().includes(expectedSuffix),
      60_000,
    );
    samples.push(measurement.inputToFrameByteArrivalMilliseconds);
    completedFramesUntilEdit.push(measurement.completedFramesUntilCondition);
    loadAverages.push({
      fifteenMinutes: currentLoadAverage[2] ?? Number.NaN,
      fiveMinutes: currentLoadAverage[1] ?? Number.NaN,
      oneMinute: currentLoadAverage[0] ?? Number.NaN,
    });
  }
  return {
    completedFramesUntilEdit,
    inputToPaintMilliseconds: samples,
    loadAverages,
  };
}

function middleMeasurementLineIndex(lineCount: number): number {
  const fraction = lineCount >= 500_000 ? 0.4 : 0.5;
  const approximateLineIndex = Math.floor(lineCount * fraction);
  const cycleAlignedLineIndex =
    approximateLineIndex - (approximateLineIndex % 8) + 4;
  return Math.min(lineCount - 1, cycleAlignedLineIndex);
}

function generateScaleWorkspace(fixtureRoot: string, lineCount: number): void {
  const generation = Bun.spawnSync(
    [
      process.execPath,
      'scripts/make-scale-workspace.ts',
      '--directory',
      fixtureRoot,
      '--lines',
      String(lineCount),
    ],
    {
      cwd: repositoryRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  if (generation.exitCode !== 0) {
    throw new Error(
      `Scale fixture generation failed for ${lineCount} lines: ` +
        new TextDecoder().decode(generation.stderr),
    );
  }
}

function peakResidentBytes(processId: number): number {
  const status = readFileSync(`/proc/${processId}/status`, 'utf8');
  const peakResidentMatch = /^VmHWM:\s+(\d+)\s+kB$/m.exec(status);
  if (peakResidentMatch?.[1] === undefined) {
    throw new Error(`VmHWM is absent for process ${processId}`);
  }
  return Number(peakResidentMatch[1]) * 1024;
}

function textOccurrenceCount(text: string, marker: string): number {
  let count = 0;
  let searchOffset = 0;
  while (true) {
    const occurrenceOffset = text.indexOf(marker, searchOffset);
    if (occurrenceOffset < 0) return count;
    count++;
    searchOffset = occurrenceOffset + marker.length;
  }
}

function assertNoTypeScriptGoProcess(context: string): void {
  const result = Bun.spawnSync(['pgrep', '-x', 'tsgo'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode === 1) return;
  const processIdentifiers = new TextDecoder().decode(result.stdout).trim();
  const processDetails =
    processIdentifiers.length === 0
      ? ''
      : new TextDecoder()
          .decode(
            Bun.spawnSync(
              [
                'ps',
                '-o',
                'pid,ppid,tty,cmd',
                '-p',
                processIdentifiers.replaceAll('\n', ','),
              ],
              { stdout: 'pipe', stderr: 'pipe' },
            ).stdout,
          )
          .trim();
  throw new Error(
    `Contaminated ${context}: tsgo process exists` +
      (processIdentifiers.length > 0 ? ` (${processIdentifiers})` : '') +
      (processDetails.length > 0 ? `; ${processDetails}` : ''),
  );
}

function requireAcquiredQuietLock(): void {
  const degradation = QuietLock.Class.degradation(process.env);
  if (degradation !== null) {
    throw new Error(
      `Scale edit measurement quiet lock degraded: ` +
        JSON.stringify(degradation),
    );
  }
  if (
    process.env.INVAR_QUIET_LOCK_MODE !== 'quiet-exclusive' ||
    process.env.INVAR_QUIET_LOCK_STATE !== 'acquired'
  ) {
    throw new Error(
      'Scale edit measurement requires an acquired quiet-exclusive lock',
    );
  }
}

function positiveIntegerFromEnvironment(
  environmentName: string,
  defaultValue: number,
): number {
  const parsedValue = Number(
    process.env[environmentName] ?? String(defaultValue),
  );
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${environmentName} must be a positive integer`);
  }
  return parsedValue;
}

interface ScaleEditingSessionOptions {
  readonly burstLength: number;
  readonly fixtureRoot: string;
  readonly forceFullRebuild: boolean;
  readonly lineCount: number;
  readonly sessionNumber: number;
}

interface ScaleEditingSession {
  readonly championCompletedFramesUntilEdit: readonly number[] | null;
  readonly championInputToPaintMilliseconds: readonly number[] | null;
  readonly championLoadAverages: readonly LoadAverageMeasurement[] | null;
  readonly forceFullRebuild: boolean;
  readonly launchToFirstPaintMilliseconds: number;
  readonly middleCompletedFramesUntilEdit: readonly number[];
  readonly middleInputToPaintMilliseconds: readonly number[];
  readonly middleLoadAverages: readonly LoadAverageMeasurement[];
  readonly middleLineIndex: number;
  readonly peakResidentBytes: number;
  readonly processId: number;
  readonly sessionNumber: number;
}

interface EditingBurstMeasurement {
  readonly completedFramesUntilEdit: readonly number[];
  readonly inputToPaintMilliseconds: readonly number[];
  readonly loadAverages: readonly LoadAverageMeasurement[];
}

interface LoadAverageMeasurement {
  readonly fifteenMinutes: number;
  readonly fiveMinutes: number;
  readonly oneMinute: number;
}

interface NestedFoldEditingSessionOptions {
  readonly burstLength: number;
  readonly collapsed: boolean;
  readonly fixtureRoot: string;
  readonly forceFullRebuild: boolean;
  readonly lineCount: number;
  readonly sessionNumber: number;
}

interface NestedFoldEditingSession {
  readonly collapsed: boolean;
  readonly collapseToggle: NestedFoldToggleSample | null;
  readonly expandToggle: NestedFoldToggleSample | null;
  readonly forceFullRebuild: boolean;
  readonly lineCount: number;
  readonly samples: readonly NestedFoldEditSample[];
  readonly sessionNumber: number;
}

interface NestedFoldToggleSample {
  readonly completedFramesUntilToggle: number;
  readonly inputToPaintMilliseconds: number;
  readonly loadAverage: {
    readonly fifteenMinutes: number;
    readonly fiveMinutes: number;
    readonly oneMinute: number;
  };
}

interface NestedFoldEditSample {
  readonly completedFramesUntilEdit: number;
  readonly inputToPaintMilliseconds: number;
  readonly loadAverage: {
    readonly fifteenMinutes: number;
    readonly fiveMinutes: number;
    readonly oneMinute: number;
  };
  readonly pressNumber: number;
}

interface NestedFoldDistribution {
  readonly maximum: number;
  readonly minimum: number;
  readonly p50: number;
  readonly p95: number;
  readonly sampleCount: number;
}

interface NestedFoldCaseMeasurement {
  readonly collapsed: boolean;
  readonly distribution: NestedFoldDistribution;
  readonly lineCount: number;
  readonly sessions: readonly NestedFoldEditingSession[];
  readonly toggleDistributions: {
    readonly collapse: NestedFoldDistribution;
    readonly expand: NestedFoldDistribution;
  } | null;
}

interface ScaleLineCountMeasurement {
  readonly lineCount: number;
  readonly sessions: readonly ScaleEditingSession[];
}
