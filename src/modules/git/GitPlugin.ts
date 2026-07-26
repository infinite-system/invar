import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import type { StatusSnapshot } from '../system/StatusChannel';
import type { Workspace } from '../workspace/Workspace';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
} from '../workspace/WorkspaceContributor.interface';
import type {
  StatusBarSegmentContext,
  StatusBarSegmentContribution,
} from '../ui/StatusBarSegments';
import { RelativeTime } from './RelativeTime';
import { GitPaneContent } from './GitPaneContent';
import { GitRows } from './GitRows';
import { GitWorkspace } from './GitWorkspace';
import { GitComparisonSurface } from './GitComparisonSurface';
import type { RegisteredSetting } from '../settings/SettingContribution.interface';

// invariant: Document identity survives document instance replacement (src/modules/workspace/workspace.invariants.md)
// invariant: Plugin panes use the shared pane and popup hosts (src/modules/ui/ui.invariants.md)
// invariant: Status text is assembled from ordered contributions (src/modules/ui/ui.invariants.md)
// invariant: Commit selection previews without focus transfer (src/modules/git/git.invariants.md)
class $GitPlugin
  implements
    ApplicationContributor,
    WorkspaceContributor,
    StatusBarSegmentContribution
{
  readonly identifier = 'git';
  readonly name = 'Git';
  readonly primaryDockContentIdentifiers = ['git'] as const;
  readonly workspaceContributor: WorkspaceContributor = this;
  protected readonly workspaces = new WeakMap<
    Workspace.Model,
    GitWorkspace.Model
  >();
  protected application: ApplicationContributionContext | null = null;
  protected paneContent: GitPaneContent.Model | null = null;
  protected comparisonSurface: GitComparisonSurface.Model | null = null;
  protected disposeComparisonSurface: (() => void) | null = null;
  protected disposeCommands: (() => void) | null = null;
  protected disposeStatusBar: (() => void) | null = null;
  protected disposeStatusProjection: (() => void) | null = null;
  protected splitRatioSetting: RegisteredSetting<number> | null = null;
  protected diffSplitRatioSetting: RegisteredSetting<number> | null = null;

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    const gitWorkspace = new GitWorkspace.Class(
      workspace,
      this.splitRatioSetting ?? undefined,
      this.diffSplitRatioSetting ?? undefined,
    );
    this.workspaces.set(workspace, gitWorkspace);
    return gitWorkspace;
  }

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    this.splitRatioSetting = context.registerSetting({
      identifier: 'gitSplitRatio',
      label: 'Changes/log split',
      section: this.name,
      defaultValue: 0.5,
      spec: {
        kind: 'number',
        step: 0.05,
        minimum: 0.1,
        maximum: 0.9,
        decimals: 2,
      },
    });
    this.diffSplitRatioSetting = context.registerSetting({
      identifier: 'diffSplitRatio',
      label: 'Previous/current split',
      section: this.name,
      defaultValue: 0.5,
      spec: {
        kind: 'number',
        step: 0.05,
        minimum: 0.15,
        maximum: 0.85,
        decimals: 2,
      },
    });
    context.registerKeybindings([
      {
        chord: { key: 'g', ctrl: true, shift: true },
        action: 'view.showSourceControl',
      },
      { chord: { key: 'g', ctrl: true }, action: 'git.togglePanel' },
      { chord: { key: 'up' }, action: 'git.up', context: 'git' },
      { chord: { key: 'down' }, action: 'git.down', context: 'git' },
      { chord: { key: 'pageup' }, action: 'git.pageUp', context: 'git' },
      {
        chord: { key: 'pagedown' },
        action: 'git.pageDown',
        context: 'git',
      },
      {
        chord: { key: 'return' },
        action: 'git.stageToggle',
        context: 'git',
      },
      {
        chord: { key: 'space' },
        action: 'git.stageToggle',
        context: 'git',
      },
      { chord: { key: 'o' }, action: 'git.openFile', context: 'git' },
      {
        chord: { key: 'right' },
        action: 'git.expandRight',
        context: 'git',
      },
      {
        chord: { key: 'left' },
        action: 'git.collapseLeft',
        context: 'git',
      },
      { chord: { key: 'd' }, action: 'git.discard', context: 'git' },
      {
        chord: { key: 'b' },
        action: 'git.cycleLogBranch',
        context: 'git',
      },
      { chord: { key: 'escape' }, action: 'git.leave', context: 'git' },
      { chord: { key: 'tab' }, action: 'git.leave', context: 'git' },
    ]);
    this.paneContent = new GitPaneContent.Class(
      context,
      () => this.activeWorkspace(),
      this.splitRatioSetting.value.value,
    );
    context.registerPrimaryDockContent(this.paneContent);
    // The comparison view is this plugin's own occupant of the editor column: the host mounts it
    // through the generic contract and never learns that a comparison is what it mounted.
    this.comparisonSurface = new GitComparisonSurface.Class(
      () => this.workspaces.get(context.workspaceSet.active) ?? null,
    );
    this.disposeComparisonSurface = context.editorSurfaceContents.register(
      this.comparisonSurface,
    );
    this.disposeStatusBar = context.statusBarSegments.register(this);
    this.disposeStatusProjection =
      context.statusProjectionContributions.register({
        snapshot: () => this.statusSnapshot(),
      });
    this.registerCommands(context);
  }

  disposeApplication(): void {
    this.paneContent = null;
    this.disposeCommands?.();
    this.disposeCommands = null;
    this.disposeStatusBar?.();
    this.disposeStatusBar = null;
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    this.disposeComparisonSurface?.();
    this.disposeComparisonSurface = null;
    this.comparisonSurface = null;
    this.splitRatioSetting = null;
    this.diffSplitRatioSetting = null;
    this.application = null;
  }

  controllerFor(workspace: Workspace.Model): GitWorkspace.Model {
    const controller = this.workspaces.get(workspace);
    if (!controller) {
      throw new Error('Source-control workspace contribution is not attached');
    }
    return controller;
  }

  protected activeWorkspace(): GitWorkspace.Model {
    const application = this.application;
    if (!application) {
      throw new Error('Source-control application contribution is not active');
    }
    return this.controllerFor(application.workspaceSet.active);
  }

  segments(context: StatusBarSegmentContext): readonly string[] {
    const workspace = this.controllerFor(context.workspaceSet.active);
    const segments: string[] = [];
    const blame = workspace.activeLineBlame;
    if (blame) {
      const when = blame.uncommitted
        ? 'uncommitted'
        : RelativeTime.Class.format(blame.authorTimeMs, Date.now());
      const summary =
        blame.summary.length > 40
          ? `${blame.summary.slice(0, 39)}…`
          : blame.summary;
      segments.push(
        summary
          ? `${blame.author} · ${when} · ${summary}`
          : `${blame.author} · ${when}`,
      );
    }
    if (
      context.primaryDockHost.activeContent?.id === this.paneContent?.id &&
      context.workspaceSet.active.focus.value === 'primaryPane'
    ) {
      segments.push('checkbox/Space stage · row/o open · d discard');
    }
    return segments;
  }

  protected registerCommands(context: ApplicationContributionContext): void {
    const active = () => this.activeWorkspace();
    const show = (): void => {
      if (!this.paneContent) return;
      context.primaryDockHost.showContent(this.paneContent.id);
      active().show();
    };
    const normalizeChangesIndex = (): void => {
      const workspace = active();
      const rows = workspace.currentChangeRows();
      if (rows[workspace.panel.changesIndex.value]?.kind === 'file') return;
      const firstFileIndex = GitRows.Class.nextFileRow(rows, -1, 1);
      if (firstFileIndex >= 0) {
        workspace.panel.moveChangesSelection(firstFileIndex);
      }
    };
    const moveLog = (rowDelta: number): void => {
      const workspace = active();
      workspace.haltLogScroll();
      workspace.panel.moveLogSelection(rowDelta, workspace.logFlatEnd());
      workspace.ensureLogWindow(workspace.panel.logScrollTop.value);
      workspace.previewLogRow(workspace.panel.logIndex.value);
    };
    const moveChanges = (direction: -1 | 1): void => {
      const workspace = active();
      workspace.haltChangesScroll();
      const rows = workspace.currentChangeRows();
      const nextIndex = GitRows.Class.nextFileRow(
        rows,
        workspace.panel.changesIndex.value,
        direction,
      );
      if (nextIndex >= 0) {
        workspace.panel.moveChangesSelection(nextIndex);
      } else if (direction === 1) {
        workspace.panel.region.value = 'log';
        workspace.previewLogRow(workspace.panel.logIndex.value);
      }
    };

    this.disposeCommands = context.commands.registerAll([
      {
        id: 'view.showSourceControl',
        title: 'View: Show Source Control',
        category: 'View',
        run: show,
      },
      {
        id: 'git.togglePanel',
        title: 'Source Control: Toggle',
        category: 'Source Control',
        run: show,
      },
      {
        id: 'git.up',
        title: 'Source Control: Move Up',
        category: 'Source Control',
        run: () => {
          const workspace = active();
          normalizeChangesIndex();
          if (workspace.panel.region.value === 'changes') moveChanges(-1);
          else if (workspace.panel.logIndex.value === 0) {
            workspace.panel.region.value = 'changes';
            const rows = workspace.currentChangeRows();
            const lastFileIndex = GitRows.Class.nextFileRow(
              rows,
              rows.length,
              -1,
            );
            if (lastFileIndex >= 0) {
              workspace.panel.moveChangesSelection(lastFileIndex);
            }
          } else {
            moveLog(-1);
          }
        },
      },
      {
        id: 'git.down',
        title: 'Source Control: Move Down',
        category: 'Source Control',
        run: () => {
          normalizeChangesIndex();
          if (active().panel.region.value === 'changes') moveChanges(1);
          else moveLog(1);
        },
      },
      {
        id: 'git.pageUp',
        title: 'Source Control: Page Up',
        category: 'Source Control',
        run: () => moveLog(-10),
      },
      {
        id: 'git.pageDown',
        title: 'Source Control: Page Down',
        category: 'Source Control',
        run: () => moveLog(10),
      },
      {
        id: 'git.stageToggle',
        title: 'Source Control: Stage or Activate',
        category: 'Source Control',
        run: () => {
          const workspace = active();
          if (workspace.panel.region.value === 'log') {
            workspace.activateLogRow(workspace.panel.logIndex.value);
            return;
          }
          normalizeChangesIndex();
          void workspace.toggleStageAtRow(workspace.panel.changesIndex.value);
        },
      },
      {
        id: 'git.openFile',
        title: 'Source Control: Open Change',
        category: 'Source Control',
        run: () => {
          const workspace = active();
          if (workspace.panel.region.value === 'log') {
            workspace.activateLogRow(workspace.panel.logIndex.value);
          } else {
            normalizeChangesIndex();
            void workspace.openChangeAtRow(workspace.panel.changesIndex.value);
          }
        },
      },
      {
        id: 'git.expandRight',
        title: 'Source Control: Expand',
        category: 'Source Control',
        run: () => {
          const workspace = active();
          if (workspace.panel.region.value !== 'log') return;
          const row = workspace.logRowAt(workspace.panel.logIndex.value);
          if (row?.kind !== 'commit') return;
          if (row.expanded) moveLog(1);
          else workspace.expandLogRow(workspace.panel.logIndex.value);
        },
      },
      {
        id: 'git.collapseLeft',
        title: 'Source Control: Collapse',
        category: 'Source Control',
        run: () => {
          const workspace = active();
          if (workspace.panel.region.value === 'log') {
            workspace.collapseLogRow(workspace.panel.logIndex.value);
          }
        },
      },
      {
        id: 'git.discard',
        title: 'Source Control: Discard',
        category: 'Source Control',
        run: () => {
          const workspace = active();
          normalizeChangesIndex();
          workspace.requestDiscardAtRow(workspace.panel.changesIndex.value);
        },
      },
      {
        id: 'git.leave',
        title: 'Source Control: Leave',
        category: 'Source Control',
        run: () => {
          const workspace = active();
          if (workspace.commitLog.value?.branch.value !== undefined) {
            workspace.selectLogBranch(null);
          } else {
            context.workspaceSet.active.focusEditor();
          }
        },
      },
      {
        id: 'git.cycleLogBranch',
        title: 'Source Control: Cycle History Branch',
        category: 'Source Control',
        run: () => void active().cycleLogBranch(),
      },
      // Change navigation inside an open comparison. Registered HERE, not in the core command
      // defaults: a comparison is this plugin's view, so its commands are its own.
      {
        id: 'diff.previousChange',
        title: 'Diff: Previous Change',
        category: 'Diff',
        when: () => this.comparisonSurface?.comparisonView !== null,
        run: () =>
          this.comparisonSurface?.comparisonView?.jumpToPreviousChange(),
      },
      {
        id: 'diff.nextChange',
        title: 'Diff: Next Change',
        category: 'Diff',
        when: () => this.comparisonSurface?.comparisonView !== null,
        run: () => this.comparisonSurface?.comparisonView?.jumpToNextChange(),
      },
    ]);
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const application = this.application;
    if (!application) return {};
    const workspace = this.activeWorkspace();
    const repository = workspace.repository.value;
    const comparisonView = this.comparisonSurface?.comparisonView ?? null;
    return {
      // The transient-comparison projection the driven smokes read. It lives here because the
      // comparison is this plugin's view; the app core contributes only the generic
      // `editorSurfaceIdentifier`.
      showingDiff: workspace.showingComparison.value,
      diffScrollTop: comparisonView?.alignedRowScrollOffset.value ?? 0,
      diffSelectionChars: comparisonView?.selectionCharacterCount() ?? 0,
      diffSelection: comparisonView?.selectionRange() ?? null,
      diffSplitRatio: workspace.diffSplitRatioSetting.value.value,
      liveGitWatcherCount: application.workspaceSet.entries.value.filter(
        (entry) => this.controllerFor(entry).hasLiveWatcher,
      ).length,
      workspaceLiveGitWatchers: application.workspaceSet.entries.value.map(
        (entry) => this.controllerFor(entry).hasLiveWatcher,
      ),
      gitWatcherActivationIgnoreQuerySubprocessCount:
        workspace.activationIgnoreQuerySubprocessCount,
      gitWatcherActivationWatchedDirectoryCount:
        workspace.activationWatchedDirectoryCount,
      gitWatcherActivationCompleted: workspace.activationCompleted,
      changesScrollTop: workspace.panel.changesScrollTop.value,
      changesScrollLeft: workspace.panel.changesScrollLeft.value,
      gitChangesIndex: workspace.panel.changesIndex.value,
      gitLogScrollTop: workspace.panel.logScrollTop.value,
      gitLogScrollLeft: workspace.panel.logScrollLeft.value,
      gitLogIndex: workspace.panel.logIndex.value,
      gitLogLoaded: workspace.commitLog.value?.loadedCount ?? 0,
      gitLogExpanded:
        workspace.commitExpansion.value?.entries.value.length ?? 0,
      gitLogBranch: workspace.commitLog.value?.branch.value ?? '',
      gitLogTipSha: workspace.commitLog.value?.loadedTipSha ?? '',
      gitRegion: workspace.panel.region.value,
      gitSelectedPaths: [...workspace.panel.selectedPaths.value],
      gitSplitRatio: workspace.splitRatio,
      gitChangedCount: repository
        ? repository.staged.value.length +
          repository.unstaged.value.length +
          repository.untracked.value.length
        : 0,
      currentLineBlameAuthor: workspace.activeLineBlame?.author ?? '',
    };
  }
}

export namespace GitPlugin {
  export const $Class = $GitPlugin;
  export let Class = $GitPlugin;
  export type Model = InstanceType<typeof Class>;
}
