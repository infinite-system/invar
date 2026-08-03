import { expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import {
  activePanelCell,
  activePanelCellRectangle,
  activeTabHasDirtyMarker,
  awaitStatusPublication,
  layoutSlotRectangle,
  panelCellsOfKind,
  panelContentIdentifiersOfKind,
} from './HarnessSmokeSupport';

test('dirty marker lookup skips the same filename in the breadcrumb row', () => {
  const rows = [
    ' ❮  ❯   workspace › dirty-marker.txt        ',
    '  dirty-marker.txt ● ×                       ',
  ];
  const snapshot = {
    rows: rows.length,
    rowText: (row: number) => rows[row] ?? '',
    cell: (row: number, column: number) => ({
      characters: rows[row]?.[column] ?? '',
    }),
  } as never;

  expect(activeTabHasDirtyMarker(snapshot, '/workspace/dirty-marker.txt')).toBe(
    true,
  );
});

test('panel status keeps kind plural and resolves the active opaque identifier', () => {
  const status = {
    height: 50,
    panelActiveContent: 'pane-instance-9',
    panelCellIds: ['pane-instance-4', 'pane-instance-9', 'database'],
    panelCellKinds: ['terminal', 'terminal', 'database'],
    panelCellColumns: [30, 40, 20],
    panelContentIds: ['pane-instance-4', 'pane-instance-9', 'database'],
    panelContentKinds: ['terminal', 'terminal', 'database'],
    layoutSlots: {
      editorCenter: { left: 10, top: 0, width: 90, height: 27 },
      bottomPanel: { left: 10, top: 27, width: 90, height: 20 },
    },
  };

  expect(
    panelCellsOfKind(status, 'terminal').map((cell) => cell.identifier),
  ).toEqual(['pane-instance-4', 'pane-instance-9']);
  expect(activePanelCell(status)).toEqual({
    identifier: 'pane-instance-9',
    kind: 'terminal',
    columns: 40,
    index: 1,
  });
  expect(panelContentIdentifiersOfKind(status, 'terminal')).toEqual([
    'pane-instance-4',
    'pane-instance-9',
  ]);
  expect(layoutSlotRectangle(status, 'bottomPanel')).toEqual({
    left: 10,
    top: 29,
    width: 90,
    height: 20,
  });
  expect(activePanelCellRectangle(status)).toEqual({
    left: 41,
    top: 29,
    width: 40,
    height: 20,
  });
});

test('rectangle text lookup ignores the same marker on another surface', () => {
  const rowTexts = ['  ❯ breadcrumb ', '  pane ❯ prompt'];
  const columns = Math.max(...rowTexts.map((rowText) => rowText.length));
  const cells = rowTexts.flatMap((rowText, row) =>
    Array.from({ length: columns }, (_unusedValue, column) => ({
      row,
      column,
      characters: rowText[column] ?? ' ',
    })),
  );
  const snapshot = new HarnessSnapshot.Class(
    columns,
    rowTexts.length,
    0,
    0,
    cells as never,
  );

  expect(snapshot.findText('❯')?.row).toBe(0);
  expect(
    snapshot.findTextInRectangle('❯', {
      left: 0,
      top: 1,
      width: columns,
      height: 1,
    }),
  ).toEqual({ row: 1, column: 7 });
});

test('support status timeout names the condition and path', async () => {
  const statusPath = `/tmp/invar-missing-support-status-${crypto.randomUUID()}.json`;

  await expect(
    awaitStatusPublication(statusPath, 'support ready flag', () => false, 1),
  ).rejects.toThrow(
    `Timed out waiting for support ready flag at ${statusPath}`,
  );
});

test('class status timeout names the condition and path', async () => {
  const statusPath = `/tmp/invar-missing-class-status-${crypto.randomUUID()}.json`;

  await expect(
    HarnessSmoke.Class.awaitStatus(
      {} as never,
      statusPath,
      'class ready flag',
      () => false,
      1,
    ),
  ).rejects.toThrow(`Timed out waiting for class ready flag at ${statusPath}`);
});

test('an already-satisfied scroll position resolves with a zero timeout', async () => {
  const statusPath = `/tmp/invar-satisfied-scroll-position-${crypto.randomUUID()}.json`;
  await Bun.write(statusPath, JSON.stringify({ editorScrollLeft: 0 }));

  try {
    await expect(
      HarnessSmoke.Class.awaitScrollPosition(
        {} as never,
        statusPath,
        'the editor is already at its left clamp',
        'editorScrollLeft',
        0,
        0,
      ),
    ).resolves.toMatchObject({ editorScrollLeft: 0 });
    await expect(
      HarnessSmoke.Class.awaitScrollPosition(
        {} as never,
        statusPath,
        'the editor reaches an unsatisfied scroll position',
        'editorScrollLeft',
        1,
        0,
      ),
    ).rejects.toThrow(
      `Timed out waiting for the editor reaches an unsatisfied scroll ` +
        `position at ${statusPath}`,
    );
  } finally {
    rmSync(statusPath, { force: true });
  }
});

test('the shared drive scale fixture has the requested first and last rows', async () => {
  const fixture = await HarnessSmoke.Class.createDriveScaleFixture(3);
  try {
    const lines = (await Bun.file(fixture.filePath).text()).split('\n');
    expect(lines).toEqual([
      'DRIVE-LINE-000001 content at scale 3',
      'DRIVE-LINE-000002 content at scale 3',
      'DRIVE-LINE-000003 content at scale 3',
    ]);
  } finally {
    await HarnessSmoke.Class.removeTemporaryDirectory(fixture.workspaceRoot);
  }
});
