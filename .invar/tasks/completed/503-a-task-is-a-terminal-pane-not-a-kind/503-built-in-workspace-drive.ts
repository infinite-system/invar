#!/usr/bin/env bun
// This probe shows the no-file built-in task and an interactive terminal in one workspace.
// Run it with `bun .invar/tasks/in-progress/503-a-task-is-a-terminal-pane-not-a-kind/503-built-in-workspace-drive.ts`.
// The first snapshot shows the declared task. The second follows a real Ctrl+J terminal gesture.
// Each printed identifier aligns with its kind and label. A task identifier paired with kind
// `terminal` proves that task identity no longer acts as a runtime category.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../../../src/modules/system/StatusChannel';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const workspaceRoot = mkdtempSync(
  join(tmpdir(), 'invar-503-built-in-workspace-'),
);
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-503-built-in-home-'));
const statusPath = join(homeDirectory, 'status.json');
const taskIdentifier = `task:${encodeURIComponent(workspaceRoot)}:0`;
const driver = new PtyTestDriver.Class({
  workspaceRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
    INVAR_TEST_SUPPRESS_BUILT_IN_TASK: '0',
    INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS: '0',
  },
});

function panelIdentity(status: StatusSnapshot): Record<string, unknown> {
  return {
    activeIdentifier: status.panelActiveContent,
    activeKind: status.panelActiveContentKind,
    identifiers: status.panelContentIds,
    kinds: status.panelContentKinds,
    labels: status.panelContentLabels,
  };
}

try {
  const taskStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the built-in task owns its stable identifier and terminal kind',
    (candidate: StatusSnapshot) =>
      Array.isArray(candidate.panelContentIds) &&
      candidate.panelContentIds.includes(taskIdentifier) &&
      Array.isArray(candidate.panelContentKinds) &&
      candidate.panelContentKinds.every((kind) => kind === 'terminal'),
  );
  driver.sendKeys('Control+j');
  await driver.awaitScreenChange();
  const interactiveTerminalStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Ctrl+J adds or selects an interactive terminal beside the task',
    (candidate: StatusSnapshot) =>
      candidate.panelActiveContentKind === 'terminal' &&
      Array.isArray(candidate.panelContentIds) &&
      candidate.panelContentIds.includes(taskIdentifier) &&
      candidate.panelContentIds.some(
        (identifier) =>
          typeof identifier === 'string' && identifier !== taskIdentifier,
      ) &&
      Array.isArray(candidate.panelContentKinds) &&
      candidate.panelContentKinds.every((kind) => kind === 'terminal'),
  );
  console.log(
    JSON.stringify(
      {
        taskIdentifier,
        beforeControlJ: panelIdentity(taskStatus),
        afterControlJ: panelIdentity(interactiveTerminalStatus),
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
