#!/usr/bin/env bun
// This smoke drives Invar Monitoring through the real pseudo terminal: it opens the pane, watches
// the readings appear, opens and closes files while the document ledger follows, takes a heap
// census, turns logging on and off, and proves that a HIDDEN monitor owns no clock and takes no
// sample. Run `bun scripts/harness/smoke-monitoring-harness.ts`.
//
// The quiescence arm is the load-bearing one: a monitor that measures while nobody is looking is
// the exact defect this plugin exists to find in other plugins.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: The monitor names its own cost and pays it only when observed (src/modules/monitoring/monitoring.invariants.md)
// invariant: A runtime reading is a delta over a named window (src/modules/monitoring/monitoring.invariants.md)
// invariant: Retained document bytes come from the buffer set (src/modules/monitoring/monitoring.invariants.md)
// invariant: The monitor is a pane content citizen (src/modules/monitoring/monitoring.invariants.md)
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'invar-monitoring-smoke-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-monitoring-home-'));
const statusPath = join(homeDirectory, 'status.json');
const logPath = join(homeDirectory, 'monitoring-samples.jsonl');
mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });

// SCALE PARITY: one small document and one large one. The ledger's bytes must follow the CONTENT,
// so a small file and a hundredfold larger file cannot report the same retained cost.
const smallFileName = 'small-file.txt';
const largeFileName = 'large-file.txt';
const smallLineCount = 40;
const largeLineCount = 40_000;
writeFileSync(
  join(fixtureRoot, smallFileName),
  Array.from(
    { length: smallLineCount },
    (_, index) => `small line ${index}`,
  ).join('\n'),
);
writeFileSync(
  join(fixtureRoot, largeFileName),
  Array.from(
    { length: largeLineCount },
    (_, index) => `large line ${index}`,
  ).join('\n'),
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 150,
  rows: 44,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    COLORTERM: 'truecolor',
    INVAR_MONITORING_LOG_PATH: logPath,
  },
  command: [process.execPath, 'src/main.ts', fixtureRoot],
});

function readStatus(): Record<string, unknown> {
  return HarnessSmoke.Class.readStatus(statusPath) as Record<string, unknown>;
}

function numberField(name: string): number {
  return Number(readStatus()[name] ?? 0);
}

/** Run one command by title through the Command Palette, whatever owns the keyboard. */
async function runPaletteCommand(commandTitle: string): Promise<void> {
  driver.sendKeys('Control+Shift+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `the Command Palette opens for ${commandTitle}`,
    (status) => status.paletteOpen === true,
  );
  const previousQuery = String(readStatus().paletteQuery ?? '');
  if (previousQuery.length > 0) {
    driver.sendKeys(
      ...Array.from({ length: previousQuery.length }, () => 'Backspace'),
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `the Command Palette clears its query before ${commandTitle}`,
      (status) => status.paletteQuery === '',
    );
  }
  driver.sendText(commandTitle);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${commandTitle} is the filtered command`,
    (status) =>
      status.paletteQuery === commandTitle &&
      Number(status.paletteMatches) >= 1,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `the Command Palette closes after ${commandTitle}`,
    (status) => status.paletteOpen === false,
  );
}

/** Show the monitoring pane and wait for a sample that is NEWER than the one already published. */
async function showMonitoringAndSample(reason: string): Promise<void> {
  const sampleCountBefore = numberField('monitoringSampleCount');
  await runPaletteCommand('View: Show Monitoring');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `the monitoring pane is observed and re-samples for ${reason}`,
    (status) =>
      status.monitoringObserved === true &&
      Number(status.monitoringSampleCount ?? 0) > sampleCountBefore,
  );
}

async function openFixture(fileName: string): Promise<void> {
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `Go to File opens before ${fileName}`,
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText(fileName);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `Go to File finds ${fileName}`,
    (status) =>
      status.quickOpenQuery === fileName && Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${fileName} becomes the active buffer`,
    (status) => String(status.activeBuffer).endsWith(`/${fileName}`),
  );
}

try {
  console.log('== monitoring: a hidden monitor owns no clock ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the application boots with the monitoring contribution installed',
    (status) => status.ready === true && status.monitoringObserved === false,
  );
  const bootStatus = readStatus();
  HarnessSmoke.Class.requireCondition(
    bootStatus.monitoringSamplingAtRest === true &&
      Number(bootStatus.monitoringSampleCount) === 0 &&
      Number(bootStatus.monitoringResidentSetBytes) === 0,
    'a never-opened monitor has no sampling clock and no reading',
  );

  console.log('== monitoring: opening the pane starts one delta reading ==');
  await showMonitoringAndSample('the first open');
  const firstStatus = readStatus();
  HarnessSmoke.Class.requireCondition(
    firstStatus.monitoringSamplingAtRest === false &&
      Number(firstStatus.monitoringResidentSetBytes) > 0 &&
      Number(firstStatus.monitoringSampleCostMilliseconds) >= 0,
    'an observed monitor samples and names what the sample cost',
  );
  // The monitor must not become the burn it looks for: one cheap sample, not a stall.
  HarnessSmoke.Class.requireCondition(
    Number(firstStatus.monitoringSampleCostMilliseconds) < 5,
    `one cadence sample costs under 5 ms (measured ${firstStatus.monitoringSampleCostMilliseconds} ms)`,
  );
  await driver.awaitGridCondition(
    'the pane paints its reading and names the window the reading covers',
    (snapshot) =>
      snapshot.findText('Invar Monitoring') !== null &&
      snapshot.findText('cpu ') !== null &&
      snapshot.findText('rss ') !== null &&
      snapshot.findText('delta over') !== null,
  );
  HarnessSmoke.Class.pass(
    'the monitoring pane opens, samples once, and names its own cost',
  );

  console.log(
    '== monitoring: the file ledger follows real opens and closes ==',
  );
  await openFixture(smallFileName);
  await showMonitoringAndSample('the small file');
  const smallStatus = readStatus();
  const smallRetainedBytes = Number(
    smallStatus.monitoringRetainedDocumentBytes,
  );
  HarnessSmoke.Class.requireCondition(
    Number(smallStatus.monitoringOpenDocumentCount) === 1 &&
      Number(smallStatus.monitoringHydratedDocumentCount) === 1 &&
      smallRetainedBytes > 0,
    `one open file is one ledger row holding ${smallRetainedBytes} bytes`,
  );

  await openFixture(largeFileName);
  await showMonitoringAndSample('the large file');
  const largeStatus = readStatus();
  const largeRetainedBytes = Number(
    largeStatus.monitoringRetainedDocumentBytes,
  );
  HarnessSmoke.Class.requireCondition(
    Number(largeStatus.monitoringOpenDocumentCount) === 2,
    'two open files are two ledger rows',
  );
  // SCALE PARITY: the ledger is a byte count, so a 1,000x larger document must dominate the total.
  HarnessSmoke.Class.requireCondition(
    largeRetainedBytes > smallRetainedBytes * 100,
    `the large document dominates the ledger (${largeRetainedBytes} bytes against ${smallRetainedBytes})`,
  );
  await driver.awaitGridCondition(
    'the ledger paints both files and the live/cold distinction',
    (snapshot) =>
      snapshot.findText('files 2 open') !== null &&
      snapshot.findText(largeFileName) !== null,
  );
  HarnessSmoke.Class.pass(
    'the document ledger counts open tabs and their retained bytes at both scales',
  );

  console.log('== monitoring: closing every tab releases every ledger row ==');
  const openTabCount = numberField('bufferTabCount');
  for (let closedCount = 0; closedCount < openTabCount; closedCount += 1) {
    const remaining = openTabCount - closedCount - 1;
    driver.sendKeys('Control+w');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `tab ${closedCount + 1} of ${openTabCount} closes`,
      (status) => Number(status.bufferTabCount ?? -1) === remaining,
    );
  }
  await showMonitoringAndSample('the emptied tab bar');
  const closedStatus = readStatus();
  HarnessSmoke.Class.requireCondition(
    Number(closedStatus.monitoringOpenDocumentCount) === 0 &&
      Number(closedStatus.monitoringRetainedDocumentBytes) === 0,
    'closing every tab returns the ledger to zero rows and zero retained bytes',
  );
  HarnessSmoke.Class.pass('the ledger releases what the buffer set releases');

  console.log(
    '== monitoring: the heap census separates retained from high-water ==',
  );
  await runPaletteCommand('Monitoring: Heap Census');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the heap census publishes what survived a full collection',
    (status) =>
      status.monitoringCensusLiveHeapBytes !== null &&
      Number(status.monitoringCensusCount ?? 0) === 1,
  );
  const censusStatus = readStatus();
  const liveHeapBytes = Number(censusStatus.monitoringCensusLiveHeapBytes);
  const capacityBytes = Number(censusStatus.monitoringCensusCapacityBytes);
  const residentSetBytes = Number(
    censusStatus.monitoringCensusResidentSetAfterBytes,
  );
  HarnessSmoke.Class.requireCondition(
    liveHeapBytes > 0 && capacityBytes >= liveHeapBytes,
    `the census reports live heap ${liveHeapBytes} within capacity ${capacityBytes}`,
  );
  // The whole point of the census: the resident set is NOT the retained heap, and the pane says so.
  HarnessSmoke.Class.requireCondition(
    residentSetBytes > liveHeapBytes,
    `the resident set ${residentSetBytes} exceeds the retained heap ${liveHeapBytes}`,
  );
  HarnessSmoke.Class.requireCondition(
    Number(censusStatus.monitoringCensusCostMilliseconds) > 0,
    'the census names its own price rather than hiding it',
  );
  await driver.awaitGridCondition(
    'the census paints the retained heap and what it cost',
    (snapshot) =>
      snapshot.findText('after GC') !== null &&
      snapshot.findText('census cost') !== null,
  );
  HarnessSmoke.Class.pass(
    'an explicit census separates retained memory from collector high-water',
  );

  console.log('== monitoring: logging costs nothing until it is turned on ==');
  HarnessSmoke.Class.requireCondition(
    readStatus().monitoringLogging === false && !existsSync(logPath),
    'logging off has written no file at all',
  );
  await runPaletteCommand('Monitoring: Toggle Sample Logging');
  await showMonitoringAndSample('the first logged sample');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'logging turns on and the next samples reach the file',
    (status) =>
      status.monitoringLogging === true &&
      Number(status.monitoringLogLineCount ?? 0) >= 2,
  );
  const logLines = readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
  const firstEntry = JSON.parse(logLines[0] ?? '{}');
  HarnessSmoke.Class.requireCondition(
    logLines.length >= 2 &&
      typeof firstEntry.residentSetBytes === 'number' &&
      typeof firstEntry.processorPercent === 'number' &&
      typeof firstEntry.retainedDocumentBytes === 'number',
    `logging on writes one machine-readable line per sample (${logLines.length} lines)`,
  );
  const lineCountWhileOn = logLines.length;
  await runPaletteCommand('Monitoring: Toggle Sample Logging');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'logging turns back off',
    (status) => status.monitoringLogging === false,
  );
  HarnessSmoke.Class.pass(
    `logging writes only while it is on (${lineCountWhileOn} lines written)`,
  );

  console.log('== monitoring: a hidden monitor goes back to rest ==');
  const sampleCountWhileOpen = numberField('monitoringSampleCount');
  // Close the dock the monitor lives in. Nothing is disposed; only the projection goes away.
  await runPaletteCommand('View: Toggle Right Dock');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the monitoring pane leaves the screen and stops its clock',
    (status) =>
      status.monitoringObserved === false &&
      status.monitoringSamplingAtRest === true,
  );
  const restingSampleCount = numberField('monitoringSampleCount');
  await Bun.sleep(3_000);
  const sampleCountAfterQuietWindow = numberField('monitoringSampleCount');
  HarnessSmoke.Class.requireCondition(
    sampleCountAfterQuietWindow === restingSampleCount,
    `a hidden monitor takes no sample over three seconds (held at ${restingSampleCount})`,
  );
  HarnessSmoke.Class.requireCondition(
    restingSampleCount >= sampleCountWhileOpen,
    'the reading published while hidden is the last one taken while observed',
  );
  const logLinesAfterHidden = existsSync(logPath)
    ? readFileSync(logPath, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0).length
    : 0;
  HarnessSmoke.Class.requireCondition(
    logLinesAfterHidden === lineCountWhileOn,
    'a hidden monitor writes no log line either',
  );
  HarnessSmoke.Class.pass(
    'hiding the pane returns the monitor to complete rest, timers and all',
  );

  console.log('== monitoring: render load is attributed per plugin ==');
  // Drive a real action owned by ANOTHER contribution. The Tasks Dashboard changes its lens
  // through its own contribution context, so the frame it asks for is attributed to that plugin
  // and not to the host or to the monitor.
  const tasksLensBefore = String(readStatus().tasksLens ?? '');
  await runPaletteCommand('Tasks: Next Lens');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Tasks Dashboard changes lens, which is that plugin asking for a frame',
    (status) => String(status.tasksLens ?? '') !== tasksLensBefore,
  );
  await showMonitoringAndSample('the attributed render load');
  const loadStatus = readStatus();
  const strayCandidate = loadStatus.monitoringStrayCandidate;
  HarnessSmoke.Class.requireCondition(
    Number(loadStatus.monitoringRenderRequestsSinceOpen) > 0 &&
      typeof strayCandidate === 'string',
    `render requests are attributed to a named plugin (${strayCandidate} raised` +
      ` the most of ${loadStatus.monitoringRenderRequestsSinceOpen})`,
  );
  // The monitor must not top its own suspect list, or the lens only ever finds itself. The suspect
  // must also be a named CONTRIBUTION, not the host: attributing every plugin's frames to the host
  // would leave the lens technically populated and completely useless.
  HarnessSmoke.Class.requireCondition(
    strayCandidate !== 'monitoring' && strayCandidate !== 'host',
    `the suspect is another named contribution (${strayCandidate})`,
  );
  HarnessSmoke.Class.requireCondition(
    Number(loadStatus.monitoringOwnRenderRequestsSinceOpen) > 0 &&
      Number(loadStatus.monitoringOwnRenderRequestsSinceOpen) <
        Number(loadStatus.monitoringRenderRequestsSinceOpen),
    'the monitor names its own render load beside the load it attributes to others',
  );
  HarnessSmoke.Class.pass(
    'the stray-plugin lens names which contribution asked for frames',
  );
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
