import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TasksDashboardOverview } from './TasksDashboardOverview';

interface Fixture {
  root: string;
  overview: TasksDashboardOverview.Model;
  renders: { count: number };
  observed: { value: boolean };
  dispose: () => void;
}

function writeTask(
  tasksRoot: string,
  state: string,
  folder: string,
  headerLines: string[],
  extraFiles: Record<string, string> = {},
): void {
  const folderPath = join(tasksRoot, state, folder);
  mkdirSync(folderPath, { recursive: true });
  const taskNumber = folder.split('-')[0];
  writeFileSync(
    join(folderPath, `task-${folder}.md`),
    [
      `# ${taskNumber} — planted`,
      '',
      ...headerLines,
      '',
      '## Outline',
      '',
    ].join('\n') + 'body line\n'.repeat(30),
  );
  for (const [fileName, text] of Object.entries(extraFiles)) {
    writeFileSync(join(folderPath, fileName), text);
  }
}

function makeFixture(options?: { withTree?: boolean }): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'tasks-dashboard-overview-'));
  const tasksRoot = join(root, '.invar', 'tasks');
  if (options?.withTree !== false) {
    const pastFilingMs = Date.now() - 600_000;
    writeTask(
      tasksRoot,
      'in-progress',
      '901-planted-building',
      [
        'State: IN-PROGRESS',
        'Engine: claude',
        'Model: fable-5',
        'Effort: high',
      ],
      {
        'brief-901-1-planted-building.md': 'brief',
        'meta.json': JSON.stringify({
          startedAt: new Date(pastFilingMs).toISOString(),
          round: 1,
          roundBriefedAtMs: pastFilingMs,
        }),
      },
    );
    writeTask(
      tasksRoot,
      'in-progress',
      '902-planted-ready',
      ['State: IN-PROGRESS', 'Engine: codex'],
      {
        'brief-902-1-planted-ready.md': 'brief',
        'report-902-planted-ready.md': 'READY',
        'meta.json': JSON.stringify({
          startedAt: new Date(pastFilingMs).toISOString(),
          round: 2,
          roundBriefedAtMs: pastFilingMs,
        }),
      },
    );
    writeTask(tasksRoot, 'active', '903-planted-waiting', [
      'State: ACTIVE',
      'Priority: user-directed',
    ]);
    writeTask(tasksRoot, 'active', '904-planted-ungrouped', ['State: ACTIVE']);
    writeTask(
      tasksRoot,
      'completed',
      '905-planted-landed',
      ['State: COMPLETED — merged 1a2b3c4d'],
      { 'meta.json': JSON.stringify({ durationMinutes: 75 }) },
    );
  }
  const renders = { count: 0 };
  const observed = { value: true };
  const overview = new TasksDashboardOverview.Class({
    workspaceRoot: () => root,
    isObserved: () => observed.value,
    requestRender: () => {
      renders.count += 1;
    },
    cycleSeconds: () => 10,
  });
  return {
    root,
    overview,
    renders,
    observed,
    dispose: () => {
      overview.dispose();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('the live lens lists in-progress tasks with the CLI standing vocabulary', () => {
  const fixture = makeFixture();
  const { overview } = fixture;
  expect(overview.available.value).toBe(true);
  expect(overview.lens.value).toBe('live');
  const rows = overview.rows.value;
  expect(rows.map((row) => row.taskNumber)).toEqual([902, 901]);
  expect(rows[0]?.standing).toBe('ready');
  expect(rows[0]?.round).toBe(2);
  expect(rows[1]?.standing).toBe('building');
  expect(rows[1]?.durationLabel).toBe('10m');
  expect(rows[1]?.identity).toBe('claude·fable-5·high');
  fixture.dispose();
});

test('the active lens groups by priority and selection skips group headings', () => {
  const fixture = makeFixture();
  const { overview } = fixture;
  overview.setLens('active');
  const rows = overview.rows.value;
  expect(rows.map((row) => row.kind)).toEqual([
    'group',
    'task',
    'group',
    'task',
  ]);
  expect(rows[0]?.label).toContain('user-directed');
  expect(rows[2]?.label).toContain('unprioritised');
  // The initial selection lands on the first TASK row, never a heading.
  expect(overview.selectedIndex.value).toBe(1);
  overview.moveSelection(1);
  expect(overview.selectedIndex.value).toBe(3);
  overview.moveSelection(-1);
  expect(overview.selectedIndex.value).toBe(1);
  fixture.dispose();
});

test('the done lens carries the landing attachment and the meta duration', () => {
  const fixture = makeFixture();
  const { overview } = fixture;
  overview.setLens('done');
  const rows = overview.rows.value;
  expect(rows).toHaveLength(1);
  expect(rows[0]?.taskNumber).toBe(905);
  expect(rows[0]?.attachment).toBe('merged 1a2b3c4d');
  expect(rows[0]?.durationLabel).toBe('1h 15m');
  fixture.dispose();
});

test('selection resolves the task record file path for opening', () => {
  const fixture = makeFixture();
  const { overview } = fixture;
  expect(overview.selectedTaskFilePath()).toBe(
    join(
      fixture.root,
      '.invar',
      'tasks',
      'in-progress',
      '902-planted-ready',
      'task-902-planted-ready.md',
    ),
  );
  fixture.dispose();
});

test('an absent task tree is stated as unavailable, never a blank row list', () => {
  const fixture = makeFixture({ withTree: false });
  const { overview } = fixture;
  expect(overview.available.value).toBe(false);
  expect(overview.rows.value).toHaveLength(0);
  expect(overview.selectedTaskFilePath()).toBe(null);
  fixture.dispose();
});

test('a tree appearing later is picked up by the probe stamp', () => {
  const fixture = makeFixture({ withTree: false });
  const { overview } = fixture;
  expect(overview.available.value).toBe(false);
  writeTask(join(fixture.root, '.invar', 'tasks'), 'active', '906-late', [
    'State: ACTIVE',
    'Priority: user-directed',
  ]);
  overview.refresh();
  expect(overview.available.value).toBe(true);
  overview.setLens('active');
  expect(overview.rows.value.filter((row) => row.kind === 'task')).toHaveLength(
    1,
  );
  fixture.dispose();
});

test('lenses advance in order and wrap both ways', () => {
  const fixture = makeFixture();
  const { overview } = fixture;
  overview.advanceLens(1);
  expect(overview.lens.value).toBe('active');
  overview.advanceLens(1);
  expect(overview.lens.value).toBe('done');
  overview.advanceLens(1);
  expect(overview.lens.value).toBe('live');
  overview.advanceLens(-1);
  expect(overview.lens.value).toBe('done');
  fixture.dispose();
});

test('scrolling clamps to the row extent', () => {
  const fixture = makeFixture();
  const { overview } = fixture;
  overview.viewportHeight.value = 1;
  overview.scrollBy(100);
  expect(overview.windowTop()).toBe(overview.rows.value.length - 1);
  overview.scrollBy(-100);
  expect(overview.windowTop()).toBe(0);
  fixture.dispose();
});

test('a version bump accompanies every data change so one counter drives repaint', () => {
  const fixture = makeFixture();
  const { overview } = fixture;
  const before = overview.version.value;
  overview.setLens('done');
  expect(overview.version.value).toBeGreaterThan(before);
  const beforeToggle = overview.version.value;
  overview.toggleCycling();
  expect(overview.cycling.value).toBe(true);
  expect(overview.version.value).toBeGreaterThan(beforeToggle);
  fixture.dispose();
});
