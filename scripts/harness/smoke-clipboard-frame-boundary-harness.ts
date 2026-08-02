#!/usr/bin/env bun
// Byte-level OSC 52 drive across terminal selection, agent transcript, and agent composer. Every
// emission is decoded from the real app PTY and must begin at ground state between synchronized
// frames, both while the renderer is active and after it has settled.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Synchronized end markers bound complete frames (scripts/harness/harness.invariants.md)
// invariant: Clipboard emissions flush at frame boundaries (src/modules/system/system.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import { dragBetweenCells } from './HarnessSmokeSupport';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';
import type { ClipboardEmission } from './TerminalOutputAudit';

const activeCopyRunCount = 5;

const idleCopyRunCount = 5;

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-clipboard-boundary-home-'),
);

const statusPath = join(homeDirectory, 'status.json');

const driver = new PtyTestDriver.Class({
  workspaceRoot: join(process.cwd(), 'fixtures'),
  columns: 110,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
    INVAR_AGENT_ECHO_DELAY_MS: '0',
  },
});

async function awaitClipboardEmission(
  previousEmissionCount: number,
  expectedText: string,
): Promise<ClipboardEmission> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const clipboardEmissions = driver.clipboardEmissions();
    if (clipboardEmissions.length > previousEmissionCount) {
      const clipboardEmission = clipboardEmissions[previousEmissionCount];
      if (!clipboardEmission)
        throw new Error('New clipboard emission disappeared');
      HarnessSmoke.Class.requireCondition(
        clipboardEmission.decodedText === expectedText,
        `OSC 52 payload decodes exactly to ${expectedText}; received ` +
          JSON.stringify(clipboardEmission.decodedText),
      );
      HarnessSmoke.Class.requireCondition(
        clipboardEmission.hasValidBase64Payload,
        'OSC 52 payload is canonical base64',
      );
      HarnessSmoke.Class.requireCondition(
        clipboardEmission.synchronizedFrameDepth === 0,
        'OSC 52 starts outside synchronized frame markers',
      );
      HarnessSmoke.Class.requireCondition(
        !clipboardEmission.startedWithinControlSequence,
        'OSC 52 starts outside every other escape sequence',
      );
      return clipboardEmission;
    }
    await Bun.sleep(5);
  }
  throw new Error(
    `Timed out waiting for OSC 52 payload ${expectedText}; outputTail=` +
      JSON.stringify(driver.recordedOutput().slice(-800)),
  );
}

async function copySelectionRepeatedly(
  expectedText: string,
  runCount: number,
  activity: 'active' | 'idle',
  activateRenderer?: (runIndex: number) => void | Promise<void>,
): Promise<void> {
  for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
    if (activity === 'active') {
      if (activateRenderer) {
        await HarnessSmoke.Class.awaitStatus(
          driver,
          statusPath,
          'the panel scroll surface is at rest before active clipboard input',
          (status) => status.panelScrollMomentumAtRest === true,
        );
        await activateRenderer(runIndex);
        await HarnessSmoke.Class.awaitStatus(
          driver,
          statusPath,
          'the panel scroll surface is active before clipboard input',
          (status) => status.panelScrollMomentumAtRest === false,
        );
      } else {
        const initialGridText = driver.snapshot().text();
        await driver.awaitGridCondition(
          'the active terminal output advances before clipboard input',
          (candidate) => candidate.text() !== initialGridText,
        );
      }
    }
    const previousEmissionCount = driver.clipboardEmissions().length;
    driver.sendRawInputWithoutFrameExpectation('\x1b[27;5;99~');
    await awaitClipboardEmission(previousEmissionCount, expectedText);
  }
  HarnessSmoke.Class.pass(
    `${expectedText} copied ${runCount}/${runCount} while renderer was ${activity}`,
  );
}

async function selectVisibleText(
  expectedText: string,
  composerSelection = false,
): Promise<{ column: number; row: number }> {
  const snapshot = await driver.awaitGridCondition(
    `${expectedText} is visible for selection`,
    (candidate) => candidate.findText(expectedText) !== null,
  );
  const position = snapshot.findText(expectedText);
  if (!position)
    throw new Error(`Selection target disappeared: ${expectedText}`);
  await dragBetweenCells(
    driver,
    position.column,
    position.row,
    position.column + expectedText.length - (composerSelection ? 0 : 1),
    position.row,
  );
  return position;
}

function activeTerminalOutputPosition(
  snapshot: HarnessSnapshot.Model,
): { column: number; row: number } | null {
  for (const [rowIndex, rowText] of snapshot.textRows().entries()) {
    const outputMatch = /ACTIVE-TERMINAL-\d{3}/.exec(rowText);
    if (outputMatch?.index !== undefined) {
      return { column: outputMatch.index, row: rowIndex };
    }
  }
  return null;
}

function panelCellBodyPoint(status: StatusSnapshot): {
  column: number;
  row: number;
} {
  const activeCell = HarnessSmoke.Class.activePanelCell(status);
  const panelCellColumns = Array.isArray(status.panelCellColumns)
    ? status.panelCellColumns.map(Number)
    : [];
  const layoutSlots = status.layoutSlots as
    | Record<
        string,
        { left: number; top: number; width: number; height: number }
      >
    | undefined;
  const bottomPanel = layoutSlots?.bottomPanel;
  if (!activeCell || !bottomPanel) {
    throw new Error('Panel geometry unavailable for the active pane');
  }
  const precedingCellColumns = panelCellColumns
    .slice(0, activeCell.index)
    .reduce((columnTotal, cellColumnCount) => columnTotal + cellColumnCount, 0);
  const screenRows = Number(status.height);
  const layoutCanvasTop =
    screenRows - 1 - (bottomPanel.top + bottomPanel.height);
  return {
    column: bottomPanel.left + 2 + precedingCellColumns + activeCell.index,
    row: layoutCanvasTop + bottomPanel.top + Math.floor(bottomPanel.height / 2),
  };
}

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.ready === true',
    (status) => status.ready === true,
    20_000,
  );

  console.log('== clipboard boundary: Settings selection ==');
  const focusBeforeSettings = (
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the host focus is published before Settings opens',
      (status) => typeof status.focus === 'string',
    )
  ).focus;
  driver.sendKeys('Control+,');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings owns the modal overlay before selection',
    (status) => status.inputOverlay === 'settingsPanel',
  );
  const settingsTarget = 'Scrolling';
  const settingsSnapshot = await driver.awaitGridCondition(
    'the known Settings heading is visible for selection',
    (snapshot) => snapshot.findText(settingsTarget) !== null,
  );
  const settingsTargetPosition = settingsSnapshot.findText(settingsTarget);
  if (!settingsTargetPosition)
    throw new Error('Settings selection target disappeared');
  await dragBetweenCells(
    driver,
    settingsTargetPosition.column,
    settingsTargetPosition.row,
    settingsTargetPosition.column + settingsTarget.length - 1,
    settingsTargetPosition.row,
  );
  const settingsEmissionCount = driver.clipboardEmissions().length;
  driver.sendKeys('Control+c');
  await awaitClipboardEmission(settingsEmissionCount, settingsTarget);
  await driver.awaitGridCondition(
    'the Settings selection paints the existing selection background',
    (snapshot) => {
      const targetBackgrounds = Array.from(
        { length: settingsTarget.length },
        (_unused, offset) =>
          snapshot.cell(
            settingsTargetPosition.row,
            settingsTargetPosition.column + offset,
          )?.background,
      );
      const selectedBackground = targetBackgrounds[0];
      const followingBackground = snapshot.cell(
        settingsTargetPosition.row,
        settingsTargetPosition.column + settingsTarget.length,
      )?.background;
      return (
        selectedBackground !== undefined &&
        targetBackgrounds.every(
          (background) => background === selectedBackground,
        ) &&
        selectedBackground !== followingBackground
      );
    },
  );
  const selectedLabelBeforeKeyboard = (
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the selected Settings label is published after pointer selection',
      (status) => typeof status.settingsSelectedLabel === 'string',
    )
  ).settingsSelectedLabel;
  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings keyboard navigation still advances after pointer selection',
    (status) =>
      status.inputOverlay === 'settingsPanel' &&
      status.focus === focusBeforeSettings &&
      status.settingsSelectedLabel !== selectedLabelBeforeKeyboard,
  );
  HarnessSmoke.Class.pass(
    'Settings selection copies visibly without stealing focus or keyboard navigation',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings closes before the panel clipboard drives',
    (status) => status.settingsOpen === false,
  );

  console.log('== clipboard boundary: active agent transcript and composer ==');
  driver.sendRawInput('\x1b[27;6;97~');
  await driver.awaitGridCondition(
    'the agent composer is focused',
    (snapshot) => snapshot.findText('Ask Claude') !== null,
  );
  for (let turnIndex = 0; turnIndex < 6; turnIndex += 1) {
    const promptMarker =
      turnIndex === 5 ? 'ACTIVE-TRANSCRIPT' : `transcript-fill-${turnIndex}`;
    const prompt =
      turnIndex === 5 ? promptMarker : `${promptMarker}-${'words '.repeat(12)}`;
    driver.sendText(prompt);
    await driver.awaitGridCondition(
      `${promptMarker} is visible in the composer`,
      (snapshot) => snapshot.findText(promptMarker) !== null,
    );
    driver.sendKeys('Enter');
    await driver.awaitScreenChange();
  }
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.agentBusy === false',
    (status) => status.agentBusy === false,
  );
  const transcriptPosition = await selectVisibleText('ACTIVE-TRANSCRIPT');
  // A wheel-notch TRAIN, not a lone notch: progressive impulse gain makes a from-rest notch a
  // one-row precision step (one frame), and each copy round awaits two frames. Three compounding
  // notches glide several rows — a frame stream.
  const transcriptWheelTrain = (
    direction: 'up' | 'down',
    notchCount: number,
  ): void => {
    for (let notchNumber = 0; notchNumber < notchCount; notchNumber += 1) {
      driver.sendMouseWithoutFrameExpectation({
        kind: 'wheel',
        column: transcriptPosition.column,
        row: transcriptPosition.row,
        direction,
      });
    }
  };
  const driveTranscriptToAnchor = async (
    direction: 'up' | 'down',
    conditionDescription: string,
    predicate: (status: StatusSnapshot) => boolean,
  ): Promise<void> => {
    let observationFinished = false;
    const observation = HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      conditionDescription,
      predicate,
      20_000,
    ).finally(() => {
      observationFinished = true;
    });
    while (!observationFinished) {
      transcriptWheelTrain(direction, 3);
      await Bun.sleep(50);
    }
    await observation;
  };
  // Deterministic anchor: clamp the transcript at the TOP of its scrollback (a known state), so a
  // round alternation of down/up trains always has room to move — no drift-into-clamp dead rounds.
  const anchorTranscriptAtScrollbackTop = async (): Promise<void> => {
    await driveTranscriptToAnchor(
      'up',
      'the transcript reaches the top scrollback anchor',
      (status) => Number(status.agentScrollTop) === 0,
    );
  };
  const transcriptActivity = (runIndex: number): void => {
    transcriptWheelTrain(runIndex % 2 === 0 ? 'down' : 'up', 3);
  };
  await anchorTranscriptAtScrollbackTop();
  await copySelectionRepeatedly(
    'ACTIVE-TRANSCRIPT',
    activeCopyRunCount,
    'active',
    transcriptActivity,
  );

  driver.sendText('ACTIVE-COMPOSER');
  await selectVisibleText('ACTIVE-COMPOSER', true);
  // Same deterministic activity as the transcript phase: the wheel scrolls the transcript (frames)
  // while the SELECTION lives in the composer — re-anchor first because the transcript phase's
  // rounds moved the view.
  await anchorTranscriptAtScrollbackTop();
  await copySelectionRepeatedly(
    'ACTIVE-COMPOSER',
    activeCopyRunCount,
    'active',
    transcriptActivity,
  );

  console.log('== clipboard boundary: idle agent transcript and composer ==');
  await copySelectionRepeatedly('ACTIVE-COMPOSER', idleCopyRunCount, 'idle');
  // The active phases anchored the transcript at scrollback TOP; the newest message lives at the
  // bottom — return there before selecting it.
  await driveTranscriptToAnchor(
    'down',
    'the transcript returns to its bottom anchor',
    (status) => status.agentStuckToBottom === true,
  );
  await selectVisibleText('ACTIVE-TRANSCRIPT');
  await copySelectionRepeatedly('ACTIVE-TRANSCRIPT', idleCopyRunCount, 'idle');

  console.log('== clipboard boundary: idle terminal selection ==');
  driver.sendKeys('Control+j');
  const terminalLayoutStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.panelActiveContentKind === 'terminal' && status.terminalFocused === true && status.panelCellKinds.includes('terminal') && status.panelCellColumns.length === status.panelCellIds.length",
    (status) =>
      status.panelActiveContentKind === 'terminal' &&
      status.terminalFocused === true &&
      Array.isArray(status.panelCellIds) &&
      status.panelCellKinds.includes('terminal') &&
      Array.isArray(status.panelCellColumns) &&
      status.panelCellColumns.length === status.panelCellIds.length &&
      typeof status.layoutSlots === 'object' &&
      status.layoutSlots !== null,
  );
  const terminalCellBodyPoint = panelCellBodyPoint(terminalLayoutStatus);
  driver.sendText('printf IDLE-TERMINAL');
  await driver.awaitScreenChange();
  driver.sendKeys('Enter');
  await selectVisibleText('IDLE-TERMINAL');
  await copySelectionRepeatedly('IDLE-TERMINAL', idleCopyRunCount, 'idle');

  console.log('== clipboard boundary: active terminal selection ==');
  // Deselect by clicking the DISCOVERED terminal cell: fixed coordinates encode one layout
  // configuration, and the full-height left dock now owns the old (2, 30) cell.
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: terminalCellBodyPoint.column,
    row: terminalCellBodyPoint.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: terminalCellBodyPoint.column,
    row: terminalCellBodyPoint.row,
    button: 'left',
  });
  await driver.awaitScreenChange();
  driver.sendKeys('Control+c');
  await driver.awaitScreenChange();
  const activeTerminalCommand =
    'for iteration in $(seq 1 500); do printf \'\\rACTIVE-TERMINAL-%03d\' "$iteration"; ' +
    'sleep 0.02; done';
  driver.sendText(activeTerminalCommand);
  // Staging sequencing only: the staged command wraps at the pane width, so no single-row text
  // wait can gate here. Quiescence proves the typed bytes flushed and the echo settled; the loop
  // output assertion below prints at pane column 0 and cannot straddle a row boundary.
  await driver.awaitScreenChange();
  driver.sendKeys('Enter');
  const activeTerminalOutputSnapshot = await driver.awaitGridCondition(
    'the shell loop emits a numbered changing terminal output row',
    (snapshot) => activeTerminalOutputPosition(snapshot) !== null,
  );
  const activeTerminalPosition = activeTerminalOutputPosition(
    activeTerminalOutputSnapshot,
  );
  if (!activeTerminalPosition)
    throw new Error('Active terminal output row disappeared before selection');
  await dragBetweenCells(
    driver,
    activeTerminalPosition.column,
    activeTerminalPosition.row,
    activeTerminalPosition.column + 'ACTIVE-TERMINAL'.length - 1,
    activeTerminalPosition.row,
  );
  await copySelectionRepeatedly(
    'ACTIVE-TERMINAL',
    activeCopyRunCount,
    'active',
  );
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: terminalCellBodyPoint.column,
    row: terminalCellBodyPoint.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: terminalCellBodyPoint.column,
    row: terminalCellBodyPoint.row,
    button: 'left',
  });
  await driver.awaitScreenChange();
  driver.sendKeys('Control+c');
  await driver.awaitScreenChange();

  driver.sendKeys('Control+q');
  await driver.exitCode();
  console.log('smoke-clipboard-frame-boundary-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
