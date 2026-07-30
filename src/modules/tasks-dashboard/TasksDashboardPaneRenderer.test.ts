import { RGBA } from '@opentui/core';
import { expect, test } from 'bun:test';
import { ThemePalettes } from '../theme/ThemePalettes';
import {
  TASKS_BUILDING_BREATH_FRAMES,
  TASKS_EXPLORING_GLYPHS,
} from '../../../scripts/tasks/tasks-status';
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
    folderName: '901-planted-task',
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
    sessionAvailable: null,
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
      session: 'S',
      workspace: 'W',
      taskRecord: 'T',
      latestBrief: 'B',
      latestReport: 'R',
      cycleStart: '>',
      cycleStop: 'x',
    },
    ellipsisCell: '…',
    hoveredTabLineTarget: null,
    ...overrides,
  };
}

test('the live lens gives every task one title row and one status row', () => {
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
            taskNumber: 902,
            kind: 'detail',
            label: 'planted-ready',
            standing: 'ready',
            round: 2,
            identity: 'codex·unknown·default',
          }),
          taskRow({
            taskNumber: 901,
            label: 'planted-building',
            standing: 'building',
            phase: 'building',
            durationLabel: '10m',
          }),
          taskRow({
            taskNumber: 901,
            kind: 'detail',
            label: 'planted-building',
            standing: 'building',
            phase: 'building',
            durationLabel: '10m',
          }),
        ],
      }),
    ),
  );
  const renderedRows = rendered.split('\n');
  expect(rendered).toContain('LIVE');
  expect(rendered).toContain('◉');
  expect(renderedRows[1]).toContain('#902 planted-ready');
  expect(renderedRows[1]).not.toContain('READY');
  expect(renderedRows[2]).toContain('READY round 2');
  expect(renderedRows[2]).not.toContain('#902 planted-ready');
  expect(rendered).toContain(TASKS_BUILDING_BREATH_FRAMES[0]!.glyph);
  expect(renderedRows[3]).toContain('#901 planted-building');
  expect(renderedRows[3]).not.toContain('10m');
  expect(renderedRows[4]).toContain('building  10m');
  expect(renderedRows[4]).not.toContain('#901 planted-building');
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
  expect(TasksDashboardPaneRenderer.Class.hitTestTabLine(6)).toBe(null);
});

test('the cycling glyph reflects start and stop through theme-owned icons', () => {
  const paused = renderedText(
    TasksDashboardPaneRenderer.Class.render(makeContext({})),
  );
  const playing = renderedText(
    TasksDashboardPaneRenderer.Class.render(makeContext({ cycling: true })),
  );
  expect(paused).toContain('>');
  expect(paused).not.toContain('x');
  expect(playing).toContain('x');
  expect(playing).not.toContain('>');
});

test('live motion advances through the CLI-exported phase frames', () => {
  const titleRow = taskRow({ standing: 'building', phase: 'building' });
  const detailRow = taskRow({
    kind: 'detail',
    standing: 'building',
    phase: 'building',
  });
  const first = renderedText(
    TasksDashboardPaneRenderer.Class.render(
      makeContext({ rows: [titleRow, detailRow], animationPaint: 0 }),
    ),
  );
  const second = renderedText(
    TasksDashboardPaneRenderer.Class.render(
      makeContext({ rows: [titleRow, detailRow], animationPaint: 10 }),
    ),
  );
  expect(first).toContain(`${TASKS_BUILDING_BREATH_FRAMES[0]!.glyph} building`);
  expect(second).toContain(
    `${TASKS_BUILDING_BREATH_FRAMES[2]!.glyph} building`,
  );
  expect(first).not.toContain(`${TASKS_BUILDING_BREATH_FRAMES[0]!.glyph} #901`);
  expect(second).not.toBe(first);

  const exploringTitleRow = taskRow({
    standing: 'building',
    phase: 'exploring',
  });
  const exploringDetailRow = taskRow({
    kind: 'detail',
    standing: 'building',
    phase: 'exploring',
  });
  const exploringFirst = renderedText(
    TasksDashboardPaneRenderer.Class.render(
      makeContext({
        rows: [exploringTitleRow, exploringDetailRow],
        animationPaint: 0,
      }),
    ),
  );
  const exploringSecond = renderedText(
    TasksDashboardPaneRenderer.Class.render(
      makeContext({
        rows: [exploringTitleRow, exploringDetailRow],
        animationPaint: 10,
      }),
    ),
  );
  expect(exploringFirst).toContain(`${TASKS_EXPLORING_GLYPHS[0]} exploring`);
  expect(exploringSecond).toContain(`${TASKS_EXPLORING_GLYPHS[2]} exploring`);
  expect(exploringSecond).not.toBe(exploringFirst);
});

test('the pinned row actions share one hit and tooltip geometry', () => {
  const context = makeContext({});
  const row = taskRow({
    kind: 'detail',
    sessionName: 'invar/901-planted-task',
    sessionAvailable: true,
  });
  expect(TasksDashboardPaneRenderer.Class.taskActionAt(context, row, 45)).toBe(
    'session',
  );
  expect(TasksDashboardPaneRenderer.Class.taskActionAt(context, row, 57)).toBe(
    'report',
  );
  expect(TasksDashboardPaneRenderer.Class.tooltipForAction('report', row)).toBe(
    'Open the latest report',
  );
  expect(
    TasksDashboardPaneRenderer.Class.tooltipForAction('session', row),
  ).toBe('Attach to builder tmux session: invar/901-planted-task');
  expect(
    renderedText(
      TasksDashboardPaneRenderer.Class.render(
        makeContext({ rows: [row], innerWidth: 60, viewportWidth: 59 }),
      ),
    ),
  ).toContain(' S  W  T  B  R ');
});

test('a missing builder session paints a loud degraded row and tooltip', () => {
  const row = taskRow({
    kind: 'detail',
    sessionName: 'planted-missing-session',
    sessionAvailable: false,
    standing: 'ready',
  });
  const rendered = renderedText(
    TasksDashboardPaneRenderer.Class.render(
      makeContext({ rows: [row], innerWidth: 60, viewportWidth: 59 }),
    ),
  );
  expect(rendered).toContain('! DEGRADED');
  expect(
    TasksDashboardPaneRenderer.Class.tooltipForAction('session', row),
  ).toBe('Builder tmux session is missing: planted-missing-session');
});

test('active and done tasks stay on one row and truncate through the shared ellipsis', () => {
  for (const lens of ['active', 'done'] as const) {
    const rendered = renderedText(
      TasksDashboardPaneRenderer.Class.render(
        makeContext({
          lens,
          innerWidth: 28,
          viewportWidth: 27,
          rows: [
            taskRow({
              label: 'planted-task-with-a-long-name',
              attachment: lens === 'done' ? 'merged 1a2b3c4d' : '',
              identity: 'codex·5.6-sol·high',
            }),
          ],
        }),
      ),
    );
    expect(rendered.split('\n')).toHaveLength(2);
    expect(rendered).toContain('#901 planted…');
    expect(rendered).not.toContain('planted-task-with-a-long-name');
    expect(rendered).toContain(' W  T  B  R ');
  }
});

test('selected and hovered tabs paint exactly one padding cell on both sides', () => {
  const tabs = TasksDashboardPaneRenderer.Class.lensTabs();
  expect(tabs).toEqual([
    { lens: 'live', label: 'LIVE', startColumn: 0, endColumn: 5 },
    { lens: 'active', label: 'ACTIVE', startColumn: 7, endColumn: 14 },
    { lens: 'done', label: 'DONE', startColumn: 16, endColumn: 21 },
  ]);
  const styled = TasksDashboardPaneRenderer.Class.render(
    makeContext({
      lens: 'active',
      hoveredTabLineTarget: { kind: 'lens', lens: 'done' },
    }),
  );
  const chunks = styled.chunks as Array<{
    text: string;
    bg?: { toString(): string };
  }>;
  const activeChunk = chunks.find((chunk) => chunk.text === ' ACTIVE ');
  const hoveredChunk = chunks.find((chunk) => chunk.text === ' DONE ');
  const inactiveChunk = chunks.find((chunk) => chunk.text === ' LIVE ');
  expect(activeChunk?.bg?.toString()).toBe(
    RGBA.fromHex(ThemePalettes.Class.DARK.selection).toString(),
  );
  expect(hoveredChunk?.bg?.toString()).toBe(
    RGBA.fromHex(ThemePalettes.Class.DARK.cursorLine).toString(),
  );
  expect(inactiveChunk?.bg).toBeUndefined();
});

test('the cycle tooltip states both actions', () => {
  const target = { kind: 'cycle' } as const;
  expect(
    TasksDashboardPaneRenderer.Class.tooltipForTabLineTarget(target, false),
  ).toBe('Start automatic lens cycling');
  expect(
    TasksDashboardPaneRenderer.Class.tooltipForTabLineTarget(target, true),
  ).toBe('Stop automatic lens cycling');
});
