#!/usr/bin/env bun
// Byte-level port of the hermetic agent-engine switch contract, including context transfer and
// provider-derived title, greeting, and transcript identity.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PanelHeadingGeometryStatus {
  readonly contentId: string;
  readonly row: number;
}

interface AgentFooterRegion {
  readonly headingRow: number;
  readonly row: number;
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

function bottomPanelSlot(status: StatusSnapshot): Rectangle {
  const layoutSlots = status.layoutSlots as
    Record<string, Rectangle> | undefined;
  const bottomPanel = layoutSlots?.bottomPanel;
  if (!bottomPanel) throw new Error('Bottom-panel slot geometry disappeared');
  return bottomPanel;
}

function agentFooterRegion(status: StatusSnapshot): AgentFooterRegion | null {
  const bottomPanel = (
    status.layoutSlots as Record<string, Rectangle> | undefined
  )?.bottomPanel;
  const headings = status.panelHeadingGeometry;
  const activeCell = HarnessSmoke.Class.activePanelCell(status);
  const cellColumns = status.panelCellColumns;
  if (
    !bottomPanel ||
    !Array.isArray(headings) ||
    activeCell?.kind !== 'agent' ||
    !Array.isArray(cellColumns)
  ) {
    return null;
  }
  const agentHeading = (
    headings as unknown as readonly PanelHeadingGeometryStatus[]
  ).find((heading) => heading.contentId === activeCell.identifier);
  const panelViewportRows = Number(status.panelRows);
  const contentColumns = activeCell.columns;
  if (!agentHeading || panelViewportRows <= 0 || contentColumns <= 0) {
    return null;
  }
  let startColumn = bottomPanel.left + 1;
  for (
    let precedingIndex = 0;
    precedingIndex < activeCell.index;
    precedingIndex += 1
  ) {
    startColumn += Number(cellColumns[precedingIndex]) + 1;
  }
  return {
    headingRow: agentHeading.row,
    row: agentHeading.row + panelViewportRows,
    startColumn,
    endColumnExclusive: startColumn + contentColumns,
  };
}

function requireAgentFooterRegion(status: StatusSnapshot): AgentFooterRegion {
  const footerRegion = agentFooterRegion(status);
  if (!footerRegion) throw new Error('Agent footer geometry disappeared');
  return footerRegion;
}

function engineSegmentPosition(
  snapshot: HarnessSnapshot.Model,
  footerRegion: AgentFooterRegion,
): { readonly column: number; readonly row: number } | null {
  for (
    let column = footerRegion.startColumn;
    column < footerRegion.endColumnExclusive;
    column += 1
  ) {
    if (
      (snapshot.cell(footerRegion.row, column)?.characters ?? '').trim()
        .length > 0
    ) {
      return { column, row: footerRegion.row };
    }
  }
  return null;
}

function agentPaneOmitsPublishedTitle(
  snapshot: HarnessSnapshot.Model,
  footerRegion: AgentFooterRegion,
  status: StatusSnapshot,
): boolean {
  return !snapshot
    .rowText(footerRegion.headingRow)
    .slice(footerRegion.startColumn, footerRegion.endColumnExclusive)
    .includes(String(status.agentTitle));
}

function hasTranscriptLabel(
  snapshot: HarnessSnapshot.Model,
  panelRectangle: Rectangle,
  label: string,
): boolean {
  return snapshot.textRows().some((rowText) => {
    const trimmedRow = rowText
      .slice(panelRectangle.left, panelRectangle.left + panelRectangle.width)
      .trimEnd();
    return trimmedRow.trim() === label;
  });
}

async function submitTurn(
  driver: PtyTestDriver.Model,
  prompt: string,
): Promise<void> {
  driver.sendText(prompt);
  await driver.awaitSnapshot((snapshot) => snapshot.findText(prompt) !== null);
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('You said') !== null,
  );
}

function createDriver(
  repositoryRoot: string,
  fixtureRoot: string,
  homeDirectory: string,
  statusPath: string,
  provider?: string,
): PtyTestDriver.Model {
  return new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    repositoryRoot,
    columns: 110,
    rows: 50,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
      INVAR_AGENT_ENGINES: 'claude,codex',
      INVAR_AGENT_PROVIDER: provider,
    },
  });
}

const repositoryRoot = process.cwd();

const fixtureRoot = join(repositoryRoot, 'fixtures');

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-agent-engine-harness-home-'),
);

const firstStatusPath = join(homeDirectory, 'claude-status.json');

let driver = createDriver(
  repositoryRoot,
  fixtureRoot,
  homeDirectory,
  firstStatusPath,
);

try {
  console.log('== harness agent engine: Claude boot and live switch ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    firstStatusPath,
    'status condition: status.ready === true',
    (status) => status.ready === true,
    20_000,
  );
  driver.sendRawInput('\x1b[27;6;97~');
  let status = await HarnessSmoke.Class.awaitStatus(
    driver,
    firstStatusPath,
    'Claude boot resolves the agent engine, title, and owned footer geometry',
    (candidate) =>
      candidate.agentEngine === 'claude' &&
      candidate.agentTitle === 'Claude' &&
      candidate.panelActiveContentKind === 'agent' &&
      agentFooterRegion(candidate) !== null,
  );
  let footerRegion = requireAgentFooterRegion(status);
  let snapshot = await driver.awaitGridCondition(
    'the Claude pane title and engine-cycle affordance are visible',
    (candidate) =>
      candidate.findText('Ask Claude anything') !== null &&
      agentPaneOmitsPublishedTitle(candidate, footerRegion, status) &&
      engineSegmentPosition(candidate, footerRegion) !== null,
  );
  HarnessSmoke.Class.pass('Claude boot resolves engine and title');
  HarnessSmoke.Class.requireCondition(
    agentPaneOmitsPublishedTitle(snapshot, footerRegion, status) &&
      engineSegmentPosition(snapshot, footerRegion) !== null,
    'Claude title and engine-cycle affordance render',
  );
  let panelRectangle = bottomPanelSlot(status);
  const initialEngineSegment = engineSegmentPosition(snapshot, footerRegion);
  if (!initialEngineSegment)
    throw new Error('Claude engine segment disappeared');
  HarnessSmoke.Class.requireCondition(
    initialEngineSegment.column > panelRectangle.left &&
      initialEngineSegment.column <
        panelRectangle.left + panelRectangle.width - 1,
    'engine-cycle affordance stays inside the editor-centered bottom-panel slot',
  );

  await submitTurn(
    driver,
    'Please remember this token for later: MAGENTA-8842.',
  );
  snapshot = await driver.awaitGridCondition(
    'the pre-switch reply carries the Claude transcript label',
    (candidate) => hasTranscriptLabel(candidate, panelRectangle, 'Claude'),
  );
  HarnessSmoke.Class.requireCondition(
    hasTranscriptLabel(snapshot, panelRectangle, 'Claude'),
    'pre-switch reply is labeled Claude',
  );
  driver.sendRawInput('\x1b[27;5;101~');
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    firstStatusPath,
    'Ctrl+E publishes the Codex provider identity',
    (candidate) =>
      candidate.agentEngine === 'codex' && candidate.agentTitle === 'Codex',
  );
  snapshot = await driver.awaitGridCondition(
    'the Codex pane is visible while the Claude transcript label remains',
    (candidate) =>
      candidate.findText('switched to codex') !== null &&
      candidate.findText('context ported') !== null &&
      agentPaneOmitsPublishedTitle(candidate, footerRegion, status) &&
      engineSegmentPosition(candidate, footerRegion) !== null &&
      hasTranscriptLabel(candidate, panelRectangle, 'Claude'),
  );
  HarnessSmoke.Class.pass(
    'Ctrl+E switches the live provider identity to Codex',
  );
  HarnessSmoke.Class.requireCondition(
    agentPaneOmitsPublishedTitle(snapshot, footerRegion, status) &&
      hasTranscriptLabel(snapshot, panelRectangle, 'Claude'),
    'pane retitles while history retains its producing engine label',
  );

  await submitTurn(driver, 'What token did I ask you to remember?');
  snapshot = await driver.awaitGridCondition(
    'the ported context reply includes the remembered token',
    (candidate) =>
      candidate.findText('End of ported context') !== null &&
      candidate.findText('MAGENTA-8842') !== null,
  );
  for (
    let page = 0;
    page < 8 && !hasTranscriptLabel(snapshot, panelRectangle, 'Codex');
    page += 1
  ) {
    driver.sendKeys('PageUp');
    await driver.awaitScreenChange();
    snapshot = driver.snapshot();
  }
  snapshot = await driver.awaitGridCondition(
    'the narrower editor-centered pane reveals the Codex transcript label',
    (candidate) => hasTranscriptLabel(candidate, panelRectangle, 'Codex'),
  );
  HarnessSmoke.Class.requireCondition(
    hasTranscriptLabel(snapshot, panelRectangle, 'Codex'),
    'post-switch reply is labeled Codex and receives ported context',
  );
  const engineSegment = engineSegmentPosition(snapshot, footerRegion);
  if (!engineSegment) throw new Error('Codex engine segment disappeared');
  driver.sendMouse({
    kind: 'press',
    column: engineSegment.column,
    row: engineSegment.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: engineSegment.column,
    row: engineSegment.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    firstStatusPath,
    "status condition: candidate.agentEngine === 'claude'",
    (candidate) => candidate.agentEngine === 'claude',
  );
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('switched to claude') !== null,
  );
  HarnessSmoke.Class.pass('clicking the engine segment cycles back to Claude');

  console.log('== harness agent engine: fresh Codex-provider boot ==');
  await driver.dispose();
  const secondStatusPath = join(homeDirectory, 'codex-status.json');
  driver = createDriver(
    repositoryRoot,
    fixtureRoot,
    homeDirectory,
    secondStatusPath,
    'codex',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    secondStatusPath,
    'status condition: candidate.ready === true',
    (candidate) => candidate.ready === true,
    20_000,
  );
  driver.sendRawInput('\x1b[27;6;97~');
  snapshot = await driver.awaitGridCondition(
    'the fresh Codex provider paints no frozen Claude identity',
    (candidate) =>
      candidate.findText('Ask Codex anything') !== null &&
      candidate.findText('Ask Claude') === null,
  );
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    secondStatusPath,
    'fresh Codex boot publishes the Codex provider identity',
    (candidate) =>
      candidate.agentEngine === 'codex' &&
      candidate.agentTitle === 'Codex' &&
      candidate.panelActiveContentKind === 'agent' &&
      agentFooterRegion(candidate) !== null,
  );
  footerRegion = requireAgentFooterRegion(status);
  panelRectangle = bottomPanelSlot(status);
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('Ask Claude') === null &&
      agentPaneOmitsPublishedTitle(snapshot, footerRegion, status) &&
      engineSegmentPosition(snapshot, footerRegion) !== null,
    'Codex-provider boot has no frozen Claude identity',
  );
  await submitTurn(driver, 'hello codex');
  snapshot = await driver.awaitGridCondition(
    'the first fresh-provider reply carries the Codex transcript label',
    (candidate) => hasTranscriptLabel(candidate, panelRectangle, 'Codex'),
  );
  HarnessSmoke.Class.requireCondition(
    hasTranscriptLabel(snapshot, panelRectangle, 'Codex'),
    'first Codex-provider reply is labeled Codex',
  );
  driver.sendKeys('Control+q');
  console.log('smoke-agent-engine-switch-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
