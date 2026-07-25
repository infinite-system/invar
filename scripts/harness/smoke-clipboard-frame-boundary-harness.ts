#!/usr/bin/env bun
// Byte-level OSC 52 drive across terminal selection, agent transcript, and agent composer. Every
// emission is decoded from the real app PTY and must begin at ground state between synchronized
// frames, both while the renderer is active and after it has settled.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Synchronized end markers bound complete frames (scripts/harness/harness.invariants.md)
// invariant: Clipboard emissions flush at frame boundaries (src/modules/system/system.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { dragBetweenCells } from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';
import { TerminalOutputAudit, type ClipboardEmission } from './TerminalOutputAudit';

const activeCopyRunCount = 5;
const idleCopyRunCount = 5;
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-clipboard-boundary-home-'));
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
    const clipboardEmissions = TerminalOutputAudit.Class.clipboardEmissions(
      driver.recordedOutput(),
    );
    if (clipboardEmissions.length > previousEmissionCount) {
      const clipboardEmission = clipboardEmissions[previousEmissionCount];
      if (!clipboardEmission) throw new Error('New clipboard emission disappeared');
      HarnessSmoke.Class.requireCondition(
        clipboardEmission.decodedText === expectedText,
        `OSC 52 payload decodes exactly to ${expectedText}; received `
        + JSON.stringify(clipboardEmission.decodedText),
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
    `Timed out waiting for OSC 52 payload ${expectedText}; outputTail=`
    + JSON.stringify(driver.recordedOutput().slice(-800)),
  );
}

async function copySelectionRepeatedly(
  expectedText: string,
  runCount: number,
  activity: 'active' | 'idle',
  activateRenderer?: (runIndex: number) => void,
): Promise<void> {
  for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
    let followingActiveFrame:
      | ReturnType<PtyTestDriver.Model['awaitNextCompletedFrameSnapshot']>
      | undefined;
    if (activity === 'active') {
      if (activateRenderer) {
        // Thunk-driven activity starts every round from momentum REST: a wheel train landing
        // mid-glide of the previous round's opposite train cancels velocity (dead round), and
        // accumulated drift walks the view into a clamp. Ambient activity (a running shell loop)
        // must NOT rest — silence there means the activity source has ended.
        await HarnessSmoke.Class.awaitFrameSilence(driver);
        activateRenderer(runIndex);
      }
      console.log(`    · active round ${runIndex}: awaiting pre-copy frame`);
      await driver.awaitNextCompletedFrameSnapshot();
      console.log(`    · active round ${runIndex}: pre-copy frame arrived`);
      followingActiveFrame = driver.awaitNextCompletedFrameSnapshot();
    } else {
      await HarnessSmoke.Class.awaitFrameSilence(driver);
    }
    const previousEmissionCount = TerminalOutputAudit.Class.clipboardEmissions(
      driver.recordedOutput(),
    ).length;
    driver.sendRawInputWithoutFrameExpectation('\x1b[27;5;99~');
    await awaitClipboardEmission(previousEmissionCount, expectedText);
    await followingActiveFrame;
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
  if (!position) throw new Error(`Selection target disappeared: ${expectedText}`);
  await dragBetweenCells(
    driver,
    position.column,
    position.row,
    position.column + expectedText.length - (composerSelection ? 0 : 1),
    position.row,
  );
  return position;
}

try {
  console.log('== clipboard boundary: active agent transcript and composer ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.ready === true",
    (status) => status.ready === true,
    20_000,
  );
  driver.sendRawInput('\x1b[27;6;97~');
  await driver.awaitGridCondition(
    'the agent composer is focused',
    (snapshot) => snapshot.findText('Ask Claude') !== null,
  );
  for (let turnIndex = 0; turnIndex < 6; turnIndex += 1) {
    const promptMarker = turnIndex === 5
      ? 'ACTIVE-TRANSCRIPT'
      : `transcript-fill-${turnIndex}`;
    const prompt = turnIndex === 5
      ? promptMarker
      : `${promptMarker}-${'words '.repeat(12)}`;
    driver.sendText(prompt);
    await driver.awaitGridCondition(
      `${promptMarker} is visible in the composer`,
      (snapshot) => snapshot.findText(promptMarker) !== null,
    );
    driver.sendKeys('Enter');
    await driver.awaitQuiescence();
  }
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.agentBusy === false",
    (status) => status.agentBusy === false,
  );
  const transcriptPosition = await selectVisibleText('ACTIVE-TRANSCRIPT');
  // A wheel-notch TRAIN, not a lone notch: progressive impulse gain makes a from-rest notch a
  // one-row precision step (one frame), and each copy round awaits two frames. Three compounding
  // notches glide several rows — a frame stream.
  const transcriptWheelTrain = (direction: 'up' | 'down', notchCount: number): void => {
    for (let notch = 0; notch < notchCount; notch += 1) {
      driver.sendMouseWithoutFrameExpectation({
        kind: 'wheel',
        column: transcriptPosition.column,
        row: transcriptPosition.row,
        direction,
      });
    }
  };
  // Deterministic anchor: clamp the transcript at the TOP of its scrollback (a known state), so a
  // round alternation of down/up trains always has room to move — no drift-into-clamp dead rounds.
  const anchorTranscriptAtScrollbackTop = async (): Promise<void> => {
    transcriptWheelTrain('up', 12);
    await HarnessSmoke.Class.awaitFrameSilence(driver);
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
  transcriptWheelTrain('down', 12);
  await HarnessSmoke.Class.awaitFrameSilence(driver);
  await selectVisibleText('ACTIVE-TRANSCRIPT');
  await copySelectionRepeatedly('ACTIVE-TRANSCRIPT', idleCopyRunCount, 'idle');

  console.log('== clipboard boundary: idle terminal selection ==');
  driver.sendKeys('F8');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.panelActiveContent === 'terminal' && status.terminalFocused === true",
    (status) => status.panelActiveContent === 'terminal' && status.terminalFocused === true,
  );
  driver.sendText('printf IDLE-TERMINAL');
  const idleTerminalPosition = await selectVisibleText('IDLE-TERMINAL');
  await copySelectionRepeatedly('IDLE-TERMINAL', idleCopyRunCount, 'idle');

  console.log('== clipboard boundary: active terminal selection ==');
  // Deselect by clicking the DISCOVERED terminal cell: fixed coordinates encode one layout
  // configuration, and the full-height left dock now owns the old (2, 30) cell.
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: idleTerminalPosition.column,
    row: idleTerminalPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: idleTerminalPosition.column,
    row: idleTerminalPosition.row,
    button: 'left',
  });
  await driver.awaitQuiescence();
  driver.sendKeys('Control+c');
  await driver.awaitQuiescence();
  const activeTerminalCommand =
    "for iteration in $(seq 1 500); do printf '\\rACTIVE-TERMINAL-%03d' \"$iteration\"; "
    + 'sleep 0.02; done';
  driver.sendText(activeTerminalCommand);
  // Staging sequencing only: the staged command wraps at the pane width, so no single-row text
  // wait can gate here. Quiescence proves the typed bytes flushed and the echo settled; the loop
  // output assertion below prints at pane column 0 and cannot straddle a row boundary.
  await driver.awaitQuiescence();
  driver.sendKeys('Enter');
  await driver.awaitGridCondition(
    'the shell loop emits its first changing terminal row',
    (snapshot) => snapshot.findText('ACTIVE-TERMINAL-001') !== null,
  );
  await selectVisibleText('ACTIVE-TERMINAL');
  await copySelectionRepeatedly('ACTIVE-TERMINAL', activeCopyRunCount, 'active');
  driver.sendMouseWithoutFrameExpectation({ kind: 'press', column: 2, row: 30, button: 'left' });
  driver.sendMouse({ kind: 'release', column: 2, row: 30, button: 'left' });
  await driver.awaitQuiescence();
  driver.sendKeys('Control+c');
  await driver.awaitQuiescence();

  driver.sendKeys('Control+q');
  await driver.exitCode();
  console.log('smoke-clipboard-frame-boundary-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(homeDirectory, { recursive: true, force: true });
}
