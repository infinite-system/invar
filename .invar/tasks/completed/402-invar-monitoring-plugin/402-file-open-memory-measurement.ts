#!/usr/bin/env bun
// WHAT THIS FINDS OUT
// Where the resident set goes after a reader opens many files, and how much of it is RETAINED
// versus how much is collector high-water waiting to be reclaimed. This is the measurement behind
// the user's report of 206 MB rising to 263 MB and not coming back down.
//
// HOW TO RUN IT
//   bun .invar/tasks/in-progress/402-invar-monitoring-plugin/402-file-open-memory-measurement.ts
//
// Optional environment:
//   MEASUREMENT_FILE_COUNT   how many files to open in turn (default 24)
//   MEASUREMENT_GEOMETRY     terminal size, `COLUMNSxROWS` (default 150x44)
//
// It drives the REAL application through a real pseudo terminal. It opens each file through Go to
// File, the same gesture a reader uses. Nothing is called directly on a model.
//
// HOW TO READ THE OUTPUT
// Four checkpoints print as one table: boot, after opening every file, after closing every tab,
// and after a settle. Each checkpoint carries five numbers:
//
//   rss            resident set of the Invar process, in MB. What `top` shows.
//   heap-used      live JavaScript heap as of the last collection, in MB.
//   live-after-gc  live JavaScript heap after a FULL collection, in MB. The retained truth.
//   capacity       heap the collector holds above the live set, in MB.
//   held-docs      bytes the open tabs retain in document text, in MB.
//
// The finding is the SHAPE, not one number:
//   * `live-after-gc` returning to near its boot value means nothing is retained. The rise in `rss`
//     is allocator high-water, and it is not a leak.
//   * `live-after-gc` staying high after every tab closes means real retention. Then `held-docs`
//     says whether the document cache owns it.
//   * `held-docs` staying flat while files open means the tab cache is bounded, which is what
//     `N open tabs do not cost N live documents` claims.
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const fileCount = Number(process.env.MEASUREMENT_FILE_COUNT ?? '24');
const [columnsText = '150', rowsText = '44'] = (
  process.env.MEASUREMENT_GEOMETRY ?? '150x44'
).split('x');

const fixtureRoot = mkdtempSync(join(tmpdir(), 'invar-402-memory-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-402-memory-home-'));
const statusPath = join(homeDirectory, 'status.json');
mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });

// The fixture files are real source text, copied from this repository's own modules so the
// measurement describes documents a reader actually opens. The LARGEST files come first, because
// the question is how much a document cache can hold, and the largest documents answer it.
const sourceDirectory = join(process.cwd(), 'src', 'modules');
const sourceNames = readdirSync(sourceDirectory, { recursive: true })
  .map((entry) => String(entry))
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => ({ name, size: statSync(join(sourceDirectory, name)).size }))
  .sort((left, right) => right.size - left.size)
  .slice(0, fileCount)
  .map((entry) => entry.name);
const fixtureNames: string[] = [];
for (const [index, sourceName] of sourceNames.entries()) {
  const text = Bun.file(join(sourceDirectory, sourceName));
  const fixtureName = `fixture-${String(index).padStart(2, '0')}.ts`;
  writeFileSync(join(fixtureRoot, fixtureName), await text.text());
  fixtureNames.push(fixtureName);
}

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: Number(columnsText),
  rows: Number(rowsText),
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath, COLORTERM: 'truecolor' },
  command: [process.execPath, 'src/main.ts', fixtureRoot],
});

interface Checkpoint {
  label: string;
  residentSetBytes: number;
  heapUsedBytes: number;
  liveAfterCollectionBytes: number;
  capacityBytes: number;
  heldDocumentBytes: number;
  openDocumentCount: number;
  hydratedDocumentCount: number;
}

const checkpoints: Checkpoint[] = [];

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1).padStart(7);
}

function kilobytes(bytes: number): string {
  return (bytes / 1024).toFixed(0).padStart(10);
}

/** Run one command by title through the Command Palette. Focus-independent, unlike a chord. */
async function runPaletteCommand(commandTitle: string): Promise<void> {
  driver.sendKeys('Control+Shift+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `the Command Palette opens for ${commandTitle}`,
    (status) => status.paletteOpen === true,
  );
  const previousQuery = String(
    HarnessSmoke.Class.readStatus(statusPath).paletteQuery ?? '',
  );
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

/**
 * Bring the monitoring pane back on screen and wait for a FRESH sample. Opening a file gives the
 * right dock to the structure pane, which correctly stops the monitor's clock, so every checkpoint
 * must re-observe before it reads.
 */
async function showMonitoringPaneAndSample(): Promise<void> {
  const sampleCountBefore = Number(
    HarnessSmoke.Class.readStatus(statusPath).monitoringSampleCount ?? 0,
  );
  driver.sendKeys('Control+Shift+n');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the monitoring pane is observed and has taken a fresh sample',
    (status) =>
      status.monitoringObserved === true &&
      Number(status.monitoringSampleCount ?? 0) > sampleCountBefore,
  );
}

/** Take one census through the Command Palette, then read the published numbers. */
async function checkpoint(label: string): Promise<void> {
  await showMonitoringPaneAndSample();
  const censusCountBefore = Number(
    HarnessSmoke.Class.readStatus(statusPath).monitoringCensusCount ?? 0,
  );
  await runPaletteCommand('Monitoring: Heap Census');
  const status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `the heap census completes for ${label}`,
    (candidate) =>
      candidate.monitoringCensusLiveHeapBytes !== null &&
      Number(candidate.monitoringCensusCount ?? 0) > censusCountBefore,
  );
  checkpoints.push({
    label,
    residentSetBytes: Number(status.monitoringCensusResidentSetAfterBytes ?? 0),
    heapUsedBytes: Number(status.monitoringHeapUsedBytes ?? 0),
    liveAfterCollectionBytes: Number(status.monitoringCensusLiveHeapBytes ?? 0),
    capacityBytes: Number(status.monitoringCensusCapacityBytes ?? 0),
    heldDocumentBytes: Number(status.monitoringRetainedDocumentBytes ?? 0),
    openDocumentCount: Number(status.monitoringOpenDocumentCount ?? 0),
    hydratedDocumentCount: Number(status.monitoringHydratedDocumentCount ?? 0),
  });
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
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the application boots',
    (status) => status.ready === true,
  );
  await checkpoint('boot');

  for (const fixtureName of fixtureNames) await openFixture(fixtureName);
  await checkpoint(`after opening ${fixtureNames.length} files`);

  const openTabCount = Number(
    HarnessSmoke.Class.readStatus(statusPath).bufferTabCount ?? 0,
  );
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
  await checkpoint('after closing every tab');
  await checkpoint('after a second collection');

  console.log('');
  console.log(
    'checkpoint'.padEnd(34) +
      '     rss  heap-used  live-gc  capacity  held-docs kB  open  live',
  );
  for (const entry of checkpoints) {
    console.log(
      entry.label.padEnd(34) +
        megabytes(entry.residentSetBytes) +
        megabytes(entry.heapUsedBytes) +
        megabytes(entry.liveAfterCollectionBytes) +
        megabytes(entry.capacityBytes) +
        kilobytes(entry.heldDocumentBytes) +
        String(entry.openDocumentCount).padStart(6) +
        String(entry.hydratedDocumentCount).padStart(6),
    );
  }
  console.log('');
  const first = checkpoints[0];
  const peak = checkpoints[1];
  const closed = checkpoints[checkpoints.length - 1];
  if (first && peak && closed) {
    console.log(
      `rss   boot ${megabytes(first.residentSetBytes).trim()} MB` +
        ` -> peak ${megabytes(peak.residentSetBytes).trim()} MB` +
        ` -> closed ${megabytes(closed.residentSetBytes).trim()} MB`,
    );
    console.log(
      `live  boot ${megabytes(first.liveAfterCollectionBytes).trim()} MB` +
        ` -> peak ${megabytes(peak.liveAfterCollectionBytes).trim()} MB` +
        ` -> closed ${megabytes(closed.liveAfterCollectionBytes).trim()} MB`,
    );
    console.log(
      `held  boot ${kilobytes(first.heldDocumentBytes).trim()} kB` +
        ` -> peak ${kilobytes(peak.heldDocumentBytes).trim()} kB` +
        ` -> closed ${kilobytes(closed.heldDocumentBytes).trim()} kB`,
    );
  }
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
