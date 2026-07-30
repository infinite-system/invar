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
import { ThemePalettes } from '../../src/modules/theme/ThemePalettes';
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
  const thumbBackground = Number.parseInt(
    ThemePalettes.Class.DARK.dim.slice(1),
    16,
  );
  for (
    let scrollBarColumn = rightBorderColumn - 1;
    scrollBarColumn >= rightBorderColumn - 4;
    scrollBarColumn -= 1
  ) {
    let longestThumbRun = 0;
    let currentThumbRun = 0;
    for (
      let row = panelRectangle.top;
      row < panelRectangle.top + panelRectangle.height;
      row += 1
    ) {
      const cell = snapshot.cell(row, scrollBarColumn);
      if (
        cell?.characters === ' ' &&
        cell.isBackgroundRgb &&
        cell.background === thumbBackground
      ) {
        currentThumbRun += 1;
      } else {
        longestThumbRun = Math.max(longestThumbRun, currentThumbRun);
        currentThumbRun = 0;
      }
    }
    longestThumbRun = Math.max(longestThumbRun, currentThumbRun);
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
  let previousStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the terminal scroll position and settled frame are published before wheel input',
    (status) =>
      Number.isFinite(Number(status.terminalScrollTop)) &&
      Number.isFinite(Number(status.frame)),
  );
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
    const previousFrame = Number(previousStatus.frame);
    const previousScrollTop = Number(previousStatus.terminalScrollTop);
    try {
      previousStatus = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'terminal momentum publishes a new settled frame and row offset',
        (status) =>
          Number(status.frame) > previousFrame &&
          Number(status.terminalScrollTop) !== previousScrollTop,
        2_000,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('Timed out waiting for terminal momentum')
      ) {
        break;
      }
      throw error;
    }
    scrollPositions.push(Number(previousStatus.terminalScrollTop));
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

async function observeTerminalScrollStateRemainsUnchangedFor(
  statusPath: string,
  expectedScrollTop: number,
  expectedContentRows: number,
  observationMilliseconds: number,
): Promise<StatusSnapshot> {
  const deadline = performance.now() + observationMilliseconds;
  let status = HarnessSmoke.Class.readStatus(statusPath);
  let scrollStateRemainedUnchanged = true;
  while (performance.now() < deadline) {
    status = HarnessSmoke.Class.readStatus(statusPath);
    if (
      Number(status.terminalScrollTop) !== expectedScrollTop ||
      Number(status.terminalScrollContentRows) !== expectedContentRows
    ) {
      scrollStateRemainedUnchanged = false;
      break;
    }
    await Bun.sleep(Math.min(20, deadline - performance.now()));
  }
  HarnessSmoke.Class.requireCondition(
    scrollStateRemainedUnchanged,
    'the child-owned wheel observation window preserves host scroll state',
  );
  return status;
}

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-terminal-harness-home-'));

const statusPath = join(homeDirectory, 'status.json');

const childClickInputPath = join(homeDirectory, 'click-input.bin');

const childWheelInputPath = join(homeDirectory, 'wheel-input.bin');

const childMouseOffInputPath = join(homeDirectory, 'mouse-off-input.bin');

const childScriptPath = join(homeDirectory, 'child-io-fixture.py');

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
    "    if sys.argv[1] == 'mouse-on':",
    "        os.write(sys.stdout.fileno(), b'\\x1b[?1000h\\x1b[?1006h\\x1b[?1049h\\x1b[HMOUSE-TARGET\\r\\nCHILD-MODE-READY')",
    "        click = b''",
    "        while not click.endswith(b'm'):",
    '            click += os.read(sys.stdin.fileno(), 64)',
    `        open(${JSON.stringify(childClickInputPath)}, 'wb').write(click)`,
    '        wheel = os.read(sys.stdin.fileno(), 64)',
    `        open(${JSON.stringify(childWheelInputPath)}, 'wb').write(wheel)`,
    '        os.read(sys.stdin.fileno(), 1)',
    "        os.write(sys.stdout.fileno(), b'\\x1b[?1049l\\x1b[?1000l\\x1b[?1006l')",
    '    else:',
    "        os.write(sys.stdout.fileno(), b'MOUSE-OFF-READY')",
    '        plain_input = os.read(sys.stdin.fileno(), 64)',
    `        open(${JSON.stringify(childMouseOffInputPath)}, 'wb').write(plain_input)`,
    'finally:',
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
  await driver.awaitScreenChange();
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
    '== harness terminal: Ctrl+J opens and focuses the real nested shell ==',
  );
  driver.sendKeys('Control+j');
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
  HarnessSmoke.Class.pass('Ctrl+J opened and focused the terminal content');
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
  const reversalBaselineStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the terminal scroll position is published before reversal',
    (status) =>
      Number.isFinite(Number(status.terminalScrollTop)) &&
      Number.isFinite(Number(status.frame)),
  );
  const scrollTopBeforeReversal = Number(
    reversalBaselineStatus.terminalScrollTop,
  );
  driver.sendMouse({
    kind: 'wheel',
    column: panelRectangle.left + Math.floor(panelRectangle.width / 2),
    row: panelRectangle.top + 6,
    direction: 'down',
  });
  const reversalPositions = [scrollTopBeforeReversal];
  let previousReversalFrame = Number(reversalBaselineStatus.frame);
  let previousReversalPosition = scrollTopBeforeReversal;
  const reversalStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the contrary notch publishes a downward terminal row reversal',
    (status) => {
      const frame = Number(status.frame);
      const position = Number(status.terminalScrollTop);
      if (frame <= previousReversalFrame || !Number.isFinite(position)) {
        return false;
      }
      reversalPositions.push(position);
      const observedDownwardTransition = position > previousReversalPosition;
      const remainsAboveLiveBottom =
        position <
        Number(status.terminalScrollContentRows) -
          Number(status.terminalScrollViewportRows);
      previousReversalFrame = frame;
      previousReversalPosition = position;
      return observedDownwardTransition && remainsAboveLiveBottom;
    },
    20_000,
  );
  const observedReversal =
    Number(reversalStatus.terminalScrollTop) >
    (reversalPositions[reversalPositions.length - 2] ??
      Number(reversalStatus.terminalScrollTop));
  HarnessSmoke.Class.requireCondition(
    observedReversal,
    `contrary notch reverses terminal row direction within synchronized frames ` +
      `(${reversalPositions.join(',')})`,
  );
  const scrolledStatus = reversalStatus;
  HarnessSmoke.Class.requireCondition(
    Number(scrolledStatus.terminalScrollTop) <
      Number(scrolledStatus.terminalScrollContentRows) -
        Number(scrolledStatus.terminalScrollViewportRows),
    'terminal remains above the live bottom after wheel reversal',
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
    '== harness terminal: child cells own click and wheel bytes, not host input ==',
  );
  driver.sendText(`python3 ${childScriptPath} mouse-on`);
  driver.sendKeys('Enter');
  const mouseTargetSnapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('CHILD-MODE-READY') !== null,
  );
  const mouseTarget = mouseTargetSnapshot.findText('MOUSE-TARGET');
  if (!mouseTarget) throw new Error('The child mouse target disappeared');
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
  driver.sendMouseClick({
    column: mouseTarget.column + 3,
    row: mouseTarget.row,
    button: 'left',
  });
  const childClickBytes = await awaitFileBytes(childClickInputPath);
  const childClickText = new TextDecoder().decode(childClickBytes);
  HarnessSmoke.Class.requireCondition(
    childClickText === '\x1b[<0;4;1M\x1b[<0;4;1m',
    `child received exact SGR click ${JSON.stringify(childClickText)}`,
  );
  driver.sendMouse({
    kind: 'wheel',
    column: panelRectangle.left + Math.floor(panelRectangle.width / 2),
    row: panelRectangle.top + 6,
    direction: 'up',
  });
  const childWheelBytes = await awaitFileBytes(childWheelInputPath);
  const childWheelText = new TextDecoder().decode(childWheelBytes);
  HarnessSmoke.Class.requireCondition(
    /^\x1b\[<64;\d+;\d+M$/.test(childWheelText),
    `child received one SGR wheel event ${JSON.stringify(childWheelText)}`,
  );
  const afterChildWheelStatus =
    await observeTerminalScrollStateRemainsUnchangedFor(
      statusPath,
      scrollTopBeforeChildWheel,
      scrollContentRowsBeforeChildWheel,
      250,
    );
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

  console.log('== harness terminal: mouse mode off keeps clicks in Invar ==');
  driver.sendText(`python3 ${childScriptPath} mouse-off`);
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('MOUSE-OFF-READY') !== null,
  );
  const mouseOffBaseline = HarnessSmoke.Class.readStatus(statusPath);
  const mouseOffTarget = driver.snapshot().findText('MOUSE-OFF-READY');
  if (!mouseOffTarget) throw new Error('The mouse-off target disappeared');
  driver.sendMouseClick({
    column: mouseOffTarget.column + 3,
    row: mouseOffTarget.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'mouse-mode-off click completes an Invar frame before keyboard input',
    (status) => Number(status.frame) > Number(mouseOffBaseline.frame),
  );
  driver.sendText('q');
  const mouseOffInput = await awaitFileBytes(childMouseOffInputPath);
  HarnessSmoke.Class.requireCondition(
    new TextDecoder().decode(mouseOffInput) === 'q',
    'mouse mode off writes no pointer bytes to the child',
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
