#!/usr/bin/env bun
// This probe drives the reported two-task shell shape through the real PTY app.
// Run it with `bun .invar/tasks/in-progress/342-tasks-json-panes-fail-to-load/probe-342-task-pane-launch.ts [line-count] [persisted]`.
// Each case prints task identifiers, labels, columns, and marker locations.
// Two task identifiers, two columns, and both markers mean both live panes loaded.
// The probe uses temporary workspaces, fake credentials tooling, and harmless echo loops.
import { chmodSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../../../src/modules/system/StatusChannel';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

interface ProbeCase {
  readonly lineCount: number;
  readonly persistedErrorIdentifier: boolean;
}

async function runProbeCase(probeCase: ProbeCase): Promise<void> {
  const workspaceRoot = mkdtempSync(
    join(tmpdir(), `invar-task-pane-${probeCase.lineCount}-workspace-`),
  );
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `invar-task-pane-${probeCase.lineCount}-home-`),
  );
  const statusPath = join(homeDirectory, 'status.json');
  const fakeBinaryDirectory = join(workspaceRoot, 'fake-bin');
  const invarDirectory = join(workspaceRoot, '.invar');
  const configurationDirectory = join(homeDirectory, '.config', 'invar');
  mkdirSync(fakeBinaryDirectory);
  mkdirSync(invarDirectory);
  mkdirSync(configurationDirectory, { recursive: true });

  const scaleLines = Array.from(
    { length: probeCase.lineCount },
    (_unused, lineIndex) => `scale-${lineIndex + 1}`,
  ).join('\n');
  await Bun.write(join(workspaceRoot, 'scale.txt'), `${scaleLines}\n`);
  await Bun.write(
    join(homeDirectory, '.profile_env'),
    `export PATH=${JSON.stringify(fakeBinaryDirectory)}:$PATH\n`,
  );
  await Bun.write(join(homeDirectory, '.zshrc'), '# harmless probe shell\n');
  const fakeAwsVaultPath = join(fakeBinaryDirectory, 'aws-vault');
  await Bun.write(
    fakeAwsVaultPath,
    [
      '#!/bin/sh',
      'while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done',
      'if [ "$#" -eq 0 ]; then exit 64; fi',
      'shift',
      'exec "$@"',
      '',
    ].join('\n'),
  );
  chmodSync(fakeAwsVaultPath, 0o755);

  await Bun.write(
    join(invarDirectory, 'tasks.json'),
    `${JSON.stringify(
      {
        version: '2.0.0',
        tasks: [
          {
            label: 'Claude',
            type: 'shell',
            command: '/usr/bin/zsh',
            args: [
              '-lc',
              `cd "\${workspaceFolder}" && source ~/.profile_env && ` +
                `echo PROBE_CLAUDE:${probeCase.lineCount}:$PWD && ` +
                `aws-vault exec harmless --duration 12h -- zsh -ic ` +
                `'echo PROBE_CLAUDE_INNER:${probeCase.lineCount}; ` +
                `while true; do sleep 60; done'`,
            ],
            problemMatcher: [],
            presentation: {
              group: 'terminal-split',
              panel: 'dedicated',
            },
            runOptions: {
              runOn: 'folderOpen',
            },
          },
          {
            label: 'Terminal',
            type: 'shell',
            command: '/usr/bin/zsh',
            args: [
              '-lc',
              `cd "\${workspaceFolder}" && source ~/.profile_env && ` +
                `aws-vault exec harmless --duration 12h -- zsh -ic ` +
                `'echo PROBE_TERMINAL_INNER:${probeCase.lineCount}; ` +
                `while true; do sleep 60; done'`,
            ],
            problemMatcher: [],
            presentation: {
              group: 'terminal-split',
              panel: 'dedicated',
            },
            runOptions: {
              runOn: 'folderOpen',
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  if (probeCase.persistedErrorIdentifier) {
    const errorIdentifier = `task:${encodeURIComponent(workspaceRoot)}:2:error`;
    await Bun.write(
      join(configurationDirectory, 'settings.json'),
      `${JSON.stringify({
        panelContentOrder: [errorIdentifier, 'agent', 'terminal'],
      })}\n`,
    );
  }

  const driver = new PtyTestDriver.Class({
    workspaceRoot,
    columns: 132,
    rows: 42,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
      INVAR_TEST_SUPPRESS_BUILT_IN_TASK: '0',
      INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS: '0',
    },
  });

  try {
    let observation = 'both task markers did not become visible';
    try {
      await driver.awaitGridCondition(
        'both harmless task markers are visible',
        (snapshot) =>
          snapshot.findText(`PROBE_CLAUDE_INNER:${probeCase.lineCount}`) !==
            null &&
          snapshot.findText(`PROBE_TERMINAL_INNER:${probeCase.lineCount}`) !==
            null,
        20_000,
      );
      observation = 'both task markers became visible';
    } catch (error) {
      observation =
        error instanceof Error ? error.message.split('\n')[0] : String(error);
    }
    const status = JSON.parse(
      await Bun.file(statusPath).text(),
    ) as StatusSnapshot;
    const snapshot = driver.snapshot();
    console.log(
      JSON.stringify(
        {
          lineCount: probeCase.lineCount,
          persistedErrorIdentifier: probeCase.persistedErrorIdentifier,
          observation,
          taskLaunchedLabels: status.taskLaunchedLabels,
          panelCellIds: status.panelCellIds,
          panelCellColumns: status.panelCellColumns,
          panelContentLabels: status.panelContentLabels,
          claudeMarker: snapshot.findText(
            `PROBE_CLAUDE_INNER:${probeCase.lineCount}`,
          ),
          terminalMarker: snapshot.findText(
            `PROBE_TERMINAL_INNER:${probeCase.lineCount}`,
          ),
          visibleRows: snapshot
            .textRows()
            .filter((rowText) => rowText.trim().length > 0),
        },
        null,
        2,
      ),
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(workspaceRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

const requestedLineCount = Number(Bun.argv[2]);
const requestedPersistence = Bun.argv[3];
if (Number.isFinite(requestedLineCount) && requestedLineCount > 0) {
  await runProbeCase({
    lineCount: requestedLineCount,
    persistedErrorIdentifier: requestedPersistence === 'persisted',
  });
} else {
  for (const lineCount of [10, 100_000]) {
    await runProbeCase({ lineCount, persistedErrorIdentifier: false });
  }
  for (const lineCount of [10, 100_000]) {
    await runProbeCase({ lineCount, persistedErrorIdentifier: true });
  }
}
