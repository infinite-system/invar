// The tasks dashboard as a dock pane content citizen: a cells citizen — the host paints
// the StyledText this returns — projecting the task system's three lenses beside the editor.
// Selection opens the task's own record file through the workspace's one open seam.
//
// invariant: The tasks dashboard is a pane content citizen (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md)
// invariant: Plugin panes use the shared pane and popup hosts (src/modules/ui/ui.invariants.md)
// invariant: Dashboard controls state their selection and next action (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: Task pane scrolling and copy use shared seams (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: One generator owns each scroll position (src/modules/ui/scroll.invariants.md)
// invariant: Copy reaches the host terminal (src/modules/system/system.invariants.md)
// invariant: Appearance comes only from theme data (src/modules/theme/theme.invariants.md)
import type { KeyEvent, StyledText } from '@opentui/core';
import { Reactive } from 'ivue';
import { computed, ref, shallowRef } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type {
  PaneContent,
  PanePointerContext,
  PaneRenderContext,
  PaneScrollPort,
  PaneTextSelectionPort,
} from '../ui/PaneContent.interface';
import { Momentum, type ScrollMomentum } from '../system/Momentum';
import { Clipboard } from '../system/Clipboard';
import { SelectionDragBehavior } from '../ui/SelectionDragBehavior';
import { TextSelectionModel } from '../ui/TextSelectionModel';
import { WrapText } from '../ui/WrapText';
import type { Palette } from '../theme/ThemePalettes';
import type { TasksDashboardOverview } from './TasksDashboardOverview';
import { TasksDashboardPaneRenderer } from './TasksDashboardPaneRenderer';
import type {
  TasksDashboardAction,
  TasksDashboardRenderContext,
  TasksDashboardTabLineTarget,
} from './TasksDashboardPaneRenderer';

class $TasksDashboardPaneContent implements PaneContent {
  constructor(
    protected readonly application: ApplicationContributionContext,
    protected readonly overview: TasksDashboardOverview.Model,
    protected readonly performAction: (
      action: TasksDashboardAction,
      rowIndex: number,
    ) => boolean,
  ) {
    this.selectionDrag = new SelectionDragBehavior.Class({
      viewportRectangle: () => ({
        leftColumn: 0,
        rightColumn: Math.max(0, this.contentWidth - 1),
        topRow: 1,
        bottomRow: Math.max(1, this.overview.viewportHeight.value),
      }),
      positionAtCell: (column, row) => this.selectionPositionAt(column, row),
      horizontalScrollPosition: () => 0,
      horizontalScrollingEnabled: () => false,
      beginSelection: (position) => {
        this.selectionOverviewVersion.value = this.overview.version.value;
        this.selection.begin(position);
        this.application.requestRender();
      },
      extendSelection: (position) => {
        this.selection.extend(position);
        this.pointerDragged = true;
        this.application.requestRender();
      },
      finishSelection: () => {
        this.selection.finish();
        this.application.requestRender();
      },
      scrollColumns: () => {},
      scrollRows: (rowDelta) => {
        this.overview.scrollBy(rowDelta);
        this.application.requestRender();
      },
      haltCompetingScroll: () => this.haltScrollMomentum(),
      lineGraphemeCount: (lineIndex) =>
        WrapText.Class.displayWidth(this.rowText(lineIndex)),
    });
  }

  protected readonly selection = new TextSelectionModel.Class();
  protected readonly selectionDrag: SelectionDragBehavior.Model;
  protected viewportScrollPort: PaneScrollPort | null = null;
  protected verticalMomentum: ScrollMomentum = Momentum.Class.AT_REST;
  protected pendingOpenRowIndex: number | null = null;
  protected pointerDragged = false;

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
    return this.application.theme.glyphVocabulary.activityTasks;
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

  get hoveredTabLineTarget() {
    return shallowRef<TasksDashboardTabLineTarget | null>(null);
  }
  get hoveredBodyRow() {
    return shallowRef<number | null>(null);
  }
  get selectionOverviewVersion() {
    return ref(-1);
  }

  protected readRenderVersion(): string {
    return [
      this.overview.version.value,
      this.overview.lens.value,
      this.overview.cycling.value,
      this.overview.available.value,
      this.overview.selectedIndex.value,
      this.hoveredBodyRow.value,
      this.hoveredTaskNumber,
      this.overview.scrollTop.value,
      this.overview.viewportHeight.value,
      this.overview.viewportWidth.value,
      this.overview.animationPaint.value,
      this.overview.gateGlance.value?.exitCode,
      this.overview.actionNotice.value?.message,
      this.hoveredTabLineTarget.value?.kind,
      this.hoveredTabLineTarget.value?.kind === 'lens'
        ? this.hoveredTabLineTarget.value.lens
        : '',
    ].join(':');
  }

  render(context: PaneRenderContext): StyledText {
    this.synchronizeSelectionWithRows();
    const innerWidth = Math.max(1, context.width);
    return TasksDashboardPaneRenderer.Class.render(
      this.renderContext(
        context.focused,
        context.palette,
        innerWidth,
        Math.max(1, context.height),
      ),
    );
  }

  protected renderContext(
    paneFocused: boolean,
    palette: Palette,
    innerWidth: number,
    height: number,
  ): TasksDashboardRenderContext {
    const baseContext: TasksDashboardRenderContext = {
      rows: this.overview.rows.value,
      lens: this.overview.lens.value,
      cycling: this.overview.cycling.value,
      available: this.overview.available.value,
      windowTop: this.overview.windowTop(),
      selectedIndex: this.overview.selectedIndex.value,
      hoveredTaskNumber: this.hoveredTaskNumber,
      paneFocused,
      palette,
      height,
      innerWidth,
      viewportWidth: Math.max(1, innerWidth - this.scrollbarThicknessCells),
      animationElapsedMilliseconds: this.overview.animationElapsedMilliseconds,
      gateGlance: this.overview.gateGlance.value,
      actionNotice: this.overview.actionNotice.value,
      taskActionIcons: this.application.theme.taskActionIcons,
      ellipsisCell: this.application.theme.ellipsisCell,
      hoveredTabLineTarget: this.hoveredTabLineTarget.value,
      selectionRanges: [],
    };
    return {
      ...baseContext,
      selectionRanges: baseContext.rows.map((row, rowIndex) =>
        this.selection.rangeForLine(
          rowIndex,
          WrapText.Class.displayWidth(
            TasksDashboardPaneRenderer.Class.textForRow(baseContext, row),
          ),
        ),
      ),
    };
  }

  protected get hoveredTaskNumber(): number | null {
    const bodyRow = this.hoveredBodyRow.value;
    if (bodyRow === null) return null;
    return (
      this.overview.rows.value[this.rowIndexAt(bodyRow)]?.taskNumber ?? null
    );
  }

  protected get contentWidth(): number {
    return this.overview.viewportWidth.value + this.scrollbarThicknessCells;
  }

  protected interactionRenderContext(
    paneFocused: boolean,
  ): TasksDashboardRenderContext {
    return this.renderContext(
      paneFocused,
      this.application.theme.palette,
      this.contentWidth,
      this.overview.viewportHeight.value + 1,
    );
  }

  protected rowText(rowIndex: number): string {
    const row = this.overview.rows.value[rowIndex];
    if (!row) return '';
    return TasksDashboardPaneRenderer.Class.textForRow(
      this.interactionRenderContext(false),
      row,
    );
  }

  protected synchronizeSelectionWithRows(): void {
    if (
      this.selection.hasSelection() &&
      this.selectionOverviewVersion.value !== this.overview.version.value
    ) {
      this.selection.clear();
      this.selectionOverviewVersion.value = -1;
    }
  }

  protected selectionPositionAt(
    column: number,
    row: number,
  ): { line: number; column: number } | null {
    if (row < 1) return null;
    const rowIndex = this.rowIndexAt(row);
    if (rowIndex < 0 || rowIndex >= this.overview.rows.value.length)
      return null;
    return {
      line: rowIndex,
      column: Math.max(
        0,
        Math.min(column, WrapText.Class.displayWidth(this.rowText(rowIndex))),
      ),
    };
  }

  handleKey(_key: KeyEvent): boolean {
    return false;
  }

  onWheel(rowDelta: number): boolean {
    Momentum.Class.queueImpulse(this.verticalMomentum, rowDelta);
    this.viewportScrollPort?.requestRender();
    return true;
  }

  /** Screen row 0 is the tab line; body rows map to window-offset lens rows. */
  protected rowIndexAt(row: number): number {
    return this.overview.windowTop() + row - 1;
  }

  onPointerMove(column: number, row: number): boolean {
    if (row === 0) {
      this.hoveredBodyRow.value = null;
      this.hoveredTabLineTarget.value =
        TasksDashboardPaneRenderer.Class.hitTestTabLine(column);
      return true;
    }
    this.hoveredTabLineTarget.value = null;
    const rowIndex = this.rowIndexAt(row);
    const rows = this.overview.rows.value;
    this.hoveredBodyRow.value =
      rowIndex >= 0 &&
      rowIndex < rows.length &&
      rows[rowIndex]?.taskNumber !== null
        ? row
        : null;
    return true;
  }

  onPointerOut(): void {
    this.hoveredBodyRow.value = null;
    this.hoveredTabLineTarget.value = null;
  }

  tooltipAt(column: number, row: number): string | null {
    if (row === 0) {
      const target = TasksDashboardPaneRenderer.Class.hitTestTabLine(column);
      return target === null
        ? null
        : TasksDashboardPaneRenderer.Class.tooltipForTabLineTarget(
            target,
            this.overview.cycling.value,
          );
    }
    if (row < 0) return null;
    const taskRow = this.overview.rows.value[this.rowIndexAt(row)];
    if (!taskRow) return null;
    const action = TasksDashboardPaneRenderer.Class.taskActionAt(
      this.interactionRenderContext(false),
      taskRow,
      column,
    );
    return action === null
      ? null
      : TasksDashboardPaneRenderer.Class.tooltipForAction(action, taskRow);
  }

  onPointerDown(column: number, row: number): boolean {
    this.onFocus();
    if (row === 0) {
      const hit = TasksDashboardPaneRenderer.Class.hitTestTabLine(column);
      if (hit === null) return false;
      this.haltScrollMomentum();
      this.selection.clear();
      if (hit.kind === 'cycle') this.overview.toggleCycling();
      else this.overview.setLens(hit.lens);
      this.application.requestRender();
      return true;
    }
    const rowIndex = this.rowIndexAt(row);
    const taskRow = this.overview.rows.value[rowIndex];
    if (!taskRow) return false;
    const action = TasksDashboardPaneRenderer.Class.taskActionAt(
      this.interactionRenderContext(true),
      taskRow,
      column,
    );
    if (action !== null) {
      const performed = this.performAction(action, rowIndex);
      if (
        performed &&
        (action === 'task' || action === 'brief' || action === 'report')
      ) {
        this.application.rightDockHost.blur();
      }
      return performed;
    }
    const selectionRowIndex = this.taskSelectionRowIndex(rowIndex);
    if (selectionRowIndex !== null)
      this.overview.setSelection(selectionRowIndex);
    this.pendingOpenRowIndex = selectionRowIndex;
    this.pointerDragged = false;
    this.selectionDrag.begin(column, row);
    return true;
  }

  onPointerDrag(
    column: number,
    row: number,
    _context?: PanePointerContext,
  ): boolean {
    if (!this.selectionDrag.active) return false;
    this.selectionDrag.drag(column, row);
    return true;
  }

  onPointerUp(
    _column: number,
    _row: number,
    _context?: PanePointerContext,
  ): boolean {
    if (!this.selectionDrag.active) return false;
    this.selectionDrag.end();
    const rowIndex = this.pendingOpenRowIndex;
    this.pendingOpenRowIndex = null;
    if (
      !this.pointerDragged &&
      rowIndex !== null &&
      this.performAction('task', rowIndex)
    ) {
      this.application.rightDockHost.blur();
    }
    this.pointerDragged = false;
    return true;
  }

  protected taskSelectionRowIndex(rowIndex: number): number | null {
    const row = this.overview.rows.value[rowIndex];
    if (row?.taskNumber === null || row?.taskNumber === undefined) return null;
    const selectionRowIndex = this.overview.rows.value.findIndex(
      (candidate) =>
        candidate.kind === 'task' && candidate.taskNumber === row.taskNumber,
    );
    return selectionRowIndex < 0 ? null : selectionRowIndex;
  }

  onResize(columns: number, rows: number): void {
    // The tab line owns one row; lens rows get the rest.
    this.overview.setViewportSize(
      columns - this.scrollbarThicknessCells,
      rows - 1,
    );
  }

  onFocus(): void {}

  onBlur(): void {}

  dispose(): void {}

  attachViewportScrollPort(scrollPort: PaneScrollPort): void {
    this.viewportScrollPort = scrollPort;
  }

  tickScroll(deltaSeconds: number): boolean {
    const options =
      this.viewportScrollPort?.momentumOptions() ??
      Momentum.Class.verticalOptions;
    const stepped = Momentum.Class.stepMomentum(
      this.verticalMomentum,
      deltaSeconds,
      options,
    );
    this.verticalMomentum = stepped.momentum;
    if (stepped.rows !== 0) this.overview.scrollBy(stepped.rows);
    return (
      Momentum.Class.isMoving(this.verticalMomentum) ||
      this.selectionDrag.tick(deltaSeconds)
    );
  }

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

  haltScrollMomentum(): void {
    this.verticalMomentum = Momentum.Class.halt();
  }

  scrollToLine(line: number): void {
    this.haltScrollMomentum();
    this.overview.scrollBy(line - this.overview.scrollTop.value);
  }

  capability<Port>(identifier: string): Port | null {
    return identifier === 'text-selection'
      ? (this as unknown as PaneTextSelectionPort as unknown as Port)
      : null;
  }

  hasSelection(): boolean {
    this.synchronizeSelectionWithRows();
    return this.selection.hasSelection();
  }

  selectionTelemetry(): { owner: string; characterLength: number } {
    return {
      owner: 'tasks-dashboard',
      characterLength: this.selectedText().length,
    };
  }

  async copySelection(): Promise<number> {
    const text = this.selectedText();
    if (text.length === 0) return 0;
    await Clipboard.Class.copy(text);
    return text.length;
  }

  protected selectedText(): string {
    this.synchronizeSelectionWithRows();
    return this.selection.selectedText((line, startCell, endCell) => {
      const text = this.rowText(line);
      if (text.length === 0 && !this.overview.rows.value[line]) return null;
      return WrapText.Class.sliceByDisplayCells(
        text,
        startCell,
        endCell ?? Number.MAX_SAFE_INTEGER,
      );
    }, '\n');
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
