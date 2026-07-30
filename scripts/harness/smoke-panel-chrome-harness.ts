#!/usr/bin/env bun
// Drive the mixed workspace-tab and editor-action row through its keyboard and mouse paths.
// Run: bun scripts/harness/smoke-panel-chrome-harness.ts
// ALL-PASS means tabs survive when editor actions truncate, both action shortcuts work,
// wide action buttons use their painted geometry, and all panel controls still work.
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
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

interface WorkspaceTabSegment {
  readonly spaceIdentifier: string;
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

interface EditorActionSegment {
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
  readonly tabs: readonly WorkspaceTabSegment[];
  readonly editorActions: readonly EditorActionSegment[];
  readonly drag: {
    readonly left: number;
    readonly width: number;
    readonly leadingPaintPadCells: number;
  };
  readonly controls: readonly ControlSegment[];
}

function tabBar(status: StatusSnapshot): TabBarGeometry {
  const geometry = status.panelSeparatorGeometry as
    TabBarGeometry | null | undefined;
  if (!geometry) throw new Error('Missing panel tab-bar geometry');
  return geometry;
}

// The painted mark run on the separator row. The drag span is addressed through what is ON
// SCREEN, not through a published rectangle: the pad cell is one cell wide, so an edge test has
// no slack for a coordinate-space disagreement between a publisher and the emulator grid.
interface MarkRun {
  readonly firstColumn: number;
  readonly lastColumn: number;
}

function splitterMarkRun(
  snapshot: HarnessSnapshot.Model,
  row: number,
): MarkRun {
  const text = Array.from(snapshot.rowText(row));
  const firstColumn = text.indexOf('\u2501');
  const lastColumn = text.lastIndexOf('\u2501');
  if (firstColumn < 0) {
    throw new Error(`No splitter mark painted on row ${row}`);
  }
  return { firstColumn, lastColumn };
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
    driver.sendKeys('Control+p');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column Quick Open appears before the editor-action drive`,
      (status) => status.quickOpenOpen === true,
    );
    driver.sendText('greeter.ts');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column Quick Open finds the shared source fixture`,
      (status) =>
        status.quickOpenQuery === 'greeter.ts' &&
        Number(status.quickOpenMatches) > 0,
    );
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column source fixture opens before shortcut checks`,
      (status) => String(status.activeBuffer).endsWith('/greeter.ts'),
    );
    driver.sendKeys('F1');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column command palette opens for editor focus`,
      (status) => status.paletteOpen === true,
    );
    driver.sendText('View: Focus Editor');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column editor-focus command is the sole palette match`,
      (status) =>
        status.paletteQuery === 'View: Focus Editor' &&
        Number(status.paletteMatches) === 1,
    );
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column editor owns focus before shortcut checks`,
      (status) => status.focus === 'editor' && status.paletteOpen === false,
    );
    driver.sendKeys('Alt+z');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column word-wrap shortcut turns wrap on`,
      (status) => status.wordWrap === true,
    );
    driver.sendKeys('Alt+z');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column word-wrap shortcut turns wrap off`,
      (status) => status.wordWrap === false,
    );
    driver.sendKeys('Alt+g');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column go-to-line shortcut opens the shared prompt`,
      (status) => status.goToLineOpen === true,
    );
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column Escape closes the shortcut-opened prompt`,
      (status) => status.goToLineOpen === false,
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
      `${columns}-column tab row paints both space tabs without pane headings`,
      (snapshot) =>
        snapshot.findText('Terminal') !== null &&
        snapshot.findText(columns === 120 ? 'Database' : 'Datab') !== null &&
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
    const initialTabBar = tabBar(status);
    const lastTab = initialTabBar.tabs.at(-1);
    const firstEditorAction = initialTabBar.editorActions[0];
    const lastEditorAction = initialTabBar.editorActions.at(-1);
    const firstControl = initialTabBar.controls[0];
    HarnessSmoke.Class.requireCondition(
      initialTabBar.tabs.length === 2 &&
        initialTabBar.tabs[0]?.spaceIdentifier.startsWith('terminal-space-') ===
          true &&
        initialTabBar.tabs[1]?.spaceIdentifier.startsWith('database-space-') ===
          true,
      `${columns}-column workspace tabs publish by space identity`,
    );
    const expectedEditorActionIdentifiers =
      columns === 120 ? ['view.toggleWordWrap', 'editor.goToLine'] : [];
    HarnessSmoke.Class.requireCondition(
      JSON.stringify(
        initialTabBar.editorActions.map((action) => action.commandId),
      ) === JSON.stringify(expectedEditorActionIdentifiers),
      `${columns}-column editor actions publish separately and truncate before tabs`,
    );
    HarnessSmoke.Class.requireCondition(
      initialTabBar.drag.width >= 1,
      `${columns}-column tabs leave a live drag span`,
    );
    HarnessSmoke.Class.requireCondition(
      JSON.stringify(
        initialTabBar.controls.map((control) => control.action),
      ) === JSON.stringify(['add', 'expand', 'close']),
      `${columns}-column tab row retains all three right controls`,
    );
    HarnessSmoke.Class.requireCondition(
      (lastTab
        ? lastTab.endColumnExclusive ===
          (firstEditorAction?.startColumn ?? initialTabBar.drag.left)
        : true) &&
        (lastEditorAction
          ? lastEditorAction.endColumnExclusive === initialTabBar.drag.left
          : true) &&
        firstControl !== undefined &&
        initialTabBar.drag.left + initialTabBar.drag.width ===
          firstControl.startColumn,
      `${columns}-column row order is tabs then actions then drag then controls with no gap or overlap`,
    );
    // The drag span stands off from the leading run by a PAINT pad: the pad cells are blank and
    // the rest of the published rectangle is the centered mark. The pad count comes from the
    // published geometry, never a literal, so this reads the app's own composition.
    const padCellCount = initialTabBar.drag.leadingPaintPadCells;
    const expectedDragCells =
      ' '.repeat(padCellCount) +
      '━'.repeat(initialTabBar.drag.width - padCellCount);
    const tabRowSnapshot = await driver.awaitGridCondition(
      `${columns}-column published drag span paints a blank pad then centered heavy-line cells`,
      (snapshot) =>
        snapshot
          .rowText(initialTabBar.row)
          .slice(
            initialTabBar.drag.left,
            initialTabBar.drag.left + initialTabBar.drag.width,
          ) === expectedDragCells,
    );
    HarnessSmoke.Class.requireCondition(
      initialTabBar.drag.width > 0 &&
        tabRowSnapshot
          .rowText(initialTabBar.row)
          .slice(
            initialTabBar.drag.left,
            initialTabBar.drag.left + initialTabBar.drag.width,
          ) === expectedDragCells,
      `${columns}-column splitter paints centered marks between tabs and controls`,
    );
    HarnessSmoke.Class.requireCondition(
      padCellCount === (initialTabBar.drag.width > 1 ? 1 : 0),
      `${columns}-column exactly one blank pad cell precedes the mark whenever the span is wider than one cell`,
    );

    // The pad is PAINT, never geometry. Both ENDS of the drag span must still grab: the blank pad
    // cell at the left, and the last cell at the right. A pad taken out of the hit rectangle
    // would leave one of them dead. The edges are addressed through the PAINTED mark run, because
    // a one-cell edge has no slack for a coordinate-space disagreement between a publisher and
    // the emulator grid. The two drags move in OPPOSITE directions, one row each, so neither is
    // asked to push the panel past a bound it already sits on; a wait for something that cannot
    // happen measures nothing. The separator ROW is the resize signal: it moves with the height.
    if (initialTabBar.drag.width > 1) {
      for (const [edgeName, edgeColumnOf, rowDelta] of [
        [
          'the blank pad cell',
          (run: MarkRun) => run.firstColumn - padCellCount,
          1,
        ],
        [
          'the last cell of the drag span',
          (run: MarkRun) => run.lastColumn,
          -1,
        ],
      ] as const) {
        const rowBeforeEdgeDrag = tabBar(
          HarnessSmoke.Class.readStatus(statusPath),
        ).row;
        const edgeSnapshot = await driver.awaitGridCondition(
          `${columns}-column splitter mark is painted before the ${edgeName} drag`,
          (snapshot) =>
            Array.from(snapshot.rowText(rowBeforeEdgeDrag)).indexOf('\u2501') >=
            0,
        );
        const edgeColumn = edgeColumnOf(
          splitterMarkRun(edgeSnapshot, rowBeforeEdgeDrag),
        );
        const edgeTargetRow = Math.max(0, rowBeforeEdgeDrag + rowDelta);
        driver.sendMouse({
          kind: 'press',
          column: edgeColumn,
          row: rowBeforeEdgeDrag,
          button: 'left',
        });
        driver.sendMouse({
          kind: 'move',
          column: edgeColumn,
          row: edgeTargetRow,
          button: 'left',
        });
        driver.sendMouse({
          kind: 'release',
          column: edgeColumn,
          row: edgeTargetRow,
          button: 'left',
        });
        await HarnessSmoke.Class.awaitStatus(
          driver,
          statusPath,
          `${columns}-column a drag begun on ${edgeName} still resizes the panel`,
          (candidate) => tabBar(candidate).row !== rowBeforeEdgeDrag,
        );
        HarnessSmoke.Class.pass(
          `${columns}-column a drag begun on ${edgeName} still resizes the panel`,
        );
      }
    }
    if (initialTabBar.editorActions.length === 2) {
      for (const action of initialTabBar.editorActions) {
        const actionCells = tabRowSnapshot
          .rowCells(initialTabBar.row)
          .slice(action.startColumn, action.endColumnExclusive);
        HarnessSmoke.Class.requireCondition(
          actionCells.length === 3 &&
            actionCells[0]?.characters.trim().length === 0 &&
            (actionCells[1]?.characters.trim().length ?? 0) > 0 &&
            actionCells[2]?.characters.trim().length === 0,
          `${columns}-column ${action.commandId} icon has one painted padding cell on each side`,
        );
      }
      HarnessSmoke.Class.requireCondition(
        status.wordWrap === false && status.goToLineOpen === false,
        `${columns}-column editor-action effects start absent before clicks`,
      );
      clickSegment(driver, initialTabBar.row, initialTabBar.editorActions[0]!);
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${columns}-column word-wrap button turns wrap on`,
        (candidate) => candidate.wordWrap === true,
      );
      clickSegment(driver, initialTabBar.row, initialTabBar.editorActions[0]!);
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${columns}-column word-wrap button turns wrap off`,
        (candidate) => candidate.wordWrap === false,
      );
      clickSegment(driver, initialTabBar.row, initialTabBar.editorActions[1]!);
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${columns}-column go-to-line button opens the shared prompt`,
        (candidate) => candidate.goToLineOpen === true,
      );
      driver.sendKeys('Escape');
      status = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${columns}-column Escape closes the button-opened prompt`,
        (candidate) => candidate.goToLineOpen === false,
      );
    }

    driver.sendKeys('Alt+PageDown');
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column keyboard cycle selects Database`,
      (candidate) =>
        candidate.panelActiveSpace === 'database-space-1' &&
        JSON.stringify(candidate.panelCellIds) === JSON.stringify(['database']),
    );
    const terminalTab = tabBar(status).tabs.find((tab) =>
      tab.spaceIdentifier.startsWith('terminal-space-'),
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
