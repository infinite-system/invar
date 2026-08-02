#!/usr/bin/env bun
// Byte-level workspace-tabs port: roots are added and switched through the painted strip and settings.
// Each root proves its own retained panel world, LSP process, diagnostics, structure, and type hover.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Workspace activation is view-only (src/modules/workspace/workspace.invariants.md)
// invariant: Cost tracks the actively observed set (project.invariants.md)
import { mkdirSync, mkdtempSync, readlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
  awaitStatus,
  clickMarker,
  markerForeground,
  pass,
  requireCondition,
  runGit,
} from './HarnessSmokeSupport';
import { ThemePalettes } from '../../src/modules/theme/ThemePalettes';
import { PtyTestDriver } from './PtyTestDriver';
import { HarnessSmoke } from './HarnessSmoke';

// Both roots live INSIDE THEIR OWN PARENT, never directly in the system temp
// directory, and that is load-bearing rather than tidiness. The project picker
// prefills the parent of the current root and fuzzy-scores that parent's entries, so
// rooting the fixture at tmpdir() made this smoke's cost depend on how many entries
// the whole machine happened to have in /tmp: it was ~1-in-3 flaky in the morning and
// ~2-in-3 by evening purely because a day of worktrees, gate logs, and failure
// directories grew /tmp to 3,752 entries, while retry-once-on-timeout kept rescuing it
// so the gate still reported green. A dedicated parent means the scan sees exactly
// these two directories on any machine.
//
// The names also carry meaning: `tiny` and `wide` are the two activation fixtures the
// GitWatcher subprocess-count assertions compare, and both are long enough for the
// later tab-name assertions (one requires an ellipsis cap, another slices 17 chars).
const fixtureParent = mkdtempSync(
  join(tmpdir(), 'tui-workspace-tabs-harness-'),
);

const firstRoot = join(fixtureParent, 'tiny-workspace-project');

const secondRoot = join(fixtureParent, 'wide-workspace-project');

mkdirSync(firstRoot);

mkdirSync(secondRoot);

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-workspace-tabs-harness-home-'),
);

const statusPath = join(homeDirectory, 'status.json');

const firstName = basename(firstRoot);

const secondName = basename(secondRoot);

const firstTaskIdentifier = `task:${encodeURIComponent(firstRoot)}:0`;

const secondTaskIdentifier = `task:${encodeURIComponent(secondRoot)}:0`;

const firstTerminalMarker = 'WORLD_A_296';

const secondTerminalMarker = 'WORLD_B_296';

const tinyTrackedDirectoryCount = 3;

const wideTrackedDirectoryCount = 520;

const ignoredPackageCount = 600;

async function selectVisibleSetting(label: string): Promise<void> {
  const settingsSnapshot = await driver.awaitGridCondition(
    `${label} is visible in the settings panel`,
    (candidate) => candidate.findText(label) !== null,
  );
  clickMarker(driver, settingsSnapshot, label);
  await driver.awaitGridCondition(
    `${label} is the visibly selected settings row`,
    (candidate) => candidate.findText(`› ${label}`) !== null,
  );
}

async function languageServerProcesses(
  status: Record<string, unknown>,
): Promise<Array<{ pid: number; command: string; cwd: string }>> {
  const subprocessPids = Array.isArray(status.subprocessPids)
    ? status.subprocessPids
    : [];
  const processes: Array<{ pid: number; command: string; cwd: string }> = [];
  for (const publishedPid of subprocessPids) {
    const pid = Number(publishedPid);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    try {
      const command = (await Bun.file(`/proc/${pid}/cmdline`).text())
        .replaceAll('\0', ' ')
        .trim();
      if (
        !command.includes('tsgo') &&
        !command.includes('typescript-language-server')
      ) {
        continue;
      }
      processes.push({
        pid,
        command,
        cwd: readlinkSync(`/proc/${pid}/cwd`),
      });
    } catch {
      // A process that exits during inspection cannot satisfy the feature waits below.
    }
  }
  return processes;
}

async function openLanguageFixture(
  root: string,
  fileName: string,
  valueName: string,
  shapeName: string,
): Promise<void> {
  driver.sendKeys('Control+p');
  await awaitStatus(
    driver,
    statusPath,
    `Go to File opens before ${fileName}`,
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText(fileName);
  await awaitStatus(
    driver,
    statusPath,
    `Go to File finds ${fileName}`,
    (status) =>
      status.quickOpenQuery === fileName && Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  const readyStatus = await awaitStatus(
    driver,
    statusPath,
    `${fileName} gains language diagnostics and structure`,
    (status) =>
      status.activeWorkspaceRoot === root &&
      String(status.activeBuffer).endsWith(`/${fileName}`) &&
      typeof status.lspProvider === 'string' &&
      Number(status.diagnosticsCount) > 0 &&
      status.structureStatus === 'ready' &&
      Number(status.structureRows) > 0,
  );
  const structureRectangle = HarnessSmoke.Class.layoutSlotRectangle(
    readyStatus,
    'rightDock',
  );
  if (!structureRectangle) {
    throw new Error('Structure dock geometry disappeared');
  }
  let snapshot = await driver.awaitGridCondition(
    `${fileName} paints its editor text and structure row`,
    (candidate) =>
      candidate.findEditorText(`${valueName};`) !== null &&
      candidate.findTextInRectangle('Structure', structureRectangle) !== null,
  );
  const target = snapshot.findEditorText(`${valueName};`);
  requireCondition(target !== null, `${fileName} hover target is visible`);
  if (!target) throw new Error(`${fileName} hover target disappeared`);
  driver.sendMouse({
    kind: 'move',
    column: target.column + 2,
    row: target.row,
    button: 'none',
  });
  await driver.awaitScreenChange();
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate
        .textRows()
        .some(
          (rowText) =>
            rowText.includes(`const ${valueName}:`) &&
            rowText.includes(shapeName) &&
            !rowText.includes('export'),
        ),
    30_000,
  );
  requireCondition(
    snapshot
      .textRows()
      .some(
        (rowText) =>
          rowText.includes(`const ${valueName}:`) &&
          rowText.includes(shapeName) &&
          !rowText.includes('export'),
      ),
    `${fileName} paints the language-server type hover`,
  );
  const languageProcesses = await languageServerProcesses(readyStatus);
  requireCondition(
    languageProcesses.length === 1 && languageProcesses[0]?.cwd === root,
    `${fileName} has one language server rooted at its active workspace`,
  );
  pass(
    `${fileName}: diagnostics=${readyStatus.diagnosticsCount}, structureRows=${readyStatus.structureRows}, cwd=${languageProcesses[0]?.cwd}`,
  );
  driver.sendKeys('Escape');
  await driver.awaitScreenChange();
}

mkdirSync(join(firstRoot, 'tracked'), { recursive: true });

for (
  let directoryIndex = 0;
  directoryIndex < tinyTrackedDirectoryCount;
  directoryIndex += 1
) {
  mkdirSync(join(firstRoot, 'tracked', `directory-${directoryIndex}`));
}

await Bun.write(join(firstRoot, 'FIRST_TREE_ONLY.txt'), 'first tree\n');

await Bun.write(join(firstRoot, 'first-root-change.txt'), 'first committed\n');

await Bun.write(
  join(firstRoot, 'first-types.ts'),
  'export interface FirstShape { label: string }\n',
);

await Bun.write(
  join(firstRoot, 'first-language.ts'),
  [
    "import type { FirstShape } from './first-types';",
    "export const firstValue: FirstShape = { label: 'first' };",
    'const firstDiagnostic: string = 1;',
    'firstValue;',
    '',
  ].join('\n'),
);

await Bun.write(
  join(firstRoot, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
    },
    include: ['*.ts'],
  }),
);

runGit(firstRoot, ['init', '-q']);

runGit(firstRoot, ['config', 'user.email', 'first@example.invalid']);

runGit(firstRoot, ['config', 'user.name', 'First']);

runGit(firstRoot, ['add', '.']);

runGit(firstRoot, ['commit', '-qm', 'first']);

await Bun.write(
  join(firstRoot, 'first-root-change.txt'),
  'first committed\nfirst modified\n',
);

mkdirSync(join(secondRoot, 'tracked'), { recursive: true });

for (
  let directoryIndex = 0;
  directoryIndex < wideTrackedDirectoryCount;
  directoryIndex += 1
) {
  mkdirSync(join(secondRoot, 'tracked', `directory-${directoryIndex}`));
}

for (
  let packageIndex = 0;
  packageIndex < ignoredPackageCount;
  packageIndex += 1
) {
  mkdirSync(
    join(secondRoot, 'ignored-cache', `package-${packageIndex}`, 'lib'),
    { recursive: true },
  );
}

await Bun.write(join(secondRoot, '.gitignore'), 'ignored-cache/\n');

await Bun.write(join(secondRoot, 'SECOND_TREE_ONLY.txt'), 'second tree\n');

await Bun.write(
  join(secondRoot, 'second-types.ts'),
  'export interface SecondShape { label: string }\n',
);

await Bun.write(
  join(secondRoot, 'second-language.ts'),
  [
    "import type { SecondShape } from './second-types';",
    "export const secondValue: SecondShape = { label: 'second' };",
    'const secondDiagnostic: string = 1;',
    'secondValue;',
    '',
  ].join('\n'),
);

await Bun.write(
  join(secondRoot, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
    },
    include: ['*.ts'],
  }),
);

await Bun.write(
  join(secondRoot, 'second-root-change.txt'),
  'second committed\n',
);

runGit(secondRoot, ['init', '-q']);

runGit(secondRoot, ['config', 'user.email', 'second@example.invalid']);

runGit(secondRoot, ['config', 'user.name', 'Second']);

runGit(secondRoot, ['add', '.']);

runGit(secondRoot, ['commit', '-qm', 'second']);

await Bun.write(
  join(secondRoot, 'second-root-change.txt'),
  'second committed\nsecond modified\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: firstRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_TEST_SUPPRESS_BUILT_IN_TASK: '0',
    INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS: '0',
  },
});

try {
  console.log(
    '== harness workspace tabs: add a second root through the plus picker ==',
  );
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText(firstName.slice(0, 17)) !== null,
    15_000,
  );
  await awaitStatus(
    driver,
    statusPath,
    'one workspace is present after boot',
    (status) => status.ready === true && status.workspaceCount === 1,
  );
  pass('booted one workspace');
  driver.sendKeys('Control+j');
  const firstPanelWorldStatus = await awaitStatus(
    driver,
    statusPath,
    'the first workspace owns its interactive terminal',
    (status) =>
      status.panelActiveContentKind === 'terminal' &&
      Array.isArray(status.panelContentKinds) &&
      status.panelContentKinds.includes(firstTaskIdentifier) &&
      status.panelContentKinds.includes('terminal'),
  );
  const firstTerminalIdentifier = String(
    firstPanelWorldStatus.panelActiveContent,
  );
  driver.sendText(`printf '${firstTerminalMarker}\\n'`);
  driver.sendKeys('Enter');
  await driver.awaitGridCondition(
    'the first workspace terminal paints its retained marker',
    (candidate) => candidate.findText(firstTerminalMarker) !== null,
  );
  pass('the first workspace terminal owns live scrollback');
  const tinyActivationStatus = await awaitStatus(
    driver,
    statusPath,
    'the tiny workspace watcher activation completes',
    (status) =>
      status.gitWatcherActivationCompleted === true &&
      Number(status.gitWatcherActivationIgnoreQuerySubprocessCount) > 0,
  );
  const tinyIgnoreQuerySubprocessCount = Number(
    tinyActivationStatus.gitWatcherActivationIgnoreQuerySubprocessCount,
  );
  requireCondition(
    tinyIgnoreQuerySubprocessCount > 0,
    'the tiny activation liveness counter moves when its walk runs',
  );
  requireCondition(
    Number(tinyActivationStatus.gitWatcherActivationWatchedDirectoryCount) ===
      tinyTrackedDirectoryCount + 2,
    'the tiny activation reports every retained directory watch',
  );
  const plusColumn = Array.from(snapshot.rowText(0)).lastIndexOf('+');
  requireCondition(
    plusColumn >= 0,
    'workspace plus button paints on the top strip',
  );
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
    (candidate) => candidate.findText(`+ ${dirname(firstRoot)}`) !== null,
  );
  pass('project picker prefills the current root parent');
  driver.sendText(secondName);
  await driver.awaitGridCondition(
    'the project picker paints the complete typed path on its input row',
    (candidate) => {
      const pathPosition = candidate.findText(`+ ${secondRoot}`);
      if (!pathPosition) return false;
      // The shared field painter puts the caret in the cell AFTER the typed path by inverting it,
      // so the caret is read as the field foreground turned into a background, not as a glyph.
      const caretColumn = pathPosition.column + `+ ${secondRoot}`.length;
      return (
        candidate.cell(pathPosition.row, caretColumn)?.background ===
        Number.parseInt(ThemePalettes.Class.DARK.fg.slice(1), 16)
      );
    },
  );
  pass('project picker paints the complete typed path');
  await driver.awaitSnapshot((candidate) =>
    candidate
      .textRows()
      .slice(4)
      .some((rowText) => rowText.includes(secondRoot)),
  );
  pass('fuzzy match list paints the sibling absolute path');
  driver.sendKeys('Enter');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('SECOND_TREE_ONLY.txt') !== null,
    15_000,
  );
  await awaitStatus(
    driver,
    statusPath,
    'the second workspace is added and active',
    (status) =>
      status.workspaceCount === 2 && status.activeWorkspaceRoot === secondRoot,
  );
  pass('second workspace was added');
  pass('new workspace is active');
  const wideActivationStatus = await awaitStatus(
    driver,
    statusPath,
    'the wide workspace watcher activation completes',
    (status) =>
      status.activeWorkspaceRoot === secondRoot &&
      status.gitWatcherActivationCompleted === true,
  );
  requireCondition(
    Number(
      wideActivationStatus.gitWatcherActivationIgnoreQuerySubprocessCount,
    ) === tinyIgnoreQuerySubprocessCount,
    'tiny and 500-directory activations launch equal ignore-query subprocess counts',
  );
  requireCondition(
    Number(wideActivationStatus.gitWatcherActivationWatchedDirectoryCount) ===
      wideTrackedDirectoryCount + 2,
    'the wide activation watches tracked directories and prunes the ignored subtree',
  );
  pass(
    `activation counters: tiny queries=${tinyIgnoreQuerySubprocessCount}, watched=${
      tinyActivationStatus.gitWatcherActivationWatchedDirectoryCount
    }; wide queries=${
      wideActivationStatus.gitWatcherActivationIgnoreQuerySubprocessCount
    }, watched=${wideActivationStatus.gitWatcherActivationWatchedDirectoryCount}`,
  );
  requireCondition(
    snapshot.findText('…') !== null,
    'long project name is capped with an ellipsis',
  );

  const secondNamePosition = snapshot.findText(secondName.slice(0, 17));
  requireCondition(secondNamePosition !== null, 'second workspace name paints');
  snapshot = await driver.awaitGridCondition(
    'the active workspace detail and readable name foregrounds match',
    (candidate) => {
      const candidateNamePosition = candidate.findText(secondName.slice(0, 17));
      if (!candidateNamePosition) return false;
      const candidateNameForeground = markerForeground(
        candidate,
        secondName.slice(0, 17),
      );
      const candidateBranchCell = candidate
        .rowCells(candidateNamePosition.row + 1)
        .find(
          (cell, column) =>
            column >= candidateNamePosition.column && cell.characters !== ' ',
        );
      return candidateBranchCell?.foreground === candidateNameForeground;
    },
  );
  const settledSecondNameForeground = markerForeground(
    snapshot,
    secondName.slice(0, 17),
  );
  const settledSecondNamePosition = snapshot.findText(secondName.slice(0, 17));
  if (!settledSecondNamePosition)
    throw new Error('Second workspace name disappeared');
  const branchRow = settledSecondNamePosition.row + 1;
  const branchCell = snapshot
    .rowCells(branchRow)
    .find(
      (cell, column) =>
        column >= settledSecondNamePosition.column && cell.characters !== ' ',
    );
  requireCondition(
    branchCell?.foreground === settledSecondNameForeground,
    'active workspace detail foreground matches the readable name foreground',
  );

  console.log(
    '== harness workspace tabs: panel worlds isolate and restore live sessions ==',
  );
  const secondPanelWorldInitialStatus = await awaitStatus(
    driver,
    statusPath,
    'the second workspace projects only its declared task pane',
    (status) =>
      status.activeWorkspaceRoot === secondRoot &&
      Array.isArray(status.panelContentKinds) &&
      status.panelContentKinds.includes(secondTaskIdentifier) &&
      status.panelContentKinds.includes('database') &&
      Array.isArray(status.panelContentIds) &&
      !status.panelContentIds.includes(firstTaskIdentifier),
  );
  requireCondition(
    !String(driver.snapshot().textRows().join('\n')).includes(
      firstTerminalMarker,
    ),
    'the second workspace does not paint the first terminal scrollback',
  );
  driver.sendKeys('Control+j');
  const secondTerminalStatus = await awaitStatus(
    driver,
    statusPath,
    'a new terminal belongs only to the second workspace',
    (status) =>
      status.panelActiveContentKind === 'terminal' &&
      Array.isArray(status.panelContentKinds) &&
      status.panelContentKinds.includes(secondTaskIdentifier) &&
      status.panelContentKinds.includes('terminal') &&
      Array.isArray(status.panelContentLabels) &&
      status.panelContentLabels.includes('Terminal'),
  );
  const secondTerminalIdentifier = String(
    secondTerminalStatus.panelActiveContent,
  );
  driver.sendText(`printf '${secondTerminalMarker}\\n'`);
  driver.sendKeys('Enter');
  await driver.awaitGridCondition(
    'the second workspace terminal paints its own retained marker',
    (candidate) => candidate.findText(secondTerminalMarker) !== null,
  );
  driver.sendKeys('Control+Shift+a');
  const secondPanelWorldStatus = await awaitStatus(
    driver,
    statusPath,
    'a new agent belongs only to the second workspace',
    (status) =>
      status.panelActiveContentKind === 'agent' &&
      Array.isArray(status.panelContentKinds) &&
      status.panelContentKinds.includes('agent'),
  );
  const secondAgentIdentifier = String(
    secondPanelWorldStatus.panelActiveContent,
  );
  snapshot = driver.snapshot();
  clickMarker(driver, snapshot, firstName.slice(0, 17));
  const restoredFirstPanelWorldStatus = await awaitStatus(
    driver,
    statusPath,
    'switching back restores the first workspace panel world',
    (status) =>
      status.activeWorkspaceRoot === firstRoot &&
      JSON.stringify(status.panelContentIds) ===
        JSON.stringify(firstPanelWorldStatus.panelContentIds) &&
      JSON.stringify(status.panelContentKinds) ===
        JSON.stringify(firstPanelWorldStatus.panelContentKinds) &&
      JSON.stringify(status.panelCellIds) ===
        JSON.stringify(firstPanelWorldStatus.panelCellIds),
  );
  requireCondition(
    Array.isArray(restoredFirstPanelWorldStatus.panelContentIds) &&
      !restoredFirstPanelWorldStatus.panelContentIds.includes(
        secondTaskIdentifier,
      ) &&
      !restoredFirstPanelWorldStatus.panelContentIds.includes(
        secondTerminalIdentifier,
      ) &&
      !restoredFirstPanelWorldStatus.panelContentIds.includes(
        secondAgentIdentifier,
      ),
    'the first workspace excludes every second-workspace pane identifier',
  );
  await driver.awaitGridCondition(
    'the first terminal scrollback returns after a workspace round trip',
    (candidate) =>
      candidate.findText(firstTerminalMarker) !== null &&
      candidate.findText(secondTerminalMarker) === null,
  );
  snapshot = driver.snapshot();
  clickMarker(driver, snapshot, secondName.slice(0, 17));
  const restoredSecondPanelWorldStatus = await awaitStatus(
    driver,
    statusPath,
    'switching again restores the exact second workspace panel world',
    (status) =>
      status.activeWorkspaceRoot === secondRoot &&
      JSON.stringify(status.panelContentIds) ===
        JSON.stringify(secondPanelWorldStatus.panelContentIds) &&
      JSON.stringify(status.panelContentKinds) ===
        JSON.stringify(secondPanelWorldStatus.panelContentKinds) &&
      JSON.stringify(status.panelCellIds) ===
        JSON.stringify(secondPanelWorldStatus.panelCellIds),
  );
  requireCondition(
    Array.isArray(restoredSecondPanelWorldStatus.panelContentIds) &&
      !restoredSecondPanelWorldStatus.panelContentIds.includes(
        firstTaskIdentifier,
      ),
    'the second workspace excludes every first-workspace task identifier',
  );
  requireCondition(
    Array.isArray(secondPanelWorldInitialStatus.panelContentIds) &&
      !secondPanelWorldInitialStatus.panelContentIds.includes(
        firstTerminalIdentifier,
      ) &&
      !secondPanelWorldInitialStatus.panelContentIds.includes(
        secondTerminalIdentifier,
      ) &&
      !secondPanelWorldInitialStatus.panelContentIds.includes(
        secondAgentIdentifier,
      ),
    'new terminal and agent instances were absent before their second-workspace gestures',
  );
  driver.sendKeys('Control+j');
  await awaitStatus(
    driver,
    statusPath,
    'the second workspace selects its retained terminal group',
    (status) =>
      status.activeWorkspaceRoot === secondRoot &&
      Array.isArray(status.panelCellIds) &&
      status.panelCellIds.includes(secondTerminalIdentifier),
  );
  await driver.awaitGridCondition(
    'the second terminal scrollback returns after a workspace round trip',
    (candidate) =>
      candidate.findText(secondTerminalMarker) !== null &&
      candidate.findText(firstTerminalMarker) === null,
  );
  pass('workspace panel worlds isolate both polarities');
  pass('workspace round trips preserve terminal processes and scrollback');
  pass(
    'workspace-local terminal and agent creation stays in the selected world',
  );
  const idleSessionsStatus = await awaitStatus(
    driver,
    statusPath,
    'the retained workspace sessions settle in the selected panel world',
    (status) =>
      status.workspaceCount === 2 &&
      status.panelVisible === true &&
      status.agentBusy === false,
  );
  requireCondition(
    idleSessionsStatus.animationFrameCadenceTimerCount === 0,
    'two idle workspaces own no animation cadence timer',
  );
  requireCondition(
    idleSessionsStatus.agentBusy === false,
    'the retained agent session is idle',
  );
  requireCondition(
    idleSessionsStatus.tasksAnimationAtRest === true,
    'the tasks dashboard owns no motion timer',
  );
  requireCondition(
    idleSessionsStatus.panelScrollMomentumAtRest === true,
    'the selected panel world owns no scroll motion',
  );
  requireCondition(
    idleSessionsStatus.workspaceScrollMomentumAtRest === true,
    'the active workspace owns no scroll motion',
  );
  requireCondition(
    idleSessionsStatus.liveGitWatcherCount === 1,
    'two open workspaces retain one live Git watcher',
  );
  pass('two idle workspaces own zero animation cadence timers');
  driver.sendKeys('Control+j');
  await awaitStatus(
    driver,
    statusPath,
    'the retained terminal closes before editor language gestures',
    (status) => status.panelVisible === false,
  );

  console.log(
    '== harness workspace tabs: language features follow each workspace root ==',
  );
  await openLanguageFixture(
    secondRoot,
    'second-language.ts',
    'secondValue',
    'SecondShape',
  );
  snapshot = driver.snapshot();
  clickMarker(driver, snapshot, firstName.slice(0, 17));
  await awaitStatus(
    driver,
    statusPath,
    'the first workspace is active before its language arm',
    (status) => status.activeWorkspaceRoot === firstRoot,
  );
  await openLanguageFixture(
    firstRoot,
    'first-language.ts',
    'firstValue',
    'FirstShape',
  );
  snapshot = driver.snapshot();
  clickMarker(driver, snapshot, secondName.slice(0, 17));
  const restoredSecondLanguageStatus = await awaitStatus(
    driver,
    statusPath,
    'the second workspace language features return after switching back',
    (status) =>
      status.activeWorkspaceRoot === secondRoot &&
      String(status.activeBuffer).endsWith('/second-language.ts') &&
      typeof status.lspProvider === 'string' &&
      Number(status.diagnosticsCount) > 0 &&
      status.structureStatus === 'ready' &&
      Number(status.structureRows) > 0,
  );
  const restoredSecondLanguageProcesses = await languageServerProcesses(
    restoredSecondLanguageStatus,
  );
  requireCondition(
    restoredSecondLanguageProcesses.length === 1 &&
      restoredSecondLanguageProcesses[0]?.cwd === secondRoot,
    'switching back recreates the language server at the second workspace root',
  );
  pass('language features retarget through second, first, and second roots');

  console.log(
    '== harness workspace tabs: git panel follows the active root ==',
  );
  driver.sendKeys('Control+g');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('second-root-change.txt') !== null,
  );
  pass('git panel paints the second repository change');

  console.log(
    '== harness workspace tabs: clicking first tab restores tree and git ==',
  );
  snapshot = driver.snapshot();
  clickMarker(driver, snapshot, firstName.slice(0, 17));
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('FIRST_TREE_ONLY.txt') !== null,
  );
  await awaitStatus(
    driver,
    statusPath,
    'the first workspace becomes active after its tab is clicked',
    (status) => status.activeWorkspaceRoot === firstRoot,
  );
  pass('click switched to the first root');
  await awaitStatus(
    driver,
    statusPath,
    'the reactivated tiny workspace watcher completes',
    (status) =>
      status.activeWorkspaceRoot === firstRoot &&
      status.gitWatcherActivationCompleted === true,
  );
  driver.sendKeys('Control+g');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('first-root-change.txt') !== null,
  );
  pass('git panel returned to the first repository');
  await awaitStatus(
    driver,
    statusPath,
    'only the active workspace owns a live Git watcher',
    (status) =>
      status.liveGitWatcherCount === 1 &&
      String(status.workspaceLiveGitWatchers) === 'true,false',
  );
  pass('two workspaces cost one live GitWatcher');
  pass('only the active workspace owns a watcher');

  console.log(
    '== harness workspace tabs: switched frame precedes repository work ==',
  );
  snapshot = driver.snapshot();
  clickMarker(driver, snapshot, secondName.slice(0, 17));
  await driver.awaitScreenChange();
  const firstSwitchedFrameStatus = await awaitStatus(
    driver,
    statusPath,
    'the switched frame is published before the watcher walk completes',
    (status) =>
      status.activeWorkspaceRoot === secondRoot &&
      status.gitWatcherActivationCompleted === false,
  );
  requireCondition(
    firstSwitchedFrameStatus.activeWorkspaceRoot === secondRoot,
    'the first switched frame belongs to the selected workspace',
  );
  requireCondition(
    firstSwitchedFrameStatus.gitWatcherActivationCompleted === false,
    'the first switched frame arrives before the watcher walk completes',
  );
  const reactivatedWideStatus = await awaitStatus(
    driver,
    statusPath,
    'the reactivated wide workspace watcher completes after the frame',
    (status) =>
      status.activeWorkspaceRoot === secondRoot &&
      status.gitWatcherActivationCompleted === true,
  );
  requireCondition(
    Number(
      reactivatedWideStatus.gitWatcherActivationIgnoreQuerySubprocessCount,
    ) === tinyIgnoreQuerySubprocessCount,
    'the completed wide walk repeats the depth-bounded query count',
  );
  snapshot = driver.snapshot();
  clickMarker(driver, snapshot, firstName.slice(0, 17));
  await awaitStatus(
    driver,
    statusPath,
    'the tiny workspace is restored after the deferral assertion',
    (status) => status.activeWorkspaceRoot === firstRoot,
  );

  console.log(
    '== harness workspace tabs: settings reorients top to left and back ==',
  );
  driver.sendKeys('Control+,');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('Settings') !== null,
  );
  await selectVisibleSetting('Workspace tabs');
  driver.sendKeys('Right');
  await driver.awaitScreenChange();
  driver.sendKeys('Escape');
  snapshot = await driver.awaitGridCondition(
    'the left-oriented workspace strip stacks the second project in the left column',
    (candidate) => {
      const firstProjectRows = candidate
        .textRows()
        .flatMap((rowText, row) =>
          rowText.slice(0, 22).includes(firstName.slice(0, 17)) ? [row] : [],
        );
      const secondProjectPosition = candidate.findText(secondName.slice(0, 17));
      return (
        secondProjectPosition !== null &&
        firstProjectRows.includes(secondProjectPosition.row - 1) &&
        secondProjectPosition.column < 22
      );
    },
  );
  const firstProjectRows = snapshot
    .textRows()
    .flatMap((rowText, row) =>
      rowText.slice(0, 22).includes(firstName.slice(0, 17)) ? [row] : [],
    );
  const secondVerticalPosition = snapshot.findText(secondName.slice(0, 17));
  requireCondition(
    secondVerticalPosition !== null &&
      firstProjectRows.includes(secondVerticalPosition.row - 1) &&
      secondVerticalPosition.column < 22,
    'left-oriented strip stacks the second project in the left column',
  );
  driver.sendKeys('Control+,');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('Settings') !== null,
  );
  await selectVisibleSetting('Workspace tabs');
  driver.sendKeys('Left');
  await driver.awaitScreenChange();
  driver.sendKeys('Escape');
  await awaitStatus(
    driver,
    statusPath,
    'Settings closes before workspace keyboard cycling',
    (status) => status.settingsOpen === false,
  );
  snapshot = await driver.awaitGridCondition(
    'the workspace strip returns to the top row',
    (candidate) => candidate.findText(secondName.slice(0, 17))?.row === 0,
  );
  requireCondition(
    snapshot.findText(secondName.slice(0, 17))?.row === 0,
    'workspace strip returns to the top row',
  );

  console.log(
    '== harness workspace tabs: Ctrl+Shift brackets cycle projects ==',
  );
  const cycleStatusBefore = await awaitStatus(
    driver,
    statusPath,
    'an active workspace root is published before keyboard cycling',
    (status) => typeof status.activeWorkspaceRoot === 'string',
  );
  const cycleRootBefore = cycleStatusBefore.activeWorkspaceRoot;
  driver.sendRawInput('\x1b[93;6u');
  await awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeWorkspaceRoot !== cycleRootBefore',
    (status) => status.activeWorkspaceRoot !== cycleRootBefore,
  );
  pass('Ctrl+Shift+] cycles to the next project');
  driver.sendRawInput('\x1b[91;6u');
  await awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeWorkspaceRoot === cycleRootBefore',
    (status) => status.activeWorkspaceRoot === cycleRootBefore,
  );
  pass('Ctrl+Shift+[ cycles back to the previous project');

  driver.sendKeys('Control+q');
  console.log('smoke-workspace-tabs-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureParent);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
