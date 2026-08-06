// The tasks dashboard plugin: an ordinary contribution — a manifest row, a dock pane,
// keybindings, commands, a contributed setting, and a status projection — registered through the
// same seams every other citizen uses. It projects the durable task system (.invar/tasks/) through
// the CLI lens readers; it starts no process and owns no protocol.
//
// Uninstall symmetry from day one: disposing the application contribution stops the overview's
// heartbeat and withdraws the commands, the status projection, and the pane reference; the host
// unregisters the pane, setting, and keybindings scoped to the activation. A reinstall rebuilds
// all of it from the same context — nothing is retained between lives.
//
// invariant: The tasks dashboard is a pane content citizen (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: Task actions use the workspace and runtime seams (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: Tasks stay hidden by default (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: The host canvas is complete without plugins (project.invariants.md)
// invariant: Plugin boundaries grant one authority (project.invariants.md)
import { existsSync } from 'node:fs';
import type {
  ApplicationContributionContext,
  ApplicationContributor,
  RegisteredDockContent,
} from '../app/ApplicationContributor.interface';
import type { StatusSnapshot } from '../system/StatusChannel';
import {
  fleetRepositoryRootForWorkspace,
  readTmuxSessionNames,
} from '../../../scripts/tasks/tasks-status';
import { TasksDashboardOverview } from './TasksDashboardOverview';
import { TasksDashboardPaneContent } from './TasksDashboardPaneContent';
import type { TasksDashboardAction } from './TasksDashboardPaneRenderer';

class $TasksDashboardPlugin implements ApplicationContributor {
  readonly identifier = 'tasks-dashboard';
  readonly name = 'Tasks Dashboard';
  protected application: ApplicationContributionContext | null = null;
  protected overview: TasksDashboardOverview.Model | null = null;
  protected paneContent: TasksDashboardPaneContent.Model | null = null;
  protected disposeStatusProjection: (() => void) | null = null;
  protected disposeCommands: (() => void) | null = null;
  protected dockContent: RegisteredDockContent | null = null;
  protected autoShown = false;
  protected lastAction: string | null = null;

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    context.registerKeybindings([
      {
        chord: { key: 't', ctrl: true, shift: true },
        action: 'view.showTasks',
      },
      {
        chord: { key: 'tab' },
        action: 'tasks.focusEditor',
        context: 'tasksDashboard',
      },
      { chord: { key: 'up' }, action: 'tasks.up', context: 'tasksDashboard' },
      {
        chord: { key: 'down' },
        action: 'tasks.down',
        context: 'tasksDashboard',
      },
      {
        chord: { key: 'left' },
        action: 'tasks.previousLens',
        context: 'tasksDashboard',
      },
      {
        chord: { key: 'right' },
        action: 'tasks.nextLens',
        context: 'tasksDashboard',
      },
      {
        chord: { key: 'return' },
        action: 'tasks.open',
        context: 'tasksDashboard',
      },
      {
        chord: { key: 'space' },
        action: 'tasks.open',
        context: 'tasksDashboard',
      },
      {
        chord: { key: 'p' },
        action: 'tasks.toggleCycle',
        context: 'tasksDashboard',
      },
      {
        chord: { key: 'c', ctrl: true },
        action: 'tasks.copy',
        context: 'tasksDashboard',
      },
      {
        chord: { key: 'c', super: true },
        action: 'tasks.copy',
        context: 'tasksDashboard',
      },
    ]);
    const cycleSecondsSetting = context.registerSetting({
      identifier: 'tasksDashboardCycleSeconds',
      label: 'Overview cycle seconds',
      section: this.name,
      defaultValue: 10,
      spec: { kind: 'number', step: 1, minimum: 2, maximum: 120, decimals: 0 },
    });
    let readShowByDefault = (): boolean => false;
    const showByDefaultSetting = context.registerSetting({
      identifier: 'tasksDashboardShowByDefault',
      label: 'Show tasks by default',
      section: this.name,
      defaultValue: false,
      spec: { kind: 'boolean' },
      changed: () => this.applyDefaultVisibility(readShowByDefault()),
    });
    readShowByDefault = () => showByDefaultSetting.value.value;
    this.overview = this.createOverview(
      context,
      () => cycleSecondsSetting.value.value,
    );
    this.paneContent = this.createPaneContent(context);
    this.dockContent = context.registerDockContent({
      content: this.paneContent,
      settingIdentifier: 'tasks.dockSide',
      settingLabel: 'Dock side',
      section: this.name,
      suggestedSide: 'right',
    });
    this.requireOverview().startObservation();
    this.applyDefaultVisibility(showByDefaultSetting.value.value);
    this.disposeStatusProjection =
      context.statusProjectionContributions.register({
        snapshot: () => this.statusSnapshot(),
      });
    this.registerCommands(context);
  }

  // invariant: Construction goes through overridable seams (project.invariants.md)
  protected createOverview(
    context: ApplicationContributionContext,
    cycleSeconds: () => number,
  ): TasksDashboardOverview.Model {
    return new TasksDashboardOverview.Class({
      workspaceRoot: () => context.workspaceSet.active.root,
      // invariant: Fleet paths derive from the workspace, never the bundle (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
      fleetRepositoryRoot: () =>
        fleetRepositoryRootForWorkspace(context.workspaceSet.active.root),
      isObserved: () => this.paneIsObserved(),
      requestRender: () => context.requestRender(),
      cycleSeconds,
      readTmuxSessionNames: () => this.currentTmuxSessionNames(),
    });
  }

  protected currentTmuxSessionNames(): ReadonlySet<string> {
    return readTmuxSessionNames();
  }

  protected createPaneContent(
    context: ApplicationContributionContext,
  ): TasksDashboardPaneContent.Model {
    return new TasksDashboardPaneContent.Class(
      context,
      this.requireOverview(),
      (action, rowIndex) => this.performRowAction(action, rowIndex),
    );
  }

  /** True while the tasks pane is on screen. A hidden pane owns no timer or task-tree read. */
  protected paneIsObserved(): boolean {
    return this.dockContent?.isPainted() ?? false;
  }

  protected requireDockContent(): RegisteredDockContent {
    const dockContent = this.dockContent;
    if (!dockContent) {
      throw new Error('Tasks dock content is not registered');
    }
    return dockContent;
  }

  protected requireOverview(): TasksDashboardOverview.Model {
    const overview = this.overview;
    if (!overview) {
      throw new Error('Tasks dashboard application contribution is not active');
    }
    return overview;
  }

  protected applyDefaultVisibility(showByDefault: boolean): void {
    const dockContent = this.dockContent;
    if (!dockContent) return;
    if (showByDefault) {
      if (!dockContent.host().visible.value) {
        dockContent.reveal();
        this.autoShown = true;
      }
      return;
    }
    if (
      this.autoShown &&
      dockContent.isPainted() &&
      !dockContent.host().focused.value
    ) {
      dockContent.host().hide();
      this.autoShown = false;
    }
  }

  protected performRowAction(
    action: TasksDashboardAction,
    rowIndex: number,
  ): boolean {
    const application = this.application;
    if (!application) return false;
    const overview = this.requireOverview();
    const row = overview.rows.value[rowIndex];
    if (!row || row.taskNumber === null) return false;
    this.lastAction = `${action}:${row.taskNumber}`;
    overview.clearActionNotice();
    if (action === 'session') {
      const currentSessionTarget = overview.currentSessionTarget(rowIndex);
      if (currentSessionTarget === null) {
        overview.stateActionMiss(
          row.taskNumber,
          `No builder session exists for #${row.taskNumber}.`,
        );
        return true;
      }
      if (!currentSessionTarget.available) {
        overview.stateActionMiss(
          row.taskNumber,
          `Builder session is missing: ${currentSessionTarget.sessionName}.`,
        );
        return true;
      }
      return application.openRuntimePane('terminal', {
        identifier: `tasks-session-${row.taskNumber}`,
        label: `#${row.taskNumber} session`,
        heading: `#${row.taskNumber} tmux`,
        columns: 80,
        rows: 24,
        workingDirectory:
          row.worktreePath !== null && existsSync(row.worktreePath)
            ? row.worktreePath
            : application.workspaceSet.active.root,
        process: {
          command: 'tmux',
          arguments: ['attach', '-t', currentSessionTarget.sessionName],
        },
      });
    }
    if (action === 'workspace') {
      if (row.worktreePath === null || !existsSync(row.worktreePath)) {
        overview.stateActionMiss(
          row.taskNumber,
          `Worktree is missing for #${row.taskNumber}.`,
        );
        return true;
      }
      application.workspaceSet.open(row.worktreePath);
      return true;
    }
    const path =
      action === 'task'
        ? row.taskFilePath
        : action === 'brief'
          ? row.latestBriefFilePath
          : row.latestReportFilePath;
    if (path === null || !existsSync(path)) {
      const name = action === 'task' ? 'task record' : `latest ${action}`;
      overview.stateActionMiss(
        row.taskNumber,
        `No ${name} exists for #${row.taskNumber}.`,
      );
      return true;
    }
    const workspace = application.workspaceSet.active;
    workspace.openFileInTab(path);
    workspace.focusEditor();
    return true;
  }

  disposeApplication(): void {
    this.paneContent = null;
    this.overview?.dispose();
    this.overview = null;
    this.disposeCommands?.();
    this.disposeCommands = null;
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    this.dockContent = null;
    this.autoShown = false;
    this.lastAction = null;
    this.application = null;
  }

  protected registerCommands(context: ApplicationContributionContext): void {
    const overview = () => this.requireOverview();
    const show = (): void => {
      // The pane is about to be looked at — refresh so the first paint is current, then move the
      // keyboard with the gesture to whichever dock owns it.
      overview().refresh();
      this.autoShown = false;
      context.workspaceSet.active.focusEditor();
      this.requireDockContent().show();
    };
    this.disposeCommands = context.commands.registerAll([
      {
        id: 'view.showTasks',
        title: 'View: Show Tasks',
        category: 'View',
        run: show,
      },
      {
        id: 'tasks.focusEditor',
        title: 'Tasks: Focus Editor',
        category: 'Tasks',
        run: () => {
          this.requireDockContent().blur();
          context.workspaceSet.active.focusEditor();
        },
      },
      {
        id: 'tasks.up',
        title: 'Tasks: Move Up',
        category: 'Tasks',
        run: () => overview().moveSelection(-1),
      },
      {
        id: 'tasks.down',
        title: 'Tasks: Move Down',
        category: 'Tasks',
        run: () => overview().moveSelection(1),
      },
      {
        id: 'tasks.previousLens',
        title: 'Tasks: Previous Lens',
        category: 'Tasks',
        run: () => {
          this.paneContent?.haltScrollMomentum();
          overview().advanceLens(-1);
        },
      },
      {
        id: 'tasks.nextLens',
        title: 'Tasks: Next Lens',
        category: 'Tasks',
        run: () => {
          this.paneContent?.haltScrollMomentum();
          overview().advanceLens(1);
        },
      },
      {
        id: 'tasks.open',
        title: 'Tasks: Open Task Record',
        category: 'Tasks',
        run: () => {
          // The record lands IN the editor, so the keyboard follows it out of the dock.
          if (this.performRowAction('task', overview().selectedIndex.value))
            this.requireDockContent().blur();
        },
      },
      {
        id: 'tasks.toggleCycle',
        title: 'Tasks: Play/Pause Overview Cycle',
        category: 'Tasks',
        run: () => overview().toggleCycling(),
      },
      {
        id: 'tasks.copy',
        title: 'Tasks: Copy Selection',
        category: 'Tasks',
        run: () => {
          if (this.paneContent) context.copyPaneSelection(this.paneContent);
        },
      },
    ]);
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const overview = this.overview;
    if (!overview) return {};
    const selectedFile = overview.selectedTaskFilePath();
    const observationCounts = overview.observationCounts();
    return {
      tasksLens: overview.lens.value,
      tasksRows: overview.rows.value.length,
      tasksSelected: overview.selectedIndex.value,
      tasksAvailable: overview.available.value,
      tasksCycling: overview.cycling.value,
      tasksSelectedFile: selectedFile,
      tasksAnimationPaint: overview.animationPaint.value,
      tasksAnimationAtRest: overview.motionHeartbeatAtRest(),
      tasksDataHeartbeatAtRest: overview.dataHeartbeatAtRest(),
      tasksDataHeartbeatTicks: observationCounts.dataHeartbeatTicks,
      tasksTaskTreeReads: observationCounts.taskTreeReads,
      tasksFleetFactProbes: observationCounts.fleetFactProbes,
      tasksSessionProbes: observationCounts.sessionProbes,
      tasksRowRebuilds: observationCounts.rowRebuilds,
      tasksFleetScopeMatches: overview.fleetScopeMatches.value,
      tasksActionNotice: overview.actionNotice.value?.message ?? null,
      tasksGateExitCode: overview.gateGlance.value?.exitCode ?? null,
      tasksLastAction: this.lastAction,
    };
  }
}

export namespace TasksDashboardPlugin {
  export const $Class = $TasksDashboardPlugin;
  export let Class = $TasksDashboardPlugin;
  export type Model = InstanceType<typeof Class>;
}
