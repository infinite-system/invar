import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ref } from 'vue';
import { PanelHost } from '../ui/PanelHost';
import { ThemePalettes } from '../theme/ThemePalettes';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type { PaneContent } from '../ui/PaneContent.interface';
import { TasksDashboardPlugin } from './TasksDashboardPlugin';

class $AvailableSessionTasksDashboardPlugin
  extends TasksDashboardPlugin.$Class
{
  protected override currentTmuxSessionNames(): ReadonlySet<string> {
    return new Set(['invar/901-planted-building']);
  }
}

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
  runtimeRequests: Array<{ kind: string; request: Record<string, unknown> }>;
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

function makeContext(
  workspaceRoot: string,
  settingValues: Record<string, unknown> = {},
): RecordingContext {
  const dockContents: PaneContent[] = [];
  const commandIds: string[] = [];
  const commandRunners = new Map<string, () => void>();
  const settingIdentifiers: string[] = [];
  const rightDockHost = new PanelHost.Class();
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
    runtimeRequests: [],
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
        open: () => 0,
      },
      rightDockHost,
      primaryDockHost: { blur: () => {} },
      settings: { scrollbarThickness: ref(1) },
      theme: {
        glyphLevel: ref('unicode'),
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
      registerKeybindings: () => {
        recording.keybindings += 1;
      },
      registerRightDockContent: (content: PaneContent) => {
        dockContents.push(content);
        rightDockHost.register(content);
      },
      registerDockContent: (contribution: {
        content: PaneContent;
        settingIdentifier: string;
      }) => {
        dockContents.push(contribution.content);
        settingIdentifiers.push(contribution.settingIdentifier);
        rightDockHost.register(contribution.content);
        return {
          value: ref<'left' | 'right'>('right'),
          host: () => rightDockHost,
          isPainted: () =>
            rightDockHost.isContentVisible(contribution.content.id),
          reveal: () => rightDockHost.revealContent(contribution.content.id),
          show: () => rightDockHost.showContent(contribution.content.id),
          blur: () => rightDockHost.blur(),
          save: () => {},
          dispose: () => {},
        };
      },
      registerSetting: (contribution: {
        identifier: string;
        defaultValue: unknown;
      }) => {
        settingIdentifiers.push(contribution.identifier);
        return {
          value: ref(
            contribution.identifier in settingValues
              ? settingValues[contribution.identifier]
              : contribution.defaultValue,
          ),
          save: () => {},
          dispose: () => {},
        };
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
      openRuntimePane: (kind: string, request: Record<string, unknown>) => {
        recording.runtimeRequests.push({ kind, request });
        return true;
      },
    } as never,
  };
  return recording;
}

test('activation registers the dock pane, commands, keybindings, setting, and status keys', () => {
  const workspaceRoot = makeWorkspaceRoot(true);
  const plugin = new TasksDashboardPlugin.Class();
  const recording = makeContext(workspaceRoot);
  plugin.activateApplication(recording.context);
  expect(recording.dockContents.map((content) => content.id)).toEqual([
    'tasks',
  ]);
  expect(recording.keybindings).toBe(1);
  expect(recording.settingIdentifiers).toEqual([
    'tasksDashboardCycleSeconds',
    'tasksDashboardShowByDefault',
    'tasks.dockSide',
  ]);
  expect(recording.commandIds).toContain('view.showTasks');
  expect(recording.commandIds).toContain('tasks.open');
  expect(recording.commandIds).toContain('tasks.toggleCycle');
  const snapshot = recording.snapshot();
  expect(snapshot.tasksLens).toBe('live');
  expect(snapshot.tasksAvailable).toBe(false);
  expect(snapshot.tasksRows).toBe(0);
  recording.commandRunners.get('view.showTasks')?.();
  expect(recording.snapshot().tasksAvailable).toBe(true);
  expect(recording.snapshot().tasksRows).toBe(3);
  plugin.disposeApplication();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

test('registration does not reveal a hidden dock; the pane shows only by gesture', () => {
  const workspaceRoot = makeWorkspaceRoot(true);
  const plugin = new TasksDashboardPlugin.Class();
  const recording = makeContext(workspaceRoot);
  expect(recording.rightDockHost.visible.value).toBe(false);
  plugin.activateApplication(recording.context);
  // Registration leaves the dock exactly as found.
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
  recording.rightDockHost.showContent('other');
  expect(recording.rightDockHost.visible.value).toBe(true);
  plugin.activateApplication(recording.context);
  expect(recording.rightDockHost.visible.value).toBe(true);
  plugin.disposeApplication();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

test('the opt-in default reveals tasks without taking keyboard focus', () => {
  const workspaceRoot = makeWorkspaceRoot(true);
  const plugin = new TasksDashboardPlugin.Class();
  const recording = makeContext(workspaceRoot, {
    tasksDashboardShowByDefault: true,
  });
  plugin.activateApplication(recording.context);
  expect(recording.rightDockHost.activeContent?.id).toBe('tasks');
  expect(recording.rightDockHost.visible.value).toBe(true);
  expect(recording.rightDockHost.focused.value).toBe(false);
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

test('the detail row attaches through the terminal runtime and states a missing report', () => {
  const workspaceRoot = makeWorkspaceRoot(true);
  const plugin = new $AvailableSessionTasksDashboardPlugin();
  const recording = makeContext(workspaceRoot);
  plugin.activateApplication(recording.context);
  recording.commandRunners.get('view.showTasks')?.();
  const pane = recording.dockContents[0]!;
  pane.onResize(60, 10);
  // Scope row, task row, detail row. The session is the first pinned action.
  expect(pane.onPointerDown?.(45, 3)).toBe(true);
  expect(recording.runtimeRequests).toHaveLength(1);
  expect(recording.runtimeRequests[0]?.kind).toBe('terminal');
  expect(recording.runtimeRequests[0]?.request.process).toEqual({
    command: 'tmux',
    arguments: ['attach', '-t', 'invar/901-planted-building'],
  });
  // The fourth pinned action is report; this fixture has none.
  expect(pane.onPointerDown?.(57, 3)).toBe(true);
  expect(recording.snapshot().tasksActionNotice).toBe(
    'No latest report exists for #901.',
  );
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
