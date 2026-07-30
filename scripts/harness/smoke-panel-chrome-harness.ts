#!/usr/bin/env bun
// Drive the workspace panel tab bar through its keyboard and mouse paths.
// Run: bun scripts/harness/smoke-panel-chrome-harness.ts
// ALL-PASS means one flat tab row selects spaces, Add creates another space,
// and the panel-level expand and close controls use their painted geometry.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
// invariant: Panel controls share paint and hit geometry (src/modules/ui/ui.invariants.md)
// invariant: Tab bars share paint and hit geometry (src/modules/ui/ui.invariants.md)
// invariant: Expanded panel overrides only the editor center rows (src/modules/layout/layout.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

interface TabSegment {
  readonly commandId: string;
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

interface ControlSegment {
  readonly action: 'pane-list' | 'add' | 'expand' | 'close';
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

interface TabBarGeometry {
  readonly row: number;
  readonly editorActions: readonly TabSegment[];
  readonly controls: readonly ControlSegment[];
}

function tabBar(status: StatusSnapshot): TabBarGeometry {
  const geometry = status.panelSeparatorGeometry as
    TabBarGeometry | null | undefined;
  if (!geometry) throw new Error('Missing panel tab-bar geometry');
  return geometry;
}

function clickSegment(
  driver: PtyTestDriver.Model,
  row: number,
  segment: { startColumn: number; endColumnExclusive: number },
): void {
  const column =
    segment.startColumn +
    Math.floor((segment.endColumnExclusive - segment.startColumn) / 2);
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
}

async function driveAtSize(columns: number, rows: number): Promise<void> {
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `invar-panel-tabs-${columns}-`),
  );
  const settingsDirectory = join(homeDirectory, '.config', 'invar');
  mkdirSync(settingsDirectory, { recursive: true });
  await Bun.write(
    join(settingsDirectory, 'settings.json'),
    `${JSON.stringify({ glyphMode: columns < 100 ? 'ascii' : 'unicode' })}\n`,
  );
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: join(process.cwd(), 'fixtures'),
    columns,
    rows,
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
      `${columns}-column application is ready`,
      (status) => status.ready === true,
      15_000,
    );
    driver.sendKeys('Control+Shift+a');
    let status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column tab bar shows Terminal and Database spaces`,
      (candidate) =>
        candidate.panelVisible === true &&
        JSON.stringify(candidate.panelSpaceLabels) ===
          JSON.stringify(['Terminal', 'Database']) &&
        Array.isArray(candidate.panelHeadingGeometry) &&
        candidate.panelHeadingGeometry.some(
          (geometry: { contentId?: string }) => geometry.contentId === 'panel',
        ),
    );
    const initialSnapshot = await driver.awaitGridCondition(
      `${columns}-column tab row paints both space labels without pane headings`,
      (snapshot) =>
        snapshot.findText('Terminal') !== null &&
        snapshot.findText('Database') !== null &&
        snapshot.findText('Claude ×') === null,
    );
    const panelSlot = (
      status.layoutSlots as Record<
        string,
        { left: number; top: number; width: number; height: number }
      >
    ).bottomPanel;
    if (!panelSlot) throw new Error('Missing bottom-panel slot');
    const topLeft = initialSnapshot.cell(panelSlot.top, panelSlot.left);
    const bottomLeft = initialSnapshot.cell(
      panelSlot.top + panelSlot.height - 1,
      panelSlot.left,
    );
    HarnessSmoke.Class.requireCondition(
      topLeft !== null &&
        bottomLeft !== null &&
        !['╭', '┌'].includes(topLeft.characters) &&
        !(topLeft.characters === '+' && bottomLeft.characters === '+'),
      `${columns}-column panel content starts without a rounded frame`,
    );

    driver.sendKeys('Alt+PageDown');
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column keyboard cycle selects Database`,
      (candidate) =>
        candidate.panelActiveSpace === 'database-space-1' &&
        JSON.stringify(candidate.panelCellIds) === JSON.stringify(['database']),
    );
    const terminalTab = tabBar(status).editorActions.find((tab) =>
      tab.commandId.startsWith('terminal-space-'),
    );
    if (!terminalTab) throw new Error('Missing Terminal tab geometry');
    clickSegment(driver, tabBar(status).row, terminalTab);
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column mouse tab click restores Terminal`,
      (candidate) =>
        String(candidate.panelActiveSpace).startsWith('terminal-space-'),
    );

    const add = tabBar(status).controls.find(
      (control) => control.action === 'add',
    );
    if (!add) throw new Error('Missing Add geometry');
    clickSegment(driver, tabBar(status).row, add);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column Add popup exposes generic content kinds`,
      (candidate) =>
        candidate.boundedListPopupOpen === true &&
        Array.isArray(candidate.boundedListPopupItemIdentifiers) &&
        candidate.boundedListPopupItemIdentifiers.includes('terminal') &&
        candidate.boundedListPopupItemIdentifiers.includes('database'),
    );
    driver.sendKeys('Down');
    driver.sendKeys('Enter');
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column Add creates Terminal 2 as a space`,
      (candidate) =>
        Array.isArray(candidate.panelSpaceLabels) &&
        candidate.panelSpaceLabels.includes('Terminal 2'),
    );

    const expand = tabBar(status).controls.find(
      (control) => control.action === 'expand',
    );
    if (!expand) throw new Error('Missing Expand geometry');
    clickSegment(driver, tabBar(status).row, expand);
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column Expand keeps the tab spaces`,
      (candidate) =>
        candidate.panelExpanded === true &&
        Array.isArray(candidate.panelSpaceLabels) &&
        candidate.panelSpaceLabels.includes('Database'),
    );
    const close = tabBar(status).controls.find(
      (control) => control.action === 'close',
    );
    if (!close) throw new Error('Missing Close geometry');
    clickSegment(driver, tabBar(status).row, close);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column panel close hides without disposing spaces`,
      (candidate) =>
        candidate.panelVisible === false &&
        Array.isArray(candidate.panelSpaceLabels) &&
        candidate.panelSpaceLabels.includes('Terminal 2'),
    );
    HarnessSmoke.Class.pass(
      `${columns}x${rows} tab row keyboard, mouse, Add, expand, and close`,
    );
  } finally {
    driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

await driveAtSize(120, 40);
await driveAtSize(88, 24);
console.log('smoke-panel-chrome-harness: ALL-PASS');
