import { expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { HarnessSmoke } from './HarnessSmoke';
import {
  activeTabHasDirtyMarker,
  awaitStatusPublication,
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
