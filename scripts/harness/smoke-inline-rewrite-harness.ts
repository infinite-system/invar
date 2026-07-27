#!/usr/bin/env bun
// Deterministic provider-neutral inline rewrite drive through the real PTY.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
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
const reproductionMode = process.env.INVAR_INLINE_REWRITE_REPRO ?? '';
const inlineRewriteBackground = Number.parseInt(
  ThemePalettes.Class.DARK.inlineRewriteBackground.slice(1),
  16,
);
mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
await Bun.write(
  join(homeDirectory, '.config', 'invar', 'settings.json'),
  JSON.stringify({
    'inlineRewrite.enabled': reproductionMode !== 'disabled',
  }),
);
await Bun.write(
  join(fixtureRoot, 'rewrite.ts'),
  'const value = calculate()\nconst label = original\n',
);
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);
HarnessSmoke.Class.runGit(fixtureRoot, ['add', 'rewrite.ts']);
HarnessSmoke.Class.runGit(fixtureRoot, [
  '-c',
  'user.email=inline-rewrite@example.test',
  '-c',
  'user.name=Inline Rewrite Smoke',
  'commit',
  '-qm',
  'fixture',
]);
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
    INVAR_INLINE_REWRITE_SLOW_REQUEST_NUMBER:
      reproductionMode === 'typed' ? '1' : '4',
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

function lineHasGutterMarker(
  snapshot: import('./HarnessSnapshot').HarnessSnapshot.Model,
  lineText: string,
): boolean {
  const linePosition = snapshot.findText(lineText);
  if (!linePosition || linePosition.column === 0) return false;
  return (
    snapshot.cell(linePosition.row, linePosition.column - 1)?.characters === '▎'
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

function idleOwnershipFailure(
  status: Record<string, unknown>,
  expectedRequestCount: number | null,
): string | null {
  const requestCount = Number(status.inlineRewriteMockRequestCount ?? 0);
  if (
    status.renderQuiescent === true &&
    (expectedRequestCount === null || requestCount === expectedRequestCount)
  ) {
    return null;
  }
  return (
    `inline rewrite idle ownership failed: renderQuiescent=` +
    `${String(status.renderQuiescent)}, requests=${requestCount}, ` +
    `expectedRequests=${expectedRequestCount ?? 'unchanged'}`
  );
}

const idleOwnershipPositiveControl = idleOwnershipFailure(
  {
    renderQuiescent: false,
    inlineRewriteMockRequestCount: 1,
  },
  0,
);
HarnessSmoke.Class.requireCondition(
  idleOwnershipPositiveControl !== null,
  'inline-rewrite idle positive control rejects an active render owner',
);
console.log(
  `inline-rewrite idle positive control RED (expected): ` +
    idleOwnershipPositiveControl,
);

smoke: try {
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
  await driver.awaitGridCondition(
    'the tracked dirty fixture paints its live gutter marker',
    (snapshot) => lineHasGutterMarker(snapshot, 'const label = value'),
    10_000,
  );
  if (reproductionMode === 'plugin-disabled') {
    driver.sendKeys('Control+Shift+x', 'Down', 'Down', 'Down');
    await driver.awaitGridCondition(
      'Inline Rewrite is selected for plugin disable',
      (snapshot) => snapshot.findText('› [x] Inline Rewrite') !== null,
    );
    driver.sendKeys('Space');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: plugin disable removes its setting schema',
      (status) =>
        !(status.settingsSections as string[] | undefined)?.includes(
          'Inline Rewrite',
        ),
    );
    driver.sendKeys('Control+Shift+j');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: editor focus returns after plugin disable',
      (status) => status.focus === 'editor',
    );
    const disabledPluginStatus =
      await HarnessSmoke.Class.awaitStatusWithoutFrame(
        driver,
        statusPath,
        'status condition: disabled plugin is render-quiescent',
        (status) => status.renderQuiescent === true,
      );
    const disabledPluginFailure = idleOwnershipFailure(disabledPluginStatus, 0);
    HarnessSmoke.Class.requireCondition(
      disabledPluginFailure === null,
      disabledPluginFailure ?? 'disabled plugin owns no request or render loop',
    );
    console.log('smoke-inline-rewrite-harness: ALL-PASS');
    break smoke;
  }
  if (reproductionMode === 'disabled') {
    HarnessSmoke.Class.requireCondition(
      openedStatus.inlineRewriteEnabled === false,
      'the inline rewrite setting is disabled',
    );
    driver.sendKeys('End');
    driver.sendText(';');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: the disabled-feature edit lands',
      (status) => firstEditorLine(status) === 'const value = calculate();',
    );
    await driver.awaitGridCondition(
      'the disabled-feature edit and its gutter marker settle visibly',
      (snapshot) => lineHasGutterMarker(snapshot, 'const value = calculate();'),
    );
    const disabledSettledStatus =
      await HarnessSmoke.Class.awaitStatusWithoutFrame(
        driver,
        statusPath,
        'status condition: disabled inline rewrite is render-quiescent',
        (status) => status.renderQuiescent === true,
      );
    const disabledFailure = idleOwnershipFailure(disabledSettledStatus, 0);
    HarnessSmoke.Class.requireCondition(
      disabledFailure === null,
      disabledFailure ??
        'disabled inline rewrite owns no request or render loop',
    );
    console.log('smoke-inline-rewrite-harness: ALL-PASS');
    break smoke;
  }
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
  let expectedTypedLine = 'const value = calculate();';
  let minimumVisibleRequestCount = 1;
  if (reproductionMode === 'typed') {
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: the delayed first request is in flight',
      (status) =>
        status.inlineRewriteRequestInFlight === true &&
        Number(status.inlineRewriteMockRequestCount) >= 1,
    );
    for (const typedCharacter of 'typed') {
      const nextFrame = driver.awaitNextCompletedFrameSnapshot();
      driver.sendText(typedCharacter);
      expectedTypedLine += typedCharacter;
      const { snapshot: typingSnapshot } = await nextFrame;
      HarnessSmoke.Class.requireCondition(
        typingSnapshot.findText(expectedTypedLine) !== null,
        `typed text remains visible after ${typedCharacter}`,
      );
      await driver.awaitQuiescence();
      await Bun.sleep(800);
    }
    minimumVisibleRequestCount = 2;
  }
  await awaitInlineRewriteVisible(minimumVisibleRequestCount);
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
  if (reproductionMode === 'typed') {
    HarnessSmoke.Class.requireCondition(
      snapshot.findText(expectedTypedLine) !== null,
      'every typed character remains visible while the proposal paints',
    );
    console.log('smoke-inline-rewrite-harness: ALL-PASS');
    break smoke;
  }
  if (reproductionMode === 'idle') {
    const idleSettledStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: visible inline rewrite is render-quiescent',
      (status) => status.renderQuiescent === true,
    );
    const idleFailure = idleOwnershipFailure(idleSettledStatus, null);
    HarnessSmoke.Class.requireCondition(
      idleFailure === null,
      idleFailure ??
        'settled inline rewrite with live gutter marks is render-quiescent',
    );
    console.log('smoke-inline-rewrite-harness: ALL-PASS');
    break smoke;
  }

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
    const inFlightStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: in-flight inline rewrite is render-quiescent',
      (status) =>
        status.inlineRewriteRequestInFlight === true &&
        status.renderQuiescent === true,
    );
    const inFlightFailure = idleOwnershipFailure(inFlightStatus, null);
    HarnessSmoke.Class.requireCondition(
      inFlightFailure === null,
      inFlightFailure ?? 'in-flight work owns no render loop',
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
