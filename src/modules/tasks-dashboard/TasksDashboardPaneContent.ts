// The tasks dashboard as a dock pane content citizen: a cells citizen — the host paints
// the StyledText this returns — projecting the task system's three lenses beside the editor.
// Selection opens the task's own record file through the workspace's one open seam.
//
// invariant: The tasks dashboard is a pane content citizen (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md)
// invariant: Plugin panes use the shared pane and popup hosts (src/modules/ui/ui.invariants.md)
import type { KeyEvent, StyledText } from '@opentui/core';
import { Reactive } from 'ivue';
import { computed } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type {
  PaneContent,
  PaneRenderContext,
} from '../ui/PaneContent.interface';
import type { TasksDashboardOverview } from './TasksDashboardOverview';
import { TasksDashboardPaneRenderer } from './TasksDashboardPaneRenderer';

class $TasksDashboardPaneContent implements PaneContent {
  constructor(
    protected readonly application: ApplicationContributionContext,
    protected readonly overview: TasksDashboardOverview.Model,
    protected readonly openSelected: () => boolean,
  ) {}

  get id(): string {
    return 'tasks';
  }

  get title(): string {
    return 'Tasks';
  }

  get activityLabel(): string {
    return 'Tasks';
  }

  get icon(): string {
    return this.application.theme.glyphLevel.value === 'ascii' ? '#' : '⛭';
  }

  get activityAction(): string {
    return 'view.showTasks';
  }

  get activityBadge(): number {
    return 0;
  }

  get keybindingContext(): string {
    return 'tasksDashboard';
  }

  get renderRevision() {
    return computed(() => this.readRenderVersion());
  }

  protected readRenderVersion(): string {
    return [
      this.overview.version.value,
      this.overview.lens.value,
      this.overview.cycling.value,
      this.overview.available.value,
      this.overview.selectedIndex.value,
      this.overview.hoveredIndex.value,
      this.overview.scrollTop.value,
      this.overview.viewportHeight.value,
      this.overview.viewportWidth.value,
    ].join(':');
  }

  render(context: PaneRenderContext): StyledText {
    const innerWidth = Math.max(1, context.width);
    return TasksDashboardPaneRenderer.Class.render({
      rows: this.overview.rows.value,
      lens: this.overview.lens.value,
      cycling: this.overview.cycling.value,
      available: this.overview.available.value,
      windowTop: this.overview.windowTop(),
      selectedIndex: this.overview.selectedIndex.value,
      hoveredIndex: this.overview.hoveredIndex.value,
      paneFocused: context.focused,
      palette: context.palette,
      height: Math.max(1, context.height),
      innerWidth,
      viewportWidth: Math.max(1, innerWidth - this.scrollbarThicknessCells),
    });
  }

  handleKey(_key: KeyEvent): boolean {
    return false;
  }

  onWheel(rowDelta: number): boolean {
    this.overview.scrollBy(rowDelta);
    this.application.requestRender();
    return true;
  }

  /** Screen row 0 is the tab line; body rows map to window-offset lens rows. */
  protected rowIndexAt(row: number): number {
    return this.overview.windowTop() + row - 1;
  }

  onPointerMove(_column: number, row: number): boolean {
    if (row === 0) {
      this.overview.hoveredIndex.value = -1;
      return true;
    }
    const rowIndex = this.rowIndexAt(row);
    const rows = this.overview.rows.value;
    this.overview.hoveredIndex.value =
      rowIndex >= 0 && rowIndex < rows.length && rows[rowIndex]?.kind === 'task'
        ? rowIndex
        : -1;
    return true;
  }

  onPointerOut(): void {
    this.overview.hoveredIndex.value = -1;
  }

  onPointerDown(column: number, row: number): boolean {
    this.onFocus();
    if (row === 0) {
      const hit = TasksDashboardPaneRenderer.Class.hitTestTabLine(column);
      if (hit === null) return false;
      if (hit.kind === 'cycle') this.overview.toggleCycling();
      else this.overview.setLens(hit.lens);
      this.application.requestRender();
      return true;
    }
    const rowIndex = this.rowIndexAt(row);
    if (!this.overview.setSelection(rowIndex)) return false;
    // The record lands IN the editor, so the keyboard follows it out of the dock.
    if (this.openSelected()) this.application.rightDockHost.blur();
    this.application.requestRender();
    return true;
  }

  onResize(columns: number, rows: number): void {
    // The tab line owns one row; lens rows get the rest.
    const viewportHeight = Math.max(1, rows - 1);
    const viewportWidth = Math.max(1, columns - this.scrollbarThicknessCells);
    if (this.overview.viewportHeight.value !== viewportHeight) {
      this.overview.viewportHeight.value = viewportHeight;
    }
    if (this.overview.viewportWidth.value !== viewportWidth) {
      this.overview.viewportWidth.value = viewportWidth;
    }
  }

  onFocus(): void {}

  onBlur(): void {}

  dispose(): void {}

  get scrollTop(): number {
    return this.overview.windowTop();
  }

  get scrollContentRows(): number {
    return this.overview.rows.value.length;
  }

  get scrollViewportRows(): number {
    return this.overview.viewportHeight.value;
  }

  /** The scrollbar tracks the lens rows below the tab line. */
  get scrollbarRowOffset(): number {
    return 1;
  }

  haltScrollMomentum(): void {}

  scrollToLine(line: number): void {
    this.overview.scrollBy(line - this.overview.scrollTop.value);
  }

  protected get scrollbarThicknessCells(): number {
    return Math.max(
      1,
      Math.round(this.application.settings.scrollbarThickness.value),
    );
  }
}

export namespace TasksDashboardPaneContent {
  export const $Class = $TasksDashboardPaneContent;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
