import type { KeyEvent, StyledText } from '@opentui/core';
import { Reactive } from 'ivue';
import { computed } from 'vue';
import type { BoundedListPopupItem } from '../ui/BoundedListPopup';
import type { ContextMenuItem } from '../ui/ContextMenu';
import type {
  PaneContent,
  PaneContentSplitter,
  PanePointerContext,
  PaneRenderContext,
  PaneWheelContext,
} from '../ui/PaneContent.interface';
import { DoubleClickGesture } from '../ui/DoubleClickGesture';
import { SplitterElement } from '../ui/SplitterElement';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type { FileRow } from './GitRows';
import { GitPaneRenderer, type GitPanelGeometry } from './GitPaneRenderer';
import type { GitWorkspace } from './GitWorkspace';

// invariant: Plugin panes use the shared pane and popup hosts (src/modules/ui/ui.invariants.md)
// invariant: Commit selection previews without focus transfer (src/modules/git/git.invariants.md)
// invariant: Commit expansion is lazy and windowed (src/modules/git/git.invariants.md)
class $GitPaneContent implements PaneContent {
  constructor(
    protected readonly application: ApplicationContributionContext,
    protected readonly activeWorkspace: () => GitWorkspace.Model,
    initialSplitRatio = 0.5,
  ) {
    this.splitter = new SplitterElement.Class({
      renderer: application.renderer,
      identifier: 'git-split-divider',
      orientation: 'horizontal',
      reportUnit: 'ratio',
      initialSize: initialSplitRatio,
      minimumSize: 0.15,
      maximumSize: 0.85,
      currentSize: () => activeWorkspace().splitRatio,
      currentExtentCells: () => this.viewportRows,
      onSizeChange: (ratio) => activeWorkspace().setSplit(ratio),
      onDragStart: () => this.onFocus(),
      onDragEnd: () => activeWorkspace().persistSplit(),
    });
    this.splitter.renderable.position = 'absolute';
    this.splitter.renderable.visible = false;
  }

  protected geometry: GitPanelGeometry = {
    changesTop: 0,
    changesRows: 0,
    dividerRow: 0,
    logHeaderRow: -1,
    logTop: 0,
    logRows: 0,
  };
  protected viewportColumns = 1;
  protected viewportRows = 1;
  protected readonly splitter: SplitterElement.Model;
  /** The log pane's share of the one double-click clock (the same generator the Markdown preview
   *  uses to open a link). */
  protected readonly logRowDoubleClick = new DoubleClickGesture.Class();

  get id(): string {
    return 'git';
  }

  get title(): string {
    return 'Git';
  }

  get activityLabel(): string {
    return 'Source Control';
  }

  get icon(): string {
    return this.application.theme.glyph('activitySourceControl');
  }

  get activityAction(): string {
    return 'view.showSourceControl';
  }

  get activityBadge(): number {
    return this.activeWorkspace()
      .currentChangeRows()
      .filter((row) => row.kind === 'file').length;
  }

  get keybindingContext(): string {
    return 'git';
  }

  get renderRevision() {
    return computed(() => this.readRenderVersion());
  }

  protected readRenderVersion(): number {
    void this.application.workspaceSet.activeWorkspaceIndex.value;
    return this.activeWorkspace().renderVersion;
  }

  render(context: PaneRenderContext): StyledText {
    const workspace = this.activeWorkspace();
    const scrollbarThickness = Math.max(
      1,
      Math.round(this.application.settings.scrollbarThickness.value),
    );
    const viewportWidth = Math.max(1, context.width - scrollbarThickness);
    workspace.panel.setChangesHorizontalExtent(
      GitPaneRenderer.Class.changesContentWidth(
        workspace.currentChangeRows(),
        this.application.theme.checkboxIcons,
      ),
      viewportWidth,
    );
    workspace.panel.setLogHorizontalExtent(
      GitPaneRenderer.Class.logContentWidth(workspace),
      viewportWidth,
    );
    const result = GitPaneRenderer.Class.render({
      workspace,
      palette: context.palette,
      innerWidth: Math.max(1, context.width),
      bodyHeight: Math.max(1, context.height),
      scrollbarThickness,
      gitActionAreaWidth: 8,
      actionIcons: this.application.theme.actionIcons,
      checkboxIcons: this.application.theme.checkboxIcons,
    });
    this.geometry = result.geometry;
    return result.text;
  }

  handleKey(key: KeyEvent): boolean {
    const workspace = this.activeWorkspace();
    if (!workspace.panel.confirmDiscard.value) return false;
    if (key.name === 'y') void workspace.confirmDiscard();
    else workspace.cancelDiscard();
    return true;
  }

  onWheel(rowDelta: number, context?: PaneWheelContext): boolean {
    const workspace = this.activeWorkspace();
    if ((context?.row ?? 0) < this.geometry.dividerRow) {
      workspace.impulseChanges(rowDelta);
    } else {
      workspace.impulseLog(rowDelta);
    }
    return true;
  }

  onHorizontalWheel(columnDelta: number, context?: PaneWheelContext): boolean {
    const workspace = this.activeWorkspace();
    if ((context?.row ?? 0) < this.geometry.dividerRow) {
      workspace.impulseChangesHorizontal(columnDelta);
    } else {
      workspace.impulseLogHorizontal(columnDelta);
    }
    return true;
  }

  tickScroll(deltaSeconds: number): boolean {
    return this.activeWorkspace().tickScroll(deltaSeconds);
  }

  onPointerMove(_column: number, row: number): boolean {
    const workspace = this.activeWorkspace();
    const hit = this.rowAt(row);
    const rows = workspace.currentChangeRows();
    workspace.panel.changesHovered.value =
      hit?.region === 'changes' && rows[hit.index]?.kind === 'file'
        ? hit.index
        : -1;
    workspace.panel.logHovered.value = hit?.region === 'log' ? hit.index : -1;
    return true;
  }

  onPointerOut(): void {
    const panel = this.activeWorkspace().panel;
    panel.changesHovered.value = -1;
    panel.logHovered.value = -1;
  }

  onPointerDown(
    column: number,
    row: number,
    context?: PanePointerContext,
  ): boolean {
    const workspace = this.activeWorkspace();
    this.onFocus();
    const hit = this.rowAt(row);
    if (!hit) return false;
    if (hit.region === 'logHeader') {
      this.openLogBranchMenu(
        context?.screenColumn ?? column,
        context?.screenRow ?? row,
      );
      return true;
    }
    if (hit.region === 'log') {
      const isDoubleClick =
        this.logRowDoubleClick.recordPressAndDetectDoubleClick(
          `log-row:${hit.index}`,
        );
      workspace.panel.region.value = 'log';
      workspace.panel.setLogSelection(hit.index);
      if (isDoubleClick) workspace.activateLogRow(hit.index);
      else if (workspace.logRowAt(hit.index)?.kind === 'commit') {
        workspace.toggleLogRow(hit.index);
      } else {
        workspace.previewLogRow(hit.index);
      }
      return true;
    }
    const changeRow = workspace.currentChangeRows()[hit.index];
    if (changeRow?.kind !== 'file') return false;
    workspace.haltChangesScroll();
    workspace.panel.region.value = 'changes';
    if (context?.button === 2) {
      this.openChangesContextMenu(
        hit.index,
        changeRow,
        context.screenColumn,
        context.screenRow,
      );
      return true;
    }
    if (context?.modifiers.ctrl) {
      workspace.panel.toggleSelected(changeRow.path);
      return true;
    }
    workspace.panel.setChangesSelection(hit.index);
    const action = this.actionAtColumn(column);
    if (column === 1 || action === 'stage') {
      void workspace.toggleStageAtRow(hit.index);
    } else if (action === 'discard') {
      workspace.requestDiscardAtRow(hit.index);
    } else {
      void workspace.openChangeAtRow(hit.index);
    }
    return true;
  }

  onResize(columns: number, rows: number): void {
    this.viewportColumns = Math.max(1, columns);
    this.viewportRows = Math.max(1, rows);
    const workspace = this.activeWorkspace();
    const scrollbarThickness = Math.max(
      1,
      Math.round(this.application.settings.scrollbarThickness.value),
    );
    const viewportWidth = Math.max(
      1,
      this.viewportColumns - scrollbarThickness,
    );
    const changeRows = workspace.currentChangeRows();
    workspace.panel.setChangesHorizontalExtent(
      GitPaneRenderer.Class.changesContentWidth(
        changeRows,
        this.application.theme.checkboxIcons,
      ),
      viewportWidth,
    );
    workspace.panel.setLogHorizontalExtent(
      GitPaneRenderer.Class.logContentWidth(workspace),
      viewportWidth,
    );
    const changesRegionHeight = Math.max(
      1,
      Math.max(2, Math.floor(this.viewportRows * workspace.splitRatio)) - 1,
    );
    const logRegionHeight = Math.max(
      1,
      this.viewportRows -
        changesRegionHeight -
        2 -
        (workspace.commitLog.value ? 1 : 0),
    );
    workspace.panel.setVerticalViewportHeights(
      changesRegionHeight,
      logRegionHeight,
    );
  }

  splitters(): readonly PaneContentSplitter[] {
    return [
      {
        id: 'git',
        element: this.splitter,
        geometry: () => ({
          left: 0,
          top: Math.max(1, this.geometry.dividerRow),
          length: this.viewportColumns,
          visible: this.geometry.dividerRow > 0,
        }),
      },
    ];
  }

  onFocus(): void {
    this.application.primaryDockHost.focus();
    this.application.workspaceSet.active.focusPrimaryPane(this.id);
    this.activeWorkspace().show();
  }

  onBlur(): void {}

  dispose(): void {}

  protected rowAt(row: number): {
    region: 'changes' | 'log' | 'logHeader';
    index: number;
  } | null {
    if (row >= 1 && row < this.geometry.dividerRow) {
      return {
        region: 'changes',
        index: this.geometry.changesTop + row - 1,
      };
    }
    if (this.geometry.logHeaderRow >= 0) {
      if (row === this.geometry.logHeaderRow) {
        return { region: 'logHeader', index: 0 };
      }
      if (row > this.geometry.logHeaderRow) {
        return {
          region: 'log',
          index: Math.max(
            0,
            this.geometry.logTop + row - this.geometry.logHeaderRow - 1,
          ),
        };
      }
    }
    if (row > this.geometry.dividerRow) {
      return {
        region: 'log',
        index: Math.max(
          0,
          this.geometry.logTop + row - this.geometry.dividerRow - 2,
        ),
      };
    }
    return null;
  }

  protected actionAtColumn(
    column: number,
  ): 'open' | 'discard' | 'stage' | null {
    const innerWidth = Math.max(
      1,
      this.application.settings.sidebarWidth.value - 2,
    );
    const actionAreaStart = Math.max(
      1,
      innerWidth -
        Math.max(
          1,
          Math.round(this.application.settings.scrollbarThickness.value),
        ) -
        8,
    );
    if (column >= actionAreaStart && column < actionAreaStart + 2) {
      return 'open';
    }
    if (column >= actionAreaStart + 2 && column < actionAreaStart + 5) {
      return 'discard';
    }
    if (column >= actionAreaStart + 5 && column < actionAreaStart + 8) {
      return 'stage';
    }
    return null;
  }

  protected openLogBranchMenu(column: number, row: number): void {
    const workspace = this.activeWorkspace();
    void workspace.localLogBranches().then((branchNames) => {
      if (branchNames.length === 0) return;
      const checkedOutBranch = workspace.repository.value?.branch.value ?? '';
      const viewedBranch =
        workspace.commitLog.value?.branch.value ?? checkedOutBranch;
      const items: BoundedListPopupItem[] = branchNames.map((branchName) => ({
        identifier: branchName,
        label: `${branchName}${
          branchName === checkedOutBranch ? ' (checked out)' : ''
        }`,
        selected: branchName === viewedBranch,
      }));
      this.application.overlayCoordinator.openExclusiveOverlay(
        'boundedListPopup',
        () =>
          this.application.boundedListPopup.openAt(
            items,
            { column, row },
            (item) => workspace.selectLogBranch(item.identifier),
            {
              title: 'View Branch History',
              selectedItemIdentifier: viewedBranch,
              minimumWidth: 30,
            },
          ),
      );
    });
  }

  openChangesContextMenu(
    rowIndex: number,
    row: FileRow,
    column: number,
    screenRow: number,
  ): void {
    const workspace = this.activeWorkspace();
    if (!workspace.panel.selectedPaths.value.has(row.path)) {
      workspace.panel.replaceSelected([row.path]);
    }
    workspace.panel.setChangesSelection(rowIndex);
    const selectedRows = workspace
      .currentChangeRows()
      .filter(
        (candidate): candidate is FileRow =>
          candidate.kind === 'file' &&
          workspace.panel.selectedPaths.value.has(candidate.path),
      );
    const stageableCount = selectedRows.filter(
      (candidate) => candidate.bucket !== 'staged',
    ).length;
    const unstageableCount = selectedRows.filter(
      (candidate) => candidate.bucket === 'staged',
    ).length;
    const items: ContextMenuItem[] = [
      {
        id: 'git.stageSelected',
        label: `Stage (${stageableCount})`,
        enabled: stageableCount > 0,
      },
      {
        id: 'git.unstageSelected',
        label: `Unstage (${unstageableCount})`,
        enabled: unstageableCount > 0,
      },
      {
        id: 'git.discardSelected',
        label: `Discard… (${selectedRows.length})`,
        enabled: selectedRows.length > 0,
      },
      {
        id: 'git.openDiff',
        label: 'Open diff',
        enabled: selectedRows.length > 0,
      },
    ];
    this.application.overlayCoordinator.openExclusiveOverlay(
      'contextMenu',
      () =>
        this.application.contextMenu.openAt(
          items,
          column,
          screenRow,
          {
            width: this.application.renderer.width,
            height: this.application.renderer.height,
          },
          (identifier) => {
            if (identifier === 'git.stageSelected') {
              void workspace.stageSelected();
            } else if (identifier === 'git.unstageSelected') {
              void workspace.unstageSelected();
            } else if (identifier === 'git.discardSelected') {
              workspace.requestDiscardSelected();
            } else {
              void workspace.openChangeAtRow(rowIndex);
            }
          },
        ),
    );
  }
}

export namespace GitPaneContent {
  export const $Class = $GitPaneContent;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
