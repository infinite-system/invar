#!/usr/bin/env bun
// Deterministic provider-neutral inline rewrite drive through the real PTY.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Inline rewrite responses are revision-stamped and stale results discarded (src/modules/lsp/lsp.invariants.md)
// invariant: An inline rewrite proposal never consumes an ordinary edit keystroke (src/modules/editor/editor.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';
import { ThemePalettes } from '../../src/modules/theme/ThemePalettes';

const repositoryRoot = process.cwd();
const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-inline-rewrite-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-inline-rewrite-home-'));
const statusPath = join(homeDirectory, 'status.json');
const inlineRewriteBackground = Number.parseInt(
  ThemePalettes.Class.dark.inlineRewriteBackground.slice(1),
  16,
);
mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
await Bun.write(
  join(homeDirectory, '.config', 'invar', 'settings.json'),
  JSON.stringify({ 'inlineRewrite.enabled': true }),
);
await Bun.write(
  join(fixtureRoot, 'rewrite.ts'),
  'const value = calculate()\nconst label = value\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  repositoryRoot,
  columns: 120,
  rows: 36,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_INLINE_REWRITE_SLOW_REQUEST_NUMBER: '4',
    INVAR_INLINE_REWRITE_SLOW_DELAY_MS: '3500',
  },
  command: [
    process.execPath,
    `--preload=${join(
      repositoryRoot,
      'scripts/harness/inline-rewrite-mock-provider-preload.ts',
    )}`,
    'src/main.ts',
    fixtureRoot,
  ],
});

function firstEditorLine(status: unknown): string {
  const statusRecord = status as Record<string, unknown>;
  return String(
    (statusRecord.editorLines as readonly unknown[] | undefined)?.[0],
  );
}

async function awaitInlineRewriteVisible(
  minimumRequestCount: number,
): Promise<void> {
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    `status condition: rewrite request ${minimumRequestCount} paints`,
    (status) =>
      status.inlineRewriteVisible === true &&
      Number(status.inlineRewriteMockRequestCount) >= minimumRequestCount,
    10_000,
  );
}

try {
  console.log('== harness inline rewrite: open the fixture ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.ready === true',
    (status) => status.ready === true,
    20_000,
  );
  driver.sendKeys('Down', 'Enter');
  const openedStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: rewrite.ts is the active buffer',
    (status) => String(status.activeBuffer).endsWith('/rewrite.ts'),
  );
  HarnessSmoke.Class.requireCondition(
    openedStatus.inlineRewriteEnabled === true &&
      Array.isArray(openedStatus.settingsSections) &&
      openedStatus.settingsSections.includes('Inline Rewrite'),
    'the contributed inlineRewrite.enabled setting is live and discoverable',
  );

  console.log(
    '== harness inline rewrite: debounce paints a themed proposal ==',
  );
  driver.sendKeys('End');
  driver.sendText(';');
  await awaitInlineRewriteVisible(1);
  let snapshot = await driver.awaitGridCondition(
    'the first rewrite candidate is visible in the terminal grid',
    (candidateSnapshot) =>
      candidateSnapshot.findText('const value = calculateValue();') !== null,
  );
  const firstCandidatePosition = snapshot.findText(
    'const value = calculateValue();',
  );
  const firstCandidateCell = firstCandidatePosition
    ? snapshot.cell(firstCandidatePosition.row, firstCandidatePosition.column)
    : null;
  HarnessSmoke.Class.requireCondition(
    firstCandidateCell?.isItalic === true &&
      firstCandidateCell.isDim === true &&
      firstCandidateCell.isBackgroundRgb === true &&
      firstCandidateCell.background === inlineRewriteBackground,
    'the proposal paints with inline-rewrite theme background and dim italic attributes',
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.text().includes('Ctrl+Alt+Right accept') &&
      snapshot.text().includes('Escape reject'),
    'the compact proposal hint names registry-derived accept and reject keys',
  );

  console.log('== harness inline rewrite: cycle and accept atomically ==');
  driver.sendKeys('Control+Alt+Down');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: the second rewrite variation is selected',
    (status) => Number(status.inlineRewriteSelectedCandidate) === 1,
  );
  snapshot = await driver.awaitGridCondition(
    'the second rewrite candidate is visible in the terminal grid',
    (candidateSnapshot) =>
      candidateSnapshot.findText('const computedValue = calculateValue();') !==
      null,
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('const computedValue = calculateValue();') !== null,
    'cycle-next paints the second ordered variation',
  );
  driver.sendKeys('Control+Alt+Up');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: cycle-previous returns to the first variation',
    (status) => Number(status.inlineRewriteSelectedCandidate) === 0,
  );
  driver.sendKeys('Control+Alt+Down', 'Control+Alt+Right');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: accept applies the second rewrite',
    (status) =>
      status.inlineRewriteVisible === false &&
      firstEditorLine(status) === 'const computedValue = calculateValue();',
  );
  driver.sendKeys('Control+z');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: one undo restores the pre-accept line',
    (status) => firstEditorLine(status) === 'const value = calculate();',
  );
  HarnessSmoke.Class.pass('accept is one undo step');

  console.log('== harness inline rewrite: reject and typing-through ==');
  driver.sendKeys('Control+Shift+r');
  await awaitInlineRewriteVisible(2);
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: reject dismisses the proposal',
    (status) => status.inlineRewriteVisible === false,
  );
  driver.sendKeys('Control+Shift+r');
  await awaitInlineRewriteVisible(3);
  driver.sendText('x');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: typing dismisses and the character lands',
    (status) =>
      status.inlineRewriteVisible === false &&
      firstEditorLine(status) === 'const value = calculate();x',
  );
  HarnessSmoke.Class.pass('ordinary typing dismisses without eating input');
  driver.sendKeys('Control+z');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: typing-through undo restores the fixture',
    (status) => firstEditorLine(status) === 'const value = calculate();',
  );

  console.log(
    '== harness inline rewrite: in-flight work stays idle and stale output is discarded ==',
  );
  driver.sendKeys('Control+Shift+r');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: the slow fourth request is in flight',
    (status) =>
      status.inlineRewriteRequestInFlight === true &&
      Number(status.inlineRewriteMockRequestCount) >= 4 &&
      Number(status.inlineRewriteMockDelayMilliseconds) === 3500,
  );
  if (process.env.INVAR_SKIP_INLINE_REWRITE_IDLE_CHECK !== '1') {
    const frameCountBefore = Number(
      HarnessSmoke.Class.readStatus(statusPath).frame,
    );
    await Bun.sleep(1000);
    const inFlightStatus = HarnessSmoke.Class.readStatus(statusPath);
    const frameCountAfter = Number(inFlightStatus.frame);
    HarnessSmoke.Class.requireCondition(
      frameCountAfter - frameCountBefore <= 1 &&
        inFlightStatus.inlineRewriteRequestInFlight === true,
      'an enabled in-flight rewrite advances at most one clock frame over ' +
        `one idle second (${frameCountBefore} -> ${frameCountAfter}; ` +
        `in flight ${String(inFlightStatus.inlineRewriteRequestInFlight)})`,
    );
  }
  driver.sendText('y');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: the edit after request lands before the response',
    (status) =>
      status.inlineRewriteVisible === false &&
      firstEditorLine(status) === 'const value = calculate();y',
  );
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: the stale mock response has arrived without painting',
    (status) =>
      Number(status.inlineRewriteMockResponseCount) >= 4 &&
      status.inlineRewriteVisible === false,
  );
  HarnessSmoke.Class.pass('a response for an older revision never paints');
  console.log('smoke-inline-rewrite-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
