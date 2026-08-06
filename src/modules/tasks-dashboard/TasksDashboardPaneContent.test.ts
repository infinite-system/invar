import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ref } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import { ThemePalettes } from '../theme/ThemePalettes';
import { TasksDashboardOverview } from './TasksDashboardOverview';
import { TasksDashboardPaneContent } from './TasksDashboardPaneContent';
import { TasksDashboardPaneRenderer } from './TasksDashboardPaneRenderer';

function makeWorkspaceRoot(taskCount = 2): string {
  const root = mkdtempSync(join(tmpdir(), 'tasks-dashboard-pane-'));
  for (let taskOffset = 0; taskOffset < taskCount; taskOffset += 1) {
    const taskNumber = 901 + taskOffset;
    const folder = `${taskNumber}-planted-${taskNumber}`;
    const folderPath = join(root, '.invar', 'tasks', 'in-progress', folder);
    mkdirSync(folderPath, { recursive: true });
    writeFileSync(
      join(folderPath, `task-${folder}.md`),
      '# planted\n\nState: IN-PROGRESS\n\n## Outline\n' +
        'body line\n'.repeat(30),
    );
  }
  return root;
}

function makeFixture(taskCount = 2) {
  const root = makeWorkspaceRoot(taskCount);
  const blurCount = { value: 0 };
  const openCount = { value: 0 };
  const overview = new TasksDashboardOverview.Class({
    workspaceRoot: () => root,
    isObserved: () => true,
    requestRender: () => {},
    cycleSeconds: () => 10,
    fleetRepositoryRoot: () => root,
    readTaskFleetFacts: (_fleetRepositoryRoot, record) => ({
      lineDelta: { added: 1, removed: 0 },
      phase: 'building',
      worktreePath: join(root, '.invar', 'worktrees', record.folderName),
    }),
    readFleetGateGlance: () => null,
    readTmuxSessionNames: () => new Set(['invar/901-planted-building']),
  });
  const application = {
    theme: {
      glyphLevel: ref('unicode'),
      glyphVocabulary: { activityTasks: '▶' },
      palette: ThemePalettes.Class.DARK,
      taskActionIcons: {
        session: 'S',
        workspace: 'W',
        taskRecord: 'T',
        latestBrief: 'B',
        latestReport: 'R',
        cycleStart: '>',
        cycleStop: 'x',
      },
      ellipsisCell: '…',
    },
    settings: { scrollbarThickness: ref(1) },
    rightDockHost: {
      blur: () => {
        blurCount.value += 1;
      },
    },
    requestRender: () => {},
  } as never as ApplicationContributionContext;
  overview.startObservation();
  const pane = new TasksDashboardPaneContent.Class(
    application,
    overview,
    () => {
      openCount.value += 1;
      return true;
    },
  );
  return {
    root,
    overview,
    pane,
    blurCount,
    openCount,
    dispose: () => {
      overview.dispose();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function renderedText(styled: { chunks: unknown }): string {
  return (styled.chunks as { text: string }[])
    .map((chunk) => chunk.text)
    .join('');
}

test('the pane renders the lens rows and its revision moves with every model change', () => {
  const fixture = makeFixture();
  const { pane, overview } = fixture;
  const revisionBefore = pane.renderRevision.value;
  const rendered = renderedText(
    pane.render({
      width: 60,
      height: 10,
      palette: ThemePalettes.Class.DARK,
      glyphLevel: 'unicode',
      colorDepth: 'truecolor',
      focused: false,
    }),
  );
  expect(rendered).toContain('#902');
  expect(rendered).toContain('#901');
  expect(pane.icon).toBe('▶');
  overview.setLens('done');
  expect(pane.renderRevision.value).not.toBe(revisionBefore);
  fixture.dispose();
});

test('a body click opens on release while a drag remains selection', () => {
  const fixture = makeFixture();
  const { pane, overview } = fixture;
  pane.onResize(60, 10);
  // Screen row 0 is the tab line; row 3 is the second task row (#901).
  expect(pane.onPointerDown(5, 3)).toBe(true);
  expect(overview.selectedIndex.value).toBe(2);
  expect(fixture.openCount.value).toBe(0);
  expect(pane.onPointerUp(5, 3)).toBe(true);
  expect(fixture.openCount.value).toBe(1);
  expect(fixture.blurCount.value).toBe(1);
  fixture.dispose();
});

test('a pointer-down on the tab line switches the lens without opening anything', () => {
  const fixture = makeFixture();
  const { pane, overview } = fixture;
  expect(pane.onPointerDown(16, 0)).toBe(true); // the DONE label's columns
  expect(overview.lens.value).toBe('done');
  expect(fixture.openCount.value).toBe(0);
  fixture.dispose();
});

test('hover treats both live rows as one group and clears on pointer-out', () => {
  const fixture = makeFixture();
  const { pane, overview } = fixture;
  pane.onResize(60, 10);
  pane.onPointerMove(5, 1);
  expect(pane.tooltipAt(49, 2)).toBe('Open the task worktree as a workspace');
  pane.onPointerMove(5, 2);
  expect(pane.tooltipAt(49, 2)).toBe('Open the task worktree as a workspace');
  pane.onPointerMove(5, 9);
  expect(pane.tooltipAt(49, 2)).toBe(null);
  pane.onPointerOut();
  expect(pane.tooltipAt(49, 2)).toBe(null);
  fixture.dispose();
});

test('resize reserves the tab line row from the scroll viewport', () => {
  const fixture = makeFixture();
  const { pane, overview } = fixture;
  pane.onResize(40, 12);
  expect(overview.viewportHeight.value).toBe(11);
  expect(overview.viewportWidth.value).toBe(39);
  expect(pane.scrollbarRowOffset).toBe(1);
  fixture.dispose();
});

test('the play control has start and stop tooltips and a second click stops cycling', () => {
  const fixture = makeFixture();
  const { pane, overview } = fixture;
  const cycleColumn = TasksDashboardPaneRenderer.Class.cycleGlyphColumn();
  expect(pane.tooltipAt(cycleColumn, 0)).toBe('Start automatic lens cycling');
  expect(pane.onPointerDown(cycleColumn, 0)).toBe(true);
  expect(overview.cycling.value).toBe(true);
  expect(pane.tooltipAt(cycleColumn, 0)).toBe('Stop automatic lens cycling');
  expect(pane.onPointerDown(cycleColumn, 0)).toBe(true);
  expect(overview.cycling.value).toBe(false);
  expect(overview.lens.value).toBe('live');
  fixture.dispose();
});

test('wheel impulses advance through one shared momentum state without rebuilding rows', () => {
  const fixture = makeFixture(20);
  const { pane, overview } = fixture;
  pane.attachViewportScrollPort({
    momentumOptions: () => ({
      impulse: 1,
      max: 20,
      decayPerSec: 4,
      stopVelocity: 0.05,
      maximumGlideDurationMilliseconds: 2_000,
    }),
    requestRender: () => {},
  });
  pane.onResize(40, 6);
  expect(pane.onWheel(4)).toBe(true);
  const movingFrames: boolean[] = [];
  for (let frame = 0; frame < 60; frame += 1) {
    movingFrames.push(pane.tickScroll(1 / 60));
  }
  expect(overview.scrollTop.value).toBeGreaterThan(0);
  expect(movingFrames[0]).toBe(true);
  pane.haltScrollMomentum();
  expect(pane.tickScroll(1 / 60)).toBe(false);
  fixture.dispose();
});

test('a selected row clears when the row projection changes', () => {
  const fixture = makeFixture();
  const { pane, overview } = fixture;
  pane.onResize(60, 10);
  pane.onPointerDown(2, 1);
  pane.onPointerDrag(12, 2);
  pane.onPointerUp(12, 2);
  expect(pane.hasSelection()).toBe(true);
  overview.setLens('active');
  expect(pane.hasSelection()).toBe(false);
  fixture.dispose();
});
