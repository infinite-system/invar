#!/usr/bin/env bun
// Probe: is the harness diagnostic log per-run, and does the reader reject foreign lines?
//
// WHAT IT FINDS OUT
// Two real Invar instances boot at the same time with TUI_DEBUG_BARS=1 and the same repository
// root. Both publish scrollbar geometry through the app logger. The probe then answers the two
// questions task 90 exists for:
//   1. ISOLATION — do the two concurrent instances write to two different files, and does the
//      shared repository-relative artifacts/tui.log stay untouched?
//   2. PROVENANCE — when a foreign line is planted inside an instance's OWN file, does the
//      reader seam reject it? An unstamped leftover line is planted too, because that is what
//      every line written before this task looks like.
//
// HOW TO RUN IT
//   bun .invar/tasks/in-progress/90-harness-diagnostic-provenance-guard/probe-90-diagnostic-log-provenance.ts
//
// HOW TO READ ITS OUTPUT
// Each check prints PASS or FAIL with the measured numbers, then a summary line. The exit code
// is 0 when every check passes and 1 otherwise. Two checks are POSITIVE CONTROLS: they assert
// that the planted lines really reached the file, so a probe that silently planted nothing
// cannot report a green guard.
//
// This probe fails if the guard is removed. Verified 2026-07-30 by deleting the identity filter
// in scripts/harness/DiagnosticLog.ts: the planted 999999 value came back as the answer.
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiagnosticLog } from '../../../../scripts/harness/DiagnosticLog';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const repositoryRoot = process.cwd();
const sharedLogPath = join(repositoryRoot, 'artifacts', 'tui.log');
const scrollbarIdentifier = 'editor-scrollbar-v';

let failureCount = 0;

function check(passed: boolean, description: string): void {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${description}`);
  if (!passed) failureCount += 1;
}

function sharedLogSize(): number {
  return existsSync(sharedLogPath) ? statSync(sharedLogPath).size : 0;
}

async function bootInstance(label: string): Promise<PtyTestDriver.Model> {
  const fixtureRoot = mkdtempSync(join(tmpdir(), `probe-90-${label}-`));
  const fixtureLines: string[] = [];
  for (let lineIndex = 0; lineIndex < 400; lineIndex += 1) {
    fixtureLines.push(`line ${lineIndex} of the ${label} probe fixture`);
  }
  await Bun.write(
    join(fixtureRoot, 'overflow.txt'),
    `${fixtureLines.join('\n')}\n`,
  );
  const homeDirectory = mkdtempSync(join(tmpdir(), `probe-90-${label}-home-`));
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    repositoryRoot,
    columns: 120,
    rows: 30,
    homeDirectory,
    environment: {
      TUI_DEBUG_BARS: '1',
      TUI_STATUS_PATH: join(homeDirectory, 'status.json'),
    },
  });
  await driver.awaitGridCondition(
    `the ${label} probe fixture renders its overflowing file`,
    (snapshot) => snapshot.findText('overflow.txt') !== null,
    30_000,
  );
  driver.sendKeys('Control+p');
  await driver.awaitGridCondition(
    `the ${label} probe opens Go to File`,
    (snapshot) => snapshot.findText('Go to File') !== null,
    15_000,
  );
  driver.sendText('overflow');
  await driver.awaitScreenChange();
  driver.sendKeys('Enter');
  await driver.awaitGridCondition(
    `the ${label} probe paints the overflowing document`,
    (snapshot) => snapshot.findText(`line 3 of the ${label}`) !== null,
    15_000,
  );
  return driver;
}

const sharedLogSizeBeforeBoot = sharedLogSize();

const [firstDriver, secondDriver] = await Promise.all([
  bootInstance('first'),
  bootInstance('second'),
]);

try {
  const firstPath = firstDriver.diagnosticLogPath;
  const secondPath = secondDriver.diagnosticLogPath;
  console.log(`  first  ${firstDriver.diagnosticLogInstance} -> ${firstPath}`);
  console.log(
    `  second ${secondDriver.diagnosticLogInstance} -> ${secondPath}`,
  );

  check(firstPath !== secondPath, 'two concurrent instances own two log paths');
  check(
    firstDriver.diagnosticLogInstance !== secondDriver.diagnosticLogInstance,
    'two concurrent instances publish two identities',
  );
  check(
    sharedLogSize() === sharedLogSizeBeforeBoot,
    `the shared ${sharedLogPath} gained no byte from either instance`,
  );

  const firstReading = DiagnosticLog.Class.read(firstDriver);
  const secondReading = DiagnosticLog.Class.read(secondDriver);
  check(
    firstReading.ownLines.length > 0,
    `the first instance publishes ${firstReading.ownLines.length} own line(s)`,
  );
  check(
    secondReading.ownLines.length > 0,
    `the second instance publishes ${secondReading.ownLines.length} own line(s)`,
  );
  check(
    firstReading.foreignLineCount === 0 && secondReading.foreignLineCount === 0,
    'neither isolated log holds a foreign line before the plant',
  );

  const ownGeometryBeforePlant = DiagnosticLog.Class.latestLineContaining(
    firstDriver,
    `bar ${scrollbarIdentifier}:`,
  );
  check(
    ownGeometryBeforePlant !== null,
    'the first instance publishes its own vertical scrollbar geometry',
  );

  // PLANT 1 — a concurrent instance's line, with an impossible value, appended AFTER the
  // instance's own newest line. A reader with no guard returns 999999.
  appendFileSync(
    firstPath,
    `${new Date().toISOString()} [info] [instance=${secondDriver.diagnosticLogInstance}] ` +
      `bar ${scrollbarIdentifier}: scrollSize=999999 viewportSize=999999 scrollPosition=999999\n`,
  );
  // PLANT 2 — an unstamped leftover, the shape of every line written before task 90.
  appendFileSync(
    firstPath,
    `${new Date().toISOString()} [info] bar ${scrollbarIdentifier}: ` +
      `scrollSize=888888 viewportSize=888888 scrollPosition=888888\n`,
  );

  const rawAfterPlant = readFileSync(firstPath, 'utf8');
  check(
    rawAfterPlant.includes('999999') && rawAfterPlant.includes('888888'),
    'positive control: both planted lines really are in the file',
  );

  const readingAfterPlant = DiagnosticLog.Class.read(firstDriver);
  check(
    readingAfterPlant.foreignLineCount === 2,
    `the guard counts both planted lines as foreign (${readingAfterPlant.foreignLineCount})`,
  );
  const ownGeometryAfterPlant = DiagnosticLog.Class.latestLineContaining(
    firstDriver,
    `bar ${scrollbarIdentifier}:`,
  );
  check(
    ownGeometryAfterPlant === ownGeometryBeforePlant,
    'the planted lines do not change the answer the reader gives',
  );
  check(
    !(ownGeometryAfterPlant ?? '').includes('999999') &&
      !(ownGeometryAfterPlant ?? '').includes('888888'),
    'no planted value reaches the reader',
  );
} finally {
  await firstDriver.dispose();
  await secondDriver.dispose();
}

console.log(
  failureCount === 0
    ? 'probe-90: all checks pass'
    : `probe-90: ${failureCount} check(s) failed`,
);
process.exit(failureCount === 0 ? 0 : 1);
