#!/usr/bin/env bun
// Drive the Files-header Open control through its in-app and native-dialog tiers. The first arm
// runs without a graphical session, browses above the workspace, and opens an outside file with
// the visible read-only badge. The second arm puts a deterministic zenity stub on PATH and opens the shared
// 100,000-line scale file without opening the in-app popup.
//
// Run: bun scripts/harness/smoke-file-open-harness.ts
// Read: both tier lines print PASS; ALL-PASS means real hover and click input reached each picker,
// outside-root routing stayed read-only, and the large native selection opened.
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const fixtureDirectory = mkdtempSync(join(tmpdir(), 'invar-file-open-smoke-'));
const workspaceDirectory = join(fixtureDirectory, 'workspace');
const scaleDirectory = join(fixtureDirectory, 'scale');
const dialogBinaryDirectory = join(fixtureDirectory, 'dialog-bin');
const outsidePath = join(fixtureDirectory, 'outside.ts');
mkdirSync(workspaceDirectory);
mkdirSync(dialogBinaryDirectory);
writeFileSync(
  join(workspaceDirectory, 'inside.ts'),
  'export const INSIDE_FILE = true;\n',
);
writeFileSync(outsidePath, 'export const OUTSIDE_READ_ONLY = true;\n');
const scaleResult = Bun.spawnSync(
  [
    'bun',
    'scripts/make-scale-workspace.ts',
    '--lines',
    '100000',
    '--directory',
    scaleDirectory,
  ],
  { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' },
);
HarnessSmoke.Class.requireCondition(
  scaleResult.exitCode === 0,
  `shared scale fixture builds: ${scaleResult.stderr.toString()}`,
);

async function clickOpenControl(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<void> {
  const openFileGlyph = ThemeIcons.Class.glyphFor('unicode', 'fileTreeOpen');
  const beforeHover = await driver.awaitGridCondition(
    'the Files header paints its Open control',
    (snapshot) => snapshot.findText(openFileGlyph) !== null,
  );
  const position = beforeHover.findText(openFileGlyph);
  if (!position) throw new Error('The Files-header Open control vanished');
  HarnessSmoke.Class.requireCondition(
    (await HarnessSmoke.Class.readStatus(statusPath)).tooltipVisible !== true,
    'positive control: the Open tooltip starts hidden',
  );
  driver.sendMouse({
    kind: 'move',
    column: position.column,
    row: position.row,
    button: 'none',
  });
  await driver.awaitGridCondition(
    'the Open control hover reaches its painted glyph',
    (snapshot) =>
      snapshot.cell(position.row, position.column)?.background !==
      beforeHover.cell(position.row, position.column)?.background,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Open control routes its tooltip through the sidebar',
    (status) => status.tooltipVisible === true,
  );
  await driver.awaitGridCondition(
    'the Open control states its action before the click',
    (snapshot) => snapshot.findText('Open file') !== null,
  );
  driver.sendMouseClick({
    column: position.column,
    row: position.row,
    button: 'left',
  });
}

try {
  console.log('== file open: tier 1 in-app browser ==');
  const tierOneHome = join(fixtureDirectory, 'tier-one-home');
  const tierOneStatusPath = join(tierOneHome, 'status.json');
  const tierOneDriver = new PtyTestDriver.Class({
    workspaceRoot: workspaceDirectory,
    columns: 120,
    rows: 40,
    homeDirectory: tierOneHome,
    environment: {
      TUI_STATUS_PATH: tierOneStatusPath,
      DISPLAY: '',
      WAYLAND_DISPLAY: '',
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      tierOneDriver,
      tierOneStatusPath,
      'tier 1 settles before its click',
      (status) => status.ready === true && status.renderQuiescent === true,
    );
    HarnessSmoke.Class.requireCondition(
      tierOneDriver.snapshot().findText('OUTSIDE_READ_ONLY') === null,
      'positive control starts before the outside file is visible',
    );
    await clickOpenControl(tierOneDriver, tierOneStatusPath);
    const openedPickerStatus = await HarnessSmoke.Class.awaitStatus(
      tierOneDriver,
      tierOneStatusPath,
      'tier 1 opens the bounded filesystem browser',
      (status) =>
        status.boundedListPopupOpen === true &&
        String(status.boundedListPopupTitle).includes(workspaceDirectory),
    );
    HarnessSmoke.Class.requireCondition(
      openedPickerStatus.boundedListPopupSelectedIdentifier ===
        fixtureDirectory,
      `the workspace parent row is selected first; selected ${String(openedPickerStatus.boundedListPopupSelectedIdentifier)}`,
    );
    tierOneDriver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      tierOneDriver,
      tierOneStatusPath,
      'the parent row enters the outside-root read-only tier',
      (status) =>
        String(status.boundedListPopupTitle).includes('[read-only]') &&
        Array.isArray(status.boundedListPopupItemIdentifiers) &&
        status.boundedListPopupItemIdentifiers.includes(outsidePath),
    );
    const outsideListing = await tierOneDriver.awaitGridCondition(
      'the outside file row paints its read-only badge',
      (snapshot) => snapshot.findText('outside.ts  [read-only]') !== null,
    );
    const outsidePosition = outsideListing.findText('outside.ts  [read-only]');
    if (!outsidePosition) throw new Error('The outside file row vanished');
    tierOneDriver.sendMouse({
      kind: 'move',
      column: outsidePosition.column,
      row: outsidePosition.row,
      button: 'none',
    });
    await tierOneDriver.awaitGridCondition(
      'the outside file row receives hover before click',
      (snapshot) =>
        snapshot.cell(outsidePosition.row, outsidePosition.column)
          ?.background !==
        outsideListing.cell(outsidePosition.row, outsidePosition.column)
          ?.background,
    );
    tierOneDriver.sendMouseClick({
      column: outsidePosition.column,
      row: outsidePosition.row,
      button: 'left',
    });
    await tierOneDriver.awaitGridCondition(
      'the outside file opens with its read-only tab badge',
      (snapshot) =>
        snapshot.findText('OUTSIDE_READ_ONLY') !== null &&
        snapshot.findText('[read-only]') !== null,
    );
    HarnessSmoke.Class.pass(
      'tier 1 browsed outside the root and opened the file read-only',
    );
    tierOneDriver.sendKeys('Control+q');
  } finally {
    await tierOneDriver.dispose();
  }

  console.log('== file open: tier 2 native dialog ==');
  const largePath = join(scaleDirectory, 'huge.ts');
  const dialogBinaryPath = join(dialogBinaryDirectory, 'zenity');
  writeFileSync(
    dialogBinaryPath,
    `#!/usr/bin/env bash\nprintf '%s\\n' '${largePath}'\n`,
  );
  chmodSync(dialogBinaryPath, 0o700);
  const tierTwoHome = join(fixtureDirectory, 'tier-two-home');
  const tierTwoStatusPath = join(tierTwoHome, 'status.json');
  const tierTwoDriver = new PtyTestDriver.Class({
    workspaceRoot: workspaceDirectory,
    columns: 120,
    rows: 40,
    homeDirectory: tierTwoHome,
    environment: {
      TUI_STATUS_PATH: tierTwoStatusPath,
      PATH: `${dialogBinaryDirectory}:${process.env.PATH ?? ''}`,
      DISPLAY: ':99',
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      tierTwoDriver,
      tierTwoStatusPath,
      'tier 2 settles before its click',
      (status) => status.ready === true && status.renderQuiescent === true,
    );
    HarnessSmoke.Class.requireCondition(
      tierTwoDriver.snapshot().findText('ScaleRecord0000000') === null,
      'positive control starts before the large file is visible',
    );
    await clickOpenControl(tierTwoDriver, tierTwoStatusPath);
    await tierTwoDriver.awaitGridCondition(
      'the native dialog selection opens the 100,000-line file',
      (snapshot) => snapshot.findText('ScaleRecord0000000') !== null,
      30_000,
    );
    const status = await HarnessSmoke.Class.readStatus(tierTwoStatusPath);
    HarnessSmoke.Class.requireCondition(
      status.boundedListPopupOpen !== true,
      'tier 2 did not open the in-app fallback popup',
    );
    HarnessSmoke.Class.pass(
      'tier 2 opened the large file through the stub native dialog',
    );
    tierTwoDriver.sendKeys('Control+q');
  } finally {
    await tierTwoDriver.dispose();
  }
  console.log('ALL-PASS file-open picker tiers 1 and 2');
} finally {
  rmSync(fixtureDirectory, { recursive: true, force: true });
}
