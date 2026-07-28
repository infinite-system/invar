import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  test('unsupported task forms and variables become named issues', () => {
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
            label: 'Variable',
            type: 'shell',
            command: 'printf',
            args: ['${workspaceRoot}'],
          },
        ],
      }),
    );

    const result = TaskConfiguration.Class.resolve(workspaceRoot);
    expect(result.tasks).toEqual([]);
    expect(result.issues.map((issue) => issue.message)).toEqual([
      'Task "Process" uses unsupported type "process"',
      'Task "Compound" uses unsupported dependsOn',
      'Unsupported task variable: ${workspaceRoot}',
    ]);
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
    expect(result.issues).toEqual([]);
    expect(result.tasks[0]?.command).toBe('program');
    expect(result.tasks[0]?.arguments).toEqual(['argument']);
  });
});
