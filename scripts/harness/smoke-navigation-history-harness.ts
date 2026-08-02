#!/usr/bin/env bun
// Navigation history through real PTY bytes and breadcrumb clicks. Run with:
// `bun scripts/harness/smoke-navigation-history-harness.ts`.
// PASS means xterm Alt+arrow, macOS readline Option+arrow, the fallback chords, and both padded
// breadcrumb buttons all drive one navigation history without changing cursor restoration.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Programmatic history navigation does not record new history (src/modules/navigation/navigation.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const fixtureRoot = mkdtempSync(
  join(tmpdir(), 'tui-navigation-history-harness-'),
);

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-navigation-history-harness-home-'),
);

const statusPath = join(homeDirectory, 'status.json');

const alphaPath = join(fixtureRoot, 'alpha.ts');

const betaPath = join(fixtureRoot, 'beta.ts');

await Bun.write(
  alphaPath,
  'alpha one\nalpha two\nalpha three\nalpha four\nalpha five\n',
);

await Bun.write(
  betaPath,
  'beta one\nbeta two\nbeta three\nbeta four\nbeta five\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log(
    '== harness navigation history: open alpha and preserve its cursor ==',
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('alpha.ts') !== null,
    15_000,
  );
  const projectMarker = ` ⌕ ${basename(fixtureRoot)}`;
  const projectSnapshot = await driver.awaitGridCondition(
    'the panel-tone project row paints its padded search control',
    (snapshot) => snapshot.findText(projectMarker) !== null,
  );
  const projectPosition = projectSnapshot.findText(projectMarker);
  HarnessSmoke.Class.requireCondition(
    projectPosition !== null &&
      projectSnapshot
        .rowCells(projectPosition.row)
        .every((cell) => cell.background === Number.parseInt('16161e', 16)),
    'the whole project row uses the panel background',
  );
  if (!projectPosition) throw new Error('The project search control vanished');
  const emptyHistoryPosition = projectSnapshot.findText(' ❮  ❯ ');
  HarnessSmoke.Class.requireCondition(
    emptyHistoryPosition !== null &&
      projectSnapshot.cell(
        emptyHistoryPosition.row,
        emptyHistoryPosition.column + 1,
      )?.foreground === Number.parseInt('787c99', 16) &&
      !projectSnapshot.rowText(0).includes('‹') &&
      !projectSnapshot.rowText(0).includes('›'),
    'the no-file breadcrumb row keeps only dim history and the single workspace tab needs no pan arrows',
  );
  driver.sendMouse({
    kind: 'press',
    column: projectPosition.column,
    row: projectPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: projectPosition.column,
    row: projectPosition.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the search control left pad opens Quick Open',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Quick Open closes before the history drive',
    (status) => status.quickOpenOpen === false,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBuffer === alphaPath',
    (status) => status.activeBuffer === alphaPath,
  );
  await driver.awaitGridCondition(
    'alpha.ts content is visible after opening the file',
    (snapshot) => snapshot.findText('alpha one') !== null,
  );
  const orderedChromeSnapshot = driver.snapshot();
  const historyRow = orderedChromeSnapshot.findText(' ❮  ❯ ')?.row ?? -1;
  const bufferTabRow = orderedChromeSnapshot.findText(' alpha.ts ')?.row ?? -1;
  HarnessSmoke.Class.requireCondition(
    historyRow >= 0 && bufferTabRow === historyRow + 1,
    'the breadcrumb and history row sits directly above the buffer tab row',
  );
  const panelTone = Number.parseInt('16161e', 16);
  const contentTone = Number.parseInt('1a1b26', 16);
  for (const [stripName, row] of [
    ['workspace', 0],
    ['branch', 1],
    ['project', projectPosition.row],
    ['breadcrumb', historyRow],
    ['file-tab', bufferTabRow],
  ] as const) {
    HarnessSmoke.Class.requireCondition(
      orderedChromeSnapshot.cell(row, 60)?.background === panelTone,
      `${stripName} strip uses the panel tone`,
    );
  }
  const activeFileTab = orderedChromeSnapshot.findText(' alpha.ts ');
  const alphaContent = orderedChromeSnapshot.findText('alpha one');
  HarnessSmoke.Class.requireCondition(
    activeFileTab !== null &&
      orderedChromeSnapshot.cell(activeFileTab.row, activeFileTab.column + 1)
        ?.background === contentTone &&
      alphaContent !== null &&
      orderedChromeSnapshot.cell(alphaContent.row, alphaContent.column)
        ?.background === contentTone,
    'only the active file-tab chip and editor canvas use the content tone',
  );
  HarnessSmoke.Class.pass('alpha.ts opened as the active buffer');
  driver.sendKeys('Down', 'Down', 'Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.cursor?.line === 3 && status.cursor.col === 0',
    (status) => status.cursor?.line === 3 && status.cursor.col === 0,
  );
  HarnessSmoke.Class.pass('cursor moved to alpha.ts line 3 (3,0)');
  await driver.awaitScreenChange();

  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.focus === 'files'",
    (status) => status.focus === 'files',
  );
  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.treeSelected === 1',
    (status) => status.treeSelected === 1,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBuffer === betaPath',
    (status) => status.activeBuffer === betaPath,
  );
  await driver.awaitGridCondition(
    'beta.ts content is visible after opening the file',
    (snapshot) => snapshot.findText('beta one') !== null,
  );
  HarnessSmoke.Class.pass('beta.ts opened as the active buffer');

  for (const commandTitle of ['Go: Back', 'Go: Forward']) {
    driver.sendKeys('F1');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `the command palette opens before locating ${commandTitle}`,
      (status) => status.paletteOpen === true,
    );
    driver.sendText(commandTitle);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${commandTitle} remains reachable from the command palette`,
      (status) =>
        status.paletteQuery === commandTitle &&
        Number(status.paletteMatches) === 1,
    );
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `the command palette closes after locating ${commandTitle}`,
      (status) => status.paletteOpen === false,
    );
  }

  console.log(
    '== harness navigation history: terminal Alt+arrow byte forms replay both directions ==',
  );
  driver.sendRawInput('\x1b[1;3D');
  const backStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBuffer === alphaPath && status.cursor?.line === 3',
    (status) => status.activeBuffer === alphaPath && status.cursor?.line === 3,
  );
  HarnessSmoke.Class.pass(
    'xterm Alt+Left restored alpha.ts as the active buffer',
  );
  HarnessSmoke.Class.requireCondition(
    backStatus.cursor?.line === 3 && backStatus.cursor.col === 0,
    'xterm Alt+Left restored the cursor to where it was left (3,0)',
  );
  await driver.awaitGridCondition(
    'alpha.ts content is visible after navigating back',
    (snapshot) => snapshot.findText('alpha one') !== null,
  );
  driver.sendRawInput('\x1b[1;3C');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBuffer === betaPath',
    (status) => status.activeBuffer === betaPath,
  );
  await driver.awaitGridCondition(
    'beta.ts content is visible after navigating forward',
    (snapshot) => snapshot.findText('beta one') !== null,
  );
  HarnessSmoke.Class.pass('xterm Alt+Right returned forward to beta.ts');

  driver.sendRawInput('\x1bb');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'macOS ESC-b activates alpha.ts',
    (status) => status.activeBuffer === alphaPath,
  );
  driver.sendRawInput('\x1bf');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'macOS ESC-f activates beta.ts',
    (status) => status.activeBuffer === betaPath,
  );
  HarnessSmoke.Class.pass(
    'macOS readline Option+arrow byte forms replay both directions',
  );

  driver.sendRawInput('\x1b[91;7u');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Ctrl+Alt+[ fallback activates alpha.ts',
    (status) => status.activeBuffer === alphaPath,
  );
  driver.sendRawInput('\x1b[93;7u');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Ctrl+Alt+] fallback activates beta.ts',
    (status) => status.activeBuffer === betaPath,
  );
  HarnessSmoke.Class.pass('Ctrl+Alt+bracket fallbacks replay both directions');

  console.log(
    '== harness navigation history: padded breadcrumb buttons drive the same history ==',
  );
  let snapshot = await driver.awaitGridCondition(
    'the breadcrumb row renders both fat history controls',
    (candidate) => candidate.findText(' ❮  ❯ ') !== null,
  );
  const historyPosition = snapshot.findText(' ❮  ❯ ');
  const breadcrumbRow = historyPosition?.row ?? -1;
  const backColumn = (historyPosition?.column ?? -2) + 1;
  HarnessSmoke.Class.requireCondition(
    breadcrumbRow >= 0 && backColumn >= 0,
    `breadcrumb buttons rendered (❮ at col ${backColumn}, row ${breadcrumbRow})`,
  );
  driver.sendMouse({
    kind: 'press',
    column: backColumn,
    row: breadcrumbRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: backColumn,
    row: breadcrumbRow,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'clicking breadcrumb back activates alpha.ts',
    (status) => status.activeBuffer === alphaPath,
  );
  await driver.awaitGridCondition(
    'alpha.ts content is visible after clicking the back breadcrumb',
    (candidate) => candidate.findText('alpha one') !== null,
  );
  HarnessSmoke.Class.pass('clicking padded breadcrumb ❮ went back to alpha.ts');
  snapshot = driver.snapshot();
  driver.sendMouse({
    kind: 'press',
    column: backColumn + 3,
    row: breadcrumbRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: backColumn + 3,
    row: breadcrumbRow,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBuffer === betaPath',
    (status) => status.activeBuffer === betaPath,
  );
  await driver.awaitGridCondition(
    'beta.ts content is visible after clicking the forward breadcrumb',
    (candidate) => candidate.findText('beta one') !== null,
  );
  HarnessSmoke.Class.pass(
    'clicking padded breadcrumb ❯ went forward to beta.ts',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-navigation-history-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
