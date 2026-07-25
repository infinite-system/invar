#!/usr/bin/env bun
// Byte-level port of the integrated-terminal smoke: Invar owns a nested shell PTY inside the
// harness PTY, and the production emulator remains the screen oracle for the full round trip.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

function terminalSizePattern(rows: number, columns: number): RegExp {
  return new RegExp(`(?:^|\\D)${rows} ${columns}(?:\\D|$)`);
}

function bottomPanelSlot(status: StatusSnapshot): Rectangle {
  const layoutSlots = status.layoutSlots as
    Record<string, Rectangle> | undefined;
  const bottomPanel = layoutSlots?.bottomPanel;
  if (!bottomPanel) throw new Error('Bottom-panel slot geometry disappeared');
  return bottomPanel;
}

function terminalThumbRowCount(
  snapshot: HarnessSnapshot.Model,
  panelRectangle: Rectangle,
): number {
  const rightBorderColumn = panelRectangle.left + panelRectangle.width - 1;
  for (
    let scrollBarColumn = rightBorderColumn - 1;
    scrollBarColumn >= rightBorderColumn - 4;
    scrollBarColumn -= 1
  ) {
    const backgrounds: Array<number | null> = [];
    for (
      let row = panelRectangle.top + 1;
      row < panelRectangle.top + panelRectangle.height - 1;
      row += 1
    ) {
      const cell = snapshot.cell(row, scrollBarColumn);
      backgrounds.push(
        cell?.characters === ' ' && cell.isBackgroundRgb
          ? cell.background
          : null,
      );
    }
    const backgroundCounts = new Map<number, number>();
    for (const background of backgrounds) {
      if (background === null) continue;
      backgroundCounts.set(
        background,
        (backgroundCounts.get(background) ?? 0) + 1,
      );
    }
    const paneBackground = [...backgroundCounts.entries()].sort(
      (firstBackground, secondBackground) =>
        secondBackground[1] - firstBackground[1],
    )[0]?.[0];
    let longestThumbRun = 0;
    let currentThumbRun = 0;
    let currentThumbBackground: number | null = null;
    for (const background of [...backgrounds, null]) {
      if (
        background !== null &&
        background !== paneBackground &&
        background === currentThumbBackground
      ) {
        currentThumbRun += 1;
      } else {
        longestThumbRun = Math.max(longestThumbRun, currentThumbRun);
        currentThumbBackground =
          background !== paneBackground ? background : null;
        currentThumbRun = currentThumbBackground === null ? 0 : 1;
      }
    }
    if (longestThumbRun >= 2) {
      return longestThumbRun;
    }
  }
  return 0;
}

async function collectTerminalScrollFrames(
  driver: PtyTestDriver.Model,
  statusPath: string,
  panelRectangle: Rectangle,
): Promise<readonly number[]> {
  const scrollPositions: number[] = [];
  let nextFrame = driver.awaitNextCompletedFrameSnapshot(2_000);
  const column = panelRectangle.left + Math.floor(panelRectangle.width / 2);
  const row = panelRectangle.top + 6;
  for (let wheelEventIndex = 0; wheelEventIndex < 18; wheelEventIndex += 1) {
    driver.sendMouse({
      kind: 'wheel',
      column,
      row,
      direction: 'up',
    });
  }
  for (let frameIndex = 0; frameIndex < 5; frameIndex += 1) {
    await nextFrame;
    scrollPositions.push(
      Number(HarnessSmoke.Class.readStatus(statusPath).terminalScrollTop),
    );
    if (frameIndex < 4) {
      nextFrame = driver.awaitNextCompletedFrameSnapshot(2_000);
    }
  }
  return scrollPositions;
}

async function awaitFileBytes(filePath: string): Promise<Uint8Array> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const file = Bun.file(filePath);
    if (await file.exists()) return new Uint8Array(await file.arrayBuffer());
    await Bun.sleep(10);
  }
  throw new Error(`Timed out waiting for child input capture at ${filePath}`);
}

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-terminal-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
const childInputPath = join(homeDirectory, 'wheel-input.bin');
const childScriptPath = join(homeDirectory, 'wheel-child.py');
const settingsDirectory = join(homeDirectory, '.config', 'invar');
mkdirSync(settingsDirectory, { recursive: true });
await Bun.write(
  join(settingsDirectory, 'settings.json'),
  '{"glyphMode":"unicode"}\n',
);
await Bun.write(
  childScriptPath,
  [
    'import os',
    'import sys',
    'import termios',
    'import tty',
    'previous = termios.tcgetattr(sys.stdin.fileno())',
    'tty.setraw(sys.stdin.fileno())',
    'try:',
    "    os.write(sys.stdout.fileno(), b'\\x1b[?1000h\\x1b[?1006h\\x1b[?1049hCHILD-MODE-READY\\r\\n')",
    '    wheel = os.read(sys.stdin.fileno(), 64)',
    `    open(${JSON.stringify(childInputPath)}, 'wb').write(wheel)`,
    '    os.read(sys.stdin.fileno(), 1)',
    'finally:',
    "    os.write(sys.stdout.fileno(), b'\\x1b[?1049l\\x1b[?1000l\\x1b[?1006l')",
    '    termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, previous)',
    '',
  ].join('\n'),
);

console.log('== harness terminal: deterministic emulator and panel tests ==');
const unitResult = Bun.spawnSync(
  [
    process.execPath,
    'test',
    'src/modules/terminal/',
    'src/modules/ui/PanelHost.test.ts',
  ],
  { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' },
);
HarnessSmoke.Class.requireCondition(
  unitResult.exitCode === 0,
  'terminal core and PanelHost unit tests',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: join(process.cwd(), 'fixtures'),
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
  },
});

try {
  console.log(
    '== harness terminal: status-bar button toggles the nested terminal ==',
  );
  const bootStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.ready === true',
    (status) => status.ready === true,
    15_000,
  );
  HarnessSmoke.Class.requireCondition(
    bootStatus.terminalVisible === false,
    'terminal is hidden at boot',
  );
  await driver.awaitQuiescence();
  const statusBarRow = Number(bootStatus.height) - 1;
  const terminalButtonStart = driver
    .snapshot()
    .rowText(statusBarRow)
    .lastIndexOf(' ❯ ');
  HarnessSmoke.Class.requireCondition(
    terminalButtonStart >= 0,
    'terminal status affordance is visibly present',
  );
  const terminalButtonColumn = terminalButtonStart + 1;
  driver.sendMouse({
    kind: 'press',
    column: terminalButtonColumn,
    row: statusBarRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: terminalButtonColumn,
    row: statusBarRow,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.terminalVisible === true',
    (status) => status.terminalVisible === true,
  );
  HarnessSmoke.Class.pass('status-bar terminal button opens the panel');
  driver.sendMouse({
    kind: 'press',
    column: terminalButtonColumn,
    row: statusBarRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: terminalButtonColumn,
    row: statusBarRow,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.terminalVisible === false',
    (status) => status.terminalVisible === false,
  );
  HarnessSmoke.Class.pass('second status-bar click hides the panel');

  console.log(
    '== harness terminal: F8 opens and focuses the real nested shell ==',
  );
  driver.sendKeys('F8');
  const openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.terminalVisible === true && status.terminalFocused === true && status.panelActiveContent === 'terminal' && Number(status.terminalColumns) > 0 && Number(status.terminalRows) > 0",
    (status) =>
      status.terminalVisible === true &&
      status.terminalFocused === true &&
      status.panelActiveContent === 'terminal' &&
      Number(status.terminalColumns) > 0 &&
      Number(status.terminalRows) > 0,
  );
  HarnessSmoke.Class.pass('F8 opened and focused the terminal content');
  const initialColumns = Number(openedStatus.terminalColumns);
  const initialRows = Number(openedStatus.terminalRows);
  const initialChildColumns = initialColumns - 4;
  const initialChildRows = initialRows - 2;

  driver.sendText('stty size');
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (snapshot) =>
      snapshot
        .textRows()
        .some((rowText) =>
          terminalSizePattern(initialChildRows, initialChildColumns).test(
            rowText,
          ),
        ),
    15_000,
  );
  HarnessSmoke.Class.pass(
    `nested shell sees padded pane size ${initialChildRows} ${initialChildColumns}`,
  );

  driver.sendText('tty');
  driver.sendKeys('Enter');
  await driver.awaitSnapshot((snapshot) =>
    snapshot.textRows().some((rowText) => /\/dev\/(?:pts\/|tty)/.test(rowText)),
  );
  HarnessSmoke.Class.pass('nested shell reports a real tty');

  driver.sendText('echo hello');
  driver.sendKeys('Enter');
  await driver.awaitSnapshot((snapshot) =>
    snapshot
      .textRows()
      .some(
        (rowText) => rowText.replace(/^[\s│|╎]+|[\s│|╎]+$/g, '') === 'hello',
      ),
  );
  HarnessSmoke.Class.pass('shell output completed the nested PTY round trip');

  console.log(
    '== harness terminal: divider drag resizes the nested child PTY ==',
  );
  const splitterRegions = openedStatus.splitterRegions as
    Record<string, { left: number; top: number; width: number }> | undefined;
  const bottomPanelSplitter = splitterRegions?.bottomPanel;
  if (!bottomPanelSplitter)
    throw new Error('Missing bottom-panel splitter region');
  const dividerRow = bottomPanelSplitter.top;
  const dividerTargetRow = dividerRow - 6;
  const dividerColumn =
    bottomPanelSplitter.left + Math.floor(bottomPanelSplitter.width / 2);
  driver.sendMouse({
    kind: 'press',
    column: dividerColumn,
    row: dividerRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: dividerColumn,
    row: dividerTargetRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: dividerColumn,
    row: dividerTargetRow,
    button: 'left',
  });
  const resizedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: Number(status.terminalRows) > initialRows',
    (status) => Number(status.terminalRows) > initialRows,
  );
  const resizedColumns = Number(resizedStatus.terminalColumns);
  const resizedRows = Number(resizedStatus.terminalRows);
  HarnessSmoke.Class.pass(
    `divider grew terminal rows ${initialRows} to ${resizedRows}`,
  );
  driver.sendText('stty size');
  driver.sendKeys('Enter');
  const resizedSizePattern = terminalSizePattern(
    resizedRows - 2,
    resizedColumns - 4,
  );
  await driver.awaitSnapshot((snapshot) =>
    snapshot.textRows().some((rowText) => resizedSizePattern.test(rowText)),
  );
  HarnessSmoke.Class.pass(
    'nested shell reflowed to the resized padded geometry',
  );

  console.log(
    '== harness terminal: scrollback momentum, thumb, reversal, and bottom-follow ==',
  );
  driver.sendText(
    'for index in {001..180}; do printf \'SCROLL-%s\\n\' "$index"; done',
  );
  driver.sendKeys('Enter');
  const longOutputStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the long terminal output reaches the live bottom with scrollback',
    (status) =>
      Number(status.terminalScrollContentRows) >
        Number(status.terminalScrollViewportRows) &&
      Number(status.terminalScrollTop) ===
        Number(status.terminalScrollContentRows) -
          Number(status.terminalScrollViewportRows),
  );
  const panelRectangle = bottomPanelSlot(longOutputStatus);
  const thumbSnapshot = await driver.awaitSnapshot(
    (candidate) => terminalThumbRowCount(candidate, panelRectangle) >= 2,
    5_000,
  );
  HarnessSmoke.Class.requireCondition(
    terminalThumbRowCount(thumbSnapshot, panelRectangle) >= 2,
    'overflowing terminal paints a visible multi-cell solid thumb',
  );
  const upwardScrollPositions = await collectTerminalScrollFrames(
    driver,
    statusPath,
    panelRectangle,
  );
  HarnessSmoke.Class.requireCondition(
    upwardScrollPositions.length >= 3 &&
      new Set(upwardScrollPositions).size >= 3,
    `terminal momentum crosses rows over multiple synchronized frames ` +
      `(${upwardScrollPositions.join(',')})`,
  );
  HarnessSmoke.Class.requireCondition(
    upwardScrollPositions.every(
      (position, positionIndex) =>
        positionIndex === 0 ||
        position <= (upwardScrollPositions[positionIndex - 1] ?? position),
    ),
    'upward terminal glide is monotonic while its impulse decays',
  );
  const scrollTopBeforeReversal = Number(
    HarnessSmoke.Class.readStatus(statusPath).terminalScrollTop,
  );
  let reversalFrame = driver.awaitNextCompletedFrameSnapshot(2_000);
  driver.sendMouse({
    kind: 'wheel',
    column: panelRectangle.left + Math.floor(panelRectangle.width / 2),
    row: panelRectangle.top + 6,
    direction: 'down',
  });
  const reversalPositions = [scrollTopBeforeReversal];
  let observedReversal = false;
  for (
    let reversalFrameIndex = 0;
    reversalFrameIndex < 10;
    reversalFrameIndex += 1
  ) {
    await reversalFrame;
    const position = Number(
      HarnessSmoke.Class.readStatus(statusPath).terminalScrollTop,
    );
    reversalPositions.push(position);
    const previousPosition =
      reversalPositions[reversalPositions.length - 2] ?? position;
    if (position > previousPosition) {
      observedReversal = true;
      break;
    }
    reversalFrame = driver.awaitNextCompletedFrameSnapshot(2_000);
  }
  HarnessSmoke.Class.requireCondition(
    observedReversal,
    `contrary notch reverses terminal row direction within synchronized frames ` +
      `(${reversalPositions.join(',')})`,
  );
  await HarnessSmoke.Class.awaitFrameSilence(driver, 200, 5_000);
  const scrolledStatus = HarnessSmoke.Class.readStatus(statusPath);
  HarnessSmoke.Class.requireCondition(
    Number(scrolledStatus.terminalScrollTop) <
      Number(scrolledStatus.terminalScrollContentRows) -
        Number(scrolledStatus.terminalScrollViewportRows),
    'terminal remains above the live bottom after momentum settles',
  );
  driver.sendText('echo NEW-OUTPUT-RETURNS-BOTTOM');
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('NEW-OUTPUT-RETURNS-BOTTOM') !== null,
  );
  const bottomFollowStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'fresh terminal output returns scrollback to the live bottom',
    (status) =>
      Number(status.terminalScrollTop) ===
      Number(status.terminalScrollContentRows) -
        Number(status.terminalScrollViewportRows),
  );
  HarnessSmoke.Class.pass(
    `fresh output returned terminal to bottom ` +
      `${Number(bottomFollowStatus.terminalScrollTop)}`,
  );

  console.log(
    '== harness terminal: child modes own wheel bytes, not host scrollback ==',
  );
  driver.sendText(`python3 ${childScriptPath}`);
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('CHILD-MODE-READY') !== null,
  );
  const childModeStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'mouse tracking and alternate screen make the child the wheel owner',
    (status) => status.terminalWheelForwardedToChild === true,
  );
  const scrollTopBeforeChildWheel = Number(childModeStatus.terminalScrollTop);
  const scrollContentRowsBeforeChildWheel = Number(
    childModeStatus.terminalScrollContentRows,
  );
  driver.sendMouse({
    kind: 'wheel',
    column: panelRectangle.left + Math.floor(panelRectangle.width / 2),
    row: panelRectangle.top + 6,
    direction: 'up',
  });
  const childWheelBytes = await awaitFileBytes(childInputPath);
  const childWheelText = new TextDecoder().decode(childWheelBytes);
  HarnessSmoke.Class.requireCondition(
    /^\x1b\[<64;\d+;\d+M$/.test(childWheelText),
    `child received one SGR wheel event ${JSON.stringify(childWheelText)}`,
  );
  const afterChildWheelStatus = HarnessSmoke.Class.readStatus(statusPath);
  HarnessSmoke.Class.requireCondition(
    Number(afterChildWheelStatus.terminalScrollTop) ===
      scrollTopBeforeChildWheel &&
      Number(afterChildWheelStatus.terminalScrollContentRows) ===
        scrollContentRowsBeforeChildWheel,
    'child-owned wheel leaves host scroll position and extent unchanged',
  );
  driver.sendText('q');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the child exits alternate-screen and mouse-tracking modes',
    (status) => status.terminalWheelForwardedToChild === false,
  );

  const clockSnapshot = await driver.awaitGridCondition(
    'the status-bar minute clock renders as HH MM',
    (candidate) =>
      candidate
        .textRows()
        .some((rowText) => /[0-2][0-9]:[0-5][0-9]/.test(rowText)),
  );
  HarnessSmoke.Class.requireCondition(
    clockSnapshot
      .textRows()
      .some((rowText) => /[0-2][0-9]:[0-5][0-9]/.test(rowText)),
    'status-bar minute clock renders HH:MM',
  );
  await HarnessSmoke.Class.awaitFrameSilence(driver);
  await driver.assertAtMostOneCompleteFrameEmittedFor(4_000);
  HarnessSmoke.Class.pass(
    'terminal-open idle window emits at most the minute-clock frame',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the terminal remains focused before quit',
    (status) => status.terminalFocused === true,
  );
  HarnessSmoke.Class.pass('terminal remains focused before quit');

  driver.sendKeys('Control+q');
  HarnessSmoke.Class.requireCondition(
    (await driver.exitCode()) === 0,
    'Ctrl+Q quits from the terminal',
  );
  const exitedSnapshot = await driver.awaitGridCondition(
    'the application screen is absent after quit',
    (candidate) =>
      !candidate.textRows().some((rowText) => /Files/.test(rowText)),
  );
  HarnessSmoke.Class.requireCondition(
    !exitedSnapshot.textRows().some((rowText) => /Files/.test(rowText)),
    'the application screen is gone after quit',
  );
  console.log('smoke-terminal-harness: ALL-PASS');
} finally {
  driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
