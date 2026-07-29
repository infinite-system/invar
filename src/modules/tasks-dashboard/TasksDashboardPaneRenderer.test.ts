import { expect, test } from 'bun:test';
import { ThemePalettes } from '../theme/ThemePalettes';
import { TASKS_BUILDING_BREATH_FRAMES } from '../../../scripts/tasks/tasks-status';
import {
  TasksDashboardPaneRenderer,
  type TasksDashboardRenderContext,
} from './TasksDashboardPaneRenderer';
import type { TasksDashboardRow } from './TasksDashboardOverview';

function renderedText(styled: { chunks: unknown }): string {
  return (styled.chunks as { text: string }[])
    .map((chunk) => chunk.text)
    .join('');
}

function taskRow(overrides: Partial<TasksDashboardRow>): TasksDashboardRow {
  return {
    kind: 'task',
    label: 'planted-task',
    taskNumber: 901,
    standing: null,
    phase: null,
    round: 1,
    durationLabel: '',
    identity: '',
    attachment: '',
    addedLines: null,
    removedLines: null,
    sessionName: null,
    worktreePath: null,
    taskFilePath: null,
    latestBriefFilePath: null,
    latestReportFilePath: null,
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<TasksDashboardRenderContext>,
): TasksDashboardRenderContext {
  return {
    rows: [],
    lens: 'live',
    cycling: false,
    available: true,
    windowTop: 0,
    selectedIndex: -1,
    hoveredIndex: -1,
    paneFocused: false,
    palette: ThemePalettes.Class.DARK,
    height: 10,
    innerWidth: 60,
    viewportWidth: 59,
    animationPaint: 0,
    gateGlance: null,
    actionNotice: null,
    taskActionIcons: {
      workspace: 'W',
      taskRecord: 'T',
      latestBrief: 'B',
      latestReport: 'R',
    },
    ...overrides,
  };
}

test('the live lens paints the standing vocabulary: READY holds, building marks motion', () => {
  const rendered = renderedText(
    TasksDashboardPaneRenderer.Class.render(
      makeContext({
        rows: [
          taskRow({
            taskNumber: 902,
            label: 'planted-ready',
            standing: 'ready',
            round: 2,
            identity: 'codex·unknown·default',
          }),
          taskRow({
            taskNumber: 901,
            label: 'planted-building',
            standing: 'building',
            durationLabel: '10m',
          }),
        ],
      }),
    ),
  );
  expect(rendered).toContain('LIVE');
  expect(rendered).toContain('◉');
  expect(rendered).toContain('#902 planted-ready READY round 2');
  expect(rendered).toContain(TASKS_BUILDING_BREATH_FRAMES[0]!.glyph);
  expect(rendered).toContain('#901 planted-building  10m');
  expect(rendered).toContain('codex·unknown·default');
});

test('the done lens paints the check, the landing attachment, and the duration', () => {
  const rendered = renderedText(
    TasksDashboardPaneRenderer.Class.render(
      makeContext({
        lens: 'done',
        rows: [
          taskRow({
            taskNumber: 905,
            label: 'planted-landed',
            attachment: 'merged 1a2b3c4d',
            durationLabel: '1h 15m',
          }),
        ],
      }),
    ),
  );
  expect(rendered).toContain('✔');
  expect(rendered).toContain('#905 planted-landed — merged 1a2b3c4d  1h 15m');
});

test('only the visible window of a large row list is rendered', () => {
  const rows = Array.from({ length: 5_000 }, (_, index) =>
    taskRow({ taskNumber: index, label: `row${index}` }),
  );
  const rendered = renderedText(
    TasksDashboardPaneRenderer.Class.render(
      makeContext({ rows, windowTop: 2_000, height: 6 }),
    ),
  );
  expect(rendered).toContain('row2000');
  expect(rendered).toContain('row2004');
  expect(rendered).not.toContain('row2005');
  expect(rendered).not.toContain('row0 ');
});

test('an absent task tree states itself, never a blank pane', () => {
  const rendered = renderedText(
    TasksDashboardPaneRenderer.Class.render(makeContext({ available: false })),
  );
  expect(rendered).toContain('No task system in this workspace.');
  expect(rendered).toContain('A tasks pane appears when .invar/tasks/ exists.');
});

test('each empty lens names itself in the CLI wording', () => {
  for (const [lens, expected] of [
    ['live', 'IN-PROGRESS: none.'],
    ['active', 'ACTIVE: none.'],
    ['done', 'COMPLETED: none.'],
  ] as const) {
    const rendered = renderedText(
      TasksDashboardPaneRenderer.Class.render(makeContext({ lens })),
    );
    expect(rendered).toContain(expected);
  }
});

test('the tab line hit test resolves every lens label and the cycle glyph', () => {
  const tabs = TasksDashboardPaneRenderer.Class.lensTabs();
  for (const tab of tabs) {
    expect(
      TasksDashboardPaneRenderer.Class.hitTestTabLine(tab.startColumn),
    ).toEqual({ kind: 'lens', lens: tab.lens });
    expect(
      TasksDashboardPaneRenderer.Class.hitTestTabLine(tab.endColumn),
    ).toEqual({ kind: 'lens', lens: tab.lens });
  }
  expect(
    TasksDashboardPaneRenderer.Class.hitTestTabLine(
      TasksDashboardPaneRenderer.Class.cycleGlyphColumn(),
    ),
  ).toEqual({ kind: 'cycle' });
  expect(TasksDashboardPaneRenderer.Class.hitTestTabLine(0)).toBe(null);
});

test('the cycling glyph reflects play and pause', () => {
  const paused = renderedText(
    TasksDashboardPaneRenderer.Class.render(makeContext({})),
  );
  const playing = renderedText(
    TasksDashboardPaneRenderer.Class.render(makeContext({ cycling: true })),
  );
  expect(paused).toContain('▷');
  expect(playing).toContain('▶');
});

test('building motion advances through the CLI-exported breath frames', () => {
  const row = taskRow({ standing: 'building', phase: 'building' });
  const first = renderedText(
    TasksDashboardPaneRenderer.Class.render(
      makeContext({ rows: [row], animationPaint: 0 }),
    ),
  );
  const second = renderedText(
    TasksDashboardPaneRenderer.Class.render(
      makeContext({ rows: [row], animationPaint: 10 }),
    ),
  );
  expect(first).toContain(TASKS_BUILDING_BREATH_FRAMES[0]!.glyph);
  expect(second).toContain(TASKS_BUILDING_BREATH_FRAMES[2]!.glyph);
  expect(second).not.toBe(first);
});

test('the pinned row actions share one hit and tooltip geometry', () => {
  const context = makeContext({});
  const row = taskRow({
    kind: 'detail',
    sessionName: 'invar/901-planted-task',
  });
  expect(TasksDashboardPaneRenderer.Class.taskActionAt(context, row, 5)).toBe(
    'session',
  );
  expect(TasksDashboardPaneRenderer.Class.taskActionAt(context, row, 57)).toBe(
    'report',
  );
  expect(TasksDashboardPaneRenderer.Class.tooltipForAction('report')).toBe(
    'Open the latest report',
  );
});
