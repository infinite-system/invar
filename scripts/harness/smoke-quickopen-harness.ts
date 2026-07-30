#!/usr/bin/env bun
// Byte-level port of smoke-quickopen: Ctrl+P, fuzzy input, and activation all cross the real PTY.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Quick Open activates the selected entry (src/modules/search/search.invariants.md)
// invariant: File enumeration failures stay visible (src/modules/search/search.invariants.md)
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-quickopen-harness-'));

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-quickopen-harness-home-'),
);

const statusPath = join(homeDirectory, 'status.json');

const degradedFixtureRoot = mkdtempSync(
  join(tmpdir(), 'tui-quickopen-degraded-harness-'),
);

const degradedHomeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-quickopen-degraded-harness-home-'),
);

const degradedStatusPath = join(degradedHomeDirectory, 'status.json');

HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);
HarnessSmoke.Class.runGit(degradedFixtureRoot, ['init', '-q']);

for (const fileName of [
  'alpha.txt',
  'beta.txt',
  'gamma.txt',
  'TASK.md',
  'project.tasks.md',
]) {
  await Bun.write(join(fixtureRoot, fileName), 'x\n');
}

mkdirSync(join(fixtureRoot, 'src'));

await Bun.write(join(fixtureRoot, 'src', 'widget.txt'), 'content\n');

const longPathResultCount = 24;
const targetLongPathResultCount = 5;
const longPathFileNames = Array.from(
  { length: longPathResultCount },
  (_unused, resultIndex) => {
    const resultGroup =
      resultIndex < targetLongPathResultCount ? 'target' : 'other';
    return (
      `scroll-${resultGroup}-${String(resultIndex).padStart(2, '0')}-` +
      'quick-open-result-with-a-name-longer-than-the-compact-dialog-width.txt'
    );
  },
);
for (const longPathFileName of longPathFileNames) {
  await Bun.write(join(fixtureRoot, longPathFileName), 'long path\n');
}

mkdirSync(join(degradedFixtureRoot, 'ignored'));

await Bun.write(
  join(degradedFixtureRoot, '.git', 'info', 'exclude'),
  'ignored/\n',
);

await Bun.write(join(degradedFixtureRoot, 'ignored', 'hidden.txt'), 'hidden\n');

function pathWithoutRipgrep(): string {
  return (process.env.PATH ?? '')
    .split(delimiter)
    .filter(
      (pathEntry) => pathEntry.length > 0 && !existsSync(join(pathEntry, 'rg')),
    )
    .join(delimiter);
}

function quickOpenDialogBounds(
  status: StatusSnapshot,
): { left: number; top: number; width: number; height: number } | null {
  const dialogBounds = status.overlayDialogBounds as
    | Record<
        string,
        { left: number; top: number; width: number; height: number } | null
      >
    | undefined;
  return dialogBounds?.quickOpen ?? null;
}

function quickOpenScrollPosition(status: StatusSnapshot): number {
  const scrollPositions = status.overlayScrollPositions as
    Record<string, number> | undefined;
  return Number(scrollPositions?.quickOpen ?? 0);
}

function quickOpenViewportExtent(
  status: StatusSnapshot,
): { contentRows: number; viewportRows: number } | null {
  const viewportExtents = status.overlayViewportExtents as
    Record<string, { contentRows: number; viewportRows: number }> | undefined;
  return viewportExtents?.quickOpen ?? null;
}

function quickOpenInputIsVisible(
  snapshot: HarnessSnapshot.Model,
  status: StatusSnapshot,
  expectedQuery: string,
): boolean {
  const dialogBounds = quickOpenDialogBounds(status);
  if (!dialogBounds) return false;
  const inputRow = snapshot
    .rowText(dialogBounds.top + 1)
    .slice(dialogBounds.left + 1, dialogBounds.left + dialogBounds.width - 1);
  return inputRow.includes(`↗ ${expectedQuery}`);
}

async function requireQuickOpenInputVisible(
  driver: PtyTestDriver.Model,
  status: StatusSnapshot,
  expectedQuery: string,
  description: string,
): Promise<void> {
  await driver.awaitGridCondition(description, (snapshot) =>
    quickOpenInputIsVisible(snapshot, status, expectedQuery),
  );
}

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 60,
  rows: 15,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness quick-open: Ctrl+P opens the modal ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the compact file tree is ready before Quick Open starts',
    (status) => status.ready === true && Number(status.treeRows) > 0,
    15_000,
  );
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Go to File') !== null,
  );
  HarnessSmoke.Class.pass('Ctrl+P opened the Go-to-File modal');

  console.log('== harness quick-open: fuzzy query opens the ranked file ==');
  driver.sendText('widget');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('src/widget.txt') !== null,
  );
  driver.sendKeys('Enter');
  const openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.activeBuffer).endsWith('/src/widget.txt')",
    (status) => String(status.activeBuffer).endsWith('/src/widget.txt'),
  );
  HarnessSmoke.Class.pass(
    `Enter opened the fuzzy-matched file (${String(openedStatus.activeBuffer).split('/').at(-1)})`,
  );
  const openedSnapshot = await driver.awaitGridCondition(
    'the opened widget file content is visible in the emulator grid',
    (candidate) => candidate.findText('content') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    openedSnapshot.findText('content') !== null,
    'the opened file content is visible in the emulator grid',
  );

  console.log(
    '== harness quick-open: activation preserves selected identity ==',
  );
  driver.sendKeys('Control+p');
  await driver.awaitGridCondition(
    'Go to File to reopen for the confusable identity pair',
    (snapshot) => snapshot.findText('Go to File') !== null,
  );
  driver.sendText('TASK.md');
  const selectedPublication = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Quick Open to publish TASK.md selected beside project.tasks.md',
    (status) =>
      status.quickOpenOpen === true &&
      status.quickOpenQuery === 'TASK.md' &&
      status.quickOpenSelectedIdentifier === 'TASK.md',
  );
  await driver.awaitGridCondition(
    'the confusable project.tasks.md result to be visible beside TASK.md',
    (snapshot) =>
      snapshot.findText('TASK.md') !== null &&
      snapshot.findText('project.tasks.md') !== null,
  );
  const publishedSelectedIdentifier =
    selectedPublication.quickOpenSelectedIdentifier;
  HarnessSmoke.Class.requireCondition(
    typeof publishedSelectedIdentifier === 'string',
    'Quick Open published a selected path identity',
  );
  driver.sendKeys('Enter');
  const identityOpenedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the opened buffer to be the exact entry Quick Open published as selected',
    (status) =>
      status.activeBuffer ===
      join(fixtureRoot, String(publishedSelectedIdentifier)),
  );
  HarnessSmoke.Class.pass(
    'Enter opened the exact Quick Open entry published as selected ' +
      `(${String(identityOpenedStatus.activeBuffer)})`,
  );

  console.log(
    '== harness quick-open: long results preserve the input through every list window ==',
  );
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Quick Open enumerates the long-path fixture before the scroll drive',
    (status) =>
      status.quickOpenOpen === true &&
      status.quickOpenQuery === '' &&
      status.quickOpenFileEnumerationState === 'complete' &&
      Number(status.quickOpenMatches) >= longPathFileNames.length,
  );
  driver.sendText('scroll');
  let longPathStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the broad long-path query publishes every fixture result',
    (status) =>
      status.quickOpenQuery === 'scroll' &&
      status.quickOpenMatches === longPathFileNames.length &&
      status.quickOpenSelected === 0,
  );
  await requireQuickOpenInputVisible(
    driver,
    longPathStatus,
    'scroll',
    'the broad query remains painted on the fixed input row',
  );

  const observedDownwardScrollPositions = new Set<number>([
    quickOpenScrollPosition(longPathStatus),
  ]);
  for (
    let selectedIndex = 1;
    selectedIndex < longPathFileNames.length;
    selectedIndex++
  ) {
    driver.sendKeys('Down');
    longPathStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `Quick Open selects long-path result ${selectedIndex} while moving down`,
      (status) =>
        status.quickOpenQuery === 'scroll' &&
        status.quickOpenSelected === selectedIndex,
    );
    observedDownwardScrollPositions.add(
      quickOpenScrollPosition(longPathStatus),
    );
    await requireQuickOpenInputVisible(
      driver,
      longPathStatus,
      'scroll',
      `the input row remains visible at downward selection ${selectedIndex}`,
    );
  }

  const broadViewportExtent = quickOpenViewportExtent(longPathStatus);
  HarnessSmoke.Class.requireCondition(
    broadViewportExtent !== null,
    'Quick Open publishes its long-path viewport extent',
  );
  const maximumBroadScrollPosition = Math.max(
    0,
    (broadViewportExtent?.contentRows ?? 0) -
      (broadViewportExtent?.viewportRows ?? 0),
  );
  for (
    let scrollPosition = 0;
    scrollPosition <= maximumBroadScrollPosition;
    scrollPosition++
  ) {
    HarnessSmoke.Class.requireCondition(
      observedDownwardScrollPositions.has(scrollPosition),
      `downward selection exposed scroll position ${scrollPosition}`,
    );
  }

  driver.sendText('target');
  longPathStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the narrow query shrinks the result set and reconciles its old bottom offset',
    (status) =>
      status.quickOpenQuery === 'scrolltarget' &&
      status.quickOpenMatches === targetLongPathResultCount &&
      quickOpenScrollPosition(status) === 0,
  );
  await requireQuickOpenInputVisible(
    driver,
    longPathStatus,
    'scrolltarget',
    'the input row remains visible after the result set shrinks',
  );

  for (
    let removedCharacterCount = 1;
    removedCharacterCount <= 'target'.length;
    removedCharacterCount++
  ) {
    driver.sendKeys('Backspace');
    const expectedQuery = `scroll${'target'.slice(
      0,
      'target'.length - removedCharacterCount,
    )}`;
    longPathStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `Quick Open publishes the growing transition query ${expectedQuery}`,
      (status) => status.quickOpenQuery === expectedQuery,
    );
    await requireQuickOpenInputVisible(
      driver,
      longPathStatus,
      expectedQuery,
      `the input row remains visible during growth transition ${expectedQuery}`,
    );
  }
  HarnessSmoke.Class.requireCondition(
    longPathStatus.quickOpenMatches === longPathFileNames.length,
    'removing the narrow suffix restores the full long-path result set',
  );

  const observedUpwardScrollPositions = new Set<number>();
  for (
    let selectedIndex = 1;
    selectedIndex < longPathFileNames.length;
    selectedIndex++
  ) {
    driver.sendKeys('Down');
    longPathStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `Quick Open returns to long-path result ${selectedIndex}`,
      (status) => status.quickOpenSelected === selectedIndex,
    );
  }
  observedUpwardScrollPositions.add(quickOpenScrollPosition(longPathStatus));
  for (
    let selectedIndex = longPathFileNames.length - 2;
    selectedIndex >= 0;
    selectedIndex--
  ) {
    driver.sendKeys('Up');
    longPathStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `Quick Open selects long-path result ${selectedIndex} while moving up`,
      (status) => status.quickOpenSelected === selectedIndex,
    );
    observedUpwardScrollPositions.add(quickOpenScrollPosition(longPathStatus));
    await requireQuickOpenInputVisible(
      driver,
      longPathStatus,
      'scroll',
      `the input row remains visible at upward selection ${selectedIndex}`,
    );
  }
  for (
    let scrollPosition = 0;
    scrollPosition <= maximumBroadScrollPosition;
    scrollPosition++
  ) {
    HarnessSmoke.Class.requireCondition(
      observedUpwardScrollPositions.has(scrollPosition),
      `upward selection exposed scroll position ${scrollPosition}`,
    );
  }
  HarnessSmoke.Class.pass(
    'the input row survived every downward and upward scroll position plus shrink and growth',
  );

  driver.sendKeys('Control+q');

  console.log(
    '== harness quick-open: an empty Git fallback stays visibly degraded ==',
  );
  const degradedDriver = new PtyTestDriver.Class({
    workspaceRoot: degradedFixtureRoot,
    columns: 120,
    rows: 40,
    homeDirectory: degradedHomeDirectory,
    environment: {
      PATH: pathWithoutRipgrep(),
      TUI_STATUS_PATH: degradedStatusPath,
    },
  });
  try {
    await degradedDriver.awaitGridCondition(
      'the degraded fixture workspace to publish ready state',
      () => {
        try {
          return (
            HarnessSmoke.Class.readStatus(degradedStatusPath).ready === true
          );
        } catch {
          return false;
        }
      },
      15_000,
    );
    degradedDriver.sendKeys('Control+p');
    await degradedDriver.awaitGridCondition(
      'Quick Open to publish and paint the degraded empty Git fallback',
      (snapshot) => {
        try {
          const status = HarnessSmoke.Class.readStatus(degradedStatusPath);
          return (
            status.quickOpenOpen === true &&
            status.quickOpenFileEnumerationState === 'degraded' &&
            status.quickOpenFileEnumerationMessage ===
              'enumeration degraded — install ripgrep or open a git-tracked folder' &&
            snapshot.findText('enumeration degraded') !== null &&
            snapshot.findText(
              'install ripgrep or open a git-tracked folder',
            ) !== null
          );
        } catch {
          return false;
        }
      },
    );
    degradedDriver.sendText('hidden.txt');
    const degradedSnapshot = await degradedDriver.awaitGridCondition(
      'the degraded message to remain visible after a query with no enumerated match',
      (snapshot) => {
        try {
          const status = HarnessSmoke.Class.readStatus(degradedStatusPath);
          return (
            status.quickOpenQuery === 'hidden.txt' &&
            status.quickOpenMatches === 0 &&
            snapshot.findText('enumeration degraded') !== null
          );
        } catch {
          return false;
        }
      },
    );
    HarnessSmoke.Class.requireCondition(
      degradedSnapshot.findText('(no matching files)') === null,
      'the degraded result does not masquerade as an ordinary empty match',
    );
    HarnessSmoke.Class.pass(
      'the missing-ripgrep and empty-Git path stayed visibly degraded',
    );
    degradedDriver.sendKeys('Control+q');
  } finally {
    await degradedDriver.dispose();
  }

  console.log('smoke-quickopen-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  await HarnessSmoke.Class.removeTemporaryDirectory(degradedFixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(degradedHomeDirectory);
}
