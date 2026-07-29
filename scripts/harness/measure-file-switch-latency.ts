#!/usr/bin/env bun
// File/workspace switch latency at the application byte boundary, plus the size of the synchronized
// frame the terminal must parse and paint.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Latency measurements name their observation boundary (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

const repositoryRoot = process.cwd();

const generatedFixtureRoot = join(
  repositoryRoot,
  'artifacts',
  'switch-latency-fixtures',
);

const sessionCount = Number(process.env.SWITCH_LATENCY_SESSION_COUNT ?? 5);

const switchCount = Number(process.env.SWITCH_LATENCY_SWITCH_COUNT ?? 20);

const requestedScenario = process.env.SWITCH_LATENCY_SCENARIO ?? 'all';

const secondWorkspaceRoot = process.env.SWITCH_LATENCY_SECOND_WORKSPACE;

const preserveGeneratedFixtures =
  process.env.SWITCH_LATENCY_PRESERVE_FIXTURES === '1';

const diagnosticLspFileSizeLimitKilobytes =
  process.env.SWITCH_LATENCY_DIAGNOSTIC_LSP_FILE_SIZE_LIMIT_KB;

const captureSwitchFrames = process.env.SWITCH_LATENCY_CAPTURE_FRAMES === '1';

const synchronizedOutputBeginMarker = '\x1b[?2026h';

const synchronizedOutputEndMarker = '\x1b[?2026l';

const observationBoundary = 'input-write→DEC-2026-end-marker-byte-arrival';

interface SwitchTarget {
  path: string;
  visibleMarker: string;
}

interface FrameStreamMetrics {
  byteCount: number;
  cursorSequenceCount: number;
  eraseSequenceCount: number;
  printableByteCount: number;
  repeatedIdenticalSgrCount: number;
  resetSgrCount: number;
  sgrByteCount: number;
  sgrSequenceCount: number;
}

interface ExpectedFrameCondition {
  description: string;
  predicate: (snapshot: HarnessSnapshot.Model) => boolean;
}

interface SwitchSample extends FrameStreamMetrics {
  cellChangeCount: number;
  completedFramesUntilCondition: number;
  direction: string;
  inputToFirstFrameByteArrivalMilliseconds: number;
  inputToFrameByteArrivalMilliseconds: number;
  sessionNumber: number;
  switchNumber: number;
}

interface ScenarioResult {
  aggregate: ReturnType<typeof summarizeSamples>;
  boundary: string;
  samples: SwitchSample[];
  scenario: string;
  sessions: Array<
    ReturnType<typeof summarizeSamples> & { sessionNumber: number }
  >;
}

const smallFirstTarget: SwitchTarget = {
  path: join(repositoryRoot, 'README.md'),
  visibleMarker: 'terminal code editor',
};

const smallSecondTarget: SwitchTarget = {
  path: join(repositoryRoot, 'LICENSE'),
  visibleMarker: 'MIT License',
};

const realLargeFirstTarget: SwitchTarget = {
  path: join(repositoryRoot, 'src/modules/app/Bootstrap.ts'),
  visibleMarker: 'Boot sequence: seal the kernel',
};

const realLargeSecondTarget: SwitchTarget = {
  path: join(repositoryRoot, 'src/modules/ui/RootView.ts'),
  visibleMarker: 'The root frame, rendered from workspace',
};

const syntheticFiveThousandTarget: SwitchTarget = {
  path: join(generatedFixtureRoot, 'synthetic-realistic-05000.ts'),
  visibleMarker: 'SWITCH-LATENCY-SYNTHETIC-05000',
};

const syntheticTwentyThousandTarget: SwitchTarget = {
  path: join(generatedFixtureRoot, 'synthetic-realistic-20000.ts'),
  visibleMarker: 'SWITCH-LATENCY-SYNTHETIC-20000',
};

const cacheTargets = Array.from(
  { length: switchCount },
  (_unused, targetIndex): SwitchTarget => ({
    path: join(
      generatedFixtureRoot,
      `cache-cold-${String(targetIndex + 1).padStart(2, '0')}.ts`,
    ),
    visibleMarker: `SWITCH-LATENCY-CACHE-${String(targetIndex + 1).padStart(2, '0')}`,
  }),
);

await prepareGeneratedFixtures();

const results: ScenarioResult[] = [];

try {
  if (scenarioRequested('keypress')) {
    results.push(await measureKeypressScenario());
  }
  if (scenarioRequested('small-plain')) {
    results.push(
      await measurePairedBufferScenario(
        'small-plain↔small-plain',
        smallFirstTarget,
        smallSecondTarget,
      ),
    );
  }
  if (scenarioRequested('real-large-typescript')) {
    results.push(
      await measurePairedBufferScenario(
        'real-large-typescript↔real-large-typescript',
        realLargeFirstTarget,
        realLargeSecondTarget,
      ),
    );
  }
  if (scenarioRequested('synthetic-large-typescript')) {
    results.push(
      await measurePairedBufferScenario(
        'synthetic-5000-lines↔synthetic-20000-lines',
        syntheticFiveThousandTarget,
        syntheticTwentyThousandTarget,
      ),
    );
  }
  if (scenarioRequested('large-small-asymmetric')) {
    results.push(
      await measurePairedBufferScenario(
        'large↔small-asymmetric',
        smallSecondTarget,
        syntheticFiveThousandTarget,
        'opening-large',
        'leaving-large',
      ),
    );
  }
  if (scenarioRequested('large-cache')) {
    results.push(...(await measureLargeCacheScenario()));
  }
  if (scenarioRequested('workspace-tabs')) {
    if (!secondWorkspaceRoot) {
      throw new Error(
        'SWITCH_LATENCY_SECOND_WORKSPACE is required for the workspace-tabs scenario',
      );
    }
    results.push(await measureWorkspaceTabScenario(secondWorkspaceRoot));
  }
  console.log(
    JSON.stringify(
      {
        boundary: observationBoundary,
        generatedAt: new Date().toISOString(),
        repositoryHead: new TextDecoder()
          .decode(
            Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {
              cwd: repositoryRoot,
              stdout: 'pipe',
            }).stdout,
          )
          .trim(),
        results,
        sessionCount,
        switchCount,
      },
      null,
      2,
    ),
  );
} finally {
  if (!preserveGeneratedFixtures) {
    rmSync(generatedFixtureRoot, { recursive: true, force: true });
  }
}

function scenarioRequested(scenario: string): boolean {
  return requestedScenario === 'all' || requestedScenario === scenario;
}

async function prepareGeneratedFixtures(): Promise<void> {
  mkdirSync(generatedFixtureRoot, { recursive: true });
  await writeRealisticTypeScriptFixture(
    syntheticFiveThousandTarget.path,
    syntheticFiveThousandTarget.visibleMarker,
    5_000,
  );
  await writeRealisticTypeScriptFixture(
    syntheticTwentyThousandTarget.path,
    syntheticTwentyThousandTarget.visibleMarker,
    20_000,
  );
  for (const cacheTarget of cacheTargets) {
    await writeRealisticTypeScriptFixture(
      cacheTarget.path,
      cacheTarget.visibleMarker,
      5_000,
    );
  }
}

async function writeRealisticTypeScriptFixture(
  fixturePath: string,
  marker: string,
  lineCount: number,
): Promise<void> {
  const lines = [
    `// ${marker}`,
    'export interface GeneratedRecord {',
    '  identifier: string;',
    '  revision: number;',
    '  tags: readonly string[];',
    '}',
  ];
  const batchCount = Math.max(1, Math.floor(lineCount / 100));
  const generatedRecordLineCount = lineCount - lines.length - batchCount * 4;
  const baseRecordsPerBatch = Math.floor(generatedRecordLineCount / batchCount);
  const batchesWithOneExtraRecord = generatedRecordLineCount % batchCount;
  let recordNumber = 1;
  for (let batchNumber = 1; batchNumber <= batchCount; batchNumber++) {
    lines.push(
      `export function generatedBatch${batchNumber}(): GeneratedRecord[] {`,
      '  const records: GeneratedRecord[] = [];',
    );
    const recordsInBatch =
      baseRecordsPerBatch + (batchNumber <= batchesWithOneExtraRecord ? 1 : 0);
    for (
      let batchRecordNumber = 1;
      batchRecordNumber <= recordsInBatch;
      batchRecordNumber++
    ) {
      lines.push(
        `  records.push({ identifier: 'record-${recordNumber}', revision: ${recordNumber}, ` +
          `tags: ['generated', 'typescript', 'batch-${batchNumber}'] });`,
      );
      recordNumber++;
    }
    lines.push('  return records;', '}');
  }
  if (lines.length !== lineCount) {
    throw new Error(`Generated ${lines.length} lines instead of ${lineCount}`);
  }
  await Bun.write(fixturePath, `${lines.join('\n')}\n`);
}

async function measureKeypressScenario(): Promise<ScenarioResult> {
  return measureSessions('keypress-baseline', async (driver, sessionNumber) => {
    await openTarget(driver, smallFirstTarget);
    const samples: SwitchSample[] = [];
    for (let switchNumber = 1; switchNumber <= switchCount; switchNumber++) {
      samples.push(
        await measureKeyAction(
          driver,
          switchNumber % 2 === 1 ? 'Right' : 'Left',
          sessionNumber,
          switchNumber,
          switchNumber % 2 === 1 ? 'right' : 'left',
        ),
      );
    }
    return samples;
  });
}

async function measurePairedBufferScenario(
  scenario: string,
  firstTarget: SwitchTarget,
  secondTarget: SwitchTarget,
  secondTargetDirection = `opening-${basename(secondTarget.path)}`,
  firstTargetDirection = `opening-${basename(firstTarget.path)}`,
): Promise<ScenarioResult> {
  return measureSessions(scenario, async (driver, sessionNumber) => {
    await openTarget(driver, firstTarget);
    await openTarget(driver, secondTarget);
    driver.sendKeys('Control+PageUp');
    await driver.awaitGridCondition(
      `the first switch target ${firstTarget.visibleMarker} is visible`,
      (snapshot) => snapshot.findText(firstTarget.visibleMarker) !== null,
    );

    const samples: SwitchSample[] = [];
    for (let switchNumber = 1; switchNumber <= switchCount; switchNumber++) {
      const openingSecondTarget = switchNumber % 2 === 1;
      const expectedTarget = openingSecondTarget ? secondTarget : firstTarget;
      const sample = await measureKeyAction(
        driver,
        openingSecondTarget ? 'Control+PageDown' : 'Control+PageUp',
        sessionNumber,
        switchNumber,
        openingSecondTarget ? secondTargetDirection : firstTargetDirection,
        visibleMarkerCondition(expectedTarget.visibleMarker),
      );
      samples.push(sample);
    }
    return samples;
  });
}

async function measureLargeCacheScenario(): Promise<ScenarioResult[]> {
  const coldSamples: SwitchSample[] = [];
  const warmSamples: SwitchSample[] = [];
  for (let sessionNumber = 1; sessionNumber <= sessionCount; sessionNumber++) {
    const driver = createDriver(sessionNumber, 'large-cache');
    try {
      await driver.awaitSnapshot(
        (snapshot) => snapshot.findText('src') !== null,
        15_000,
      );
      for (
        let targetIndex = 0;
        targetIndex < cacheTargets.length;
        targetIndex++
      ) {
        const target = cacheTargets[targetIndex];
        if (!target) throw new Error(`Missing cache target ${targetIndex}`);
        coldSamples.push(
          await openTargetMeasured(
            driver,
            target,
            sessionNumber,
            targetIndex + 1,
            'cold-first-open',
          ),
        );
      }
      for (let switchNumber = 1; switchNumber <= switchCount; switchNumber++) {
        const targetIndex =
          cacheTargets.length - 1 - (switchNumber % cacheTargets.length);
        const expectedTarget = cacheTargets[targetIndex];
        const sample = await measureKeyAction(
          driver,
          'Control+PageUp',
          sessionNumber,
          switchNumber,
          'warm-refocus',
          expectedTarget
            ? visibleMarkerCondition(expectedTarget.visibleMarker)
            : undefined,
        );
        warmSamples.push(sample);
      }
    } finally {
      await disposeDriver(driver);
    }
  }
  return [
    scenarioResult('large-cold-first-open', coldSamples),
    scenarioResult('large-warm-refocus', warmSamples),
  ];
}

async function measureWorkspaceTabScenario(
  workspaceRoot: string,
): Promise<ScenarioResult> {
  return measureSessions(
    'workspace-tab-switch',
    async (driver, sessionNumber) => {
      const statusPath = sessionStatusPath(
        sessionNumber,
        'workspace-tab-switch',
      );
      const initialSnapshot = await driver.awaitSnapshot(
        (snapshot) => snapshot.findText('Files') !== null,
        15_000,
      );
      const plusColumn = Array.from(initialSnapshot.rowText(0)).lastIndexOf(
        '+',
      );
      if (plusColumn < 0)
        throw new Error('Workspace plus button was not visible');
      driver.sendMouse({
        kind: 'press',
        column: plusColumn,
        row: 0,
        button: 'left',
      });
      driver.sendMouse({
        kind: 'release',
        column: plusColumn,
        row: 0,
        button: 'left',
      });
      await driver.awaitSnapshot(
        (snapshot) =>
          snapshot.findText(`+ ${dirname(repositoryRoot)}`) !== null,
      );
      driver.sendText(basename(workspaceRoot));
      await driver.awaitGridCondition(
        `the workspace picker resolved ${workspaceRoot}`,
        (snapshot) => snapshot.findText(workspaceRoot) !== null,
        15_000,
      );
      driver.sendKeys('Enter');
      await driver.awaitGridCondition(
        `the active workspace root is ${workspaceRoot}`,
        () => activeWorkspaceRoot(statusPath) === workspaceRoot,
        15_000,
      );
      driver.sendKeys('Control+Shift+PageUp');
      await driver.awaitGridCondition(
        `the active workspace root is ${repositoryRoot}`,
        () => activeWorkspaceRoot(statusPath) === repositoryRoot,
        15_000,
      );

      const samples: SwitchSample[] = [];
      for (let switchNumber = 1; switchNumber <= switchCount; switchNumber++) {
        const openingSecondWorkspace = switchNumber % 2 === 1;
        const expectedWorkspaceRoot = openingSecondWorkspace
          ? workspaceRoot
          : repositoryRoot;
        samples.push(
          await measureKeyAction(
            driver,
            openingSecondWorkspace
              ? 'Control+Shift+PageDown'
              : 'Control+Shift+PageUp',
            sessionNumber,
            switchNumber,
            openingSecondWorkspace
              ? 'opening-second-worktree'
              : 'opening-primary-worktree',
            {
              description: `the active workspace root is ${expectedWorkspaceRoot}`,
              predicate: () =>
                activeWorkspaceRoot(statusPath) === expectedWorkspaceRoot,
            },
          ),
        );
      }
      return samples;
    },
  );
}

async function measureSessions(
  scenario: string,
  measureSession: (
    driver: PtyTestDriver.Model,
    sessionNumber: number,
  ) => Promise<SwitchSample[]>,
): Promise<ScenarioResult> {
  const samples: SwitchSample[] = [];
  for (let sessionNumber = 1; sessionNumber <= sessionCount; sessionNumber++) {
    const driver = createDriver(sessionNumber, scenario);
    try {
      samples.push(...(await measureSession(driver, sessionNumber)));
    } finally {
      await disposeDriver(driver);
    }
  }
  return scenarioResult(scenario, samples);
}

function createDriver(
  sessionNumber: number,
  scenario: string,
): PtyTestDriver.Model {
  const homeDirectory = sessionHomeDirectory(sessionNumber, scenario);
  mkdirSync(homeDirectory, { recursive: true });
  if (diagnosticLspFileSizeLimitKilobytes !== undefined) {
    const settingsDirectory = join(homeDirectory, '.config', 'invar');
    mkdirSync(settingsDirectory, { recursive: true });
    writeFileSync(
      join(settingsDirectory, 'settings.json'),
      JSON.stringify({
        lspFileSizeLimitKb: Number(diagnosticLspFileSizeLimitKilobytes),
      }),
    );
  }
  return new PtyTestDriver.Class({
    workspaceRoot: repositoryRoot,
    repositoryRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: sessionStatusPath(sessionNumber, scenario),
    },
  });
}

function sessionHomeDirectory(sessionNumber: number, scenario: string): string {
  return join(
    generatedFixtureRoot,
    'homes',
    scenario.replaceAll(/[^a-z0-9-]/gi, '-'),
    String(sessionNumber),
  );
}

function sessionStatusPath(sessionNumber: number, scenario: string): string {
  return join(sessionHomeDirectory(sessionNumber, scenario), 'status.json');
}

function activeWorkspaceRoot(statusPath: string): string | undefined {
  try {
    const status = JSON.parse(readFileSync(statusPath, 'utf8')) as {
      activeWorkspaceRoot?: string;
    };
    return status.activeWorkspaceRoot;
  } catch {
    return undefined;
  }
}

async function disposeDriver(driver: PtyTestDriver.Model): Promise<void> {
  driver.sendKeys('Control+q');
  await driver.dispose();
  await Promise.race([driver.exitCode(), Bun.sleep(1_000)]);
}

async function openTarget(
  driver: PtyTestDriver.Model,
  target: SwitchTarget,
): Promise<void> {
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Go to File') !== null,
    15_000,
  );
  const relativeTargetPath = relative(repositoryRoot, target.path);
  driver.sendText(relativeTargetPath);
  await awaitQuickOpenCandidate(driver, relativeTargetPath);
  driver.sendKeys('Enter');
  await driver.awaitGridCondition(
    `the opened target ${target.visibleMarker} is visible`,
    (snapshot) => snapshot.findText(target.visibleMarker) !== null,
    60_000,
  );
}

async function openTargetMeasured(
  driver: PtyTestDriver.Model,
  target: SwitchTarget,
  sessionNumber: number,
  switchNumber: number,
  direction: string,
): Promise<SwitchSample> {
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Go to File') !== null,
    15_000,
  );
  const relativeTargetPath = relative(repositoryRoot, target.path);
  driver.sendText(relativeTargetPath);
  await awaitQuickOpenCandidate(driver, relativeTargetPath);
  const sample = await measureKeyAction(
    driver,
    'Enter',
    sessionNumber,
    switchNumber,
    direction,
    visibleMarkerCondition(target.visibleMarker),
  );
  return sample;
}

async function awaitQuickOpenCandidate(
  driver: PtyTestDriver.Model,
  relativeTargetPath: string,
): Promise<void> {
  await driver.awaitGridCondition(
    `Quick Open has resolved the candidate ${relativeTargetPath}`,
    (snapshot) => {
      let matchingRowCount = 0;
      for (let row = 0; row < snapshot.rows; row++) {
        if (snapshot.rowText(row).includes(relativeTargetPath))
          matchingRowCount++;
      }
      return matchingRowCount >= 2;
    },
    60_000,
  );
}

async function measureKeyAction(
  driver: PtyTestDriver.Model,
  keyName: string,
  sessionNumber: number,
  switchNumber: number,
  direction: string,
  expectedFrameCondition?: ExpectedFrameCondition,
): Promise<SwitchSample> {
  const beforeSnapshot = driver.snapshot();
  const expectedCondition = expectedFrameCondition ?? {
    description: 'the keypress moves the native caret',
    predicate: (snapshot: HarnessSnapshot.Model) =>
      snapshot.cursorColumn !== beforeSnapshot.cursorColumn ||
      snapshot.cursorRow !== beforeSnapshot.cursorRow,
  };
  const measurement = await driver.sendKeysAndAwaitGridConditionByteArrival(
    [keyName],
    expectedCondition.description,
    expectedCondition.predicate,
    expectedFrameCondition === undefined ? 10_000 : 60_000,
  );
  const afterSnapshot = measurement.snapshot;
  const frameBytes = synchronizedFrameBytes(
    driver.recordedOutput(),
    measurement.completedFrame.observedByteCount,
  );
  if (captureSwitchFrames) {
    const captureDirectory = join(
      repositoryRoot,
      'artifacts',
      'switch-latency-results',
      'frames',
    );
    mkdirSync(captureDirectory, { recursive: true });
    await Bun.write(
      join(
        captureDirectory,
        `${direction.replaceAll(/[^a-z0-9-]/gi, '-')}-session-${sessionNumber}` +
          `-switch-${switchNumber}.bin`,
      ),
      frameBytes,
    );
  }
  return {
    ...frameStreamMetrics(frameBytes),
    cellChangeCount: changedCellCount(beforeSnapshot, afterSnapshot),
    completedFramesUntilCondition: measurement.completedFramesUntilCondition,
    direction,
    inputToFirstFrameByteArrivalMilliseconds:
      measurement.inputToFirstFrameByteArrivalMilliseconds,
    inputToFrameByteArrivalMilliseconds:
      measurement.inputToFrameByteArrivalMilliseconds,
    sessionNumber,
    switchNumber,
  };
}

function visibleMarkerCondition(visibleMarker: string): ExpectedFrameCondition {
  return {
    description: `the switch target ${visibleMarker} is visible`,
    predicate: (snapshot) => snapshot.findText(visibleMarker) !== null,
  };
}

function synchronizedFrameBytes(
  recordedOutput: string,
  completedObservedByteCount: number,
): Uint8Array {
  const recordedBytes = new TextEncoder().encode(recordedOutput);
  const completedBytes = recordedBytes.slice(
    0,
    Math.min(completedObservedByteCount, recordedBytes.length),
  );
  const beginMarkerBytes = new TextEncoder().encode(
    synchronizedOutputBeginMarker,
  );
  const beginOffset = lastByteSequenceOffset(completedBytes, beginMarkerBytes);
  if (beginOffset < 0)
    throw new Error('Completed frame has no DEC 2026 begin marker');
  return completedBytes.slice(beginOffset);
}

function lastByteSequenceOffset(
  haystack: Uint8Array,
  needle: Uint8Array,
): number {
  for (
    let candidateOffset = haystack.length - needle.length;
    candidateOffset >= 0;
    candidateOffset--
  ) {
    let matches = true;
    for (let needleOffset = 0; needleOffset < needle.length; needleOffset++) {
      if (haystack[candidateOffset + needleOffset] !== needle[needleOffset]) {
        matches = false;
        break;
      }
    }
    if (matches) return candidateOffset;
  }
  return -1;
}

function frameStreamMetrics(frameBytes: Uint8Array): FrameStreamMetrics {
  const frameText = new TextDecoder().decode(frameBytes);
  if (
    !frameText.startsWith(synchronizedOutputBeginMarker) ||
    !frameText.endsWith(synchronizedOutputEndMarker)
  ) {
    throw new Error(
      'Extracted frame is not bounded by matching DEC 2026 markers',
    );
  }
  const sgrSequences = frameText.match(/\x1b\[[0-9;:]*m/g) ?? [];
  let repeatedIdenticalSgrCount = 0;
  for (
    let sequenceIndex = 1;
    sequenceIndex < sgrSequences.length;
    sequenceIndex++
  ) {
    if (sgrSequences[sequenceIndex] === sgrSequences[sequenceIndex - 1]) {
      repeatedIdenticalSgrCount++;
    }
  }
  return {
    byteCount: frameBytes.length,
    cursorSequenceCount: (frameText.match(/\x1b\[[0-9;]*[HfGd]/g) ?? []).length,
    eraseSequenceCount: (frameText.match(/\x1b\[[0-9;]*[JKX]/g) ?? []).length,
    printableByteCount: new TextEncoder().encode(
      frameText
        .replaceAll(/\x1b\][^\x07]*?(?:\x07|\x1b\\)/g, '')
        .replaceAll(/\x1b\[[0-?]*[ -/]*[@-~]/g, ''),
    ).length,
    repeatedIdenticalSgrCount,
    resetSgrCount: sgrSequences.filter(
      (sequence) => sequence === '\x1b[0m' || sequence === '\x1b[m',
    ).length,
    sgrByteCount: sgrSequences.reduce(
      (byteCount, sequence) =>
        byteCount + new TextEncoder().encode(sequence).length,
      0,
    ),
    sgrSequenceCount: sgrSequences.length,
  };
}

function changedCellCount(
  beforeSnapshot: HarnessSnapshot.Model,
  afterSnapshot: HarnessSnapshot.Model,
): number {
  let changeCount = 0;
  for (let row = 0; row < beforeSnapshot.rows; row++) {
    for (let column = 0; column < beforeSnapshot.columns; column++) {
      const beforeCell = beforeSnapshot.cell(row, column);
      const afterCell = afterSnapshot.cell(row, column);
      if (JSON.stringify(beforeCell) !== JSON.stringify(afterCell))
        changeCount++;
    }
  }
  return changeCount;
}

function scenarioResult(
  scenario: string,
  samples: SwitchSample[],
): ScenarioResult {
  return {
    aggregate: summarizeSamples(samples),
    boundary: observationBoundary,
    samples,
    scenario,
    sessions: Array.from(
      new Set(samples.map((sample) => sample.sessionNumber)),
      (sessionNumber) => ({
        sessionNumber,
        ...summarizeSamples(
          samples.filter((sample) => sample.sessionNumber === sessionNumber),
        ),
      }),
    ),
  };
}

function summarizeSamples(samples: readonly SwitchSample[]): {
  byDirection: Record<
    string,
    {
      byteArrivalP50Milliseconds: number;
      byteArrivalP95Milliseconds: number;
      sampleCount: number;
    }
  >;
  byteArrivalP50Milliseconds: number;
  byteArrivalP95Milliseconds: number;
  cellChangesP50: number;
  cellChangesP95: number;
  completedFramesUntilConditionP50: number;
  completedFramesUntilConditionP95: number;
  firstFrameByteArrivalP50Milliseconds: number;
  firstFrameByteArrivalP95Milliseconds: number;
  frameBytesP50: number;
  frameBytesP95: number;
  printableBytesP50: number;
  repeatedIdenticalSgrP50: number;
  resetSgrP50: number;
  sampleCount: number;
  sgrBytesP50: number;
  sgrSequencesP50: number;
} {
  const directions = new Set(samples.map((sample) => sample.direction));
  return {
    byDirection: Object.fromEntries(
      [...directions].map((direction) => {
        const directionSamples = samples.filter(
          (sample) => sample.direction === direction,
        );
        return [
          direction,
          {
            byteArrivalP50Milliseconds: percentile(
              directionSamples.map(
                (sample) => sample.inputToFrameByteArrivalMilliseconds,
              ),
              0.5,
            ),
            byteArrivalP95Milliseconds: percentile(
              directionSamples.map(
                (sample) => sample.inputToFrameByteArrivalMilliseconds,
              ),
              0.95,
            ),
            sampleCount: directionSamples.length,
          },
        ];
      }),
    ),
    byteArrivalP50Milliseconds: percentile(
      samples.map((sample) => sample.inputToFrameByteArrivalMilliseconds),
      0.5,
    ),
    byteArrivalP95Milliseconds: percentile(
      samples.map((sample) => sample.inputToFrameByteArrivalMilliseconds),
      0.95,
    ),
    cellChangesP50: percentile(
      samples.map((sample) => sample.cellChangeCount),
      0.5,
    ),
    cellChangesP95: percentile(
      samples.map((sample) => sample.cellChangeCount),
      0.95,
    ),
    completedFramesUntilConditionP50: percentile(
      samples.map((sample) => sample.completedFramesUntilCondition),
      0.5,
    ),
    completedFramesUntilConditionP95: percentile(
      samples.map((sample) => sample.completedFramesUntilCondition),
      0.95,
    ),
    firstFrameByteArrivalP50Milliseconds: percentile(
      samples.map((sample) => sample.inputToFirstFrameByteArrivalMilliseconds),
      0.5,
    ),
    firstFrameByteArrivalP95Milliseconds: percentile(
      samples.map((sample) => sample.inputToFirstFrameByteArrivalMilliseconds),
      0.95,
    ),
    frameBytesP50: percentile(
      samples.map((sample) => sample.byteCount),
      0.5,
    ),
    frameBytesP95: percentile(
      samples.map((sample) => sample.byteCount),
      0.95,
    ),
    printableBytesP50: percentile(
      samples.map((sample) => sample.printableByteCount),
      0.5,
    ),
    repeatedIdenticalSgrP50: percentile(
      samples.map((sample) => sample.repeatedIdenticalSgrCount),
      0.5,
    ),
    resetSgrP50: percentile(
      samples.map((sample) => sample.resetSgrCount),
      0.5,
    ),
    sampleCount: samples.length,
    sgrBytesP50: percentile(
      samples.map((sample) => sample.sgrByteCount),
      0.5,
    ),
    sgrSequencesP50: percentile(
      samples.map((sample) => sample.sgrSequenceCount),
      0.5,
    ),
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
    throw new Error(`Missing percentile sample ${sampleIndex}`);
  return sample;
}
