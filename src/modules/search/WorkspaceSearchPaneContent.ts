import type { KeyEvent, StyledText } from '@opentui/core';
import { Reactive } from 'ivue';
import { computed, ref, shallowRef } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import { Clipboard } from '../system/Clipboard';
import { Momentum, type ScrollMomentum } from '../system/Momentum';
import { TextCoordinates } from '../text/TextCoordinates';
import type { TextInputAction, TextInputModel } from '../text/TextInputModel';
import { TextInputKey } from '../text/TextInputKey';
import type { Palette } from '../theme/ThemePalettes';
import type {
  PaneContent,
  PanePointerContext,
  PaneRenderContext,
  PaneScrollPort,
  PaneTextInputPort,
  PaneTextSelectionPort,
} from '../ui/PaneContent.interface';
import { SelectionDragBehavior } from '../ui/SelectionDragBehavior';
import { TextSelectionModel } from '../ui/TextSelectionModel';
import { WrapText } from '../ui/WrapText';
import type { Workspace } from '../workspace/Workspace';
import type { TextPatchDirection } from '../workspace/TextPatch';
import type { WorkspaceSearchResult } from './WorkspaceSearchBackend';
import type { WorkspaceReplacementLocation } from './WorkspaceReplacementHistory';
import {
  WorkspaceSearchPaneRenderer,
  type WorkspaceSearchButtonAction,
  type WorkspaceSearchButtonZone,
  type WorkspaceSearchField,
  type WorkspaceSearchFieldZone,
  type WorkspaceSearchFocus,
  type WorkspaceSearchPaneRenderContext,
  type WorkspaceSearchPaneRenderResult,
} from './WorkspaceSearchPaneRenderer';
import {
  WorkspaceSearchResultTree,
  type WorkspaceSearchTreeRow,
} from './WorkspaceSearchResultTree';
import type { WorkspacePreparedReplacement } from './WorkspaceSearchWorkspace';
import { SearchCountText } from './SearchCountText';

// invariant: Plugin panes use the shared pane and popup hosts (src/modules/ui/ui.invariants.md)
// invariant: Editable text fields share one input model (project.invariants.md)
// invariant: One generator owns each scroll position (src/modules/ui/scroll.invariants.md)
// invariant: Copy reaches the host terminal (src/modules/system/system.invariants.md)
class $WorkspaceSearchPaneContent implements PaneContent {
  constructor(
    protected readonly application: ApplicationContributionContext,
    protected readonly activeWorkspace: () => Workspace.Model,
  ) {
    this.selectionDrag = new SelectionDragBehavior.Class({
      viewportRectangle: () => ({
        leftColumn: 0,
        rightColumn: Math.max(0, this.contentWidth - 1),
        topRow: this.resultStartRow,
        bottomRow: Math.max(
          this.resultStartRow,
          this.resultStartRow + this.search.resultTree.viewportHeight.value - 1,
        ),
      }),
      positionAtCell: (column, row) => this.selectionPositionAt(column, row),
      horizontalScrollPosition: () => 0,
      horizontalScrollingEnabled: () => false,
      beginSelection: (position) => {
        this.selectionGeneration.value = this.search.queryGeneration.value;
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
        this.search.resultTree.scrollBy(rowDelta);
        this.application.requestRender();
      },
      haltCompetingScroll: () => this.haltScrollMomentum(),
      lineGraphemeCount: (lineIndex) =>
        TextCoordinates.Class.lineWidth(this.rowText(lineIndex)),
    });
  }

  protected readonly selection = new TextSelectionModel.Class();
  protected readonly selectionDrag: SelectionDragBehavior.Model;
  protected viewportScrollPort: PaneScrollPort | null = null;
  protected verticalMomentum: ScrollMomentum = Momentum.Class.AT_REST;
  protected projection: WorkspaceSearchPaneRenderResult | null = null;
  protected pendingActivationRow: WorkspaceSearchTreeRow | null = null;
  protected fieldDrag: WorkspaceSearchField | null = null;
  protected pointerDragged = false;

  get activeFocus() {
    return ref<WorkspaceSearchFocus>('query');
  }

  get hoveredField() {
    return shallowRef<WorkspaceSearchField | null>(null);
  }

  get hoveredButton() {
    return shallowRef<WorkspaceSearchButtonAction | null>(null);
  }

  get pressedButton() {
    return shallowRef<WorkspaceSearchButtonAction | null>(null);
  }

  get selectionGeneration() {
    return ref(-1);
  }

  get id(): string {
    return 'search';
  }

  get title(): string {
    return 'Search';
  }

  get activityLabel(): string {
    return 'Search';
  }

  get icon(): string {
    return this.application.theme.glyphVocabulary.activitySearch;
  }

  get activityAction(): string {
    return 'view.showSearch';
  }

  get activityBadge(): number {
    return this.search.resultCount;
  }

  get resultSummary(): string {
    if (this.search.flowState.value === 'searching') return 'Searching…';
    if (this.search.flowState.value === 'queued') return 'Search queued…';
    return SearchCountText.Class.resultSummary(
      this.search.resultCount,
      this.search.fileCount.value,
    );
  }

  get keybindingContext(): string {
    return 'workspaceSearch';
  }

  get renderRevision() {
    return computed(() => this.readRenderVersion());
  }

  protected get workspace(): Workspace.Model {
    return this.activeWorkspace();
  }

  protected get search() {
    return this.workspace.workspaceSearch;
  }

  protected get resultStartRow(): number {
    return WorkspaceSearchPaneRenderer.Class.RESULT_START_ROW;
  }

  protected readRenderVersion(): string {
    void this.application.workspaceSet.activeWorkspaceIndex.value;
    const search = this.search;
    return [
      search.queryInput.value,
      search.queryInput.caret.value,
      search.queryInput.selectionAnchor.value,
      search.replacementInput.value,
      search.replacementInput.caret.value,
      search.replacementInput.selectionAnchor.value,
      search.includeInput.value,
      search.includeInput.caret.value,
      search.includeInput.selectionAnchor.value,
      search.excludeInput.value,
      search.excludeInput.caret.value,
      search.excludeInput.selectionAnchor.value,
      search.caseSensitive.value,
      search.wholeWord.value,
      search.useRegex.value,
      search.useIgnoreFiles.value,
      search.flowState.value,
      search.queryGeneration.value,
      search.resultCount,
      search.fileCount.value,
      search.resultTree.version.value,
      search.resultTree.selectedIndex.value,
      search.resultTree.hoveredIndex.value,
      search.resultTree.scrollTop.value,
      this.activeFocus.value,
      this.hoveredField.value,
      this.hoveredButton.value,
      this.pressedButton.value,
    ].join(':');
  }

  render(context: PaneRenderContext): StyledText {
    this.synchronizeSelection();
    const renderContext = this.renderContext(
      context.focused,
      context.palette,
      Math.max(1, context.width),
      Math.max(1, context.height),
    );
    this.projection = WorkspaceSearchPaneRenderer.Class.render(renderContext);
    return this.projection.text;
  }

  caret(): { column: number; row: number } | null {
    return this.projection?.caret ?? null;
  }

  protected renderContext(
    paneFocused: boolean,
    palette: Palette,
    width: number,
    height: number,
  ): WorkspaceSearchPaneRenderContext {
    const rows = this.search.resultTree.rows;
    const baseContext: WorkspaceSearchPaneRenderContext = {
      workspace: this.search,
      resultSummary: this.resultSummary,
      palette,
      width,
      height,
      focused: paneFocused,
      activeFocus: this.activeFocus.value,
      hoveredField: this.hoveredField.value,
      hoveredButton: this.hoveredButton.value,
      pressedButton: this.pressedButton.value,
      foldOpenGlyph: this.application.theme.glyphVocabulary.foldOpen,
      foldClosedGlyph: this.application.theme.glyphVocabulary.foldClosed,
      closeGlyph: this.application.theme.glyphVocabulary.panelClose,
      replaceGlyph: this.application.theme.findIcons.replace,
      ellipsisCell: this.application.theme.ellipsisCell,
      selectionRanges: [],
    };
    return {
      ...baseContext,
      selectionRanges: rows.map((row, rowIndex) =>
        this.selection.rangeForLine(
          rowIndex,
          TextCoordinates.Class.lineWidth(
            WorkspaceSearchPaneRenderer.Class.textForRow(
              row,
              baseContext,
              this.search.resultTree.rowIsDismissed(row),
            ),
          ),
        ),
      ),
    };
  }

  capability<Port>(identifier: string): Port | null {
    if (identifier === 'text-input') {
      return this as unknown as PaneTextInputPort as Port;
    }
    if (identifier === 'text-selection') {
      return this as unknown as PaneTextSelectionPort as Port;
    }
    return null;
  }

  applyInputAction(action: TextInputAction): void {
    const input = this.focusedInput();
    if (!input || !input.apply(action)) return;
    this.search.queueSearch();
    this.application.requestRender();
  }

  copyInputSelection(): Promise<number> {
    return this.activeFocus.value === 'results'
      ? this.copySelection()
      : (this.focusedInput()?.copySelection() ?? Promise.resolve(0));
  }

  handleKey(key: KeyEvent): boolean {
    if (!TextInputKey.Class.isTypedCharacter(key)) return false;
    const input = this.focusedInput();
    if (!input) return false;
    if (input.insert(key.sequence)) this.search.queueSearch();
    this.application.requestRender();
    return true;
  }

  handlePaste(text: string): boolean {
    const input = this.focusedInput();
    if (!input) return false;
    if (input.insert(text)) this.search.queueSearch();
    this.application.requestRender();
    return true;
  }

  focusNext(delta: number): void {
    const order: readonly WorkspaceSearchFocus[] = [
      'query',
      'replacement',
      'include',
      'exclude',
      'results',
    ];
    const currentIndex = Math.max(0, order.indexOf(this.activeFocus.value));
    this.activeFocus.value =
      order[(currentIndex + delta + order.length) % order.length] ?? 'query';
    if (
      this.activeFocus.value === 'results' &&
      this.search.resultTree.selectedIndex.value < 0
    ) {
      this.search.resultTree.setSelection(0);
    }
    this.application.requestRender();
  }

  focusField(field: WorkspaceSearchField): void {
    this.activeFocus.value = field;
    this.onFocus();
    this.application.requestRender();
  }

  focusResults(): void {
    this.activeFocus.value = 'results';
    if (this.search.resultTree.selectedIndex.value < 0) {
      this.search.resultTree.setSelection(0);
    }
    this.onFocus();
  }

  searchNow(): void {
    void this.search.search().finally(() => this.application.requestRender());
  }

  submit(): void {
    if (this.activeFocus.value === 'results') this.activateSelectedResult();
    else this.searchNow();
  }

  toggleCase(): void {
    this.search.caseSensitive.value = !this.search.caseSensitive.value;
    this.search.queueSearch();
  }

  toggleWholeWord(): void {
    this.search.wholeWord.value = !this.search.wholeWord.value;
    this.search.queueSearch();
  }

  toggleRegex(): void {
    this.search.useRegex.value = !this.search.useRegex.value;
    this.search.queueSearch();
  }

  toggleIgnoreFiles(): void {
    this.search.useIgnoreFiles.value = !this.search.useIgnoreFiles.value;
    this.search.queueSearch();
  }

  dismissSelectedMatch(): void {
    const row = this.search.resultTree.selectedRow();
    if (row?.kind !== 'match' || !row.result) return;
    this.search.resultTree.dismiss(row.result);
    this.application.requestRender();
  }

  requestReplaceSelectedMatch(): void {
    const row = this.search.resultTree.selectedRow();
    if (row?.kind !== 'match' || !row.result) return;
    this.requestReplaceMatch(row.result);
  }

  requestReplaceAll(): void {
    const prepared = this.search.prepareReplace();
    if (prepared.tooLarge) {
      this.showTooLargeAlert(prepared);
      return;
    }
    this.showPreparedDialog(prepared);
  }

  requestUndo(workspace: Workspace.Model = this.workspace): void {
    workspace.workspaceUndoCoordinator.requestLatest(
      'undo',
      workspace.workspaceSearch.providerIdentifier,
    );
  }

  showUndoRequest(
    workspace: Workspace.Model,
    transactionIdentifier: string,
  ): void {
    const prepared = workspace.workspaceSearch.prepareUndo(
      transactionIdentifier,
    );
    if (prepared) this.showPreparedDialog(prepared, workspace);
  }

  requestRedo(workspace: Workspace.Model = this.workspace): void {
    workspace.workspaceUndoCoordinator.requestLatest(
      'redo',
      workspace.workspaceSearch.providerIdentifier,
    );
  }

  showRedoRequest(
    workspace: Workspace.Model,
    transactionIdentifier: string,
  ): void {
    const prepared = workspace.workspaceSearch.prepareRedo(
      transactionIdentifier,
    );
    if (prepared) this.showPreparedDialog(prepared, workspace);
  }

  moveResultSelection(delta: number): void {
    this.haltScrollMomentum();
    this.focusResults();
    this.search.resultTree.moveSelection(delta);
  }

  scrollResultsBy(delta: number): void {
    this.haltScrollMomentum();
    this.focusResults();
    this.search.resultTree.scrollBy(delta);
    this.application.requestRender();
  }

  activateSelectedResult(): void {
    const row = this.search.resultTree.selectedRow();
    if (!row) return;
    if (row.kind === 'file') {
      this.search.resultTree.toggleFile(row.relativePath);
      return;
    }
    if (row.result) this.openResult(row.result);
  }

  cancelSearch(): void {
    this.search.cancel();
    this.application.requestRender();
  }

  onWheel(rowDelta: number): boolean {
    Momentum.Class.queueImpulse(this.verticalMomentum, rowDelta);
    this.viewportScrollPort?.requestRender();
    return true;
  }

  onPointerMove(column: number, row: number): boolean {
    const field = this.fieldAt(column, row);
    const button = this.buttonAt(column, row);
    this.hoveredField.value = field?.field ?? null;
    this.hoveredButton.value = button?.action ?? null;
    const resultIndex = this.resultIndexAtRow(row);
    this.search.resultTree.hoveredIndex.value = resultIndex;
    return true;
  }

  onPointerOut(): void {
    this.hoveredField.value = null;
    this.hoveredButton.value = null;
    this.pressedButton.value = null;
    this.search.resultTree.hoveredIndex.value = -1;
  }

  tooltipAt(column: number, row: number): string | null {
    const button = this.buttonAt(column, row);
    if (button?.action === 'toggleCase') return 'Match case';
    if (button?.action === 'toggleWholeWord') return 'Match whole word';
    if (button?.action === 'toggleRegex') return 'Use regular expression';
    if (button?.action === 'toggleIgnoreFiles') {
      return 'Use workspace excludes and .gitignore';
    }
    if (button?.action === 'dismissMatch') return 'Dismiss match';
    if (button?.action === 'replaceMatch') return 'Replace match';
    if (button?.action === 'replaceAll') return 'Replace all selected matches';
    if (button?.action === 'undo') return 'Undo workspace replace';
    if (button?.action === 'redo') return 'Redo workspace replace';
    const resultIndex = this.resultIndexAtRow(row);
    const resultRow = this.search.resultTree.rows[resultIndex];
    if (!resultRow) return null;
    if (resultRow.kind === 'limitNotice') {
      return WorkspaceSearchResultTree.Class.LIMIT_NOTICE_TEXT;
    }
    if (resultRow.kind === 'replacementPreview') {
      return resultRow.result?.replacementText ?? '';
    }
    return resultRow.result?.lineText ?? resultRow.relativePath;
  }

  onPointerDown(column: number, row: number): boolean {
    this.onFocus();
    const button = this.buttonAt(column, row);
    if (button) {
      this.pressedButton.value = button.action;
      this.application.requestRender();
      return true;
    }
    const field = this.fieldAt(column, row);
    if (field) {
      this.focusField(field.field);
      const input = this.input(field.field);
      input.beginSelection(this.inputCaretAtColumn(input, field, column));
      this.fieldDrag = field.field;
      return true;
    }
    const resultIndex = this.resultIndexAtRow(row);
    const resultRow = this.search.resultTree.rows[resultIndex];
    if (!resultRow) return false;
    this.focusResults();
    this.search.resultTree.setSelection(resultIndex);
    this.pendingActivationRow = resultRow;
    this.pointerDragged = false;
    this.selectionDrag.begin(column, row);
    return true;
  }

  onPointerDrag(column: number, row: number): boolean {
    if (this.fieldDrag) {
      const field = this.projection?.fields.find(
        (zone) => zone.field === this.fieldDrag,
      );
      if (!field) return false;
      const input = this.input(this.fieldDrag);
      input.extendSelection(this.inputCaretAtColumn(input, field, column));
      this.application.requestRender();
      return true;
    }
    if (!this.selectionDrag.active) return false;
    this.selectionDrag.drag(column, row);
    return true;
  }

  onPointerUp(
    column: number,
    row: number,
    _context?: PanePointerContext,
  ): boolean {
    if (this.fieldDrag) {
      this.input(this.fieldDrag).finishSelection();
      this.fieldDrag = null;
      return true;
    }
    const pressedButton = this.pressedButton.value;
    this.pressedButton.value = null;
    if (pressedButton) {
      const button = this.buttonAt(column, row);
      if (button?.action === pressedButton) this.runButton(button);
      this.application.requestRender();
      return true;
    }
    if (!this.selectionDrag.active) return false;
    this.selectionDrag.end();
    const resultRow = this.pendingActivationRow;
    this.pendingActivationRow = null;
    if (!this.pointerDragged && resultRow?.kind === 'file') {
      this.search.resultTree.toggleFile(resultRow.relativePath);
    } else if (
      !this.pointerDragged &&
      resultRow?.kind === 'match' &&
      resultRow.result
    ) {
      this.openResult(resultRow.result);
    }
    this.pointerDragged = false;
    return true;
  }

  protected runButton(button: WorkspaceSearchButtonZone): void {
    if (button.disabled) return;
    if (button.action === 'toggleCase') this.toggleCase();
    else if (button.action === 'toggleWholeWord') this.toggleWholeWord();
    else if (button.action === 'toggleRegex') this.toggleRegex();
    else if (button.action === 'toggleIgnoreFiles') this.toggleIgnoreFiles();
    else if (button.action === 'dismissMatch' && button.result) {
      this.search.resultTree.dismiss(button.result);
    } else if (button.action === 'replaceMatch' && button.result) {
      this.requestReplaceMatch(button.result);
    } else if (button.action === 'replaceAll') this.requestReplaceAll();
    else if (button.action === 'undo') this.requestUndo();
    else if (button.action === 'redo') this.requestRedo();
  }

  protected requestReplaceMatch(result: WorkspaceSearchResult): void {
    const prepared = this.search.prepareReplace([result]);
    if (prepared.tooLarge) {
      this.showTooLargeAlert(prepared);
      return;
    }
    if (prepared.safeEntries.length > 0) {
      this.search.applyPreparedAction(prepared);
      this.application.requestRender();
      return;
    }
    const location =
      prepared.driftedEntries[0]?.location ??
      prepared.failedEntries[0]?.entry.location;
    if (!location) return;
    this.application.confirm({
      identifier: 'workspace-replace-drifted-match',
      title: 'Match changed',
      message:
        'This item changed since the search and will not be replaced.\n\n' +
        `${location.relativePath}:${location.line + 1}\n\n` +
        'Refresh the search to find its new location.',
      confirmLabel: 'Refresh',
      cancelLabel: 'Cancel',
      onConfirm: () => {
        void this.search
          .search()
          .finally(() => this.application.requestRender());
      },
      onCancel: () => this.search.cancelPreparedAction(prepared),
    });
  }

  protected showPreparedDialog(
    prepared: WorkspacePreparedReplacement,
    workspace: Workspace.Model = this.workspace,
  ): void {
    const safeCount = prepared.safeEntries.length;
    const safeFileCount = new Set(
      prepared.safeEntries.map((entry) => entry.location.absolutePath),
    ).size;
    const allCount = prepared.entries.length;
    const changedLocations = prepared.driftedEntries.map(
      (entry) => entry.location,
    );
    const failedLocations = prepared.failedEntries.map(
      ({ entry }) => entry.location,
    );
    const direction = prepared.direction;
    const title = this.dialogTitle(direction);
    const confirmLabel = this.dialogConfirmLabel(direction);
    const hasSkippedItems =
      changedLocations.length > 0 || failedLocations.length > 0;
    const actionLine = this.dialogActionLine(
      direction,
      safeCount,
      safeFileCount,
      hasSkippedItems,
    );
    const changedLead = this.changedItemsLead(
      direction,
      changedLocations.length,
      allCount,
    );
    const failureLead = `${failedLocations.length} of ${allCount} items could not be changed and will be skipped.`;
    const warningSections = [
      ...(changedLocations.length > 0
        ? [`${changedLead}\n\n${this.locationText(changedLocations)}`]
        : []),
      ...(failedLocations.length > 0
        ? [`${failureLead}\n\n${this.locationText(failedLocations)}`]
        : []),
    ];
    const message = [
      ...warningSections,
      actionLine,
      'Open files will have unsaved changes. Closed files will change on disk.',
    ].join('\n\n');
    this.application.confirm({
      identifier: `workspace-replace-${direction}`,
      title,
      message,
      confirmLabel,
      cancelLabel: 'Cancel',
      onConfirm: () => {
        workspace.workspaceSearch.applyPreparedAction(prepared);
        this.application.requestRender();
      },
      onCancel: () => workspace.workspaceSearch.cancelPreparedAction(prepared),
    });
  }

  protected showTooLargeAlert(prepared: WorkspacePreparedReplacement): void {
    this.application.confirm({
      identifier: 'workspace-replace-too-large',
      title: 'Replace is too large',
      message:
        'This replace needs more than 64 MiB of undo text.\n\n' +
        'No files changed. Narrow the search and try again.',
      confirmLabel: 'Close',
      singleAction: true,
      hint: 'Enter or Escape to close',
      onConfirm: () => this.search.cancelPreparedAction(prepared),
      onCancel: () => this.search.cancelPreparedAction(prepared),
    });
  }

  protected dialogTitle(direction: TextPatchDirection): string {
    if (direction === 'apply') return 'Replace across files';
    if (direction === 'undo') return 'Undo workspace replace';
    return 'Redo workspace replace';
  }

  protected dialogConfirmLabel(direction: TextPatchDirection): string {
    if (direction === 'apply') return 'Replace';
    if (direction === 'undo') return 'Undo';
    return 'Redo';
  }

  protected dialogActionLine(
    direction: TextPatchDirection,
    safeItemCount: number,
    safeFileCount: number,
    hasSkippedItems: boolean,
  ): string {
    const safeQualifier = hasSkippedItems ? ' safe' : '';
    if (direction === 'apply') {
      return `Replace ${safeItemCount}${safeQualifier} ${SearchCountText.Class.itemNoun(safeItemCount)} across ${safeFileCount} ${SearchCountText.Class.fileNoun(safeFileCount)}?`;
    }
    if (direction === 'undo') {
      return `Undo will revert ${safeItemCount}${safeQualifier} ${SearchCountText.Class.itemNoun(safeItemCount)} across ${safeFileCount} ${SearchCountText.Class.fileNoun(safeFileCount)}.`;
    }
    return `Redo will replace ${safeItemCount}${safeQualifier} ${SearchCountText.Class.itemNoun(safeItemCount)} across ${safeFileCount} ${SearchCountText.Class.fileNoun(safeFileCount)}.`;
  }

  protected changedItemsLead(
    direction: TextPatchDirection,
    changedItemCount: number,
    allItemCount: number,
  ): string {
    if (direction === 'apply') {
      return `${changedItemCount} of ${allItemCount} items changed since this search and will be skipped.`;
    }
    if (direction === 'undo') {
      return `${changedItemCount} of ${allItemCount} items changed since replacement and will be skipped.`;
    }
    return `${changedItemCount} of ${allItemCount} items changed since undo and will be skipped.`;
  }

  protected locationText(
    locations: readonly WorkspaceReplacementLocation[],
  ): string {
    return locations
      .map((location) => `${location.relativePath}:${location.line + 1}`)
      .join('\n');
  }

  protected openResult(result: WorkspaceSearchResult): void {
    const workspace = this.workspace;
    workspace.openFileInTab(result.absolutePath);
    workspace.editor.placeCursor(result.line, result.startColumn);
    workspace.editor.cursor.setAnchorHere();
    workspace.editor.placeCursor(result.line, result.endColumn);
    workspace.editor.revealCursor();
    workspace.focusEditor();
    this.application.primaryDockHost.blur();
    this.application.requestRender();
  }

  onResize(columns: number, rows: number): void {
    this.search.resultTree.setViewportSize(
      Math.max(1, columns - this.scrollbarThicknessCells),
      Math.max(1, rows - this.resultStartRow),
    );
  }

  onFocus(): void {
    this.workspace.focusPrimaryPane('search');
  }

  onBlur(): void {}

  dispose(): void {
    this.search.cancel();
  }

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
    if (stepped.rows !== 0) this.search.resultTree.scrollBy(stepped.rows);
    return (
      Momentum.Class.isMoving(this.verticalMomentum) ||
      this.selectionDrag.tick(deltaSeconds)
    );
  }

  get scrollTop(): number {
    return this.search.resultTree.scrollTop.value;
  }

  get scrollContentRows(): number {
    return this.search.resultTree.rows.length;
  }

  get scrollViewportRows(): number {
    return this.search.resultTree.viewportHeight.value;
  }

  get scrollbarRowOffset(): number {
    return this.resultStartRow;
  }

  haltScrollMomentum(): void {
    this.verticalMomentum = Momentum.Class.halt();
  }

  scrollToLine(line: number): void {
    this.haltScrollMomentum();
    this.search.resultTree.scrollBy(
      line - this.search.resultTree.scrollTop.value,
    );
  }

  hasSelection(): boolean {
    this.synchronizeSelection();
    return this.selection.hasSelection();
  }

  selectionTelemetry(): { owner: string; characterLength: number } {
    return {
      owner: 'workspace-search',
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
    this.synchronizeSelection();
    return this.selection.selectedText((line, startCell, endCell) => {
      const text = this.rowText(line);
      if (text.length === 0 && !this.search.resultTree.rows[line]) return null;
      return WrapText.Class.sliceByDisplayCells(
        text,
        startCell,
        endCell ?? Number.MAX_SAFE_INTEGER,
      );
    }, '\n');
  }

  protected synchronizeSelection(): void {
    if (
      this.selection.hasSelection() &&
      this.selectionGeneration.value !== this.search.queryGeneration.value
    ) {
      this.selection.clear();
      this.selectionGeneration.value = -1;
    }
  }

  protected selectionPositionAt(
    column: number,
    row: number,
  ): { line: number; column: number } | null {
    const rowIndex = this.resultIndexAtRow(row);
    if (rowIndex < 0 || rowIndex >= this.search.resultTree.rows.length)
      return null;
    return {
      line: rowIndex,
      column: Math.max(
        0,
        Math.min(
          column,
          TextCoordinates.Class.lineWidth(this.rowText(rowIndex)),
        ),
      ),
    };
  }

  protected resultIndexAtRow(row: number): number {
    if (row < this.resultStartRow) return -1;
    const rowIndex =
      this.search.resultTree.scrollTop.value + row - this.resultStartRow;
    return rowIndex >= 0 && rowIndex < this.search.resultTree.rows.length
      ? rowIndex
      : -1;
  }

  protected rowText(rowIndex: number, row?: WorkspaceSearchTreeRow): string {
    const resultRow = row ?? this.search.resultTree.rows[rowIndex];
    if (!resultRow) return '';
    return WorkspaceSearchPaneRenderer.Class.textForRow(
      resultRow,
      this.interactionRenderContext(false),
      this.search.resultTree.rowIsDismissed(resultRow),
    );
  }

  protected interactionRenderContext(
    paneFocused: boolean,
  ): WorkspaceSearchPaneRenderContext {
    return this.renderContext(
      paneFocused,
      this.application.theme.palette,
      this.contentWidth,
      this.search.resultTree.viewportHeight.value + this.resultStartRow,
    );
  }

  protected fieldAt(
    column: number,
    row: number,
  ): WorkspaceSearchFieldZone | null {
    return (
      this.projection?.fields.find(
        (field) =>
          field.row === row &&
          column >= field.startColumn &&
          column < field.endColumn,
      ) ?? null
    );
  }

  protected buttonAt(
    column: number,
    row: number,
  ): WorkspaceSearchButtonZone | null {
    return (
      this.projection?.buttons.find(
        (button) =>
          button.row === row &&
          column >= button.startColumn &&
          column < button.endColumn,
      ) ?? null
    );
  }

  protected focusedInput(): TextInputModel.Model | null {
    return this.activeFocus.value === 'results'
      ? null
      : this.input(this.activeFocus.value);
  }

  protected input(field: WorkspaceSearchField): TextInputModel.Model {
    if (field === 'query') return this.search.queryInput;
    if (field === 'replacement') return this.search.replacementInput;
    if (field === 'include') return this.search.includeInput;
    return this.search.excludeInput;
  }

  protected inputCaretAtColumn(
    input: TextInputModel.Model,
    field: WorkspaceSearchFieldZone,
    column: number,
  ): number {
    const displayColumn = Math.max(0, column - field.startColumn - 1);
    return TextCoordinates.Class.graphemeAtDisplayColumn(
      input.value,
      displayColumn,
    );
  }

  protected get contentWidth(): number {
    return (
      this.search.resultTree.viewportWidth.value + this.scrollbarThicknessCells
    );
  }

  protected get scrollbarThicknessCells(): number {
    return Math.max(
      1,
      Math.round(this.application.settings.scrollbarThickness.value),
    );
  }
}

export namespace WorkspaceSearchPaneContent {
  export const $Class = $WorkspaceSearchPaneContent;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
