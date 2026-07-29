// The tasks dashboard plugin: an ordinary contribution — a manifest row, a right-dock pane,
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
// invariant: Selection opens the record through the workspace open seam (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: The host canvas is complete without plugins (project.invariants.md)
// invariant: Plugin boundaries grant one authority (project.invariants.md)
import { existsSync } from 'node:fs';
import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import type { StatusSnapshot } from '../system/StatusChannel';
import { TasksDashboardOverview } from './TasksDashboardOverview';
import { TasksDashboardPaneContent } from './TasksDashboardPaneContent';

class $TasksDashboardPlugin implements ApplicationContributor {
  readonly identifier = 'tasks-dashboard';
  readonly name = 'Tasks Dashboard';
  protected application: ApplicationContributionContext | null = null;
  protected overview: TasksDashboardOverview.Model | null = null;
  protected paneContent: TasksDashboardPaneContent.Model | null = null;
  protected disposeStatusProjection: (() => void) | null = null;
  protected disposeCommands: (() => void) | null = null;

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
    ]);
    const cycleSecondsSetting = context.registerSetting({
      identifier: 'tasksDashboardCycleSeconds',
      label: 'Overview cycle seconds',
      section: this.name,
      defaultValue: 10,
      spec: { kind: 'number', step: 1, minimum: 2, maximum: 120, decimals: 0 },
    });
    this.overview = this.createOverview(
      context,
      () => cycleSecondsSetting.value.value,
    );
    this.paneContent = this.createPaneContent(context);
    // The host reveals a dock-style slot on registration. The tasks pane summons itself only by
    // gesture (Ctrl+Shift+T, the activity action, the palette), so take back exactly the reveal
    // this registration itself caused — a dock that was already visible is left alone.
    const dockWasVisible = context.rightDockHost.visible.value;
    context.registerRightDockContent(this.paneContent);
    if (!dockWasVisible && context.rightDockHost.visible.value) {
      context.rightDockHost.hide();
    }
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
      isObserved: () => this.paneIsObserved(),
      requestRender: () => context.requestRender(),
      cycleSeconds,
    });
  }

  protected createPaneContent(
    context: ApplicationContributionContext,
  ): TasksDashboardPaneContent.Model {
    return new TasksDashboardPaneContent.Class(
      context,
      this.requireOverview(),
      () => this.openSelectedRecord(),
    );
  }

  /** True while the tasks pane is on screen: the right dock is visible and this pane is its
   *  active content. The overview gates every tree read on this, so a hidden pane costs zero. */
  protected paneIsObserved(): boolean {
    const application = this.application;
    if (!application) return false;
    return (
      application.rightDockHost.visible.value &&
      application.rightDockHost.activeContent?.id === 'tasks'
    );
  }

  protected requireOverview(): TasksDashboardOverview.Model {
    const overview = this.overview;
    if (!overview) {
      throw new Error('Tasks dashboard application contribution is not active');
    }
    return overview;
  }

  /** Open the selected task's own record file through the workspace's one open seam. */
  protected openSelectedRecord(): boolean {
    const application = this.application;
    if (!application) return false;
    const taskFilePath = this.requireOverview().selectedTaskFilePath();
    if (taskFilePath === null || !existsSync(taskFilePath)) return false;
    const workspace = application.workspaceSet.active;
    workspace.openFileInTab(taskFilePath);
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
    this.application = null;
  }

  protected registerCommands(context: ApplicationContributionContext): void {
    const overview = () => this.requireOverview();
    const show = (): void => {
      // The pane is about to be looked at — refresh so the first paint is current, then move the
      // keyboard WITH the gesture: pull workspace focus off the primary dock before showing.
      overview().refresh();
      context.workspaceSet.active.focusEditor();
      context.primaryDockHost.blur();
      context.rightDockHost.showContent('tasks');
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
          context.rightDockHost.blur();
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
        run: () => overview().advanceLens(-1),
      },
      {
        id: 'tasks.nextLens',
        title: 'Tasks: Next Lens',
        category: 'Tasks',
        run: () => overview().advanceLens(1),
      },
      {
        id: 'tasks.open',
        title: 'Tasks: Open Task Record',
        category: 'Tasks',
        run: () => {
          // The record lands IN the editor, so the keyboard follows it out of the dock.
          if (this.openSelectedRecord()) context.rightDockHost.blur();
        },
      },
      {
        id: 'tasks.toggleCycle',
        title: 'Tasks: Play/Pause Overview Cycle',
        category: 'Tasks',
        run: () => overview().toggleCycling(),
      },
    ]);
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const overview = this.overview;
    if (!overview) return {};
    const selectedFile = overview.selectedTaskFilePath();
    return {
      tasksLens: overview.lens.value,
      tasksRows: overview.rows.value.length,
      tasksSelected: overview.selectedIndex.value,
      tasksAvailable: overview.available.value,
      tasksCycling: overview.cycling.value,
      tasksSelectedFile: selectedFile,
    };
  }
}

export namespace TasksDashboardPlugin {
  export const $Class = $TasksDashboardPlugin;
  export let Class = $TasksDashboardPlugin;
  export type Model = InstanceType<typeof Class>;
}
