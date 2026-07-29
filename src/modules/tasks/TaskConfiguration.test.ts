import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { TaskConfiguration } from './TaskConfiguration';

const temporaryDirectories: string[] = [];

function createWorkspace(): string {
  const workspaceRoot = mkdtempSync(
    join(tmpdir(), 'invar-task-configuration-'),
  );
  temporaryDirectories.push(workspaceRoot);
  return workspaceRoot;
}

function writeConfiguration(
  workspaceRoot: string,
  directoryName: '.invar' | '.vscode',
  contents: string,
): void {
  const configurationDirectory = join(workspaceRoot, directoryName);
  mkdirSync(configurationDirectory, { recursive: true });
  writeFileSync(join(configurationDirectory, 'tasks.json'), contents);
}

afterEach(() => {
  for (const temporaryDirectory of temporaryDirectories.splice(0)) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

describe('TaskConfiguration', () => {
  test('publishes its static configuration seam', () => {
    expect(TaskConfiguration.Class).toBe(TaskConfiguration.$Class);
  });

  test('.invar wins outright and JSONC preserves VS Code compatibility', () => {
    const workspaceRoot = createWorkspace();
    writeConfiguration(
      workspaceRoot,
      '.vscode',
      `{
        // A VS Code file may contain comments and trailing commas.
        "version": "2.0.0",
        "tasks": [{
          "label": "VS Code",
          "type": "shell",
          "command": "printf",
          "args": ["%s", "\${workspaceFolder}",],
          "runOptions": { "runOn": "folderOpen" },
        }],
      }`,
    );

    const visualStudioCodeResult =
      TaskConfiguration.Class.resolve(workspaceRoot);
    expect(visualStudioCodeResult.source).toBe('.vscode/tasks.json');
    expect(visualStudioCodeResult.tasks[0]?.arguments).toEqual([
      '%s',
      workspaceRoot,
    ]);

    writeConfiguration(
      workspaceRoot,
      '.invar',
      JSON.stringify({
        tasks: [
          {
            label: 'Invar',
            type: 'shell',
            command: 'invar-command',
          },
        ],
      }),
    );
    const invarResult = TaskConfiguration.Class.resolve(workspaceRoot);
    expect(invarResult.source).toBe('.invar/tasks.json');
    expect(invarResult.tasks.map((task) => task.label)).toEqual(['Invar']);
  });

  test('no file supplies the deliberate continue-or-fresh default', () => {
    const result = TaskConfiguration.Class.resolve(createWorkspace());

    expect(result.source).toBe('built-in');
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.command).toBe(
      'claude --dangerously-skip-permissions --continue || ' +
        'claude --dangerously-skip-permissions',
    );
    expect(result.tasks[0]?.runOnFolderOpen).toBe(true);
  });

  test('file sources name each displaced built-in exactly once', () => {
    const fileSources = [
      ['.invar', '.invar/tasks.json'],
      ['.vscode', '.vscode/tasks.json'],
    ] as const;
    for (const [directoryName, source] of fileSources) {
      const workspaceRoot = createWorkspace();
      writeConfiguration(
        workspaceRoot,
        directoryName,
        JSON.stringify({
          tasks: [
            {
              label: 'Configured',
              type: 'shell',
              command: 'configured-command',
            },
          ],
        }),
      );

      const result = TaskConfiguration.Class.resolve(workspaceRoot);

      expect(result.tasks.map((task) => task.label)).toEqual(['Configured']);
      expect(result.issues).toEqual([
        {
          configurationIndex: 1,
          label: 'Displaced: Claude',
          severity: 'warning',
          message: `${source} displaces built-in task: "Claude"`,
        },
      ]);
    }
  });

  test('unsupported task forms become named issues', () => {
    const workspaceRoot = createWorkspace();
    writeConfiguration(
      workspaceRoot,
      '.invar',
      JSON.stringify({
        tasks: [
          {
            label: 'Process',
            type: 'process',
            command: 'program',
          },
          {
            label: 'Compound',
            type: 'shell',
            command: 'program',
            dependsOn: 'Process',
          },
          {
            label: 'Supported',
            type: 'shell',
            command: 'printf',
          },
        ],
      }),
    );

    const result = TaskConfiguration.Class.resolve(workspaceRoot);
    expect(result.tasks.map((task) => task.label)).toEqual(['Supported']);
    expect(result.issues.map((issue) => issue.message)).toEqual([
      'Task "Process" uses unsupported type "process"',
      'Task "Compound" uses unsupported dependsOn',
      '.invar/tasks.json displaces built-in task: "Claude"',
    ]);
  });

  test('unknown task variables pass through unchanged in command and args', () => {
    const workspaceRoot = createWorkspace();
    writeConfiguration(
      workspaceRoot,
      '.vscode',
      JSON.stringify({
        tasks: [
          {
            label: 'Unknown',
            type: 'shell',
            command:
              '${workspaceFolder}:${LOCAL_DIR#/some/prefix}:${workspaceRoot}',
            args: [
              '${inputMode:target}',
              '${commander:selectTarget}',
              '${workspaceFolderBasename}',
            ],
          },
        ],
      }),
    );

    const result = TaskConfiguration.Class.resolve(workspaceRoot);

    expect(result.tasks[0]?.command).toBe(
      `${workspaceRoot}:\${LOCAL_DIR#/some/prefix}:\${workspaceRoot}`,
    );
    expect(result.tasks[0]?.arguments).toEqual([
      '${inputMode:target}',
      '${commander:selectTarget}',
      basename(workspaceRoot),
    ]);
  });

  test('environment variables resolve from the app environment and undefined values become empty', () => {
    const workspaceRoot = createWorkspace();
    const environmentVariableName = 'INVAR_TASK_CONFIGURATION_DEFINED';
    const previousValue = process.env[environmentVariableName];
    process.env[environmentVariableName] = 'defined-value';
    writeConfiguration(
      workspaceRoot,
      '.vscode',
      JSON.stringify({
        tasks: [
          {
            label: 'Environment',
            type: 'shell',
            command: '${env:INVAR_TASK_CONFIGURATION_DEFINED}',
            args: ['before-${env:INVAR_TASK_CONFIGURATION_UNDEFINED}-after'],
          },
        ],
      }),
    );

    try {
      delete process.env.INVAR_TASK_CONFIGURATION_UNDEFINED;
      const result = TaskConfiguration.Class.resolve(workspaceRoot);

      expect(result.tasks[0]?.command).toBe('defined-value');
      expect(result.tasks[0]?.arguments).toEqual(['before--after']);
    } finally {
      if (previousValue === undefined)
        delete process.env[environmentVariableName];
      else process.env[environmentVariableName] = previousValue;
    }
  });

  test('predefined variables use the selected workspace root and active document', () => {
    for (const workspaceName of ['first-workspace', 'second-workspace']) {
      const parentDirectory = createWorkspace();
      const workspaceRoot = join(parentDirectory, workspaceName);
      mkdirSync(workspaceRoot);
      const activeDocumentPath = join(
        workspaceRoot,
        'nested',
        'active.document.ts',
      );
      writeConfiguration(
        workspaceRoot,
        '.vscode',
        JSON.stringify({
          tasks: [
            {
              label: 'Predefined',
              type: 'shell',
              command: '${workspaceFolder}',
              args: [
                '${workspaceFolderBasename}',
                '${file}',
                '${fileBasename}',
                '${fileDirname}',
                '${fileExtname}',
                '${relativeFile}',
                '${cwd}',
                '${pathSeparator}',
                '${userHome}',
              ],
            },
          ],
        }),
      );

      const result = TaskConfiguration.Class.resolve(
        workspaceRoot,
        activeDocumentPath,
      );

      expect(result.tasks[0]?.command).toBe(workspaceRoot);
      expect(result.tasks[0]?.arguments).toEqual([
        basename(workspaceRoot),
        activeDocumentPath,
        basename(activeDocumentPath),
        dirname(activeDocumentPath),
        extname(activeDocumentPath),
        relative(workspaceRoot, activeDocumentPath),
        workspaceRoot,
        sep,
        homedir(),
      ]);
    }
  });

  test('each file variable refuses resolution without an active document', () => {
    const workspaceRoot = createWorkspace();
    const fileVariableNames = [
      'file',
      'fileBasename',
      'fileDirname',
      'fileExtname',
      'relativeFile',
    ];
    writeConfiguration(
      workspaceRoot,
      '.vscode',
      JSON.stringify({
        tasks: fileVariableNames.map((variableName) => ({
          label: variableName,
          type: 'shell',
          command: `\${${variableName}}`,
        })),
      }),
    );

    const result = TaskConfiguration.Class.resolve(workspaceRoot);

    expect(result.tasks).toEqual([]);
    expect(result.issues.slice(0, -1).map((issue) => issue.message)).toEqual(
      fileVariableNames.map(
        (variableName) =>
          `Task variable \${${variableName}} requires an active document`,
      ),
    );
  });

  test('input and command variables stay outside the supported boundary', () => {
    const workspaceRoot = createWorkspace();
    writeConfiguration(
      workspaceRoot,
      '.vscode',
      JSON.stringify({
        tasks: [
          {
            label: 'Input',
            type: 'shell',
            command: '${input:target}',
          },
          {
            label: 'Command',
            type: 'shell',
            command: 'printf',
            args: ['${command:selectTarget}'],
          },
          {
            label: 'Input-like unknown',
            type: 'shell',
            command: '${inputMode:target}',
          },
          {
            label: 'Command-like unknown',
            type: 'shell',
            command: '${commander:selectTarget}',
          },
        ],
      }),
    );

    const result = TaskConfiguration.Class.resolve(workspaceRoot);

    expect(result.tasks.map((task) => task.command)).toEqual([
      '${inputMode:target}',
      '${commander:selectTarget}',
    ]);
    for (const variable of ['${input:target}', '${command:selectTarget}']) {
      expect(
        result.issues.some(
          (issue) =>
            issue.message.startsWith(
              `Unsupported task variable: ${variable}.`,
            ) && issue.message.includes('${env:NAME}'),
        ),
      ).toBe(true);
    }
  });

  test('problemMatcher is accepted without changing process launch data', () => {
    const workspaceRoot = createWorkspace();
    writeConfiguration(
      workspaceRoot,
      '.invar',
      JSON.stringify({
        tasks: [
          {
            label: 'Matched',
            type: 'shell',
            command: 'program',
            args: ['argument'],
            problemMatcher: ['$tsc'],
          },
        ],
      }),
    );

    const result = TaskConfiguration.Class.resolve(workspaceRoot);
    expect(result.issues.map((issue) => issue.message)).toEqual([
      '.invar/tasks.json displaces built-in task: "Claude"',
    ]);
    expect(result.tasks[0]?.command).toBe('program');
    expect(result.tasks[0]?.arguments).toEqual(['argument']);
  });
});
