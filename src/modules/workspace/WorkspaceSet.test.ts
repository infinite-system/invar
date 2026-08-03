import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  mkdtempSync as makeTemporaryDirectorySync,
  mkdirSync as makeDirectorySync,
  rmSync as removeSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir as temporaryDirectory } from 'node:os';
import { join } from 'node:path';
import { ref } from 'vue';
import { Settings, type SettingsFileSystem } from '../settings/Settings';
import { WorkspaceSet } from './WorkspaceSet';
import { GitPlugin } from '../git/GitPlugin';
import { EditorSourceTextViewProviderFactory } from '../editor/EditorSourceTextViewProviderFactory';

let temporaryRoot = '';

let workspaceRoots: string[] = [];

beforeEach(() => {
  temporaryRoot = makeTemporaryDirectorySync(
    join(temporaryDirectory(), 'workspace-set-'),
  );
  workspaceRoots = ['first-project', 'second-project', 'third-project'].map(
    (directoryName) => {
      const workspaceRoot = join(temporaryRoot, directoryName);
      makeDirectorySync(workspaceRoot);
      return workspaceRoot;
    },
  );
});

afterEach(() => {
  removeSync(temporaryRoot, { recursive: true, force: true });
});

function createSettings(): Settings.Instance {
  const settingsFileSystem: SettingsFileSystem = {
    readTextFile: () => null,
    writeTextFile: () => {},
    homeDirectory: () => temporaryRoot,
  };
  return new Settings.Class({ fileSystem: settingsFileSystem });
}

describe('WorkspaceSet project-layer flyweight', () => {
  test('workspace lifecycle events bracket contributor open and final disposal', () => {
    const events: string[] = [];
    const workspaceSet = new WorkspaceSet.Class(createSettings(), {
      contributors: [
        {
          attachWorkspace: () => ({
            opened: (root) => events.push(`opened:${root}`),
            suspended: () => {},
            resumed: () => {},
            disposed: () => events.push('contribution-disposed'),
          }),
        },
      ],
    });
    workspaceSet.onActiveWorkspaceChanged((workspace) =>
      events.push(`active:${workspace.root}`),
    );
    workspaceSet.onWorkspaceDisposed((workspace) =>
      events.push(`world-disposed:${workspace.root}`),
    );

    workspaceSet.open(workspaceRoots[0]!);
    workspaceSet.open(workspaceRoots[1]!);
    expect(events.slice(0, 4)).toEqual([
      `active:${workspaceRoots[0]}`,
      `opened:${workspaceRoots[0]}`,
      `active:${workspaceRoots[1]}`,
      `opened:${workspaceRoots[1]}`,
    ]);

    events.length = 0;
    workspaceSet.closeActive();
    expect(events).toEqual([
      'contribution-disposed',
      `active:${workspaceRoots[0]}`,
      `world-disposed:${workspaceRoots[1]}`,
    ]);
    workspaceSet.dispose();
  });

  test('host code-folding capability attaches to every workspace editor', () => {
    const codeFoldingEnabled = ref(false);
    const workspaceSet = new WorkspaceSet.Class(createSettings(), {
      createSourceTextViews: () =>
        EditorSourceTextViewProviderFactory.Class.create(),
      codeFoldingEnabled,
    });
    workspaceSet.open(workspaceRoots[0]!);
    expect(workspaceSet.activeEditor.codeFoldingEnabled).toBe(false);

    codeFoldingEnabled.value = true;
    expect(workspaceSet.activeEditor.codeFoldingEnabled).toBe(true);
  });

  test('active editor and document shortcuts follow the selected workspace', () => {
    const documentPath = join(workspaceRoots[0]!, 'active.txt');
    writeFileSync(documentPath, 'active document\n');
    const workspaceSet = new WorkspaceSet.Class(createSettings(), {
      createSourceTextViews: () =>
        EditorSourceTextViewProviderFactory.Class.create(),
    });
    workspaceSet.open(workspaceRoots[0]!);

    expect(workspaceSet.activeEditor).toBe(workspaceSet.active.editor);
    expect(workspaceSet.activeDocument).toBeNull();

    workspaceSet.active.openFileInTab(documentPath);
    expect(workspaceSet.activeDocument).toBe(
      workspaceSet.active.activeDocumentHandle?.document ?? null,
    );
    expect(workspaceSet.activeLanguageProviderNotice).toBe(
      workspaceSet.active.languageProviderNotice(),
    );
    workspaceSet.dispose();
  });

  test('N open workspaces keep exactly one live GitWatcher', () => {
    const plugin = new GitPlugin.Class();
    const workspaceSet = new WorkspaceSet.Class(createSettings(), {
      createSourceTextViews: () =>
        EditorSourceTextViewProviderFactory.Class.create(),
      contributors: [plugin],
    });
    for (const workspaceRoot of workspaceRoots)
      workspaceSet.open(workspaceRoot);

    expect(workspaceSet.count).toBe(3);
    expect(workspaceSet.activeWorkspaceIndex.value).toBe(2);
    expect(
      workspaceSet.entries.value.map(
        (workspace) => plugin.controllerFor(workspace).hasLiveWatcher,
      ),
    ).toEqual([false, false, true]);

    workspaceSet.activate(0);
    expect(
      workspaceSet.entries.value.map(
        (workspace) => plugin.controllerFor(workspace).hasLiveWatcher,
      ),
    ).toEqual([true, false, false]);
    workspaceSet.dispose();
  });

  test('switching restores each workspace tree and editor state', () => {
    const firstFilePath = join(workspaceRoots[0]!, 'first.txt');
    const secondFilePath = join(workspaceRoots[1]!, 'second.txt');
    writeFileSync(firstFilePath, 'first workspace\n');
    writeFileSync(secondFilePath, 'second workspace\n');
    const workspaceSet = new WorkspaceSet.Class(createSettings(), {
      createSourceTextViews: () =>
        EditorSourceTextViewProviderFactory.Class.create(),
    });

    workspaceSet.open(workspaceRoots[0]!);
    workspaceSet.active.openFileInTab(firstFilePath);
    workspaceSet.open(workspaceRoots[1]!);
    workspaceSet.active.openFileInTab(secondFilePath);

    expect(workspaceSet.activeDocument?.path).toBe(secondFilePath);
    workspaceSet.activate(0);
    expect(workspaceSet.active.root).toBe(workspaceRoots[0]!);
    expect(workspaceSet.activeDocument?.path).toBe(firstFilePath);
    workspaceSet.activate(1);
    expect(workspaceSet.activeDocument?.path).toBe(secondFilePath);
    workspaceSet.dispose();
  });

  test('closing disposes one workspace and activates a stable neighbour', () => {
    const plugin = new GitPlugin.Class();
    const workspaceSet = new WorkspaceSet.Class(createSettings(), {
      createSourceTextViews: () =>
        EditorSourceTextViewProviderFactory.Class.create(),
      contributors: [plugin],
    });
    for (const workspaceRoot of workspaceRoots)
      workspaceSet.open(workspaceRoot);

    expect(workspaceSet.close(1)).toBe(true);
    expect(
      workspaceSet.tabs().map((workspaceTab) => workspaceTab.name),
    ).toEqual(['first-project', 'third-project']);
    expect(workspaceSet.active.root).toBe(workspaceRoots[2]!);
    expect(workspaceSet.closeActive()).toBe(true);
    expect(workspaceSet.count).toBe(1);
    expect(workspaceSet.closeActive()).toBe(false);
    expect(plugin.controllerFor(workspaceSet.active).hasLiveWatcher).toBe(true);
    workspaceSet.dispose();
  });
});
