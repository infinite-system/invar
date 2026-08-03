#!/usr/bin/env bun
// Byte-level port of the integrated-terminal smoke: Invar owns a nested shell PTY inside the
// harness PTY, and the production emulator remains the screen oracle for the full round trip.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Child synchronized updates commit as one repaint (src/modules/terminal/terminal.invariants.md)
import { mkdirSync, mkdtempSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import type { FrameDump } from '../../src/modules/system/FrameProbe';
import {
  ThemePalettes,
  type Palette,
} from '../../src/modules/theme/ThemePalettes';
import { tasksTreeStamp } from '../tasks/tasks-status';
import { DiagnosticLog } from './DiagnosticLog';
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

interface TaskPaneSizeObservation {
  readonly columns: number;
  readonly rows: number;
  readonly resizeEventCount: number;
  readonly visibleRowNumbers: readonly number[];
}

function taskPaneSizeObservation(
  snapshot: HarnessSnapshot.Model,
  paneLabel: string,
): TaskPaneSizeObservation | null {
  const pattern = new RegExp(
    `${paneLabel}\\s+(\\d+)\\/(\\d+)\\s+(\\d+)x(\\d+)\\s+E(\\d+)`,
    'g',
  );
  const matches = snapshot
    .textRows()
    .flatMap((rowText) => [...rowText.matchAll(pattern)]);
  const lastMatch = matches.at(-1);
  if (!lastMatch) return null;
  return {
    columns: Number(lastMatch[3]),
    rows: Number(lastMatch[4]),
    resizeEventCount: Number(lastMatch[5]),
    visibleRowNumbers: [
      ...new Set(matches.map((match) => Number(match[1]))),
    ].sort((left, right) => left - right),
  };
}

function taskPaneFrameIsComplete(
  snapshot: HarnessSnapshot.Model,
  paneLabel: string,
  columns: number,
  rows: number,
  minimumResizeEventCount: number,
): boolean {
  const observation = taskPaneSizeObservation(snapshot, paneLabel);
  return (
    observation !== null &&
    observation.columns === columns &&
    observation.rows === rows &&
    observation.resizeEventCount >= minimumResizeEventCount &&
    observation.visibleRowNumbers.length === rows &&
    observation.visibleRowNumbers[0] === 1 &&
    observation.visibleRowNumbers.at(-1) === rows
  );
}

function panelCellColumns(status: StatusSnapshot): number[] {
  return Array.isArray(status.panelCellColumns)
    ? status.panelCellColumns.map(Number)
    : [];
}

function panelViewportRows(status: StatusSnapshot): number {
  return Number(status.panelRows ?? 0);
}

// invariant: Terminal bytes cross exactly one backend seam (src/modules/terminal/terminal.invariants.md)
async function driveTaskPaneSizeProbe(): Promise<void> {
  const workspaceRoot = mkdtempSync(
    join(tmpdir(), 'tui-terminal-task-pane-workspace-'),
  );
  const taskHomeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-terminal-task-pane-home-'),
  );
  const taskStatusPath = join(taskHomeDirectory, 'status.json');
  const probeScriptPath = join(taskHomeDirectory, 'pty-size-probe.py');
  mkdirSync(join(workspaceRoot, '.invar'), { recursive: true });
  await Bun.write(
    probeScriptPath,
    [
      'import os',
      'import signal',
      'import sys',
      'pane_label = sys.argv[1]',
      'resize_event_count = 0',
      'def draw_frame():',
      '    terminal_size = os.get_terminal_size(sys.stdout.fileno())',
      '    columns = max(1, terminal_size.columns)',
      '    rows = max(1, terminal_size.lines)',
      '    row_number_width = len(str(rows))',
      '    frame_lines = []',
      '    for row_number in range(1, rows + 1):',
      '        label = f"{pane_label} {row_number:0{row_number_width}d}/{rows} {columns}x{rows} E{resize_event_count}"',
      '        frame_lines.append(label[:columns - 1].ljust(columns - 1))',
      '    sys.stdout.write("\\x1b[2J\\x1b[H" + "\\r\\n".join(frame_lines))',
      '    sys.stdout.flush()',
      'def handle_window_change(_signal_number, _frame):',
      '    global resize_event_count',
      '    resize_event_count += 1',
      '    draw_frame()',
      'signal.signal(signal.SIGWINCH, handle_window_change)',
      'sys.stdout.write("\\x1b[?1049h\\x1b[?25l")',
      'draw_frame()',
      'while True:',
      '    signal.pause()',
      '',
    ].join('\n'),
  );
  await Bun.write(
    join(workspaceRoot, '.invar', 'tasks.json'),
    `${JSON.stringify(
      {
        version: '2.0.0',
        tasks: ['A', 'B'].map((paneLabel) => ({
          label: `PTY Probe ${paneLabel}`,
          type: 'shell',
          command: 'python3',
          args: [probeScriptPath, paneLabel],
          problemMatcher: [],
          presentation: {
            group: 'pty-size-probes',
            panel: 'dedicated',
          },
          runOptions: { runOn: 'folderOpen' },
        })),
      },
      null,
      2,
    )}\n`,
  );

  const taskDriver = new PtyTestDriver.Class({
    workspaceRoot,
    columns: 120,
    rows: 40,
    homeDirectory: taskHomeDirectory,
    environment: {
      TUI_STATUS_PATH: taskStatusPath,
      INVAR_AGENT_BACKEND: 'echo',
      INVAR_TEST_SUPPRESS_BUILT_IN_TASK: '0',
      INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS: '0',
    },
  });
  try {
    const initialStatus = await HarnessSmoke.Class.awaitStatus(
      taskDriver,
      taskStatusPath,
      'two task PTYs launch in one split panel group',
      (status) =>
        status.ready === true &&
        Array.isArray(status.taskLaunchedLabels) &&
        status.taskLaunchedLabels.length === 2 &&
        panelCellColumns(status).length === 2,
      20_000,
    );
    const initialPaneColumns = panelCellColumns(initialStatus).map((columns) =>
      Math.max(1, columns - 4),
    );
    // Split content reserves one first row for its frame-close button before terminal output.
    const initialPaneRows = Math.max(1, panelViewportRows(initialStatus) - 1);
    const initialSnapshot = await taskDriver.awaitGridCondition(
      'both task guests report and fill their initial visible split grids',
      (snapshot) =>
        taskPaneFrameIsComplete(
          snapshot,
          'A',
          initialPaneColumns[0] ?? 1,
          initialPaneRows,
          0,
        ) &&
        taskPaneFrameIsComplete(
          snapshot,
          'B',
          initialPaneColumns[1] ?? 1,
          initialPaneRows,
          0,
        ),
      15_000,
    );
    const initialAResizeEventCount =
      taskPaneSizeObservation(initialSnapshot, 'A')?.resizeEventCount ?? 0;
    const initialBResizeEventCount =
      taskPaneSizeObservation(initialSnapshot, 'B')?.resizeEventCount ?? 0;

    taskDriver.resize(100, 30);
    const resizedStatus = await HarnessSmoke.Class.awaitStatus(
      taskDriver,
      taskStatusPath,
      'the task-pane drive publishes the resized outer grid',
      (status) =>
        status.width === 100 &&
        status.height === 30 &&
        panelCellColumns(status).length === 2,
    );
    const resizedPaneColumns = panelCellColumns(resizedStatus).map((columns) =>
      Math.max(1, columns - 4),
    );
    const resizedPaneRows = Math.max(1, panelViewportRows(resizedStatus) - 1);
    await taskDriver.awaitGridCondition(
      'both task guests report and fill their resized visible split grids',
      (snapshot) =>
        taskPaneFrameIsComplete(
          snapshot,
          'A',
          resizedPaneColumns[0] ?? 1,
          resizedPaneRows,
          initialAResizeEventCount + 1,
        ) &&
        taskPaneFrameIsComplete(
          snapshot,
          'B',
          resizedPaneColumns[1] ?? 1,
          resizedPaneRows,
          initialBResizeEventCount + 1,
        ),
      5_000,
    );
    HarnessSmoke.Class.pass(
      `task guests resized to ${resizedPaneColumns.join(',')}x${resizedPaneRows} and exposed rows 1 through ${resizedPaneRows}`,
    );
  } finally {
    await taskDriver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(workspaceRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(taskHomeDirectory);
  }
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
  const rightmostColumn = panelRectangle.left + panelRectangle.width - 1;
  let longestThumbRun = 0;
  for (
    let scrollBarColumn = rightmostColumn;
    scrollBarColumn >= rightmostColumn - 4;
    scrollBarColumn -= 1
  ) {
    let currentThumbRun = 0;
    let currentThumbBackground: number | null = null;
    for (
      let row = panelRectangle.top;
      row < panelRectangle.top + panelRectangle.height;
      row += 1
    ) {
      const cell = snapshot.cell(row, scrollBarColumn);
      const background =
        cell?.characters === ' ' ? (cell.background ?? null) : null;
      if (background !== null && currentThumbBackground === background) {
        currentThumbRun += 1;
      } else {
        longestThumbRun = Math.max(longestThumbRun, currentThumbRun);
        currentThumbBackground = background;
        currentThumbRun = background === null ? 0 : 1;
      }
    }
    longestThumbRun = Math.max(longestThumbRun, currentThumbRun);
  }
  return longestThumbRun;
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
    if (await file.exists()) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length > 0) return bytes;
    }
    await Bun.sleep(10);
  }
  throw new Error(`Timed out waiting for child input capture at ${filePath}`);
}

async function awaitFrameDump(
  framePath: string,
  predicate: (frameDump: FrameDump) => boolean,
  description: string,
): Promise<FrameDump> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const frameFile = Bun.file(framePath);
    if (await frameFile.exists()) {
      const frameDump = (await frameFile.json()) as FrameDump;
      if (predicate(frameDump)) return frameDump;
    }
    await Bun.sleep(10);
  }
  throw new Error(`Timed out waiting for FrameProbe: ${description}`);
}

function codePointSequenceStart(
  codePoints: readonly string[],
  markerCodePoints: readonly string[],
): number {
  for (
    let startIndex = 0;
    startIndex <= codePoints.length - markerCodePoints.length;
    startIndex += 1
  ) {
    if (
      markerCodePoints.every(
        (codePoint, markerIndex) =>
          codePoints[startIndex + markerIndex] === codePoint,
      )
    ) {
      return startIndex;
    }
  }
  return -1;
}

function frameLaneAt(
  frameDump: FrameDump,
  marker: string,
  markerCellOffset: number,
  lane: 'fg' | 'bg',
): string {
  for (const row of frameDump.rows) {
    const markerStart = codePointSequenceStart(
      Array.from(row.text),
      Array.from(marker),
    );
    if (markerStart >= 0) {
      return row[lane][markerStart + markerCellOffset] ?? 'missing';
    }
  }
  return 'marker-missing';
}

function terminalBodyText(
  snapshot: HarnessSnapshot.Model,
  panelRectangle: Rectangle,
): string {
  const endRowExclusive = Math.min(
    snapshot.rows,
    panelRectangle.top + panelRectangle.height,
  );
  const endColumnExclusive = Math.min(
    snapshot.columns,
    panelRectangle.left + panelRectangle.width,
  );
  return snapshot
    .textRows()
    .slice(panelRectangle.top, endRowExclusive)
    .map((rowText) => rowText.slice(panelRectangle.left, endColumnExclusive))
    .join('\n');
}

function requireChildColorMatrix(
  frameDump: FrameDump,
  observationName: string,
  palette: Palette,
): void {
  const ansiColors = [
    palette.terminalAnsiBlack,
    '#123456',
    palette.terminalAnsiGreen,
    palette.terminalAnsiYellow,
    palette.terminalAnsiBlue,
    palette.terminalAnsiMagenta,
    palette.terminalAnsiCyan,
    palette.terminalAnsiWhite,
    palette.terminalAnsiBrightBlack,
    palette.terminalAnsiBrightRed,
    palette.terminalAnsiBrightGreen,
    palette.terminalAnsiBrightYellow,
    palette.terminalAnsiBrightBlue,
    palette.terminalAnsiBrightMagenta,
    palette.terminalAnsiBrightCyan,
    palette.terminalAnsiBrightWhite,
  ].map((color) => {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    return `${red},${green},${blue},255`;
  });
  for (let colorIndex = 0; colorIndex < ansiColors.length; colorIndex += 1) {
    HarnessSmoke.Class.requireCondition(
      frameLaneAt(frameDump, 'FG16-0123456789ABCDEF', 5 + colorIndex, 'fg') ===
        ansiColors[colorIndex],
      `${observationName} keeps ANSI foreground ${colorIndex} exact`,
    );
    HarnessSmoke.Class.requireCondition(
      frameLaneAt(frameDump, 'BG16-0123456789ABCDEF', 5 + colorIndex, 'bg') ===
        ansiColors[colorIndex],
      `${observationName} keeps ANSI background ${colorIndex} exact`,
    );
  }
  HarnessSmoke.Class.requireCondition(
    frameLaneAt(frameDump, 'DEFAULT-D', 8, 'fg') ===
      rgbaLane(palette.terminalForeground) &&
      frameLaneAt(frameDump, 'DEFAULT-D', 8, 'bg') ===
        rgbaLane(palette.terminalBackground),
    `${observationName} derives the terminal default foreground and background from theme data`,
  );
  HarnessSmoke.Class.requireCondition(
    frameLaneAt(frameDump, 'OSC4-O', 5, 'fg') === '18,52,86,255',
    `${observationName} keeps the child OSC 4 ANSI override exact`,
  );
  HarnessSmoke.Class.requireCondition(
    frameLaneAt(frameDump, 'INDEX-I', 6, 'fg') === '255,0,0,255' &&
      frameLaneAt(frameDump, 'INDEX-I', 6, 'bg') === '0,0,255,255',
    `${observationName} keeps 256-color foreground and background exact`,
  );
  HarnessSmoke.Class.requireCondition(
    frameLaneAt(frameDump, 'TRUE-T', 5, 'fg') === '18,52,86,255' &&
      frameLaneAt(frameDump, 'TRUE-T', 5, 'bg') === '101,67,33,255',
    `${observationName} keeps truecolor foreground and background exact`,
  );
}

function rgbaLane(color: string): string {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `${red},${green},${blue},255`;
}

async function selectSettingByVisibleLabel(
  driver: PtyTestDriver.Model,
  statusPath: string,
  settingLabel: string,
): Promise<void> {
  let selectionStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the selected settings label is published before navigation',
    (status) => typeof status.settingsSelectedLabel === 'string',
  );
  for (let navigationStep = 0; navigationStep < 40; navigationStep += 1) {
    if (selectionStatus.settingsSelectedLabel === settingLabel) break;
    const previousSelectedLabel = selectionStatus.settingsSelectedLabel;
    driver.sendKeys('Down');
    selectionStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `settings navigation advances toward ${settingLabel}`,
      (status) => status.settingsSelectedLabel !== previousSelectedLabel,
    );
  }
  HarnessSmoke.Class.requireCondition(
    selectionStatus.settingsSelectedLabel === settingLabel,
    `${settingLabel} is discovered by its live settings label`,
  );
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

const framePath = join(homeDirectory, 'frame.json');

const childClickInputPath = join(homeDirectory, 'click-input.bin');

const childWheelInputPath = join(homeDirectory, 'wheel-input.bin');

const childMouseOffInputPath = join(homeDirectory, 'mouse-off-input.bin');

const childScriptPath = join(homeDirectory, 'child-io-fixture.py');

const tasksWatchTasksRoot = join(homeDirectory, 'tasks-watch-tasks');

const foregroundColorFixture = Array.from({ length: 16 }, (_, colorIndex) => {
  const ansiCode = colorIndex < 8 ? 30 + colorIndex : 90 + (colorIndex - 8);
  return `\x1b[${ansiCode}m${colorIndex.toString(16).toUpperCase()}`;
}).join('');

const backgroundColorFixture = Array.from({ length: 16 }, (_, colorIndex) => {
  const ansiCode = colorIndex < 8 ? 40 + colorIndex : 100 + (colorIndex - 8);
  return `\x1b[${ansiCode}m${colorIndex.toString(16).toUpperCase()}`;
}).join('');

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
    "        os.write(sys.stdout.fileno(), b'\\x1b]4;1;rgb:12/34/56\\x1b\\\\\\x1b[?1000h\\x1b[?1006h\\x1b[?1049h\\x1b[HMOUSE-TARGET\\r\\n')",
    "        os.write(sys.stdout.fileno(), b'DEFAULT-D\\r\\n')",
    "        os.write(sys.stdout.fileno(), b'OSC4-\\x1b[31mO\\x1b[0m\\r\\n')",
    `        os.write(sys.stdout.fileno(), ${JSON.stringify(`FG16-${foregroundColorFixture}\x1b[0m\r\n`)}.encode('latin1'))`,
    `        os.write(sys.stdout.fileno(), ${JSON.stringify(`BG16-${backgroundColorFixture}\x1b[0m\r\n`)}.encode('latin1'))`,
    "        os.write(sys.stdout.fileno(), b'INDEX-\\x1b[38;5;196;48;5;21mI\\x1b[0m\\r\\n')",
    "        os.write(sys.stdout.fileno(), b'TRUE-\\x1b[38;2;18;52;86;48;2;101;67;33mT\\x1b[0m\\r\\n')",
    "        os.write(sys.stdout.fileno(), b'CHILD-MODE-READY')",
    "        click = b''",
    "        while not click.endswith(b'm'):",
    '            click += os.read(sys.stdin.fileno(), 64)',
    `        open(${JSON.stringify(childClickInputPath)}, 'wb').write(click)`,
    '        wheel = os.read(sys.stdin.fileno(), 64)',
    `        open(${JSON.stringify(childWheelInputPath)}, 'wb').write(wheel)`,
    '        os.read(sys.stdin.fileno(), 1)',
    "        os.write(sys.stdout.fileno(), b'\\x1b]104;1\\x1b\\\\\\x1b[?1049l\\x1b[?1000l\\x1b[?1006l')",
    '    else:',
    "        os.write(sys.stdout.fileno(), b'MOUSE-OFF-READY')",
    '        plain_input = os.read(sys.stdin.fileno(), 64)',
    `        open(${JSON.stringify(childMouseOffInputPath)}, 'wb').write(plain_input)`,
    'finally:',
    '    termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, previous)',
    '',
  ].join('\n'),
);

for (const taskState of ['active', 'in-progress', 'completed', 'retired']) {
  mkdirSync(join(tasksWatchTasksRoot, taskState), { recursive: true });
}
const tasksWatchFixtureFolders: string[] = [];
for (const taskNumber of [997, 998, 999]) {
  const folderName =
    taskNumber === 997
      ? '997-tasks-watch-motion-fixture-with-a-long-row-PHANTOM-TAIL-must-not-wrap'
      : `${taskNumber}-tasks-watch-shrink-fixture`;
  const fixtureFolder = join(tasksWatchTasksRoot, 'in-progress', folderName);
  tasksWatchFixtureFolders.push(fixtureFolder);
  mkdirSync(fixtureFolder);
  await Bun.write(
    join(fixtureFolder, `task-${folderName}.md`),
    [
      '# Task watch motion fixture',
      '',
      'State: IN-PROGRESS',
      'Engine: codex',
      'Model: fixture',
      'Effort: high',
      '',
    ].join('\n'),
  );
}

const tasksWatchScriptPath = join(
  process.cwd(),
  'scripts',
  'tasks',
  'tasks-status.ts',
);
const directTasksWatchDriver = new PtyTestDriver.Class({
  workspaceRoot: homeDirectory,
  columns: 60,
  rows: 30,
  command: [process.execPath, tasksWatchScriptPath, 'watch'],
  environment: { INVAR_TASKS_ROOT: tasksWatchTasksRoot },
});
try {
  await directTasksWatchDriver.awaitGridCondition(
    'the direct tasks watch paints all three fixture tasks',
    (snapshot) =>
      snapshot.findText('IN-PROGRESS (3)') !== null &&
      snapshot.findText('#997') !== null,
  );
  for (const fixtureFolder of tasksWatchFixtureFolders.slice(1)) {
    renameSync(
      fixtureFolder,
      join(tasksWatchTasksRoot, 'completed', basename(fixtureFolder)),
    );
  }
  const directTasksWatchShrinkSnapshot =
    await directTasksWatchDriver.awaitGridCondition(
      'the direct tasks watch paints the shrunken one-task model',
      (snapshot) =>
        snapshot.findText('IN-PROGRESS (1)') !== null &&
        snapshot.findText('2 completed') !== null,
    );
  const directTasksWatchShrinkText = directTasksWatchShrinkSnapshot
    .textRows()
    .join('\n');
  HarnessSmoke.Class.requireCondition(
    (directTasksWatchShrinkText.match(/#997/g) ?? []).length === 1 &&
      !directTasksWatchShrinkText.includes('#998') &&
      !directTasksWatchShrinkText.includes('#999'),
    'direct tasks:watch paints exactly the one model task after a shrink',
  );
  HarnessSmoke.Class.requireCondition(
    !directTasksWatchShrinkText.includes('PHANTOM-TAIL'),
    'direct tasks:watch leaves no autowrapped physical tail after a shrink',
  );
} finally {
  await directTasksWatchDriver.dispose();
  for (const fixtureFolder of tasksWatchFixtureFolders.slice(1)) {
    renameSync(
      join(tasksWatchTasksRoot, 'completed', basename(fixtureFolder)),
      fixtureFolder,
    );
  }
}

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

console.log(
  '== harness terminal: task PTYs match their visible split grids after resize ==',
);
await driveTaskPaneSizeProbe();

const driver = new PtyTestDriver.Class({
  workspaceRoot: join(process.cwd(), 'fixtures'),
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    TUI_FRAME_PATH: framePath,
    TUI_FRAME_DUMP: '1',
    INVAR_COPY_PATH_TELEMETRY: '1',
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
    "status condition: status.terminalVisible === true && status.terminalFocused === true && status.panelActiveContentKind === 'terminal' && Number(status.terminalColumns) > 0 && Number(status.terminalRows) > 0",
    (status) =>
      status.terminalVisible === true &&
      status.terminalFocused === true &&
      status.panelActiveContentKind === 'terminal' &&
      Number(status.terminalColumns) > 0 &&
      Number(status.terminalRows) > 0,
  );
  HarnessSmoke.Class.pass('Ctrl+J opened and focused the terminal content');
  const initialColumns = Number(openedStatus.terminalColumns);
  const initialRows = Number(openedStatus.terminalRows);
  const initialChildColumns = initialColumns - 4;
  const initialChildRows = initialRows - 1;

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
  // The trimmed set is every glyph the chrome can paint at a row's two ends: pane borders,
  // the terminal's own rules, and BOTH splitter marks. A vertical splitter used to paint a
  // blank cell, so plain whitespace trimming reached the shell text through it; it now paints
  // the slim mark, which the old set left in place and broke the exact-match compare.
  await driver.awaitSnapshot((snapshot) =>
    snapshot
      .textRows()
      .some(
        (rowText) =>
          rowText.replace(/^[\s│|╎┃━]+|[\s│|╎┃━]+$/g, '') === 'hello',
      ),
  );
  HarnessSmoke.Class.pass('shell output completed the nested PTY round trip');

  console.log(
    '== harness terminal: idle terminal reads do not exhaust the shared worker pool ==',
  );
  let newestTerminalStatus = openedStatus;
  for (let terminalNumber = 2; terminalNumber <= 6; terminalNumber += 1) {
    HarnessSmoke.Class.clickText(driver, driver.snapshot(), '+ Plugin');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `terminal ${terminalNumber} Add popup opens from the visible panel control`,
      (status) =>
        status.boundedListPopupOpen === true &&
        Array.isArray(status.boundedListPopupItemIdentifiers) &&
        JSON.stringify(status.boundedListPopupItemIdentifiers) ===
          JSON.stringify(['terminal', 'database']),
    );
    driver.sendKeys('Enter');
    newestTerminalStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `terminal ${terminalNumber} becomes the active panel content`,
      (status) =>
        status.boundedListPopupOpen === false &&
        Array.isArray(status.panelContentKinds) &&
        status.panelContentKinds.filter((kind) => kind === 'terminal')
          .length === terminalNumber &&
        status.panelActiveContentKind === 'terminal' &&
        status.panelActiveContentLabel === `Terminal ${terminalNumber}`,
    );
    const terminalPanelRectangle = bottomPanelSlot(newestTerminalStatus);
    await driver.awaitGridCondition(
      `idle terminal ${terminalNumber} paints its prompt without another terminal producing output`,
      (candidate) =>
        terminalBodyText(candidate, terminalPanelRectangle).includes('$'),
    );
  }
  const newestTerminalPanelRectangle = bottomPanelSlot(newestTerminalStatus);
  driver.sendText("printf '\\114\\111\\126\\105\\055\\066\\n'");
  driver.sendKeys('Enter');
  await driver.awaitGridCondition(
    'terminal 6 reads its own command result without another input advancing the shared read queue',
    (candidate) =>
      terminalBodyText(candidate, newestTerminalPanelRectangle).includes(
        'LIVE-6',
      ),
  );
  HarnessSmoke.Class.pass(
    'six idle terminal read paths remain live in the default process worker pool',
  );

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
    resizedRows - 1,
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
  const darkFrameDump = await awaitFrameDump(
    framePath,
    (candidate) => candidate.rows.some((row) => row.text.includes('TRUE-T')),
    'the child color matrix under the dark theme',
  );
  requireChildColorMatrix(
    darkFrameDump,
    'dark theme',
    ThemePalettes.Class.DARK,
  );
  const darkStatusBackground =
    darkFrameDump.rows[darkFrameDump.height - 1]?.bg[10] ?? 'missing';
  const settingsButtonColumn = driver
    .snapshot()
    .rowText(statusBarRow)
    .lastIndexOf('⚙');
  HarnessSmoke.Class.requireCondition(
    settingsButtonColumn >= 0,
    'the status bar exposes its themed settings affordance',
  );
  driver.sendMouseClick({
    column: settingsButtonColumn,
    row: statusBarRow,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'settings opens above the running child terminal',
    (status) => status.settingsOpen === true,
  );
  await selectSettingByVisibleLabel(driver, statusPath, 'Theme');
  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the live theme setting changes from dark to light',
    (status) => status.settingsSelectedValue === 'light',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'settings closes over the same running child terminal',
    (status) => status.settingsOpen === false,
  );
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('CHILD-MODE-READY') !== null,
  );
  const lightFrameDump = await awaitFrameDump(
    framePath,
    (candidate) =>
      candidate.rows.some((row) => row.text.includes('TRUE-T')) &&
      candidate.rows[candidate.height - 1]?.bg[10] !== darkStatusBackground,
    'the unchanged child color matrix and changed chrome under the light theme',
  );
  requireChildColorMatrix(
    lightFrameDump,
    'live light theme',
    ThemePalettes.Class.LIGHT,
  );
  HarnessSmoke.Class.requireCondition(
    lightFrameDump.rows[lightFrameDump.height - 1]?.bg[10] !==
      darkStatusBackground,
    'live theme switch repaints host status chrome around unchanged child cells',
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
  const selectionBackgroundBeforeShiftDrag = driver
    .snapshot()
    .cell(mouseTarget.row, mouseTarget.column)?.background;
  const clipboardEmissionCountBeforeShiftDrag =
    driver.clipboardEmissions().length;
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: mouseTarget.column,
    row: mouseTarget.row,
    button: 'left',
    shift: true,
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: mouseTarget.column + 4,
    row: mouseTarget.row,
    button: 'left',
    shift: true,
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: mouseTarget.column + 4,
    row: mouseTarget.row,
    button: 'left',
    shift: true,
  });
  await driver.awaitGridCondition(
    'Shift drag paints a host selection over the mouse-tracking child',
    (candidate) =>
      candidate.cell(mouseTarget.row, mouseTarget.column)?.background !==
      selectionBackgroundBeforeShiftDrag,
  );
  driver.sendKeys('Control+c');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'Shift-dragged terminal text reaches the copy result channel',
    (status) => status.lastCopyChars === 5,
  );
  await driver.awaitOutputCondition(
    'Shift-dragged terminal text emits one exact OSC 52 payload',
    () =>
      driver.clipboardEmissions().length >
      clipboardEmissionCountBeforeShiftDrag,
  );
  const shiftDragClipboardEmission = driver.clipboardEmissions().at(-1);
  HarnessSmoke.Class.requireCondition(
    shiftDragClipboardEmission?.decodedText === 'MOUSE',
    `Shift drag copied exact terminal text ${JSON.stringify(shiftDragClipboardEmission?.decodedText)}`,
  );
  await driver.awaitOutputCondition(
    'Shift-dragged terminal copy writes terminal-owned telemetry',
    () => {
      const telemetryLine = DiagnosticLog.Class.latestLineContaining(
        driver,
        'COPY_PATH_TELEMETRY ',
      );
      return (
        telemetryLine?.includes('"focusedSurface":"terminal"') === true &&
        telemetryLine.includes('"selectionOwner":"terminal"') &&
        telemetryLine.includes('"selectionLength":5') &&
        telemetryLine.includes('"routeTaken":"copy-handler"') &&
        telemetryLine.includes('"osc52Emitted":true') &&
        telemetryLine.includes('"osc52ByteLength":5')
      );
    },
  );
  HarnessSmoke.Class.pass(
    'Shift drag copied mouse-tracking child text and named the terminal selection',
  );
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: mouseTarget.column,
    row: mouseTarget.row,
    button: 'left',
    shift: true,
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: mouseTarget.column,
    row: mouseTarget.row,
    button: 'left',
    shift: true,
  });
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

  console.log(
    '== harness terminal: real tasks:watch commits one complete initial frame ==',
  );
  const tasksWatchBaselineMarker = 'TASKS-WATCH-BASELINE';
  const tasksWatchBaselineObservationStart =
    driver.completedFrameObservationCount;
  driver.sendText(`printf '${tasksWatchBaselineMarker}\\n'`);
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText(tasksWatchBaselineMarker) !== null,
  );
  await driver.awaitOutputCondition(
    'the tasks:watch shell baseline reaches a completed outer frame',
    () =>
      driver
        .completedFrameObservationsSince(tasksWatchBaselineObservationStart)
        .some(
          (observation) =>
            observation.snapshot.findText(tasksWatchBaselineMarker) !== null,
        ),
    5_000,
  );
  const tasksWatchObservationStart = driver.completedFrameObservationCount;
  const tasksWatchTreeStampBefore = tasksTreeStamp(tasksWatchTasksRoot);
  driver.sendText(
    `INVAR_TASKS_ROOT=${tasksWatchTasksRoot} bun ${tasksWatchScriptPath} watch`,
  );
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('INVAR TASKS') !== null ||
      candidate.findText('active ·') !== null,
    15_000,
  );
  const tasksWatchAnimationObservationStart =
    driver.completedFrameObservationCount;
  await driver.awaitOutputCondition(
    'real tasks:watch advances a live motion row without a ledger change',
    () => {
      const motionFingerprints = new Set<string>();
      for (const observation of driver.completedFrameObservationsSince(
        tasksWatchAnimationObservationStart,
      )) {
        const motionLine = terminalBodyText(
          observation.snapshot,
          panelRectangle,
        )
          .split('\n')
          .find(
            (line) => line.includes('building') || line.includes('exploring'),
          );
        if (motionLine !== undefined) {
          motionFingerprints.add(motionLine.trim());
        }
      }
      return motionFingerprints.size > 1;
    },
    5_000,
  );
  HarnessSmoke.Class.requireCondition(
    tasksTreeStamp(tasksWatchTasksRoot) === tasksWatchTreeStampBefore,
    'real tasks:watch advances motion while the task tree stays unchanged',
  );
  for (const fixtureFolder of tasksWatchFixtureFolders.slice(1)) {
    renameSync(
      fixtureFolder,
      join(tasksWatchTasksRoot, 'completed', basename(fixtureFolder)),
    );
  }
  const shrunkenTasksWatchSnapshot = await driver.awaitSnapshot((candidate) => {
    const bodyText = terminalBodyText(candidate, panelRectangle);
    return (
      bodyText.includes('IN-PROGRESS (1)') && bodyText.includes('2 completed')
    );
  }, 15_000);
  const shrunkenTasksWatchBody = terminalBodyText(
    shrunkenTasksWatchSnapshot,
    panelRectangle,
  );
  HarnessSmoke.Class.requireCondition(
    (shrunkenTasksWatchBody.match(/#997/g) ?? []).length === 1 &&
      !shrunkenTasksWatchBody.includes('#998') &&
      !shrunkenTasksWatchBody.includes('#999'),
    'real tasks:watch paints exactly the one model task after a shrink',
  );
  const tasksWatchObservations = driver.completedFrameObservationsSince(
    tasksWatchObservationStart,
  );
  // invariant: Atomicity is claimed only for self-generated output (scripts/harness/harness.invariants.md)
  //
  // This body belongs to `tasks:watch`, a real child process that repaints by
  // clearing and redrawing WITHOUT synchronized-frame markers. Between its
  // clear and its redraw the child has genuinely sent an empty screen, so a
  // completed frame painted there shows the truth of what arrived. Invar
  // cannot make a foreign repaint atomic, and no terminal emulator can.
  //
  // So the honest claim is CONVERGENCE, not absence: a blank frame is fine
  // when a later frame repaints content; a blank that never resolves is the
  // defect — and that persistent case is the real user symptom (#458: a
  // terminal showing a cursor and nothing else). The old absence claim fired
  // on the harmless transient roughly 40% of gate runs (#436) while being no
  // better at catching the dangerous one.
  //
  // No invented threshold lives here. "Converged" means the observed frames do
  // not END blank, which needs no tolerance to be chosen and therefore cannot
  // be tuned to hide a regression. The longest transient run is reported, not
  // gated.
  const tasksWatchFrameBearsContent = (
    observation: (typeof tasksWatchObservations)[number],
  ): boolean => {
    const bodyText = terminalBodyText(observation.snapshot, panelRectangle);
    return (
      bodyText.includes(tasksWatchBaselineMarker) ||
      bodyText.includes('tasks-status.ts') ||
      bodyText.includes('INVAR TASKS') ||
      bodyText.includes('active ·')
    );
  };

  // PRESENT arm: the matcher must find content in at least one frame. Without
  // this, a matcher that can never match would report a converged, painted
  // terminal — silence read as success.
  HarnessSmoke.Class.requireCondition(
    tasksWatchObservations.some(tasksWatchFrameBearsContent),
    `real tasks:watch painted its content in at least one completed frame ` +
      `(${tasksWatchObservations.length} outer frames) — the content matcher can see`,
  );

  let trailingBlankFrameCount = 0;
  for (let index = tasksWatchObservations.length - 1; index >= 0; index -= 1) {
    const observation = tasksWatchObservations[index];
    if (observation === undefined || tasksWatchFrameBearsContent(observation)) {
      break;
    }
    trailingBlankFrameCount += 1;
  }

  let longestTransientBlankRun = 0;
  let currentBlankRun = 0;
  for (const observation of tasksWatchObservations) {
    if (tasksWatchFrameBearsContent(observation)) {
      longestTransientBlankRun = Math.max(
        longestTransientBlankRun,
        currentBlankRun,
      );
      currentBlankRun = 0;
      continue;
    }
    currentBlankRun += 1;
  }

  // ABSENT arm: a terminal that ends blank must fail. Plant it by inverting
  // `tasksWatchFrameBearsContent` to `false` — every frame then reads blank,
  // the PRESENT arm above goes red first, and inverting only the final frame
  // reddens this one.
  HarnessSmoke.Class.requireCondition(
    trailingBlankFrameCount === 0,
    `real tasks:watch converges to painted content ` +
      `(${tasksWatchObservations.length} outer frames, ` +
      `${trailingBlankFrameCount} trailing blank, ` +
      `longest transient blank run ${longestTransientBlankRun} — transient runs are reported, not gated)`,
  );
  driver.sendKeys('Control+c');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText(tasksWatchBaselineMarker) !== null,
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
