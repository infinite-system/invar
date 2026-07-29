import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ref } from 'vue';
import { PanelHost } from '../ui/PanelHost';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type { PaneContent } from '../ui/PaneContent.interface';
import { TasksDashboardPlugin } from './TasksDashboardPlugin';

interface RecordingContext {
  context: ApplicationContributionContext;
  rightDockHost: PanelHost.Instance;
  dockContents: PaneContent[];
  keybindings: number;
  commandIds: string[];
  commandRunners: Map<string, () => void>;
  commandDisposals: number;
  statusDisposals: number;
  settingIdentifiers: string[];
  openedPaths: string[];
  editorFocusCount: number;
  snapshot: () => Record<string, unknown>;
}

function makeWorkspaceRoot(withTree: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'tasks-dashboard-plugin-'));
  if (withTree) {
    const folderPath = join(
      root,
      '.invar',
      'tasks',
      'in-progress',
      '901-planted-building',
    );
    mkdirSync(folderPath, { recursive: true });
    writeFileSync(
      join(folderPath, 'task-901-planted-building.md'),
      '# 901 — planted\n\nState: IN-PROGRESS\n\n## Outline\n' +
        'body line\n'.repeat(30),
    );
  }
  return root;
}

function makeContext(workspaceRoot: string): RecordingContext {
  const dockContents: PaneContent[] = [];
  const commandIds: string[] = [];
  const commandRunners = new Map<string, () => void>();
  const settingIdentifiers: string[] = [];
  // The REAL right-dock host options (Bootstrap registers with reveal-on-registration), so the
  // take-back-the-reveal behavior is observed against genuine host semantics.
  const rightDockHost = new PanelHost.Class({
    showWhenContentRegistered: true,
  });
  let snapshotProvider: (() => Record<string, unknown>) | null = null;
  const recording: RecordingContext = {
    rightDockHost,
    dockContents,
    keybindings: 0,
    commandIds,
    commandRunners,
    commandDisposals: 0,
    statusDisposals: 0,
    settingIdentifiers,
    openedPaths: [],
    editorFocusCount: 0,
    snapshot: () => snapshotProvider?.() ?? {},
    context: {
      workspaceSet: {
        active: {
          root: workspaceRoot,
          openFileInTab: (path: string) => {
            recording.openedPaths.push(path);
          },
          focusEditor: () => {
            recording.editorFocusCount += 1;
          },
        },
        activeWorkspaceIndex: ref(0),
      },
      rightDockHost,
      primaryDockHost: { blur: () => {} },
      settings: { scrollbarThickness: ref(1) },
      theme: { glyphLevel: ref('unicode') },
      registerKeybindings: () => {
        recording.keybindings += 1;
      },
      registerRightDockContent: (content: PaneContent) => {
        dockContents.push(content);
        rightDockHost.register(content);
      },
      registerSetting: (contribution: { identifier: string }) => {
        settingIdentifiers.push(contribution.identifier);
        return { value: ref(10), save: () => {}, dispose: () => {} };
      },
      statusProjectionContributions: {
        register: (contribution: {
          snapshot: () => Record<string, unknown>;
        }) => {
          snapshotProvider = contribution.snapshot;
          return () => {
            recording.statusDisposals += 1;
            snapshotProvider = null;
          };
        },
      },
      commands: {
        registerAll: (commands: readonly { id: string; run: () => void }[]) => {
          for (const command of commands) {
            commandIds.push(command.id);
            commandRunners.set(command.id, command.run);
          }
          return () => {
            recording.commandDisposals += 1;
          };
        },
      },
      requestRender: () => {},
    } as never,
  };
  return recording;
}

test('activation registers the right-dock pane, commands, keybindings, setting, and status keys', () => {
  const workspaceRoot = makeWorkspaceRoot(true);
  const plugin = new TasksDashboardPlugin.Class();
  const recording = makeContext(workspaceRoot);
  plugin.activateApplication(recording.context);
  expect(recording.dockContents.map((content) => content.id)).toEqual([
    'tasks',
  ]);
  expect(recording.keybindings).toBe(1);
  expect(recording.settingIdentifiers).toEqual(['tasksDashboardCycleSeconds']);
  expect(recording.commandIds).toContain('view.showTasks');
  expect(recording.commandIds).toContain('tasks.open');
  expect(recording.commandIds).toContain('tasks.toggleCycle');
  const snapshot = recording.snapshot();
  expect(snapshot.tasksLens).toBe('live');
  expect(snapshot.tasksAvailable).toBe(true);
  expect(snapshot.tasksRows).toBe(1);
  plugin.disposeApplication();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

test('registration does not reveal a hidden dock; the pane shows only by gesture', () => {
  const workspaceRoot = makeWorkspaceRoot(true);
  const plugin = new TasksDashboardPlugin.Class();
  const recording = makeContext(workspaceRoot);
  expect(recording.rightDockHost.visible.value).toBe(false);
  plugin.activateApplication(recording.context);
  // The host's reveal-on-registration is taken back: boot leaves the dock exactly as found.
  expect(recording.rightDockHost.visible.value).toBe(false);
  recording.commandRunners.get('view.showTasks')?.();
  expect(recording.rightDockHost.visible.value).toBe(true);
  expect(recording.rightDockHost.activeContent?.id).toBe('tasks');
  plugin.disposeApplication();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

test('activation leaves an already-visible dock alone', () => {
  const workspaceRoot = makeWorkspaceRoot(true);
  const plugin = new TasksDashboardPlugin.Class();
  const recording = makeContext(workspaceRoot);
  recording.rightDockHost.register({
    id: 'other',
    title: 'Other',
    renderRevision: ref(0),
    handleKey: () => false,
    onResize: () => {},
    onFocus: () => {},
    onBlur: () => {},
    dispose: () => {},
  } as never);
  expect(recording.rightDockHost.visible.value).toBe(true);
  plugin.activateApplication(recording.context);
  expect(recording.rightDockHost.visible.value).toBe(true);
  plugin.disposeApplication();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

test('tasks.open opens the selected record through the workspace seam and blurs the dock', () => {
  const workspaceRoot = makeWorkspaceRoot(true);
  const plugin = new TasksDashboardPlugin.Class();
  const recording = makeContext(workspaceRoot);
  plugin.activateApplication(recording.context);
  recording.commandRunners.get('view.showTasks')?.();
  expect(recording.rightDockHost.activeContent?.id).toBe('tasks');
  recording.commandRunners.get('tasks.open')?.();
  expect(recording.openedPaths).toEqual([
    join(
      workspaceRoot,
      '.invar',
      'tasks',
      'in-progress',
      '901-planted-building',
      'task-901-planted-building.md',
    ),
  ]);
  expect(recording.editorFocusCount).toBeGreaterThan(0);
  plugin.disposeApplication();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

test('an absent tree keeps tasks.open a stated no-op, never a crash', () => {
  const workspaceRoot = makeWorkspaceRoot(false);
  const plugin = new TasksDashboardPlugin.Class();
  const recording = makeContext(workspaceRoot);
  plugin.activateApplication(recording.context);
  expect(recording.snapshot().tasksAvailable).toBe(false);
  recording.commandRunners.get('tasks.open')?.();
  expect(recording.openedPaths).toEqual([]);
  plugin.disposeApplication();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

test('dispose withdraws the projection and commands; a reinstall rebuilds from the same context', () => {
  const workspaceRoot = makeWorkspaceRoot(true);
  const plugin = new TasksDashboardPlugin.Class();
  const recording = makeContext(workspaceRoot);
  plugin.activateApplication(recording.context);
  plugin.disposeApplication();
  expect(recording.statusDisposals).toBe(1);
  expect(recording.commandDisposals).toBe(1);
  expect(recording.snapshot()).toEqual({});
  // Reinstall: a second activation registers a fresh pane and a live projection.
  plugin.activateApplication(recording.context);
  expect(recording.dockContents).toHaveLength(2);
  expect(recording.snapshot().tasksLens).toBe('live');
  plugin.disposeApplication();
  rmSync(workspaceRoot, { recursive: true, force: true });
});
