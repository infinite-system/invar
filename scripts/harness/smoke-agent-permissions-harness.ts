#!/usr/bin/env bun
// Byte-level port of the interactive permission loop using the permission-gated echo backend.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const themedSearchGlyph = ThemeIcons.Class.findIconsFor('unicode').search;

interface Rectangle {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface PanelHeadingGeometryStatus {
  readonly contentId: string;
  readonly row: number;
}

interface AgentFooterRegion {
  readonly row: number;
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

function agentFooterRegion(status: StatusSnapshot): AgentFooterRegion | null {
  const bottomPanel = (
    status.layoutSlots as Record<string, Rectangle> | undefined
  )?.bottomPanel;
  const headings = status.panelHeadingGeometry;
  if (!bottomPanel || !Array.isArray(headings)) return null;
  const agentHeading = (
    headings as unknown as readonly PanelHeadingGeometryStatus[]
  ).find((heading) => heading.contentId === 'agent');
  const panelViewportRows = Number(status.terminalRows);
  if (!agentHeading || panelViewportRows <= 0) return null;
  return {
    row: agentHeading.row + panelViewportRows,
    startColumn: bottomPanel.left + 1,
    endColumnExclusive: bottomPanel.left + bottomPanel.width - 1,
  };
}

function agentPermissionFooterSignature(
  snapshot: HarnessSnapshot.Model,
  footerRegion: AgentFooterRegion,
): string | null {
  const footerCharacters: string[] = [];
  let themedSearchGlyphFound = false;
  for (
    let column = footerRegion.startColumn;
    column < footerRegion.endColumnExclusive;
    column++
  ) {
    const characters =
      snapshot.cell(footerRegion.row, column)?.characters ?? ' ';
    footerCharacters.push(characters);
    if (characters === themedSearchGlyph) themedSearchGlyphFound = true;
  }
  return themedSearchGlyphFound ? footerCharacters.join('\0') : null;
}

async function submitPrompt(
  driver: PtyTestDriver.Model,
  statusPath: string,
  prompt: string,
): Promise<void> {
  // The pending-permission wait must be unreachable from the previous prompt.
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'no permission is pending before this command is sent',
    (status) =>
      status.agentPendingPermissionTool === null ||
      status.agentPendingPermissionTool === undefined ||
      status.agentPendingPermissionTool === '',
  );
  driver.sendText(prompt);
  await driver.awaitSnapshot((snapshot) => snapshot.findText(prompt) !== null);
  driver.sendKeys('Enter');
  const permissionStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `a permission is pending for ${prompt}`,
    (status) =>
      status.agentPendingPermissionTool === 'Bash' &&
      String(status.agentLastAssistantText).includes(prompt),
  );
  HarnessSmoke.Class.requireCondition(
    String(permissionStatus.agentLastAssistantText).includes(prompt),
    `the pending permission belongs to ${prompt}`,
  );
  await driver.awaitGridCondition(
    `the permission prompt for ${prompt} is visibly rendered`,
    (snapshot) =>
      snapshot.findText('[y] allow') !== null &&
      snapshot.findText('[n] deny') !== null &&
      snapshot.findText('[a] always') !== null &&
      snapshot.findText('▸ ⚙ Bash') === null,
  );
}

async function answerPermission(
  driver: PtyTestDriver.Model,
  statusPath: string,
  answer: 'y' | 'n' | 'a',
): Promise<void> {
  driver.sendText(answer);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.agentBusy === false && status.agentPendingPermissionTool === ''",
    (status) =>
      status.agentBusy === false && status.agentPendingPermissionTool === '',
  );
}

const repositoryRoot = process.cwd();
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-agent-permissions-harness-home-'),
);
mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
await Bun.write(
  join(homeDirectory, '.config', 'invar', 'settings.json'),
  JSON.stringify({ glyphMode: 'unicode' }),
);
const statusPath = join(homeDirectory, 'status.json');
const driver = new PtyTestDriver.Class({
  workspaceRoot: join(repositoryRoot, 'fixtures'),
  repositoryRoot,
  columns: 110,
  rows: 34,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
    INVAR_AGENT_ECHO_PERMISSION: '1',
  },
});

try {
  console.log('== harness agent permissions: enter ask mode ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.ready === true',
    (status) => status.ready === true,
    20_000,
  );
  driver.sendRawInput('\x1b[27;6;97~');
  const agentFooterStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the agent footer owner has published its panel geometry',
    (candidate) => agentFooterRegion(candidate) !== null,
  );
  const footerRegion = agentFooterRegion(agentFooterStatus);
  if (!footerRegion) throw new Error('Agent footer geometry disappeared');
  const bypassSnapshot = await driver.awaitGridCondition(
    'the permission state is visible in the agent-owned footer',
    (snapshot) =>
      agentPermissionFooterSignature(snapshot, footerRegion) !== null,
  );
  const bypassFooterSignature = agentPermissionFooterSignature(
    bypassSnapshot,
    footerRegion,
  );
  if (!bypassFooterSignature) {
    throw new Error('Agent permission footer disappeared');
  }
  driver.sendKeys('Shift+Tab');
  await driver.awaitGridCondition(
    'Shift+Tab visibly changes the agent-owned permission state',
    (snapshot) => {
      const footerSignature = agentPermissionFooterSignature(
        snapshot,
        footerRegion,
      );
      return (
        footerSignature !== null && footerSignature !== bypassFooterSignature
      );
    },
  );
  HarnessSmoke.Class.pass('Shift+Tab cycles bypass mode to ask permissions');

  console.log('== harness agent permissions: allow one gated tool ==');
  await submitPrompt(driver, statusPath, 'first-gated-command');
  let snapshot = driver.snapshot();
  let status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the gated agent tool remains busy behind the permission prompt',
    (candidate) => candidate.agentBusy === true,
  );
  HarnessSmoke.Class.requireCondition(
    status.agentBusy === true &&
      snapshot.findText('? Claude wants to run') !== null &&
      snapshot.findText('$ echo gated for: first-gated-command') !== null &&
      snapshot.findText('[y] allow') !== null &&
      snapshot.findText('▸ ⚙ Bash') === null,
    'tool is paused behind the rendered permission prompt',
  );
  await answerPermission(driver, statusPath, 'y');
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('✓ allowed') !== null &&
      candidate.findText('▸ ⚙ Bash') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('▸ ⚙ Bash') !== null,
    'allow runs the gated tool and completes the turn',
  );

  console.log('== harness agent permissions: deny one gated tool ==');
  await submitPrompt(driver, statusPath, 'second-gated-command');
  await answerPermission(driver, statusPath, 'n');
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('✗ denied') !== null &&
      candidate.findText('will not run that command') !== null &&
      candidate.findText('▸ ✓ gated for: second-gated-command') === null,
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('▸ ✓ gated for: second-gated-command') === null,
    'deny records the refusal without producing a tool-result row',
  );

  console.log('== harness agent permissions: stray input is swallowed ==');
  await submitPrompt(driver, statusPath, 'third-gated-command');
  driver.sendRawInputWithoutFrameExpectation('zqx');
  await driver.awaitGridCondition(
    'the permission prompt remains visible without rendering stray input',
    (snapshot) =>
      snapshot.findText('[y] allow') !== null &&
      snapshot.findText('[n] deny') !== null &&
      snapshot.findText('[a] always') !== null &&
      snapshot.findText('zqx') === null,
  );
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'stray typing leaves the Bash permission unresolved',
    (candidate) => candidate.agentPendingPermissionTool === 'Bash',
  );
  HarnessSmoke.Class.pass('stray typing leaves the permission unresolved');
  await answerPermission(driver, statusPath, 'y');
  HarnessSmoke.Class.pass('a later valid answer resolves the prompt');

  console.log(
    '== harness agent permissions: always allow persists for the session ==',
  );
  await submitPrompt(driver, statusPath, 'fourth-gated-command');
  await answerPermission(driver, statusPath, 'a');
  await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('gated for: fourth-gated-command') !== null,
  );
  driver.sendText('fifth-auto-allowed');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('fifth-auto-allowed') !== null,
  );
  driver.sendKeys('Enter');
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: candidate.agentBusy === false',
    (candidate) =>
      candidate.agentBusy === false &&
      candidate.agentPendingPermissionTool === '',
  );
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('gated for: fifth-auto-allowed') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    status.agentPendingPermissionTool === '' &&
      snapshot.findText('gated for: fifth-auto-allowed') !== null,
    'always-allow skips the next prompt and runs its tool',
  );

  driver.sendKeys('Control+q');
  await driver.exitCode();
  console.log('smoke-agent-permissions-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
