#!/usr/bin/env bun
// This probe shows how one folder-open task appears in the panel identity fields.
// Run it with `bun .invar/tasks/in-progress/503-a-task-is-a-terminal-pane-not-a-kind/503-task-kind-drive.ts`.
// TASK_503_READY proves the real shell started. The printed arrays align each pane identifier,
// kind, and label. A task-prefixed kind means the panel still treats task identity as a kind.
// The glyph cell proves the task marker painted. The opened path proves a real click on that cell
// opened this workspace's task source. The nearby rows show both observations in screen context.

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../../../src/modules/system/StatusChannel';
import { ThemeIcons } from '../../../../src/modules/theme/ThemeIcons';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const workspaceRoot = mkdtempSync(
  join(tmpdir(), 'invar-503-task-kind-workspace-'),
);
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-503-task-kind-home-'));
const invarDirectory = join(workspaceRoot, '.invar');
mkdirSync(invarDirectory);

await Bun.write(
  join(invarDirectory, 'tasks.json'),
  `${JSON.stringify(
    {
      version: '2.0.0',
      tasks: [
        {
          label: 'Task 503 Probe',
          type: 'shell',
          command: '/bin/sh',
          args: ['-lc', "printf 'TASK_503_READY\\n'; exec /bin/sh -i"],
          presentation: { panel: 'dedicated' },
          runOptions: { runOn: 'folderOpen' },
        },
      ],
    },
    null,
    2,
  )}\n`,
);

const statusPath = join(homeDirectory, 'status.json');
const driver = new PtyTestDriver.Class({
  workspaceRoot,
  columns: 132,
  rows: 42,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
    INVAR_TEST_SUPPRESS_BUILT_IN_TASK: '1',
    INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS: '0',
  },
});

try {
  const status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the folder-open task owns one live panel pane',
    (candidate: StatusSnapshot) =>
      Array.isArray(candidate.panelContentIds) &&
      candidate.panelContentIds.some(
        (identifier) =>
          typeof identifier === 'string' && identifier.startsWith('task:'),
      ),
  );
  const screen = await driver.awaitGridCondition(
    'the folder-open task reaches its real shell',
    (snapshot) => snapshot.findText('TASK_503_READY') !== null,
  );
  const taskGlyph = (['nerd', 'unicode', 'ascii'] as const)
    .map((glyphLevel) =>
      screen.findText(
        ThemeIcons.Class.taskActionIconsFor(glyphLevel).taskRecord,
      ),
    )
    .find((location) => location !== null);
  if (!taskGlyph) throw new Error('The task pane did not paint its task glyph');
  driver.sendMouse({
    kind: 'move',
    column: taskGlyph.column,
    row: taskGlyph.row,
  });
  driver.sendMouseClick({
    column: taskGlyph.column,
    row: taskGlyph.row,
    button: 'left',
  });
  const openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the task glyph opens the pane task source',
    (candidate: StatusSnapshot) =>
      candidate.activeBuffer === join(invarDirectory, 'tasks.json'),
  );
  console.log(
    JSON.stringify(
      {
        panelContentIds: status.panelContentIds,
        panelContentKinds: status.panelContentKinds,
        panelContentLabels: status.panelContentLabels,
        taskMarkerRow: screen.findText('TASK_503_READY')?.row,
        taskGlyph: {
          column: taskGlyph.column,
          row: taskGlyph.row,
        },
        openedTaskSource: openedStatus.activeBuffer,
        taskPanelRows: screen
          .textRows()
          .slice(
            Math.max(0, (screen.findText('TASK_503_READY')?.row ?? 4) - 4),
            (screen.findText('TASK_503_READY')?.row ?? 4) + 3,
          ),
      },
      null,
      2,
    ),
  );
} finally {
  await driver.dispose();
  rmSync(workspaceRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
