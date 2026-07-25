// Live source | preview split for one Markdown editor buffer. RootView supplies the existing source
// renderable; this controller owns only the preview pane, divider, rendered-text selection model, and
// pane-local interactions. The MarkdownRenderable remains the one rendered-markdown projection.
//
// invariant: A Markdown file offers a live source preview split (src/modules/markdown/markdown.invariants.md)
// invariant: A file reference opens from rendered Markdown (src/modules/markdown/markdown.invariants.md)
import { BoxRenderable, type CliRenderer } from '@opentui/core';
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import { ReadOnlyTextBuffer } from '../editor/ReadOnlyTextBuffer';
import { SplitterModel } from '../layout/SplitterModel';
import type { FindBar, FindBarTarget } from '../search/FindBar';
import type { FindInBufferMatch } from '../search/FindInBuffer';
import type { Settings } from '../settings/Settings';
import type { Theme } from '../theme/Theme';
import { Momentum, AT_REST, VERTICAL_MOMENTUM, type ScrollMomentum } from '../system/Momentum';
import { SelectionDragBehavior } from '../ui/SelectionDragBehavior';
import { SplitterElement } from '../ui/SplitterElement';
import { MarkdownPreview } from './MarkdownPreview';
import type { MarkdownSource } from './MarkdownDocument';
import { MarkdownRenderable, type MarkdownReferenceHit } from './MarkdownRenderable';

class $MarkdownSplitView {
  readonly rootRenderable: BoxRenderable;
  readonly preview: MarkdownPreview.Instance;
  readonly previewRenderable: MarkdownRenderable.Model;
  protected readonly previewPaneRenderable: BoxRenderable;
  protected readonly dividerRenderable: BoxRenderable;
  protected readonly paneSplitter: SplitterModel.Instance;
  protected readonly splitterElement: SplitterElement.Model;
  protected readonly previewTextBuffer: ReadOnlyTextBuffer.Model;
  protected readonly previewSelectionDragBehavior: SelectionDragBehavior.Model;
  protected lastLaidOutWidth = -1;
  protected renderedPreviewText = '';

  get focusedPane() {
    return ref<MarkdownSplitPane>('source');
  }
  get hoveredReferencePath() {
    return ref<string | null>(null);
  }
  get hoveredReferenceKey() {
    return ref<string | null>(null);
  }
  get selectionRevision() {
    return ref(0);
  }
  get verticalScrollMomentum() {
    return shallowRef<ScrollMomentum>(AT_REST);
  }

  constructor(
    readonly renderer: CliRenderer,
    readonly theme: Theme.Instance,
    readonly options: MarkdownSplitViewOptions,
  ) {
    this.rootRenderable = new BoxRenderable(renderer, {
      id: 'markdown-split-view',
      width: '100%',
      height: '100%',
      flexDirection: 'row',
      overflow: 'hidden',
    });
    this.previewPaneRenderable = new BoxRenderable(renderer, {
      id: 'markdown-preview-pane',
      height: '100%',
      flexDirection: 'column',
      border: true,
      borderStyle: 'rounded',
      title: 'Preview',
      overflow: 'hidden',
      flexShrink: 0,
    });
    this.splitterElement = this.createSplitterElement();
    this.dividerRenderable = this.splitterElement.renderable;
    this.preview = this.createPreview();
    this.previewRenderable = this.createPreviewRenderable();
    this.previewPaneRenderable.add(this.previewRenderable);
    this.previewTextBuffer = this.createPreviewTextBuffer();
    this.paneSplitter = this.splitterElement.model;
    this.previewSelectionDragBehavior = this.createSelectionDragBehavior();

    this.rootRenderable.add(options.sourceRenderable);
    options.sourceRenderable.flexGrow = 0;
    options.sourceRenderable.flexShrink = 0;
    this.rootRenderable.add(this.dividerRenderable);
    this.rootRenderable.add(this.previewPaneRenderable);
    options.parentRenderable.add(this.rootRenderable);
    this.bindPreviewEvents();
    this.previewRenderable.attachFindEngineProvider(
      () => options.findBar.engineFor(this.previewFindTargetIdentifier()),
    );
    this.preview.open(options.source, this.previewRenderable);
    this.update();
  }

  protected createPreview(): MarkdownPreview.Instance {
    return new MarkdownPreview.Class();
  }

  protected createPreviewRenderable(): MarkdownRenderable.Model {
    return new MarkdownRenderable.Class(this.renderer, this.preview, this.theme);
  }

  protected createPreviewTextBuffer(): ReadOnlyTextBuffer.Model {
    const textBuffer = new ReadOnlyTextBuffer.Class();
    textBuffer.openText(`${this.options.sourcePath} (rendered preview)`, '');
    return textBuffer;
  }

  protected createSplitterElement(): SplitterElement.Model {
    return new SplitterElement.Class({
      renderer: this.renderer,
      identifier: 'markdown-preview-divider',
      orientation: 'vertical',
      reportUnit: 'ratio',
      initialSize: this.options.settings.markdownSplitRatio.value,
      minimumSize: 0.2,
      maximumSize: 0.8,
      currentSize: () => this.options.settings.markdownSplitRatio.value,
      currentExtentCells: () => this.paneExtentWidth(),
      onSizeChange: (ratio) => {
        this.options.settings.markdownSplitRatio.value = ratio;
        this.update();
      },
      onDragEnd: () => {
        this.options.settings.save();
        this.update();
      },
    });
  }

  protected createSelectionDragBehavior(): SelectionDragBehavior.Model {
    // invariant: Markdown preview selection reuses shared drag behavior (src/modules/markdown/markdown.invariants.md)
    return new SelectionDragBehavior.Class({
      viewportRectangle: () => ({
        leftColumn: this.previewRenderable.bodyRenderable.x,
        rightColumn:
          this.previewRenderable.bodyRenderable.x + Math.max(1, this.previewViewportWidth()) - 1,
        topRow: this.previewRenderable.bodyRenderable.y,
        bottomRow:
          this.previewRenderable.bodyRenderable.y + Math.max(1, this.previewViewportHeight()) - 1,
      }),
      positionAtCell: (screenColumn, screenRow) =>
        this.previewRenderable.positionAtCell(screenColumn, screenRow),
      horizontalScrollPosition: () => 0,
      horizontalScrollingEnabled: () => false,
      lineGraphemeCount: (lineIndex) =>
        EditorCoordinates.Class.graphemeCount(this.previewTextBuffer.document.line(lineIndex)),
      beginSelection: (position, pointerDisplayColumn) => {
        this.focusPreview();
        this.previewTextBuffer.cursor.set(
          position.line,
          position.column,
          pointerDisplayColumn,
        );
        this.previewTextBuffer.cursor.setAnchorHere();
        this.selectionRevision.value += 1;
      },
      extendSelection: (position, pointerDisplayColumn) => {
        this.previewTextBuffer.cursor.set(
          position.line,
          position.column,
          pointerDisplayColumn,
        );
        this.selectionRevision.value += 1;
        this.applyPreviewSelection();
      },
      finishSelection: () => {
        if (!this.previewTextBuffer.cursor.hasSelection) {
          this.previewTextBuffer.cursor.clearSelection();
        }
        this.selectionRevision.value += 1;
        this.applyPreviewSelection();
      },
      scrollColumns: () => {},
      scrollRows: (rowDelta) => {
        this.preview.scrollBy(rowDelta, this.previewViewportWidth(), this.previewViewportHeight());
      },
      haltCompetingScroll: () => {
        this.verticalScrollMomentum.value = Momentum.Class.halt();
      },
    });
  }

  focusSource(): void {
    this.focusedPane.value = 'source';
  }

  focusPreview(): void {
    this.focusedPane.value = 'preview';
  }

  get previewFocused(): boolean {
    return this.focusedPane.value === 'preview';
  }

  previewFindTargetIdentifier(): string {
    return `markdown-preview:${this.options.sourcePath}`;
  }

  findTarget(): FindBarTarget {
    this.synchronizeRenderedPreviewDocument();
    return this.previewTextBuffer.findTarget(
      this.previewFindTargetIdentifier(),
      (match) => this.revealFindMatch(match),
    );
  }

  update(): void {
    this.synchronizePaneGeometry();
    const palette = this.theme.palette;
    this.rootRenderable.backgroundColor = palette.bg;
    this.previewPaneRenderable.backgroundColor = palette.bg;
    this.previewPaneRenderable.borderColor = this.previewFocused
      ? palette.borderActive
      : palette.border;
    this.previewPaneRenderable.titleColor = this.previewFocused ? palette.accent : palette.dim;
    this.splitterElement.updateAppearance(palette);
    this.previewRenderable.setHoveredReferenceKey(this.hoveredReferenceKey.value);
    this.previewRenderable.refresh();
    this.synchronizeRenderedPreviewDocument();
    this.applyPreviewSelection();
  }

  /** Frame hook for preview momentum, edge autoscroll, async parse landing, and first-layout sizing. */
  tick(deltaTimeSeconds: number): boolean {
    const momentumStep = Momentum.Class.stepMomentum(
      this.verticalScrollMomentum.value,
      deltaTimeSeconds,
      VERTICAL_MOMENTUM,
    );
    this.verticalScrollMomentum.value = momentumStep.momentum;
    if (momentumStep.rows !== 0) {
      this.preview.scrollBy(
        momentumStep.rows,
        this.previewViewportWidth(),
        this.previewViewportHeight(),
      );
    }
    const selectionAutoscrolling = this.previewSelectionDragBehavior.tick(deltaTimeSeconds);
    const laidOutWidth = Number(this.rootRenderable.width) || 0;
    const layoutChanged = laidOutWidth !== this.lastLaidOutWidth;
    if (layoutChanged) this.lastLaidOutWidth = laidOutWidth;
    const documentChanged = this.synchronizeRenderedPreviewDocument();
    if (momentumStep.rows !== 0 || selectionAutoscrolling || layoutChanged || documentChanged) {
      this.update();
    }
    return Momentum.Class.isMoving(momentumStep.momentum) || selectionAutoscrolling || layoutChanged;
  }

  moveByKeyboardRows(rowDelta: number): void {
    this.verticalScrollMomentum.value = Momentum.Class.halt();
    this.preview.scrollBy(rowDelta, this.previewViewportWidth(), this.previewViewportHeight());
    this.update();
  }

  pageByKeyboard(direction: -1 | 1): void {
    this.moveByKeyboardRows(direction * this.previewViewportHeight());
  }

  async copySelection(): Promise<number> {
    return this.previewTextBuffer.copySelection();
  }

  selectAll(): void {
    this.previewTextBuffer.selectAll();
    this.selectionRevision.value += 1;
    this.applyPreviewSelection();
  }

  selectionCharacterCount(): number {
    void this.selectionRevision.value;
    return this.previewTextBuffer.selectionText().length;
  }

  openHoveredReference(): void {
    const path = this.hoveredReferencePath.value;
    if (path) this.options.openReference(path);
  }

  protected revealFindMatch(match: FindInBufferMatch): void {
    this.focusPreview();
    this.previewTextBuffer.cursor.set(match.line, match.endColumn);
    this.previewTextBuffer.cursor.anchor.value = {
      line: match.line,
      col: match.startColumn,
    };
    this.preview.scrollTo(match.line, this.previewViewportWidth(), this.previewViewportHeight());
    this.selectionRevision.value += 1;
    this.update();
  }

  protected synchronizeRenderedPreviewDocument(): boolean {
    const renderedText = this.preview
      .allRows(this.previewViewportWidth())
      .map((row) => this.preview.textForRow(row))
      .join('\n');
    if (renderedText === this.renderedPreviewText) return false;
    this.renderedPreviewText = renderedText;
    this.previewTextBuffer.replaceText(renderedText);
    this.options.findBar.engineFor(this.previewFindTargetIdentifier())?.findAll();
    this.selectionRevision.value += 1;
    return true;
  }

  protected applyPreviewSelection(): void {
    const selection = this.previewTextBuffer.cursor.selectionRange();
    const firstVisibleRow = this.preview.scrollTop.value;
    const viewportHeight = this.previewViewportHeight();
    if (
      !selection ||
      selection.end.line < firstVisibleRow ||
      selection.start.line >= firstVisibleRow + viewportHeight
    ) {
      this.previewRenderable.clearSelectionRange();
      return;
    }
    const anchorRow = Math.max(0, selection.start.line - firstVisibleRow);
    const focusRow = Math.min(viewportHeight - 1, selection.end.line - firstVisibleRow);
    const anchorColumn = selection.start.line >= firstVisibleRow
      ? EditorCoordinates.Class.displayColumn(
          this.previewTextBuffer.document.line(selection.start.line),
          selection.start.col,
        )
      : 0;
    const focusColumn = selection.end.line < firstVisibleRow + viewportHeight
      ? EditorCoordinates.Class.displayColumn(
          this.previewTextBuffer.document.line(selection.end.line),
          selection.end.col,
        )
      : this.previewViewportWidth();
    this.previewRenderable.setSelectionRange(anchorColumn, anchorRow, focusColumn, focusRow);
  }

  protected bindPreviewEvents(): void {
    const previewBody = this.previewRenderable.bodyRenderable;
    previewBody.onMouseDown = (event) => {
      this.focusPreview();
      const resolvedReference = this.resolvedReferenceAt(event.x, event.y);
      // OpenTUI exposes terminal Meta/Super mouse modifiers through the SGR alt bit. Supporting
      // ctrl OR alt therefore covers Ctrl-click and terminal Cmd/Meta-click without a second path.
      if (event.button === 0 && (event.modifiers.ctrl || event.modifiers.alt) && resolvedReference) {
        this.options.openReference(resolvedReference.path);
        return;
      }
      this.previewSelectionDragBehavior.begin(event.x, event.y);
    };
    previewBody.onMouseDrag = (event) => this.previewSelectionDragBehavior.drag(event.x, event.y);
    previewBody.onMouseUp = () => this.previewSelectionDragBehavior.end();
    previewBody.onMouseDragEnd = () => this.previewSelectionDragBehavior.end();
    previewBody.onMouseScroll = (event) => {
      this.focusPreview();
      const direction = event.scroll?.direction;
      const rowImpulse = direction === 'up' || direction === 'left' ? -1 : 1;
      this.verticalScrollMomentum.value = Momentum.Class.addImpulse(
        this.verticalScrollMomentum.value,
        rowImpulse,
        VERTICAL_MOMENTUM,
      );
    };
    previewBody.onMouseMove = (event) => {
      const resolvedReference = this.resolvedReferenceAt(event.x, event.y);
      this.hoveredReferenceKey.value = resolvedReference?.hit.key ?? null;
      this.hoveredReferencePath.value = resolvedReference?.path ?? null;
      this.previewRenderable.setHoveredReferenceKey(this.hoveredReferenceKey.value);
      if (resolvedReference) {
        this.options.showReferenceTooltip(resolvedReference.path, event.x, event.y);
      } else {
        this.options.clearReferenceTooltip();
      }
      this.renderer.requestRender();
    };
    previewBody.onMouseOut = () => {
      this.hoveredReferenceKey.value = null;
      this.hoveredReferencePath.value = null;
      this.previewRenderable.setHoveredReferenceKey(null);
      this.options.clearReferenceTooltip();
      this.renderer.requestRender();
    };
  }

  protected resolvedReferenceAt(
    screenColumn: number,
    screenRow: number,
  ): { hit: MarkdownReferenceHit; path: string } | null {
    const hit = this.previewRenderable.referenceAtCell(screenColumn, screenRow);
    if (!hit) return null;
    const path = this.options.resolveReference(hit.target);
    return path ? { hit, path } : null;
  }

  protected paneExtentWidth(): number {
    return Math.max(2, (Number(this.rootRenderable.width) || 80) - 1);
  }

  protected sourcePaneWidth(): number {
    const ratio = Math.max(0.2, Math.min(0.8, this.options.settings.markdownSplitRatio.value));
    return Math.max(1, Math.round(this.paneExtentWidth() * ratio));
  }

  protected synchronizePaneGeometry(): void {
    const sourcePaneWidth = this.sourcePaneWidth();
    this.options.sourceRenderable.width = sourcePaneWidth;
    this.options.sourceRenderable.height = '100%';
    this.previewPaneRenderable.width = Math.max(1, this.paneExtentWidth() - sourcePaneWidth);
    this.paneSplitter.setExtentCells(this.paneExtentWidth());
  }

  protected previewViewportWidth(): number {
    return Math.max(
      1,
      Number(this.previewRenderable.bodyRenderable.width) ||
        Number(this.previewPaneRenderable.width) - 2 ||
        1,
    );
  }

  protected previewViewportHeight(): number {
    return Math.max(
      1,
      Number(this.previewRenderable.bodyRenderable.height) ||
        Number(this.previewPaneRenderable.height) - 2 ||
        1,
    );
  }

  protected captureDragTarget(target: object): void {
    const renderableWithContext = target as {
      _ctx?: { setCapturedRenderable?: (renderable: unknown) => void };
    };
    renderableWithContext._ctx?.setCapturedRenderable?.(target);
  }

  dispose(): void {
    try {
      this.preview.dispose();
      this.previewTextBuffer.dispose();
      this.rootRenderable.remove(this.options.sourceRenderable);
      this.options.sourceRenderable.flexGrow = 1;
      this.options.sourceRenderable.flexShrink = 1;
      this.options.sourceRenderable.width = '100%';
      this.options.parentRenderable.remove(this.rootRenderable);
      this.rootRenderable.destroyRecursively();
    } catch {
      // Disposal is idempotent from RootView's swap perspective.
    }
  }
}

export namespace MarkdownSplitView {
  export const $Class = $MarkdownSplitView;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface MarkdownSplitViewOptions {
  source: MarkdownSource;
  sourcePath: string;
  sourceRenderable: BoxRenderable;
  parentRenderable: BoxRenderable;
  settings: Settings.Instance;
  findBar: FindBar.Instance;
  resolveReference(reference: string): string | null;
  openReference(path: string): void;
  showReferenceTooltip(path: string, screenColumn: number, screenRow: number): void;
  clearReferenceTooltip(): void;
}

type MarkdownSplitPane = 'source' | 'preview';
