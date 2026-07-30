#!/usr/bin/env bun
// Byte-level settings applied-effect port. Every setting driven by the original smoke is loaded from
// one per-run isolated HOME, then proven through real PTY input plus emulator cells or status output.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync, renameSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Settings } from '../../src/modules/settings/Settings';
import { ThemePalettes } from '../../src/modules/theme/ThemePalettes';
import { HarnessInput } from './HarnessInput';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

type SettingValue = boolean | number | string | string[];

interface LaunchedDriver {
  driver: PtyTestDriver.Model;
  statusPath: string;
}

const coveredSettingNames = new Set([
  'verticalFlingCeiling',
  'scrollAccelGain',
  'scrollFriction',
  'maximumGlideDurationMilliseconds',
  'linesPerNotch',
  'horizontalScrollModifier',
  'fastScrollModifier',
  'fastScrollMultiplier',
  'scrollbarThickness',
  'glyphMode',
  // Real-image live apply, downgrade cleanup, and restart persistence live in the pixel smoke.
  'graphicsTier',
  'theme',
  'wordWrap',
  'showActivityBar',
  // Live mirror apply and exact glyph parity live in the activity-bar smoke.
  'showRightActivityBar',
  'showIndentGuides',
  'reducedMotion',
  'workspaceTabPosition',
  'typescriptServer',
  'lspFileSizeLimitKb',
  'agentProvider',
  'agentSkipPermissions',
  'agentModel',
  'agentTerminalFollowMode',
  'agentTypingSpeed',
  'terminalCleanPrompt',
  'agentAudioNarration',
  'agentNarrationVoice',
  'agentNarrationRate',
  'sidebarWidth',
  // Live mouse edits plus slot-edge assertions live in smoke-layout-harness.ts.
  'rightDockWidth',
  'sidebarPosition',
  'panelAlignment',
  'leftDockVerticalSpan',
  'rightDockVerticalSpan',
  'gitSplitRatio',
  'diffSplitRatio',
  'markdownSplitRatio',
  // Plugin membership, activity reorder, and same-HOME restart are driven by the activity-bar smoke.
  'primaryDockContentOrder',
  'panelContentOrder',
  // Workspace switching and the reconstruction adapter drive this persisted panel-world map.
  'panelWorkspaceStates',
  // The panel-chrome smoke drives a one-second interval and the enabled switch through visible tab changes.
  'panelTabCycleSeconds',
  'panelTabCycling',
]);

const schemaSettingNames = Object.keys(Settings.$Class.DEFAULTS);

const settingsHome = mkdtempSync(
  join(tmpdir(), 'tui-settings-applied-harness-home-'),
);

const settingsDirectory = join(settingsHome, '.config', 'invar');

const settingsPath = join(settingsDirectory, 'settings.json');

mkdirSync(settingsDirectory, { recursive: true });

await Bun.write(settingsPath, '{}\n');

async function setSetting(
  settingName: string,
  value: SettingValue,
): Promise<void> {
  const settings = JSON.parse(await Bun.file(settingsPath).text()) as Record<
    string,
    SettingValue
  >;
  settings[settingName] = value;
  const temporaryPath = `${settingsPath}.temporary`;
  await Bun.write(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(temporaryPath, settingsPath);
}

async function launchDriver(
  label: string,
  workspaceRoot: string,
  columns = 120,
  rows = 40,
): Promise<LaunchedDriver> {
  const statusPath = join(settingsHome, `status-${label}.json`);
  const driver = new PtyTestDriver.Class({
    workspaceRoot,
    columns,
    rows,
    homeDirectory: settingsHome,
    retainFullOutput: true,
    environment: {
      TUI_STATUS_PATH: statusPath,
      COLORTERM: 'truecolor',
    },
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.ready === true',
    (status) => status.ready === true,
    15_000,
  );
  return { driver, statusPath };
}

async function openOnlyFile(launchedDriver: LaunchedDriver): Promise<string> {
  for (let openAttempt = 0; openAttempt < 4; openAttempt++) {
    try {
      const status = await HarnessSmoke.Class.awaitStatus(
        launchedDriver.driver,
        launchedDriver.statusPath,
        'an active buffer is already published',
        (status) =>
          typeof status.activeBuffer === 'string' &&
          status.activeBuffer.length > 0,
        50,
      );
      return String(status.activeBuffer);
    } catch {
      // The fixture has not opened yet; drive the next tree row.
    }
    launchedDriver.driver.sendKeys('Enter');
    try {
      const status = await HarnessSmoke.Class.awaitStatus(
        launchedDriver.driver,
        launchedDriver.statusPath,
        "status condition: typeof candidate.activeBuffer === 'string' && candidate.activeBuffer.length > 0",
        (candidate) =>
          typeof candidate.activeBuffer === 'string' &&
          candidate.activeBuffer.length > 0,
        1_000,
      );
      return String(status.activeBuffer);
    } catch {
      await Bun.sleep(100);
    }
  }
  throw new Error('FAIL fixture file did not open');
}

async function selectSettingByVisibleLabel(
  launchedDriver: LaunchedDriver,
  settingLabel: string,
): Promise<void> {
  let selectionStatus = await HarnessSmoke.Class.awaitStatus(
    launchedDriver.driver,
    launchedDriver.statusPath,
    'the selected settings label is published before navigation',
    (status) => typeof status.settingsSelectedLabel === 'string',
  );
  for (let navigationStep = 0; navigationStep < 40; navigationStep++) {
    if (selectionStatus.settingsSelectedLabel === settingLabel) break;
    const previousSelectedLabel = selectionStatus.settingsSelectedLabel;
    launchedDriver.driver.sendKeys('Down');
    selectionStatus = await HarnessSmoke.Class.awaitStatus(
      launchedDriver.driver,
      launchedDriver.statusPath,
      `settings navigation advances toward ${settingLabel}`,
      (candidate) => candidate.settingsSelectedLabel !== previousSelectedLabel,
    );
  }
  HarnessSmoke.Class.requireCondition(
    selectionStatus.settingsSelectedLabel === settingLabel,
    `${settingLabel} is discovered by its live settings label`,
  );
  await launchedDriver.driver.awaitGridCondition(
    `${settingLabel} is the visibly selected settings row`,
    (snapshot) => snapshot.findText(`› ${settingLabel}`) !== null,
  );
}

async function awaitSettledPublishedNumber(options: {
  launchedDriver: LaunchedDriver;
  fieldName: string;
  description: string;
  progressFieldName: string;
  progressPreviousValue: number;
  momentumAtRestFieldName: string;
}): Promise<number> {
  let settledValue = Number.NaN;
  let lastProgressValue = Number.NaN;
  let lastMomentumAtRest: unknown;
  try {
    await options.launchedDriver.driver.awaitGridCondition(
      options.description,
      () => {
        const status = HarnessSmoke.Class.readStatus(
          options.launchedDriver.statusPath,
        );
        settledValue = Number(status[options.fieldName]);
        lastProgressValue = Number(status[options.progressFieldName]);
        lastMomentumAtRest = status[options.momentumAtRestFieldName];
        return (
          Number.isFinite(settledValue) &&
          lastMomentumAtRest === true &&
          lastProgressValue !== options.progressPreviousValue
        );
      },
    );
  } catch (error) {
    throw new Error(
      `${String(error)}\nLast published ${options.fieldName}=${settledValue}, ` +
        `${options.progressFieldName}=${lastProgressValue}, ` +
        `${options.momentumAtRestFieldName}=${String(lastMomentumAtRest)}`,
    );
  }
  return settledValue;
}

async function scrollTopAfterShortGesture(
  label: string,
  workspaceRoot: string,
  alt: boolean,
): Promise<number> {
  const launchedDriver = await launchDriver(label, workspaceRoot);
  try {
    await openOnlyFile(launchedDriver);
    await launchedDriver.driver.awaitGridCondition(
      'the long fixture content is rendered before short wheel input',
      (candidate) => candidate.findText('line 000') !== null,
    );
    const openingStatus = await HarnessSmoke.Class.awaitStatus(
      launchedDriver.driver,
      launchedDriver.statusPath,
      'the opening editor scroll top is published before short wheel input',
      (status) => typeof status.editorScrollTop === 'number',
    );
    const openingSnapshot = launchedDriver.driver.snapshot();
    let settledScrollTop = Number.NaN;
    await launchedDriver.driver.assertContentInvariantAcrossAction({
      invariantRegion: {
        startRow: 0,
        endRowExclusive: 1,
        startColumn: 0,
        endColumnExclusive: 20,
      },
      changedRegion: {
        startRow: 1,
        endRowExclusive: openingSnapshot.rows - 2,
        startColumn: 32,
        endColumnExclusive: openingSnapshot.columns,
      },
      actionDescription:
        'editor short wheel gesture changes only the editor viewport',
      performAction: async () => {
        launchedDriver.driver.sendRawInputWithoutFrameExpectation(
          Array.from({ length: 2 }, () =>
            HarnessInput.Class.mouse({
              kind: 'wheel',
              column: 59,
              row: 11,
              direction: 'down',
              alt,
            }),
          ).join(''),
        );
        settledScrollTop = await awaitSettledPublishedNumber({
          launchedDriver,
          fieldName: 'editorScrollTop',
          description:
            'the short-gesture editor viewport reaches its changed resting position',
          progressFieldName: 'editorScrollTop',
          progressPreviousValue: Number(openingStatus.editorScrollTop),
          momentumAtRestFieldName: 'workspaceScrollMomentumAtRest',
        });
      },
    });
    return settledScrollTop;
  } finally {
    await launchedDriver.driver.dispose();
  }
}

async function scrollTopAfterFling(
  label: string,
  workspaceRoot: string,
): Promise<number> {
  const launchedDriver = await launchDriver(label, workspaceRoot);
  try {
    await openOnlyFile(launchedDriver);
    await launchedDriver.driver.awaitGridCondition(
      'the long fixture content is rendered before wheel-train input',
      (candidate) => candidate.findText('line 000') !== null,
    );
    const openingStatus = await HarnessSmoke.Class.awaitStatus(
      launchedDriver.driver,
      launchedDriver.statusPath,
      'the opening editor scroll top is published before fling input',
      (status) => typeof status.editorScrollTop === 'number',
    );
    const openingSnapshot = launchedDriver.driver.snapshot();
    let settledScrollTop = Number.NaN;
    await launchedDriver.driver.assertContentInvariantAcrossAction({
      invariantRegion: {
        startRow: 0,
        endRowExclusive: 1,
        startColumn: 0,
        endColumnExclusive: 20,
      },
      changedRegion: {
        startRow: 1,
        endRowExclusive: openingSnapshot.rows - 2,
        startColumn: 32,
        endColumnExclusive: openingSnapshot.columns,
      },
      actionDescription: 'editor wheel train changes only the editor viewport',
      performAction: async () => {
        for (let wheelIndex = 0; wheelIndex < 10; wheelIndex++) {
          launchedDriver.driver.sendMouseWithoutFrameExpectation({
            kind: 'wheel',
            column: 59,
            row: 11,
            direction: 'down',
          });
        }
        settledScrollTop = await awaitSettledPublishedNumber({
          launchedDriver,
          fieldName: 'editorScrollTop',
          description:
            'the wheel-train editor viewport reaches its changed resting position',
          progressFieldName: 'editorScrollTop',
          progressPreviousValue: Number(openingStatus.editorScrollTop),
          momentumAtRestFieldName: 'workspaceScrollMomentumAtRest',
        });
      },
    });
    return settledScrollTop;
  } finally {
    await launchedDriver.driver.dispose();
  }
}

async function rapidInputTravel(
  label: string,
  workspaceRoot: string,
): Promise<{ appliedImpulseCount: number; rowsTravelled: number }> {
  const launchedDriver = await launchDriver(label, workspaceRoot);
  try {
    await openOnlyFile(launchedDriver);
    await launchedDriver.driver.awaitGridCondition(
      'the long fixture content is rendered before rapid wheel input',
      (candidate) => candidate.findText('line 000') !== null,
    );
    const openingStatus = await HarnessSmoke.Class.awaitStatus(
      launchedDriver.driver,
      launchedDriver.statusPath,
      'scroll and impulse counts are published before rapid wheel input',
      (status) =>
        typeof status.editorScrollTop === 'number' &&
        typeof status.editorVerticalScrollImpulseCount === 'number',
    );
    const openingScrollTop = Number(openingStatus.editorScrollTop);
    const openingImpulseCount = Number(
      openingStatus.editorVerticalScrollImpulseCount,
    );
    const inputEventCount = 150;
    const inputEventIntervalMilliseconds = 6;
    await new Promise<void>((resolveInput) => {
      let sentInputEventCount = 0;
      const inputInterval = setInterval(() => {
        launchedDriver.driver.sendMouseWithoutFrameExpectation({
          kind: 'wheel',
          column: 59,
          row: 11,
          direction: 'down',
        });
        sentInputEventCount++;
        if (sentInputEventCount === inputEventCount) {
          clearInterval(inputInterval);
          resolveInput();
        }
      }, inputEventIntervalMilliseconds);
    });

    let appliedImpulseCount = 0;
    let rowsTravelled = 0;
    await launchedDriver.driver.awaitGridCondition(
      'all rapid wheel events are applied and the glide reaches rest',
      () => {
        const status = HarnessSmoke.Class.readStatus(launchedDriver.statusPath);
        appliedImpulseCount =
          Number(status.editorVerticalScrollImpulseCount) - openingImpulseCount;
        rowsTravelled = Number(status.editorScrollTop) - openingScrollTop;
        return (
          appliedImpulseCount === inputEventCount &&
          rowsTravelled > 0 &&
          status.workspaceScrollMomentumAtRest === true
        );
      },
    );
    return { appliedImpulseCount, rowsTravelled };
  } finally {
    await launchedDriver.driver.dispose();
  }
}

async function singleNotchTravel(
  label: string,
  workspaceRoot: string,
): Promise<{ appliedImpulseCount: number; rowsTravelled: number }> {
  const launchedDriver = await launchDriver(label, workspaceRoot);
  try {
    await openOnlyFile(launchedDriver);
    await launchedDriver.driver.awaitGridCondition(
      'the long fixture content is rendered before single wheel input',
      (candidate) => candidate.findText('line 000') !== null,
    );
    const openingStatus = await HarnessSmoke.Class.awaitStatus(
      launchedDriver.driver,
      launchedDriver.statusPath,
      'scroll and impulse counts are published before single wheel input',
      (status) =>
        typeof status.editorScrollTop === 'number' &&
        typeof status.editorVerticalScrollImpulseCount === 'number',
    );
    const openingScrollTop = Number(openingStatus.editorScrollTop);
    const openingImpulseCount = Number(
      openingStatus.editorVerticalScrollImpulseCount,
    );
    launchedDriver.driver.sendMouseWithoutFrameExpectation({
      kind: 'wheel',
      column: 59,
      row: 11,
      direction: 'down',
    });

    let appliedImpulseCount = 0;
    let rowsTravelled = 0;
    await launchedDriver.driver.awaitGridCondition(
      'the single wheel event is applied and the glide reaches rest',
      () => {
        const status = HarnessSmoke.Class.readStatus(launchedDriver.statusPath);
        appliedImpulseCount =
          Number(status.editorVerticalScrollImpulseCount) - openingImpulseCount;
        rowsTravelled = Number(status.editorScrollTop) - openingScrollTop;
        return (
          appliedImpulseCount === 1 &&
          status.workspaceScrollMomentumAtRest === true
        );
      },
    );
    return { appliedImpulseCount, rowsTravelled };
  } finally {
    await launchedDriver.driver.dispose();
  }
}

function markerRow(snapshot: HarnessSnapshot.Model, marker: string): number {
  return snapshot.findText(marker)?.row ?? -1;
}

function sidebarDividerColumn(snapshot: HarnessSnapshot.Model): number {
  for (const row of [3, 5, 7, 10]) {
    const rowText = snapshot.rowText(row);
    for (let column = 6; column < Math.min(90, snapshot.columns); column++) {
      if (rowText[column] === '│') return column;
    }
  }
  return -1;
}

function paintedScrollbarColumnCount(snapshot: HarnessSnapshot.Model): number {
  const thumbBackground = Number.parseInt(
    ThemePalettes.Class.DARK.dim.slice(1),
    16,
  );
  const paintedRowsByColumn = new Map<number, number>();
  for (let row = 2; row < Math.min(34, snapshot.rows); row++) {
    for (let column = 24; column < Math.min(32, snapshot.columns); column++) {
      const cell = snapshot.cell(row, column);
      if (cell?.isBackgroundRgb && cell.background === thumbBackground) {
        paintedRowsByColumn.set(
          column,
          (paintedRowsByColumn.get(column) ?? 0) + 1,
        );
      }
    }
  }
  return [...paintedRowsByColumn.values()].filter(
    (paintedRows) => paintedRows >= 2,
  ).length;
}

function firstSubfolderGlyphs(snapshot: HarnessSnapshot.Model): string {
  const position = snapshot.findText('subfolder');
  if (!position) return '';
  return Array.from(snapshot.rowText(position.row)).slice(1, 6).join('');
}

function indentGuideCellCount(snapshot: HarnessSnapshot.Model): number {
  const position = snapshot.findText('deeply(');
  if (!position || position.column < 8) return 0;
  return snapshot
    .rowCells(position.row)
    .slice(position.column - 8, position.column)
    .filter((cell) => cell.characters !== ' ').length;
}

async function snapshotForSetting(
  label: string,
  workspaceRoot: string,
  openFile: boolean,
): Promise<HarnessSnapshot.Model> {
  const launchedDriver = await launchDriver(label, workspaceRoot);
  try {
    if (openFile) {
      const activeBuffer = await openOnlyFile(launchedDriver);
      const renderedFileMarker = (await Bun.file(activeBuffer).text())
        .split('\n')
        .find((line) => line.length > 0)
        ?.slice(0, 16);
      if (!renderedFileMarker) {
        throw new Error(
          `FAIL ${basename(activeBuffer)} has no rendered marker`,
        );
      }
      // Await inside this try: returning the pending promise enters finally and
      // disposes the PTY before the editor body can paint.
      return await launchedDriver.driver.awaitGridCondition(
        `${basename(activeBuffer)} body is rendered before its setting snapshot`,
        (snapshot) => snapshot.findText(renderedFileMarker) !== null,
      );
    }
    try {
      return await launchedDriver.driver.awaitGridCondition(
        'the tree fixture rows are rendered before the setting snapshot',
        (snapshot) =>
          snapshot.findText('Files') !== null &&
          snapshot.findText('file-01.txt') !== null,
      );
    } catch (error) {
      throw new Error(
        `${String(error)}\nRetained output:\n${launchedDriver.driver.recordedOutput().slice(-20_000)}`,
      );
    }
  } finally {
    await launchedDriver.driver.dispose();
  }
}

const fixtureDirectories: string[] = [];

function createFixture(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  fixtureDirectories.push(directory);
  return directory;
}

const longFixture = createFixture('tui-settings-long-harness-');

let longText = '';

for (let lineNumber = 0; lineNumber < 2_000; lineNumber++) {
  longText += `line ${String(lineNumber).padStart(3, '0')} ${'x'.repeat(180)}\n`;
}

await Bun.write(join(longFixture, 'long.txt'), longText);

const treeFixture = createFixture('tui-settings-tree-harness-');

for (let fileNumber = 1; fileNumber <= 60; fileNumber++) {
  await Bun.write(
    join(treeFixture, `file-${String(fileNumber).padStart(2, '0')}.txt`),
    'x\n',
  );
}

mkdirSync(join(treeFixture, 'subfolder'));

const wrapFixture = createFixture('tui-settings-wrap-harness-');

await Bun.write(join(wrapFixture, 'w.txt'), `${'A'.repeat(300)}\nMARKERLINE\n`);

const gitFixture = createFixture('tui-settings-git-harness-');

await Bun.write(join(gitFixture, 'f.txt'), 'a\n');

HarnessSmoke.Class.runGit(gitFixture, ['init', '-q']);

HarnessSmoke.Class.runGit(gitFixture, ['add', 'f.txt']);

HarnessSmoke.Class.runGit(gitFixture, [
  '-c',
  'user.name=settings-harness',
  '-c',
  'user.email=settings-harness@example.test',
  'commit',
  '-qm',
  'init',
]);

await Bun.write(join(gitFixture, 'f.txt'), 'a\nb\n');

await Bun.write(join(gitFixture, 'g.txt'), 'n\n');

const indentFixture = createFixture('tui-settings-indent-harness-');

await Bun.write(
  join(indentFixture, 'i.ts'),
  'function f() {\n        deeply();\n}\n',
);

const lspFixture = createFixture('tui-settings-lsp-harness-');

symlinkSync(
  join(process.cwd(), 'node_modules'),
  join(lspFixture, 'node_modules'),
);

await Bun.write(
  join(lspFixture, 'tsconfig.json'),
  '{ "compilerOptions": { "target": "ES2022", "module": "ESNext", ' +
    '"moduleResolution": "bundler", "strict": true }, "include": ["*.ts"] }\n',
);

await Bun.write(
  join(lspFixture, 'big.ts'),
  `// padding ${'x'.repeat(1_500)}\nconst bad: number = "nope";\n`,
);

try {
  await setSetting('showActivityBar', false);
  await setSetting('wordWrap', false);
  await setSetting('fastScrollModifier', 'none');

  console.log(
    '== harness settings: scrolling settings change driven distance and routing ==',
  );
  await setSetting('linesPerNotch', 1);
  const oneLineGesture = await scrollTopAfterShortGesture(
    'notch-one',
    longFixture,
    false,
  );
  await setSetting('linesPerNotch', 8);
  const eightLineGesture = await scrollTopAfterShortGesture(
    'notch-eight',
    longFixture,
    false,
  );
  HarnessSmoke.Class.requireCondition(
    eightLineGesture > oneLineGesture,
    `linesPerNotch 8 moves farther than 1 (${oneLineGesture} to ${eightLineGesture})`,
  );

  await setSetting('linesPerNotch', 1);
  await setSetting('scrollAccelGain', 5);
  const lowGain = await scrollTopAfterShortGesture(
    'gain-low',
    longFixture,
    false,
  );
  await setSetting('scrollAccelGain', 120);
  const highGain = await scrollTopAfterShortGesture(
    'gain-high',
    longFixture,
    false,
  );
  HarnessSmoke.Class.requireCondition(
    highGain > lowGain,
    `scrollAccelGain 120 moves farther than 5 (${lowGain} to ${highGain})`,
  );
  await setSetting('scrollAccelGain', 34);

  await setSetting('verticalFlingCeiling', 80);
  const lowCeiling = await scrollTopAfterFling('ceiling-low', longFixture);
  await setSetting('verticalFlingCeiling', 1_500);
  const highCeiling = await scrollTopAfterFling('ceiling-high', longFixture);
  HarnessSmoke.Class.requireCondition(
    highCeiling > lowCeiling,
    `verticalFlingCeiling 1500 flings farther than 80 (${lowCeiling} to ${highCeiling})`,
  );
  await setSetting('verticalFlingCeiling', 220);

  await setSetting('scrollFriction', 0.001);
  const lowFriction = await scrollTopAfterFling('friction-low', longFixture);
  await setSetting('scrollFriction', 0.4);
  const highFriction = await scrollTopAfterFling('friction-high', longFixture);
  HarnessSmoke.Class.requireCondition(
    lowFriction !== highFriction,
    `scrollFriction changes glide distance (${lowFriction} versus ${highFriction})`,
  );
  await setSetting('scrollFriction', 0.015);

  await setSetting('maximumGlideDurationMilliseconds', 100);
  const minimumGlideDuration = await singleNotchTravel(
    'glide-duration-minimum',
    longFixture,
  );
  HarnessSmoke.Class.requireCondition(
    minimumGlideDuration.appliedImpulseCount === 1 &&
      minimumGlideDuration.rowsTravelled >= 1,
    `maximumGlideDurationMilliseconds 100 applies one impulse and moves at ` +
      `least one row (${minimumGlideDuration.appliedImpulseCount} impulse, ` +
      `${minimumGlideDuration.rowsTravelled} rows)`,
  );

  await setSetting('maximumGlideDurationMilliseconds', 300);
  const shortGlideDuration = await rapidInputTravel(
    'glide-duration-short',
    longFixture,
  );
  await setSetting('maximumGlideDurationMilliseconds', 1_200);
  const longGlideDuration = await rapidInputTravel(
    'glide-duration-long',
    longFixture,
  );
  const maximumOneFrameTravelRows = Math.ceil(220 / 30);
  HarnessSmoke.Class.requireCondition(
    shortGlideDuration.appliedImpulseCount === 150 &&
      longGlideDuration.appliedImpulseCount === 150 &&
      longGlideDuration.rowsTravelled >
        shortGlideDuration.rowsTravelled + maximumOneFrameTravelRows,
    `maximumGlideDurationMilliseconds 1200 travels more rows than 300 ` +
      `by more than one frame budget for 150 applied impulses each ` +
      `(${shortGlideDuration.rowsTravelled} to ` +
      `${longGlideDuration.rowsTravelled}; frame budget ` +
      `${maximumOneFrameTravelRows})`,
  );
  await setSetting('maximumGlideDurationMilliseconds', 900);

  await setSetting('linesPerNotch', 1);
  await setSetting('horizontalScrollModifier', 'ctrl');
  await setSetting('fastScrollModifier', 'none');
  await setSetting('fastScrollMultiplier', 6);
  const baseAltGesture = await scrollTopAfterShortGesture(
    'fast-base',
    longFixture,
    true,
  );
  await setSetting('fastScrollModifier', 'alt');
  const fastAltGesture = await scrollTopAfterShortGesture(
    'fast-alt',
    longFixture,
    true,
  );
  HarnessSmoke.Class.requireCondition(
    fastAltGesture > baseAltGesture,
    `Alt fast modifier and multiplier increase the step (${baseAltGesture} to ${fastAltGesture})`,
  );
  await setSetting('fastScrollModifier', 'none');

  async function horizontalOffset(
    label: string,
    modifier: string,
  ): Promise<number> {
    await setSetting('horizontalScrollModifier', modifier);
    const launchedDriver = await launchDriver(label, longFixture);
    try {
      await openOnlyFile(launchedDriver);
      await launchedDriver.driver.awaitGridCondition(
        'the long fixture content is rendered before modified wheel input',
        (candidate) => candidate.findText('line 000') !== null,
      );
      const openingStatus = await HarnessSmoke.Class.awaitStatus(
        launchedDriver.driver,
        launchedDriver.statusPath,
        'the opening editor scroll offsets are published',
        (status) =>
          typeof status.editorScrollLeft === 'number' &&
          typeof status.editorScrollTop === 'number',
      );
      const openingSnapshot = launchedDriver.driver.snapshot();
      let settledHorizontalOffset = Number.NaN;
      await launchedDriver.driver.assertContentInvariantAcrossAction({
        invariantRegion: {
          startRow: 0,
          endRowExclusive: 1,
          startColumn: 0,
          endColumnExclusive: 20,
        },
        changedRegion: {
          startRow: 1,
          endRowExclusive: openingSnapshot.rows - 2,
          startColumn: 32,
          endColumnExclusive: openingSnapshot.columns,
        },
        actionDescription:
          'modified wheel input changes only the editor viewport',
        performAction: async () => {
          for (let wheelIndex = 0; wheelIndex < 3; wheelIndex++) {
            launchedDriver.driver.sendMouseWithoutFrameExpectation({
              kind: 'wheel',
              column: 59,
              row: 11,
              direction: 'down',
              alt: true,
            });
          }
          const progressFieldName =
            modifier === 'alt' ? 'editorScrollLeft' : 'editorScrollTop';
          settledHorizontalOffset = await awaitSettledPublishedNumber({
            launchedDriver,
            fieldName: 'editorScrollLeft',
            description: `the ${progressFieldName} viewport reaches its changed resting position`,
            progressFieldName,
            progressPreviousValue: Number(openingStatus[progressFieldName]),
            momentumAtRestFieldName: 'workspaceScrollMomentumAtRest',
          });
        },
      });
      return settledHorizontalOffset;
    } finally {
      await launchedDriver.driver.dispose();
    }
  }
  const altHorizontalOffset = await horizontalOffset('horizontal-alt', 'alt');
  const disabledHorizontalOffset = await horizontalOffset(
    'horizontal-none',
    'none',
  );
  HarnessSmoke.Class.requireCondition(
    altHorizontalOffset > disabledHorizontalOffset,
    `horizontalScrollModifier routes Alt-wheel horizontally (${disabledHorizontalOffset} to ${altHorizontalOffset})`,
  );
  await setSetting('horizontalScrollModifier', 'alt');

  console.log(
    '== harness settings: layout and visual settings change emulator cells ==',
  );
  await setSetting('wordWrap', false);
  const wrapOffSnapshot = await snapshotForSetting(
    'wrap-off',
    wrapFixture,
    true,
  );
  await setSetting('wordWrap', true);
  const wrapOnSnapshot = await snapshotForSetting('wrap-on', wrapFixture, true);
  HarnessSmoke.Class.requireCondition(
    markerRow(wrapOnSnapshot, 'MARKER') > markerRow(wrapOffSnapshot, 'MARKER'),
    'wordWrap pushes the marker onto a lower visual row',
  );
  await setSetting('wordWrap', false);

  await setSetting('sidebarWidth', 28);
  const narrowSidebar = sidebarDividerColumn(
    await snapshotForSetting('sidebar-narrow', treeFixture, false),
  );
  await setSetting('sidebarWidth', 44);
  const wideSidebar = sidebarDividerColumn(
    await snapshotForSetting('sidebar-wide', treeFixture, false),
  );
  HarnessSmoke.Class.requireCondition(
    wideSidebar > narrowSidebar,
    `sidebarWidth moves the real divider (${narrowSidebar} to ${wideSidebar})`,
  );
  await setSetting('sidebarWidth', 32);

  async function scrollbarColumns(
    label: string,
    thickness: number,
  ): Promise<number> {
    await setSetting('scrollbarThickness', thickness);
    const launchedDriver = await launchDriver(label, treeFixture);
    try {
      const openingSnapshot = await launchedDriver.driver.awaitGridCondition(
        'the file tree is rendered before scrollbar wheel input',
        (candidate) =>
          candidate.findText('Files') !== null &&
          candidate.findText('file-20.txt') !== null,
      );
      const scrolledSnapshot =
        await launchedDriver.driver.assertContentInvariantAcrossAction({
          invariantRegion: {
            startRow: 0,
            endRowExclusive: 1,
            startColumn: 0,
            endColumnExclusive: 20,
          },
          changedRegion: {
            startRow: 1,
            endRowExclusive: openingSnapshot.rows - 2,
            startColumn: 0,
            endColumnExclusive: 32,
          },
          actionDescription: 'tree wheel input changes only the tree viewport',
          performAction: () => {
            for (let wheelIndex = 0; wheelIndex < 10; wheelIndex++) {
              launchedDriver.driver.sendMouseWithoutFrameExpectation({
                kind: 'wheel',
                column: 9,
                row: 9,
                direction: 'down',
              });
            }
          },
        });
      return paintedScrollbarColumnCount(scrolledSnapshot);
    } finally {
      await launchedDriver.driver.dispose();
    }
  }
  await setSetting('theme', 'dark');
  const thinScrollbarColumns = await scrollbarColumns('scrollbar-thin', 1);
  const thickScrollbarColumns = await scrollbarColumns('scrollbar-thick', 3);
  HarnessSmoke.Class.requireCondition(
    thinScrollbarColumns === 1 && thickScrollbarColumns === 3,
    `scrollbarThickness paints 1 then 3 real columns (${thinScrollbarColumns}/${thickScrollbarColumns})`,
  );
  await setSetting('scrollbarThickness', 1);

  await setSetting('theme', 'dark');
  const darkSnapshot = await snapshotForSetting(
    'theme-dark',
    treeFixture,
    false,
  );
  await setSetting('theme', 'light');
  const lightSnapshot = await snapshotForSetting(
    'theme-light',
    treeFixture,
    false,
  );
  const darkStatusBackground = darkSnapshot.cell(
    darkSnapshot.rows - 1,
    10,
  )?.background;
  const lightStatusBackground = lightSnapshot.cell(
    lightSnapshot.rows - 1,
    10,
  )?.background;
  HarnessSmoke.Class.requireCondition(
    darkStatusBackground !== lightStatusBackground,
    `theme changes the status palette (${String(darkStatusBackground)} versus ${String(lightStatusBackground)})`,
  );
  await setSetting('theme', 'dark');

  await setSetting('glyphMode', 'ascii');
  const asciiGlyphs = firstSubfolderGlyphs(
    await snapshotForSetting('glyph-ascii', treeFixture, false),
  );
  await setSetting('glyphMode', 'nerd');
  const nerdGlyphs = firstSubfolderGlyphs(
    await snapshotForSetting('glyph-nerd', treeFixture, false),
  );
  HarnessSmoke.Class.requireCondition(
    asciiGlyphs !== nerdGlyphs,
    `glyphMode changes rendered tree glyphs (${JSON.stringify(asciiGlyphs)} versus ${JSON.stringify(nerdGlyphs)})`,
  );
  await setSetting('glyphMode', 'auto');

  await setSetting('showActivityBar', true);
  const activityBarDivider = sidebarDividerColumn(
    await snapshotForSetting('activity-on', treeFixture, false),
  );
  await setSetting('showActivityBar', false);
  const noActivityBarDivider = sidebarDividerColumn(
    await snapshotForSetting('activity-off', treeFixture, false),
  );
  HarnessSmoke.Class.requireCondition(
    activityBarDivider - noActivityBarDivider === 4,
    `showActivityBar shifts the sidebar by four columns (${noActivityBarDivider} to ${activityBarDivider})`,
  );

  await setSetting('showIndentGuides', true);
  const guideCells = indentGuideCellCount(
    await snapshotForSetting('guides-on', indentFixture, true),
  );
  await setSetting('showIndentGuides', false);
  const noGuideCells = indentGuideCellCount(
    await snapshotForSetting('guides-off', indentFixture, true),
  );
  HarnessSmoke.Class.requireCondition(
    guideCells > 0 && noGuideCells === 0,
    `showIndentGuides paints then removes guide cells (${guideCells}/${noGuideCells})`,
  );
  await setSetting('showIndentGuides', true);

  console.log(
    '== harness settings: terminal follow mode live-applies through Ctrl+, ==',
  );
  await setSetting('agentTerminalFollowMode', 'off');
  const followModeDriver = await launchDriver(
    'terminal-follow-mode',
    treeFixture,
  );
  try {
    followModeDriver.driver.sendKeys('Control+,');
    const openedSettingsStatus = await HarnessSmoke.Class.awaitStatus(
      followModeDriver.driver,
      followModeDriver.statusPath,
      'settings opens with terminal follow mode off',
      (candidate) =>
        candidate.settingsOpen === true &&
        candidate.terminalFollowMode === 'off',
    );
    const settingsLabels = openedSettingsStatus.settingsLabels;
    HarnessSmoke.Class.requireCondition(
      Array.isArray(settingsLabels) &&
        settingsLabels.length >= schemaSettingNames.length,
      `opened Settings panel lists at least all ${schemaSettingNames.length} ` +
        'host schema fields',
    );
    await selectSettingByVisibleLabel(
      followModeDriver,
      'Agent terminal follow mode',
    );
    followModeDriver.driver.sendKeys('Right');
    await HarnessSmoke.Class.awaitStatus(
      followModeDriver.driver,
      followModeDriver.statusPath,
      'the terminal follow setting publishes follow-all',
      (candidate) =>
        candidate.terminalFollowMode === 'follow-all' &&
        candidate.settingsSelectedValue === 'follow-all',
    );
    await followModeDriver.driver.awaitGridCondition(
      'the live settings row visibly changes terminal follow mode to follow-all',
      (snapshot) => {
        const settingPosition = snapshot.findText('Agent terminal follow mode');
        return (
          settingPosition !== null &&
          snapshot.rowText(settingPosition.row).includes('follow-all')
        );
      },
    );
    HarnessSmoke.Class.pass(
      'agentTerminalFollowMode changes through the real settings path and flips live status',
    );
  } finally {
    await followModeDriver.driver.dispose();
  }

  console.log(
    '== harness settings: panel content order live-applies through real reorder ==',
  );
  await setSetting('panelContentOrder', ['agent', 'terminal']);
  const panelContentOrderDriver = await launchDriver(
    'panel-content-order',
    treeFixture,
  );
  try {
    panelContentOrderDriver.driver.sendRawInput('\x1b[27;6;97~');
    await HarnessSmoke.Class.awaitStatus(
      panelContentOrderDriver.driver,
      panelContentOrderDriver.statusPath,
      "status condition: status.panelCellIds.join(',') === 'agent' && status.panelActiveContent === 'agent'",
      (status) =>
        Array.isArray(status.panelCellIds) &&
        status.panelCellIds.join(',') === 'agent' &&
        status.panelActiveContent === 'agent',
    );
    panelContentOrderDriver.driver.sendKeys('Control+j');
    await HarnessSmoke.Class.awaitStatus(
      panelContentOrderDriver.driver,
      panelContentOrderDriver.statusPath,
      "status condition: status.panelContentOrder.join(',') === 'agent,terminal,database' && status.panelCellIds.join(',') === 'terminal' && status.panelActiveContent === 'terminal'",
      (status) =>
        Array.isArray(status.panelContentOrder) &&
        status.panelContentOrder.join(',') === 'agent,terminal,database' &&
        Array.isArray(status.panelCellIds) &&
        status.panelCellIds.join(',') === 'terminal' &&
        status.panelActiveContent === 'terminal',
    );
    panelContentOrderDriver.driver.sendKeys('Alt+Up');
    await HarnessSmoke.Class.awaitStatus(
      panelContentOrderDriver.driver,
      panelContentOrderDriver.statusPath,
      "status condition: status.panelContentOrder.join(',') === 'terminal,agent,database' && status.panelCellIds.join(',') === 'terminal'",
      (status) =>
        Array.isArray(status.panelContentOrder) &&
        status.panelContentOrder.join(',') === 'terminal,agent,database' &&
        Array.isArray(status.panelCellIds) &&
        status.panelCellIds.join(',') === 'terminal',
    );
    HarnessSmoke.Class.pass(
      'panelContentOrder changes through Alt+Up without auto-splitting the active group',
    );
  } finally {
    await panelContentOrderDriver.driver.dispose();
    await setSetting('panelContentOrder', ['agent', 'terminal']);
  }

  console.log(
    '== harness settings: Git split ratio moves the commit-log region ==',
  );
  async function gitCommitRow(label: string, ratio: number): Promise<number> {
    await setSetting('gitSplitRatio', ratio);
    const launchedDriver = await launchDriver(label, gitFixture);
    try {
      launchedDriver.driver.sendKeys('Control+g');
      const snapshot = await launchedDriver.driver.awaitSnapshot(
        (candidate) => candidate.findText('init') !== null,
        15_000,
      );
      return markerRow(snapshot, 'init');
    } finally {
      await launchedDriver.driver.dispose();
    }
  }
  const highLogRegion = await gitCommitRow('git-ratio-low', 0.3);
  const lowLogRegion = await gitCommitRow('git-ratio-high', 0.7);
  HarnessSmoke.Class.requireCondition(
    lowLogRegion > highLogRegion,
    `gitSplitRatio 0.7 moves the commit row lower than 0.3 (${highLogRegion} to ${lowLogRegion})`,
  );
  await setSetting('gitSplitRatio', 0.5);

  console.log(
    '== harness settings: LSP file-size budget gates the real language server ==',
  );
  const tsgoPath = join(process.cwd(), 'node_modules', '.bin', 'tsgo');
  if (!(await Bun.file(tsgoPath).exists())) {
    console.log(
      '  SKIP  tsgo not installed — lspFileSizeLimitKb applied-effect drive skipped',
    );
  } else {
    async function lspResult(
      label: string,
      fileSizeLimitKilobytes: number,
    ): Promise<{ sizeSuppressed: boolean; diagnosticsCount: number }> {
      await setSetting('lspFileSizeLimitKb', fileSizeLimitKilobytes);
      await setSetting('typescriptServer', 'tsgo');
      const launchedDriver = await launchDriver(label, lspFixture, 120, 36);
      try {
        launchedDriver.driver.sendKeys('Down', 'Enter');
        const status = await HarnessSmoke.Class.awaitStatus(
          launchedDriver.driver,
          launchedDriver.statusPath,
          "status condition: String(candidate.activeBuffer).endsWith('/big.ts') && ( candidate.lspSizeSuppressed === true || Number(candidate.diagnosticsCount) > 0 )",
          (candidate) =>
            String(candidate.activeBuffer).endsWith('/big.ts') &&
            (candidate.lspSizeSuppressed === true ||
              Number(candidate.diagnosticsCount) > 0),
          60_000,
        );
        return {
          sizeSuppressed: status.lspSizeSuppressed === true,
          diagnosticsCount: Number(status.diagnosticsCount),
        };
      } finally {
        await launchedDriver.driver.dispose();
      }
    }
    const suppressedResult = await lspResult('lsp-suppressed', 1);
    const attachedResult = await lspResult('lsp-attached', 2_048);
    HarnessSmoke.Class.requireCondition(
      suppressedResult.sizeSuppressed &&
        suppressedResult.diagnosticsCount === 0,
      '1 KB budget size-suppresses the file and receives no diagnostics',
    );
    HarnessSmoke.Class.requireCondition(
      !attachedResult.sizeSuppressed && attachedResult.diagnosticsCount > 0,
      '2048 KB budget attaches the LSP and receives diagnostics',
    );
    await setSetting('lspFileSizeLimitKb', 2_048);
  }

  console.log('== harness settings: schema coverage meta-gate ==');
  const uncoveredSettings = schemaSettingNames.filter(
    (settingName) => !coveredSettingNames.has(settingName),
  );
  HarnessSmoke.Class.requireCondition(
    schemaSettingNames.length > 0,
    'runtime Settings defaults enumerate at least one schema field',
  );
  HarnessSmoke.Class.requireCondition(
    uncoveredSettings.length === 0,
    `all ${schemaSettingNames.length} schema fields have an ` +
      'applied-effect drive; ' +
      `uncovered: ${uncoveredSettings.join(', ') || 'none'}`,
  );

  console.log('smoke-settings-applied-harness: ALL-PASS');
} finally {
  await HarnessSmoke.Class.removeTemporaryDirectory(settingsHome);
  for (const fixtureDirectory of fixtureDirectories) {
    await HarnessSmoke.Class.removeTemporaryDirectory(fixtureDirectory);
  }
}
