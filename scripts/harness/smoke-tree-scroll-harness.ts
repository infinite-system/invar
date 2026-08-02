#!/usr/bin/env bun
// Byte-level port of smoke-tree-scroll: real SGR wheel and click input drive the file tree while
// semantic scroll/selection state comes from the existing status projection.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Rendering is one coarse frame effect (src/modules/app/app.invariants.md)
// invariant: The tree reveal follows the active file (src/modules/filetree/filetree.invariants.md)
// invariant: File tree controls share paint and hit geometry (src/modules/filetree/filetree.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-tree-scroll-harness-'));

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-tree-scroll-harness-home-'),
);
const statusPath = join(homeDirectory, 'status.json');
const settingOffHomeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-tree-scroll-setting-off-home-'),
);
const settingOffStatusPath = join(settingOffHomeDirectory, 'status.json');
mkdirSync(join(settingOffHomeDirectory, '.config', 'invar'), {
  recursive: true,
});
await Bun.write(
  join(settingOffHomeDirectory, '.config', 'invar', 'settings.json'),
  JSON.stringify({
    glyphMode: 'unicode',
    fileTreeRevealOpenFile: false,
  }),
);
const scaleBranchCount = Number.parseInt(
  process.env.INVAR_FILE_TREE_SCALE_BRANCH_COUNT ?? '60',
  10,
);
if (!Number.isFinite(scaleBranchCount) || scaleBranchCount < 1) {
  throw new Error(
    'INVAR_FILE_TREE_SCALE_BRANCH_COUNT must be a positive integer',
  );
}
const scaleDirectory = join(fixtureRoot, 'scale');
mkdirSync(scaleDirectory);
for (let branchNumber = 1; branchNumber <= scaleBranchCount; branchNumber++) {
  mkdirSync(
    join(scaleDirectory, `branch-${String(branchNumber).padStart(4, '0')}`),
  );
}
const revealTargetRelativePath = join(
  'scale',
  `branch-${String(scaleBranchCount).padStart(4, '0')}`,
  'target.ts',
);
await Bun.write(
  join(fixtureRoot, revealTargetRelativePath),
  'export const revealedTarget = true;\n',
);

for (let fileNumber = 1; fileNumber <= 60; fileNumber++) {
  await Bun.write(
    join(fixtureRoot, `file-${String(fileNumber).padStart(2, '0')}.txt`),
    'x\n',
  );
}

const shortFixtureRoot = mkdtempSync(
  join(tmpdir(), 'tui-tree-scroll-short-harness-'),
);
const shortHomeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-tree-scroll-short-home-'),
);
const shortStatusPath = join(shortHomeDirectory, 'status.json');
await Bun.write(
  join(shortFixtureRoot, 'short.ts'),
  'export const short = true;\n',
);
const shortDriver = new PtyTestDriver.Class({
  workspaceRoot: shortFixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory: shortHomeDirectory,
  environment: { TUI_STATUS_PATH: shortStatusPath },
});
try {
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    shortDriver,
    shortStatusPath,
    'the short tree settles without a scrollbar',
    (status) =>
      status.ready === true &&
      status.renderQuiescent === true &&
      status.treeRows === 1,
  );
  const revealGlyph = ThemeIcons.Class.glyphFor('unicode', 'fileTreeReveal');
  const shortSnapshot = await shortDriver.awaitGridCondition(
    'the short tree paints its reveal button',
    (snapshot) => snapshot.findText(revealGlyph) !== null,
  );
  const shortRevealPosition = shortSnapshot.findText(revealGlyph);
  HarnessSmoke.Class.requireCondition(
    shortRevealPosition?.column === 33 &&
      shortSnapshot.cell(shortRevealPosition.row, 32)?.characters ===
        '\u00a0' &&
      shortSnapshot.cell(shortRevealPosition.row, 34)?.characters === '\u00a0',
    'the short tree keeps the padded reveal button at columns 32 through 34',
  );
  if (!shortRevealPosition)
    throw new Error('The short-tree reveal button vanished');
  shortDriver.sendMouse({
    kind: 'move',
    column: shortRevealPosition.column,
    row: shortRevealPosition.row,
    button: 'none',
  });
  await shortDriver.awaitGridCondition(
    'the short-tree reveal hover paints both pads and its glyph',
    (snapshot) =>
      [32, 33, 34].every(
        (column) =>
          snapshot.cell(shortRevealPosition.row, column)?.background ===
          Number.parseInt('#1e202e'.slice(1), 16),
      ),
  );
  shortDriver.sendKeys('Control+q');
} finally {
  await shortDriver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(shortFixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(shortHomeDirectory);
}

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness tree-scroll: overflowing tree boots ==');
  const openingStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: a settled boot publishes all 60 file-tree rows',
    (status) =>
      status.ready === true &&
      status.renderQuiescent === true &&
      status.treeRows === 61,
  );
  HarnessSmoke.Class.requireCondition(
    openingStatus.treeRows === 61,
    'the settled model contains the scale directory and all 60 file rows',
  );
  HarnessSmoke.Class.requireCondition(
    Array.isArray(openingStatus.settingsLabels) &&
      openingStatus.settingsLabels.includes('Reveal open file'),
    'the Settings panel publishes the Reveal open file row',
  );
  const openingSnapshot = await driver.awaitGridCondition(
    'the settled boot paints the populated file tree',
    (snapshot) => snapshot.findText('file-20.txt') !== null,
    15_000,
  );
  HarnessSmoke.Class.pass('the settled boot paints the populated file tree');
  const revealGlyph = ThemeIcons.Class.glyphFor('unicode', 'fileTreeReveal');
  const tallRevealPosition = openingSnapshot.findText(revealGlyph);
  HarnessSmoke.Class.requireCondition(
    tallRevealPosition?.column === 32 &&
      openingSnapshot.cell(tallRevealPosition.row, 31)?.characters ===
        '\u00a0' &&
      openingSnapshot.cell(tallRevealPosition.row, 33)?.characters === '\u00a0',
    'the overflowing tree shifts the whole padded reveal button left of the scrollbar',
  );
  if (!tallRevealPosition)
    throw new Error('The tall-tree reveal button vanished');
  driver.sendMouse({
    kind: 'move',
    column: tallRevealPosition.column,
    row: tallRevealPosition.row,
    button: 'none',
  });
  const tallRevealHover = await driver.awaitGridCondition(
    'the tall-tree reveal hover paints both pads and its glyph',
    (snapshot) =>
      [31, 32, 33].every(
        (column) =>
          snapshot.cell(tallRevealPosition.row, column)?.background ===
          Number.parseInt('#1e202e'.slice(1), 16),
      ),
  );
  HarnessSmoke.Class.requireCondition(
    tallRevealHover.cell(tallRevealPosition.row, 34)?.background !==
      Number.parseInt('#1e202e'.slice(1), 16),
    'the tall-tree reveal hover stops before the scrollbar column',
  );

  console.log(
    '== harness tree-scroll: wheel moves the window without swimming selection ==',
  );
  await driver.assertContentInvariantAcrossAction({
    invariantRegion: {
      startRow: 1,
      endRowExclusive: openingSnapshot.rows - 2,
      startColumn: 32,
      endColumnExclusive: openingSnapshot.columns,
    },
    changedRegion: {
      startRow: 1,
      endRowExclusive: openingSnapshot.rows - 2,
      startColumn: 0,
      endColumnExclusive: 30,
    },
    actionDescription:
      'tree wheel input changes the file window while the editor stays fixed',
    performAction: async () => {
      for (let wheelEventIndex = 0; wheelEventIndex < 80; wheelEventIndex++) {
        driver.sendMouseWithoutFrameExpectation({
          kind: 'wheel',
          column: 9,
          row: 9,
          direction: 'down',
        });
      }
      await driver.awaitGridCondition(
        'the wheel train reaches the final file-tree row',
        (candidate) => candidate.findText('file-60.txt') !== null,
      );
    },
  });
  const scrolledStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: Number(status.treeScrollTop) > 0',
    (status) => Number(status.treeScrollTop) > 0,
  );
  const scrolledOffset = Number(scrolledStatus.treeScrollTop);
  HarnessSmoke.Class.pass(
    `wheel scrolled the window (scrollTop=${scrolledOffset})`,
  );
  HarnessSmoke.Class.requireCondition(
    scrolledStatus.treeSelected === 0,
    'wheel left the selection put (selected=0)',
  );

  console.log(
    '== harness tree-scroll: opening a visible lower row centers it ==',
  );
  driver.sendMouse({
    kind: 'press',
    column: 9,
    row: 19,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: 9,
    row: 19,
    button: 'left',
  });
  const clickedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: typeof status.activeBuffer === 'string' && status.activeBuffer.length > 0",
    (status) =>
      typeof status.activeBuffer === 'string' && status.activeBuffer.length > 0,
  );
  const clickedSidebarHeight = Number(
    (
      clickedStatus.layoutSlots as {
        sidebar?: { height?: number };
      }
    ).sidebar?.height,
  );
  const clickedTreeViewportRows = clickedSidebarHeight - 3;
  HarnessSmoke.Class.requireCondition(
    Number(clickedStatus.treeSelected) - Number(clickedStatus.treeScrollTop) ===
      Math.floor(clickedTreeViewportRows / 2),
    'opening a clicked file centers its selected tree row',
  );
  HarnessSmoke.Class.requireCondition(
    typeof clickedStatus.activeBuffer === 'string',
    `click opened the clicked row (${String(clickedStatus.activeBuffer).split('/').at(-1)})`,
  );
  const clickedFileSnapshot = await driver.awaitGridCondition(
    'the clicked file content is visible in the emulator grid',
    (candidate) => candidate.findText('x') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    clickedFileSnapshot.findText('x') !== null,
    'the clicked file content is visible in the emulator grid',
  );

  console.log(
    '== harness tree-scroll: quick open reveals the active file through one path ==',
  );
  driver.sendKeys('Control+p');
  await driver.awaitGridCondition(
    'Quick Open is visible before the reveal target is typed',
    (candidate) => candidate.findText('Go to File') !== null,
  );
  driver.sendText(revealTargetRelativePath);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Quick Open selects the exact nested reveal target',
    (status) =>
      status.quickOpenQuery === revealTargetRelativePath &&
      status.quickOpenSelectedIdentifier === revealTargetRelativePath,
  );
  driver.sendKeys('Enter');
  const revealedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Quick Open activates and reveals the nested target',
    (status) =>
      typeof status.activeBuffer === 'string' &&
      status.activeBuffer.endsWith(revealTargetRelativePath) &&
      status.treeSelected === scaleBranchCount + 1 &&
      Number(status.treeScrollTop) > 0,
  );
  const revealedSnapshot = await driver.awaitGridCondition(
    'the selected reveal target is visible in the file-tree viewport',
    (candidate) => candidate.findText('target.ts') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    revealedSnapshot.findText('target.ts') !== null,
    'Quick Open expands ancestors and paints target.ts in the tree',
  );
  HarnessSmoke.Class.requireCondition(
    revealedStatus.focus === 'editor',
    'automatic reveal leaves keyboard focus in the editor',
  );
  HarnessSmoke.Class.requireCondition(
    revealedStatus.treeRows === scaleBranchCount + 62,
    `reveal materializes only the ${scaleBranchCount} branch rows and the target`,
  );
  const sidebarHeight = Number(
    (
      revealedStatus.layoutSlots as {
        sidebar?: { height?: number };
      }
    ).sidebar?.height,
  );
  const treeViewportRows = sidebarHeight - 3;
  HarnessSmoke.Class.requireCondition(
    Number(revealedStatus.treeSelected) -
      Number(revealedStatus.treeScrollTop) ===
      Math.floor(treeViewportRows / 2),
    'automatic reveal centers the selected file in the tree viewport',
  );

  driver.sendKeys('Control+q');

  console.log(
    '== harness tree-scroll: setting off suppresses reveal and the button reveals on demand ==',
  );
  const settingOffDriver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 120,
    rows: 40,
    homeDirectory: settingOffHomeDirectory,
    environment: { TUI_STATUS_PATH: settingOffStatusPath },
  });
  try {
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      settingOffDriver,
      settingOffStatusPath,
      'the setting-off session reaches its collapsed tree',
      (status) =>
        status.ready === true &&
        status.renderQuiescent === true &&
        status.treeRows === 61,
    );
    await settingOffDriver.awaitGridCondition(
      'the setting-off session paints the reveal button',
      (candidate) =>
        candidate.findText(
          ThemeIcons.Class.glyphFor('unicode', 'fileTreeReveal'),
        ) !== null,
    );
    settingOffDriver.sendKeys('Control+p');
    await settingOffDriver.awaitGridCondition(
      'Quick Open is visible in the setting-off session',
      (candidate) => candidate.findText('Go to File') !== null,
    );
    settingOffDriver.sendText(revealTargetRelativePath);
    await HarnessSmoke.Class.awaitStatus(
      settingOffDriver,
      settingOffStatusPath,
      'Quick Open selects the exact setting-off reveal target',
      (status) =>
        status.quickOpenQuery === revealTargetRelativePath &&
        status.quickOpenSelectedIdentifier === revealTargetRelativePath,
    );
    settingOffDriver.sendKeys('Enter');
    const suppressedStatus = await HarnessSmoke.Class.awaitStatus(
      settingOffDriver,
      settingOffStatusPath,
      'the target activates while the setting keeps the tree collapsed',
      (status) =>
        typeof status.activeBuffer === 'string' &&
        status.activeBuffer.endsWith(revealTargetRelativePath) &&
        status.treeRows === 61,
    );
    HarnessSmoke.Class.requireCondition(
      suppressedStatus.treeSelected === 0 &&
        suppressedStatus.treeScrollTop === 0,
      'fileTreeRevealOpenFile=false leaves tree selection and scroll unchanged',
    );

    const settingOffButtonSnapshot = await settingOffDriver.awaitGridCondition(
      'the reveal button is visible after Quick Open closes',
      (candidate) =>
        candidate.findText(
          ThemeIcons.Class.glyphFor('unicode', 'fileTreeReveal'),
        ) !== null,
    );
    HarnessSmoke.Class.clickText(
      settingOffDriver,
      settingOffButtonSnapshot,
      ThemeIcons.Class.glyphFor('unicode', 'fileTreeReveal'),
    );
    const buttonRevealStatus = await HarnessSmoke.Class.awaitStatus(
      settingOffDriver,
      settingOffStatusPath,
      'the reveal button selects and scrolls to the active file',
      (status) =>
        status.treeSelected === scaleBranchCount + 1 &&
        Number(status.treeScrollTop) > 0,
    );
    const buttonRevealSnapshot = await settingOffDriver.awaitGridCondition(
      'the reveal button paints target.ts inside the file-tree columns',
      (candidate) =>
        candidate
          .textRows()
          .some((rowText) => rowText.slice(0, 32).includes('target.ts')),
    );
    HarnessSmoke.Class.requireCondition(
      buttonRevealSnapshot
        .textRows()
        .some((rowText) => rowText.slice(0, 32).includes('target.ts')),
      'the reveal button paints target.ts in the tree viewport',
    );
    HarnessSmoke.Class.requireCondition(
      buttonRevealStatus.focus === 'editor',
      'the reveal button returns keyboard focus to the editor',
    );
    settingOffDriver.sendKeys('Control+q');
  } finally {
    await settingOffDriver.dispose();
  }
  console.log('smoke-tree-scroll-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  await HarnessSmoke.Class.removeTemporaryDirectory(settingOffHomeDirectory);
}
