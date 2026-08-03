#!/usr/bin/env bun
// Byte-level drive of the agent-visible integrated-terminal tools and clean prompt.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Blocking gate verdicts use ordering and counts (scripts/harness/harness.invariants.md)
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

function paneText(
  snapshot: HarnessSnapshot.Model,
  paneLeft: number,
  paneColumns: number,
): string {
  return snapshot
    .textRows()
    .map((_rowText, rowIndex) =>
      snapshot
        .rowCells(rowIndex)
        .slice(paneLeft, paneLeft + paneColumns)
        .filter((cell) => cell.width > 0)
        .map((cell) => cell.characters || ' ')
        .join(''),
    )
    .join('\n');
}

function findBottommostText(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): { row: number; column: number } | null {
  for (let rowIndex = snapshot.rows - 1; rowIndex >= 0; rowIndex -= 1) {
    const column = snapshot.rowText(rowIndex).lastIndexOf(marker);
    if (column >= 0) return { row: rowIndex, column };
  }
  return null;
}

function activePanelText(
  snapshot: HarnessSnapshot.Model,
  statusPath: string,
): string {
  const status = JSON.parse(readFileSync(statusPath, 'utf8')) as Record<
    string,
    unknown
  >;
  const layoutSlots = status.layoutSlots as
    Record<string, { left: number }> | undefined;
  const panelCellColumns = status.panelCellColumns as number[] | undefined;
  const focusedCellIndex = Number(status.panelFocusedIndex ?? 0);
  const panelLeft = Number(layoutSlots?.bottomPanel?.left ?? 0) + 1;
  const panelColumns = Number(panelCellColumns?.[focusedCellIndex] ?? 0);
  return paneText(snapshot, panelLeft, panelColumns);
}

function snapshotHasPromptColor(
  snapshot: HarnessSnapshot.Model,
  promptColor: number,
): boolean {
  return snapshot
    .textRows()
    .some((_rowText, rowIndex) =>
      snapshot
        .rowCells(rowIndex)
        .some(
          (cell) =>
            cell.characters === '$' &&
            cell.isForegroundRgb &&
            cell.foreground === promptColor,
        ),
    );
}

async function awaitFileContents(
  path: string,
  expected: string,
): Promise<void> {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    if (existsSync(path) && readFileSync(path, 'utf8') === expected) return;
    await Bun.sleep(10);
  }
  throw new Error(`Timed out waiting for ${path} to contain ${expected}`);
}

async function openAgentPane(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<void> {
  driver.sendRawInput('\x1b[27;6;97~');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.panelActiveContentKind === 'agent' && status.panelFocused === true",
    (status) =>
      status.panelActiveContentKind === 'agent' && status.panelFocused === true,
  );
}

async function driveAnimatedTerminalTools(
  homeDirectory: string,
  settingsPath: string,
): Promise<void> {
  writeFileSync(
    settingsPath,
    JSON.stringify({
      agentSkipPermissions: true,
      terminalTypingSpeed: 40,
      reducedMotion: false,
      terminalCleanPrompt: true,
    }),
  );
  const statusPath = join(homeDirectory, 'animated-status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: join(process.cwd(), 'fixtures'),
    columns: 140,
    rows: 42,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
    },
  });
  const stagedPath = join(homeDirectory, 'staged-proof.txt');
  const injectionPath = join(homeDirectory, 'injection-proof.txt');
  const queuedPath = join(homeDirectory, 'queued-proof.txt');
  const animatedPath = join(homeDirectory, 'animated-proof.txt');
  const replacementPath = join(homeDirectory, 'replacement-proof.txt');

  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.ready === true',
      (status) => status.ready === true,
    );

    console.log(
      '== harness terminal-stage: clean themed prompt and live header ==',
    );
    driver.sendKeys('Control+j');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      "status condition: status.panelActiveContentKind === 'terminal' && status.terminalFocused === true",
      (status) =>
        status.panelActiveContentKind === 'terminal' &&
        status.terminalFocused === true,
    );
    let snapshot = await driver.awaitGridCondition(
      'the clean terminal paints the minimal prompt with the ' +
        'terminalPrompt palette role',
      (candidate) => snapshotHasPromptColor(candidate, 0x7aa2f7),
      15_000,
    );
    HarnessSmoke.Class.requireCondition(
      snapshotHasPromptColor(snapshot, 0x7aa2f7),
      'minimal $ prompt foreground equals the terminalPrompt palette role',
    );
    const panelBodyTop =
      Number(
        (
          HarnessSmoke.Class.readStatus(statusPath).panelSeparatorGeometry as {
            tabRow?: number;
          } | null
        )?.tabRow,
      ) + 1;
    HarnessSmoke.Class.requireCondition(
      snapshot
        .textRows()
        .slice(panelBodyTop)
        .every((rowText) => !rowText.includes('Terminal ×')),
      'the terminal body has no local heading or close control',
    );

    driver.sendText('cd /tmp');
    driver.sendKeys('Enter');
    driver.sendText('pwd');
    driver.sendKeys('Enter');
    snapshot = await driver.awaitSnapshot((candidate) =>
      candidate.textRows().join('\n').includes('/tmp'),
    );
    HarnessSmoke.Class.requireCondition(
      snapshot.textRows().join('\n').includes('/tmp'),
      'the terminal preserves its live working directory after cd',
    );

    console.log(
      '== harness terminal-stage: echo backend lists provider tools ==',
    );
    await openAgentPane(driver, statusPath);
    driver.sendText('terminal-tools:list');
    driver.sendKeys('Enter');
    snapshot = await driver.awaitSnapshot(
      (candidate) => candidate.findText('stageTerminalCommand') !== null,
    );
    let sawRunTerminalCommand =
      snapshot.findText('runTerminalCommand') !== null;
    let sawReplaceTerminalInput =
      snapshot.findText('replaceTerminalInput') !== null;
    for (
      let page = 0;
      page < 12 && !(sawRunTerminalCommand && sawReplaceTerminalInput);
      page += 1
    ) {
      driver.sendKeys('PageUp');
      await driver.awaitScreenChange();
      snapshot = driver.snapshot();
      sawRunTerminalCommand ||=
        snapshot.findText('runTerminalCommand') !== null;
      sawReplaceTerminalInput ||=
        snapshot.findText('replaceTerminalInput') !== null;
    }
    HarnessSmoke.Class.requireCondition(
      sawRunTerminalCommand && sawReplaceTerminalInput,
      'the editor-centered pane exposes every registered terminal tool manual by scrolling',
    );

    console.log(
      '== harness terminal-stage: staged command is inert until human Enter ==',
    );
    driver.sendText(`terminal-tools:stage:printf STAGED > ${stagedPath}`);
    driver.sendKeys('Enter');
    const terminalStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      "status condition: Array.isArray(status.panelCellKinds) && status.panelCellKinds.join(',') === 'terminal' && status.panelFocusedIndex === 0",
      (status) =>
        Array.isArray(status.panelCellKinds) &&
        status.panelCellKinds.join(',') === 'terminal' &&
        status.panelFocusedIndex === 0,
    );
    const activeTerminalCell =
      HarnessSmoke.Class.activePanelCell(terminalStatus);
    const panelCellColumns = terminalStatus.panelCellColumns as number[];
    if (activeTerminalCell?.kind !== 'terminal') {
      throw new Error('The active terminal cell geometry disappeared');
    }
    const terminalCellIndex = activeTerminalCell.index;
    const panelLeft =
      Number(
        (
          terminalStatus.layoutSlots as
            Record<string, { left: number }> | undefined
        )?.bottomPanel?.left ?? 0,
      ) + 1;
    const terminalPaneLeft =
      panelLeft +
      (terminalCellIndex === 0 ? 0 : Number(panelCellColumns[0] ?? 0) + 1);
    const terminalPaneColumns = Number(
      panelCellColumns[terminalCellIndex] ?? 0,
    );
    const terminalText = (candidate: HarnessSnapshot.Model): string =>
      paneText(candidate, terminalPaneLeft, terminalPaneColumns);
    snapshot = await driver.awaitSnapshot(
      (candidate) => terminalText(candidate).includes('printf STAGED'),
      15_000,
    );
    HarnessSmoke.Class.requireCondition(
      !existsSync(stagedPath),
      'staged bytes appear at the prompt and do not execute',
    );
    driver.sendKeys('Enter');
    await awaitFileContents(stagedPath, 'STAGED');
    HarnessSmoke.Class.pass('human Enter executes the staged readline buffer');

    console.log(
      '== harness terminal-stage: grapheme-safe staged typing and mid-line edit ==',
    );
    await openAgentPane(driver, statusPath);
    const emojiCommand = 'echo "test — with emoji 🦊✨"';
    driver.sendText(`terminal-tools:stage:${emojiCommand}`);
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the emoji stage request finishes before the user edits its readline buffer',
      (candidate) =>
        candidate.agentBusy === false &&
        String(candidate.agentLastToolResult).includes('Staged without Enter'),
    );
    snapshot = await driver.awaitSnapshot((candidate) =>
      terminalText(candidate)
        .split('\n')
        .some(
          (rowText) =>
            rowText.includes('echo "test — with emoji 🦊') &&
            rowText.includes('✨ "'),
        ),
    );
    await openAgentPane(driver, statusPath);
    driver.sendText('terminal-tools:read');
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'readTerminalInput confirms the complete staged emoji command before editing',
      (candidate) =>
        candidate.agentBusy === false &&
        String(candidate.agentLastToolResult).includes(
          `Current terminal input: ${emojiCommand}`,
        ),
    );
    driver.sendKeys('Control+j');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the terminal group is active before the staged command is edited',
      (candidate) => candidate.panelActiveContentKind === 'terminal',
    );
    driver.sendKeys('Left');
    driver.sendText('X');
    driver.sendKeys('Backspace');
    driver.sendKeys('End');
    snapshot = await driver.awaitSnapshot((candidate) =>
      terminalText(candidate).includes('echo "test — with emoji 🦊'),
    );
    HarnessSmoke.Class.requireCondition(
      terminalText(snapshot).includes('echo "test — with emoji 🦊'),
      'four-byte emoji and variation-selector graphemes reach readline intact',
    );
    driver.sendKeys('Enter');
    snapshot = await driver.awaitSnapshot((candidate) =>
      terminalText(candidate)
        .split('\n')
        .some(
          (rowText) =>
            rowText.includes('test — with emoji') &&
            rowText.includes('🦊') &&
            rowText.includes('✨') &&
            !rowText.includes('echo "'),
        ),
    );
    HarnessSmoke.Class.requireCondition(
      terminalText(snapshot)
        .split('\n')
        .some(
          (rowText) =>
            rowText.includes('test — with emoji') &&
            rowText.includes('🦊') &&
            rowText.includes('✨') &&
            !rowText.includes('echo "'),
        ),
      'mid-line editing preserves the exact command and Enter executes byte-exact emoji output',
    );

    console.log(
      '== harness terminal-stage: read and replace the real readline buffer ==',
    );
    driver.sendText('printf BROKN_COMMAND');
    await driver.awaitSnapshot((candidate) =>
      terminalText(candidate).includes('printf BROKN_COMMAND'),
    );
    await openAgentPane(driver, statusPath);
    driver.sendText('terminal-tools:read');
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'readTerminalInput finishes with the current readline buffer',
      (candidate) =>
        candidate.agentBusy === false &&
        typeof candidate.agentLastToolResult === 'string' &&
        candidate.agentLastToolResult.includes(
          'Current terminal input: printf BROKN_COMMAND',
        ),
    );
    driver.sendKeys('Control+j');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the terminal group is active before the completed transcript repaints',
      (candidate) => candidate.panelActiveContentKind === 'terminal',
    );
    await openAgentPane(driver, statusPath);
    snapshot = await driver.awaitGridCondition(
      'the completed readTerminalInput result summary repaints after returning to the agent',
      (candidate) =>
        findBottommostText(candidate, 'lines') !== null &&
        findBottommostText(candidate, 'readTerminalInput') !== null,
    );
    const readResultSummary = findBottommostText(snapshot, 'lines');
    HarnessSmoke.Class.requireCondition(
      readResultSummary !== null,
      'readTerminalInput returns terminal scrollback through the provider tool path',
    );
    if (!readResultSummary)
      throw new Error('readTerminalInput result summary disappeared');
    driver.sendMouseClick({
      column: readResultSummary.column,
      row: readResultSummary.row,
      button: 'left',
    });
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'clicking the readTerminalInput result expands exactly one tool row',
      (candidate) => candidate.agentExpandedCount === 1,
    );
    snapshot = await driver.awaitGridCondition(
      'the expanded tool result shows the current terminal input',
      (candidate) =>
        candidate.findText('Current terminal input: printf') !== null,
    );
    HarnessSmoke.Class.pass(
      'the read result reports the hidden terminal readline buffer',
    );
    driver.sendText(
      `terminal-tools:replace:printf REPLACED > ${replacementPath}`,
    );
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the replacement finishes typing before the human executes it',
      (candidate) =>
        candidate.agentBusy === false &&
        candidate.panelActiveContentKind === 'terminal',
    );
    snapshot = await driver.awaitSnapshot((candidate) =>
      terminalText(candidate).includes(`printf REPLACED > ${replacementPath}`),
    );
    HarnessSmoke.Class.requireCondition(
      !existsSync(replacementPath) &&
        !terminalText(snapshot).includes('BROKN_COMMANDprintf REPLACED'),
      'replaceTerminalInput clears the old line and stages the replacement without Enter',
    );
    driver.sendKeys('Enter');
    await awaitFileContents(replacementPath, 'REPLACED');
    await openAgentPane(driver, statusPath);
    await driver.awaitSnapshot(
      (candidate) =>
        candidate.findText('terminal command user-executed') !== null,
    );
    HarnessSmoke.Class.pass(
      'replacement executes only after human Enter and records the diff event',
    );

    console.log(
      '== harness terminal-stage: newline injection is stripped before the first byte ==',
    );
    driver.sendText(
      `terminal-tools:stage:printf SAFE\\ntouch ${injectionPath}`,
    );
    driver.sendKeys('Enter');
    snapshot = await driver.awaitSnapshot((candidate) =>
      terminalText(candidate).includes('printf SAFEtouch'),
    );
    HarnessSmoke.Class.requireCondition(
      !existsSync(injectionPath) &&
        !terminalText(snapshot).includes('printf SAFE\ntouch'),
      'embedded newline is stripped and neither command executes',
    );
    driver.sendKeys('Control+c');
    await driver.awaitSnapshot(
      (candidate) => candidate.findText('^C') !== null,
    );

    console.log(
      '== harness terminal-stage: user input blocks and queues agent typing ==',
    );
    driver.sendText('printf USER_BUSY');
    await driver.awaitSnapshot((candidate) =>
      terminalText(candidate).includes('printf USER_BUSY'),
    );
    await openAgentPane(driver, statusPath);
    driver.sendText(`terminal-tools:stage:printf QUEUED > ${queuedPath}`);
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the busy readline buffer queues the staged agent command',
      (candidate) =>
        candidate.panelActiveContentKind === 'terminal' &&
        String(candidate.agentLastToolResult).includes('Queued until'),
    );
    HarnessSmoke.Class.requireCondition(
      !existsSync(queuedPath),
      'agent command queues while the user owns a non-empty readline buffer',
    );
    driver.sendKeys('Control+c');
    await driver.awaitSnapshot((candidate) =>
      terminalText(candidate).includes('printf QUEUED'),
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: candidate.panelFocusedIndex === terminalCellIndex',
      (candidate) => candidate.panelFocusedIndex === terminalCellIndex,
    );
    HarnessSmoke.Class.pass(
      'queued command types only after the user releases the prompt',
    );
    driver.sendKeys('Enter');
    await awaitFileContents(queuedPath, 'QUEUED');

    console.log(
      '== harness terminal-stage: animated run exposes intermediate partial states ==',
    );
    await openAgentPane(driver, statusPath);
    const animatedCommand = `printf ANIMATED_RUN > ${animatedPath} # human cadence proof xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`;
    driver.sendText(`terminal-tools:run:${animatedCommand}`);
    driver.sendKeys('Enter');
    snapshot = await driver.awaitSnapshot((candidate) => {
      const projectedTerminalText = terminalText(candidate);
      return (
        projectedTerminalText.includes('printf ANI') &&
        !projectedTerminalText.includes(animatedCommand)
      );
    });
    HarnessSmoke.Class.requireCondition(
      terminalText(snapshot).includes('printf ANI') &&
        !terminalText(snapshot).includes(animatedCommand),
      'animated run paints an intermediate partial command',
    );
    await awaitFileContents(animatedPath, 'ANIMATED_RUN');
    await driver.awaitSnapshot((candidate) =>
      terminalText(candidate).includes('ANIMATED_RUN'),
    );
    HarnessSmoke.Class.pass(
      'runTerminalCommand sends Enter after the full visible command',
    );

    driver.sendKeys('Control+q');
    HarnessSmoke.Class.requireCondition(
      (await driver.exitCode()) === 0,
      'animated drive quits cleanly',
    );
  } finally {
    await driver.dispose();
  }
}

async function driveReducedMotion(
  homeDirectory: string,
  settingsPath: string,
): Promise<void> {
  writeFileSync(
    settingsPath,
    JSON.stringify({
      agentSkipPermissions: true,
      terminalTypingSpeed: 10,
      reducedMotion: true,
      terminalCleanPrompt: true,
    }),
  );
  const statusPath = join(homeDirectory, 'reduced-motion-status.json');
  const reducedMotionPath = join(homeDirectory, 'reduced-motion-proof.txt');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: join(process.cwd(), 'fixtures'),
    columns: 140,
    rows: 42,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.ready === true',
      (status) => status.ready === true,
    );
    await openAgentPane(driver, statusPath);
    const command = `printf INSTANT > ${reducedMotionPath} # ${'x'.repeat(120)}`;
    let firstTypingFrameObserved = false;
    let firstTypingFrameWasComplete = false;
    await driver.collectCompletedFrameObservationsUntil({
      conditionDescription:
        'the reduced-motion terminal command paints and creates its proof file',
      condition: () =>
        existsSync(reducedMotionPath) && firstTypingFrameObserved,
      observeFrame: (completedFrameObservation) => {
        const projectedTerminalText = activePanelText(
          completedFrameObservation.snapshot,
          statusPath,
        );
        if (
          !firstTypingFrameObserved &&
          projectedTerminalText.includes('printf')
        ) {
          firstTypingFrameObserved = true;
          firstTypingFrameWasComplete =
            projectedTerminalText.includes('xxxxxxxxxxxx');
        }
      },
      performAction: () => {
        driver.sendText(`terminal-tools:run:${command}`);
        driver.sendKeys('Enter');
      },
    });
    await awaitFileContents(reducedMotionPath, 'INSTANT');
    const positiveControlFailure = firstTypingFrameCompletionFailure(
      true,
      false,
    );
    HarnessSmoke.Class.requireCondition(
      positiveControlFailure !== null,
      'reduced-motion frame positive control rejects a partial first frame',
    );
    console.log(
      `reduced-motion frame positive control RED (expected): ` +
        positiveControlFailure,
    );
    const missingFramePositiveControlFailure =
      firstTypingFrameCompletionFailure(false, false);
    HarnessSmoke.Class.requireCondition(
      missingFramePositiveControlFailure !== null,
      'reduced-motion frame positive control rejects a missing typing frame',
    );
    console.log(
      `reduced-motion missing-frame positive control RED (expected): ` +
        missingFramePositiveControlFailure,
    );
    const completionFailure = firstTypingFrameCompletionFailure(
      firstTypingFrameObserved,
      firstTypingFrameWasComplete,
    );
    HarnessSmoke.Class.requireCondition(
      completionFailure === null,
      completionFailure ??
        'reducedMotion writes the complete command in its first typing frame',
    );
    driver.sendKeys('Control+q');
  } finally {
    await driver.dispose();
  }
}

function firstTypingFrameCompletionFailure(
  firstTypingFrameObserved: boolean,
  firstTypingFrameWasComplete: boolean,
): string | null {
  if (firstTypingFrameObserved && firstTypingFrameWasComplete) return null;
  return (
    `reducedMotion first-frame ordering failed: observed=` +
    `${firstTypingFrameObserved}, complete=${firstTypingFrameWasComplete}`
  );
}

async function countAgentTypingFrames(
  homeDirectory: string,
  settingsPath: string,
  label: string,
  terminalTypingSpeed: number,
): Promise<number> {
  writeFileSync(
    settingsPath,
    JSON.stringify({
      agentSkipPermissions: true,
      terminalTypingSpeed,
      reducedMotion: false,
      terminalCleanPrompt: true,
    }),
  );
  const statusPath = join(homeDirectory, `${label}-typing-status.json`);
  const executedCommandPath = join(homeDirectory, `${label}-typing-proof.txt`);
  const driver = new PtyTestDriver.Class({
    workspaceRoot: join(process.cwd(), 'fixtures'),
    columns: 140,
    rows: 42,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.ready === true',
      (status) => status.ready === true,
    );
    await openAgentPane(driver, statusPath);
    const command = `printf ${label.toUpperCase()} > ${executedCommandPath} # ${'x'.repeat(60)}`;
    const completedFrameObservations =
      await driver.collectCompletedFrameObservationsUntil({
        conditionDescription: `${label} terminal typing creates its proof file`,
        condition: () => existsSync(executedCommandPath),
        performAction: () => {
          driver.sendText(`terminal-tools:run:${command}`);
          driver.sendKeys('Enter');
        },
      });
    await awaitFileContents(executedCommandPath, label.toUpperCase());
    return completedFrameObservations.length;
  } finally {
    await driver.dispose();
  }
}

async function driveAgentTypingSpeed(
  homeDirectory: string,
  settingsPath: string,
): Promise<void> {
  console.log(
    '== harness terminal-stage: terminalTypingSpeed controls visible typing frames ==',
  );
  const slowCompletedFrameCount = await countAgentTypingFrames(
    homeDirectory,
    settingsPath,
    'slow',
    10,
  );
  const fastCompletedFrameCount = await countAgentTypingFrames(
    homeDirectory,
    settingsPath,
    'fast',
    240,
  );
  const positiveControlFailure = typingFrameOrderingFailure(3, 3);
  HarnessSmoke.Class.requireCondition(
    positiveControlFailure !== null,
    'typing-frame positive control rejects equal slow and fast frame counts',
  );
  console.log(
    `typing-frame positive control RED (expected): ` + positiveControlFailure,
  );
  const orderingFailure = typingFrameOrderingFailure(
    slowCompletedFrameCount,
    fastCompletedFrameCount,
  );
  HarnessSmoke.Class.requireCondition(
    orderingFailure === null,
    orderingFailure ??
      'terminalTypingSpeed 10 spans more completed frames than 240',
  );
}

function typingFrameOrderingFailure(
  slowCompletedFrameCount: number,
  fastCompletedFrameCount: number,
): string | null {
  if (slowCompletedFrameCount > fastCompletedFrameCount) return null;
  return (
    `terminalTypingSpeed frame ordering failed: slow=` +
    `${slowCompletedFrameCount}, fast=${fastCompletedFrameCount}; ` +
    `expected slow > fast`
  );
}

async function driveTerminalCleanPromptDisabled(
  homeDirectory: string,
  settingsPath: string,
): Promise<void> {
  writeFileSync(join(homeDirectory, '.bashrc'), "PS1='NORMAL_PROMPT> '\n");
  writeFileSync(
    settingsPath,
    JSON.stringify({
      agentSkipPermissions: true,
      terminalTypingSpeed: 40,
      reducedMotion: false,
      terminalCleanPrompt: false,
    }),
  );
  const statusPath = join(homeDirectory, 'default-prompt-status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: join(process.cwd(), 'fixtures'),
    columns: 140,
    rows: 42,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
      SHELL: '/bin/bash',
    },
  });
  try {
    console.log(
      '== harness terminal-stage: terminalCleanPrompt false keeps the shell prompt ==',
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.ready === true',
      (status) => status.ready === true,
    );
    driver.sendKeys('Control+j');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      "status condition: status.panelActiveContentKind === 'terminal' && status.terminalFocused === true",
      (status) =>
        status.panelActiveContentKind === 'terminal' &&
        status.terminalFocused === true,
    );
    const snapshot = await driver.awaitGridCondition(
      'the normal interactive shell prompt from HOME is visible',
      (candidate) => candidate.findText('NORMAL_PROMPT>') !== null,
      15_000,
    );
    HarnessSmoke.Class.requireCondition(
      snapshot.findText('NORMAL_PROMPT>') !== null,
      'terminalCleanPrompt false preserves the user shell prompt',
    );
  } finally {
    await driver.dispose();
  }
}

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-terminal-stage-harness-home-'),
);

const settingsDirectory = join(homeDirectory, '.config', 'invar');

const settingsPath = join(settingsDirectory, 'settings.json');

mkdirSync(settingsDirectory, { recursive: true });

try {
  await driveAnimatedTerminalTools(homeDirectory, settingsPath);
  await driveReducedMotion(homeDirectory, settingsPath);
  await driveAgentTypingSpeed(homeDirectory, settingsPath);
  await driveTerminalCleanPromptDisabled(homeDirectory, settingsPath);
  console.log('smoke-terminal-stage-harness: ALL-PASS');
} finally {
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
