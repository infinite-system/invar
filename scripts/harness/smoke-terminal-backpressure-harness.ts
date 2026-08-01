#!/usr/bin/env bun
// Drive the product-side OpenPty role: a focused integrated terminal receives a large paste while
// its foreground child is stopped in raw mode, then a reserved UI key must still hide the panel and
// produce a fresh frame.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Shared PTY writes never block the event loop (src/modules/terminal/terminal.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const fixtureRoot = mkdtempSync(
  join(tmpdir(), 'tui-terminal-backpressure-harness-'),
);

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-terminal-backpressure-harness-home-'),
);

const statusPath = join(homeDirectory, 'status.json');

const stoppedChildIdentifierPath = join(
  homeDirectory,
  'stopped-terminal-child.pid',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
  },
});

let stoppedChildProcessIdentifier = 0;

try {
  console.log(
    '== harness terminal backpressure: open and focus the integrated terminal ==',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the application is ready before opening the integrated terminal',
    (status) => status.ready === true,
    15_000,
  );
  driver.sendKeys('Control+j');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the integrated terminal is visible and focused',
    (status) =>
      status.terminalVisible === true &&
      status.terminalFocused === true &&
      status.panelActiveContentKind === 'terminal',
  );
  driver.sendText('echo BACKPRESSURE_READY');
  driver.sendKeys('Enter');
  await driver.awaitGridCondition(
    'the nested shell completes a readiness round trip',
    (snapshot) => snapshot.findText('BACKPRESSURE_READY') !== null,
  );
  HarnessSmoke.Class.pass(
    'the integrated terminal completed a shell round trip',
  );

  console.log(
    '== harness terminal backpressure: stop a raw child that cannot read the paste ==',
  );
  driver.sendText(
    `bash -c 'echo $$ > ${stoppedChildIdentifierPath}; ` +
      `stty raw -echo; kill -STOP $$'`,
  );
  driver.sendKeys('Enter');
  const stoppedChildDeadline = performance.now() + 10_000;
  let stoppedChildStateObserved = false;
  while (performance.now() < stoppedChildDeadline) {
    const identifierFile = Bun.file(stoppedChildIdentifierPath);
    if (await identifierFile.exists()) {
      stoppedChildProcessIdentifier = Number(
        (await identifierFile.text()).trim(),
      );
      if (stoppedChildProcessIdentifier > 0) {
        try {
          const processStatus = await Bun.file(
            `/proc/${stoppedChildProcessIdentifier}/status`,
          ).text();
          if (/^State:\s+T/m.test(processStatus)) {
            stoppedChildStateObserved = true;
            break;
          }
        } catch {
          // The child has not reached its stopped state yet.
        }
      }
    }
    await Bun.sleep(10);
  }
  HarnessSmoke.Class.requireCondition(
    stoppedChildStateObserved,
    'the integrated terminal foreground child is stopped in raw mode',
  );
  // AWAIT THE HEADING, do not sample after quiescence and hope. Quiescence means "no frame is
  // pending", which is NOT the condition this assertion reads: under gate load the shell can still be
  // starting, so the heading has not been painted yet and the sample finds nothing. This exact line
  // failed a gate on 2026-07-26 while passing solo — the wait must observe what the assertion reads.
  await driver.awaitGridCondition(
    'the terminal heading names the running shell before the backpressured paste',
    (candidate) => candidate.findText('bash') !== null,
  );

  console.log(
    '== harness terminal backpressure: a large paste cannot freeze later UI input ==',
  );
  driver.sendPaste('x'.repeat(65_536));
  driver.sendKeys('Control+j');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Ctrl+J is processed after the paste and hides the backpressured terminal',
    (status) => status.terminalVisible === false,
    10_000,
  );
  await driver.awaitGridCondition(
    'the frame loop repaints after hiding the backpressured terminal',
    (snapshot) => snapshot.findText('bash') === null,
    10_000,
  );
  HarnessSmoke.Class.pass(
    'a subsequent Ctrl+J keystroke registers after the backpressured paste',
  );
  HarnessSmoke.Class.pass(
    'the frame loop repaints after the backpressured terminal is hidden',
  );
  driver.sendKeys('Control+q');
  HarnessSmoke.Class.requireCondition(
    (await driver.exitCode()) === 0,
    'the responsive application exits cleanly after the backpressure drive',
  );
  console.log('smoke-terminal-backpressure-harness: ALL-PASS');
} finally {
  if (stoppedChildProcessIdentifier > 0) {
    try {
      process.kill(stoppedChildProcessIdentifier, 'SIGKILL');
    } catch {
      // The stopped child already exited with its owning application.
    }
  }
  driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
}
