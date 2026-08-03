// Live source | preview split for one Markdown editor buffer. RootView supplies the existing source
// renderable; this controller owns only the preview pane, divider, rendered-text selection model, and
// pane-local interactions. The MarkdownRenderable remains the one rendered-markdown projection.
//
// invariant: A Markdown file offers a live source preview split (src/modules/markdown/markdown.invariants.md)
// invariant: Markdown view mode persists across Markdown documents (src/modules/markdown/markdown.invariants.md)
// invariant: A file reference opens from rendered Markdown (src/modules/markdown/markdown.invariants.md)
// invariant: Dead relative Markdown links have one revision-stamped verdict (src/modules/markdown/markdown.invariants.md)
import { BoxRenderable, type CliRenderer } from '@opentui/core';
import { Reactive } from 'ivue';
import { ref } from 'vue';
import { TextCoordinates } from '../text/TextCoordinates';
import { ReadOnlyTextBuffer } from '../text/ReadOnlyTextBuffer';
import { SplitterModel } from '../layout/SplitterModel';
import type { FindBar, FindBarTarget } from '../search/FindBar';
import type { FindInBufferMatch } from '../search/FindInBuffer';
import type { Settings } from '../settings/Settings';
import type { RegisteredSetting } from '../settings/SettingContribution.interface';
import type { Theme } from '../theme/Theme';
import { DoubleClickGesture } from '../ui/DoubleClickGesture';
import { ScrollableTextViewport } from '../ui/ScrollableTextViewport';
import { SplitterElement } from '../ui/SplitterElement';
import { MarkdownPreview } from './MarkdownPreview';
import type { MarkdownSource } from './MarkdownDocument';
import {
  MarkdownRenderable,
  type MarkdownReferenceHit,
} from './MarkdownRenderable';

class $MarkdownSplitView {
  readonly rootRenderable: BoxRenderable;
  readonly preview: MarkdownPreview.Instance;
  readonly previewRenderable: MarkdownRenderable.Model;
  protected readonly previewPaneRenderable: BoxRenderable;
  protected readonly dividerRenderable: BoxRenderable;
  protected readonly paneSplitter: SplitterModel.Instance;
  protected readonly splitterElement: SplitterElement.Model;
  protected readonly previewTextBuffer: ReadOnlyTextBuffer.Model;
  protected readonly previewViewport: ScrollableTextViewport.Instance;
  protected readonly splitRatioSetting: RegisteredSetting<number>;
  protected readonly scrollSyncSetting: RegisteredSetting<boolean>;
  protected lastLaidOutWidth = -1;
  protected renderedPreviewText = '';
  protected renderedPreviewRevision = -1;
  protected renderedPreviewWidth = -1;
  protected renderedPreviewBorderSignature = '';
  protected pendingSourceRevealLine: number | null = null;
  protected pendingBottomReveal = false;
  protected lastScrollSyncLeader: MarkdownSplitPane | null = null;
  protected lastSynchronizedSourceScrollTop = -1;
  protected lastSynchronizedPreviewScrollTop = -1;
  protected lastSynchronizedPreviewRevision = -1;
  protected lastSynchronizedPreviewWidth = -1;
  protected referenceVerdictRevision = -1;
  protected referenceDeadByTarget = new Map<string, boolean>();
  /** The preview's share of the one double-click clock. A second press on the SAME reference span
   *  activates it, so the mouse alone navigates. */
  protected readonly previewDoubleClick = new DoubleClickGesture.Class();

  get focusedPane() {
    return ref<MarkdownSplitPane>(this.options.viewOnly ? 'preview' : 'source');
  }
  get hoveredReferencePath() {
    return ref<string | null>(null);
  }
  get hoveredReferenceKey() {
    return ref<string | null>(null);
  }
  /** The last stated outcome of activating an UNRESOLVABLE link (external scheme or missing
   *  file), for the status bar. Cleared by the next successful open; null while nothing is owed.
   *  invariant: An unresolvable Markdown link states why (src/modules/markdown/markdown.invariants.md) */
  get linkNotice() {
    return ref<string | null>(null);
  }
  get selectionRevision() {
    return ref(0);
  }
  constructor(
    readonly renderer: CliRenderer,
    readonly theme: Theme.Instance,
    readonly options: MarkdownSplitViewOptions,
  ) {
    this.splitRatioSetting =
      options.splitRatioSetting ?? this.createTransientSplitRatioSetting();
    this.scrollSyncSetting =
      options.scrollSyncSetting ?? this.createTransientScrollSyncSetting();
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
      // MarkdownRenderable already clips its body. A second scissor here leaves the trailing-edge
      // bars painted but removes them from OpenTUI's hit grid, so native drag and track clicks die.
      flexShrink: 0,
    });
    this.splitterElement = this.createSplitterElement();
    this.dividerRenderable = this.splitterElement.renderable;
    this.preview = this.createPreview();
    this.previewRenderable = this.createPreviewRenderable();
    this.previewPaneRenderable.add(this.previewRenderable);
    this.previewTextBuffer = this.createPreviewTextBuffer();
    this.previewViewport = this.createPreviewViewport();
    this.paneSplitter = this.splitterElement.model;

    // The RENDERED view reads left-to-right first, so the preview sits LEFT by default; the
    // contributed `markdownPreviewSide` setting flips the order. Only the child order and the
    // splitter's pointer direction change — the persisted ratio keeps meaning "source pane share".
    // invariant: The Markdown preview opens itself and sits on the configured side (src/modules/markdown/markdown.invariants.md)
    const childRenderables = options.viewOnly
      ? [this.previewPaneRenderable]
      : this.previewSide === 'left'
        ? [
            this.previewPaneRenderable,
            this.dividerRenderable,
            options.sourceRenderable,
          ]
        : [
            options.sourceRenderable,
            this.dividerRenderable,
            this.previewPaneRenderable,
          ];
    for (const childRenderable of childRenderables) {
      this.rootRenderable.add(childRenderable);
    }
    if (!options.viewOnly) {
      options.sourceRenderable.flexGrow = 0;
      options.sourceRenderable.flexShrink = 0;
    }
    options.parentRenderable.add(this.rootRenderable);
    this.bindPreviewEvents();
    this.previewRenderable.attachFindEngineProvider(() =>
      options.findBar.engineFor(this.previewFindTargetIdentifier()),
    );
    this.previewRenderable.attachReferenceIsDeadProvider((target) =>
      this.referenceIsDead(target),
    );
    this.preview.open(options.source, this.previewRenderable);
    this.update();
  }

  protected createPreview(): MarkdownPreview.Instance {
    return new MarkdownPreview.Class();
  }

  protected createPreviewRenderable(): MarkdownRenderable.Model {
    return new MarkdownRenderable.Class(
      this.renderer,
      this.preview,
      this.theme,
    );
  }

  protected createPreviewTextBuffer(): ReadOnlyTextBuffer.Model {
    const textBuffer = new ReadOnlyTextBuffer.Class();
    textBuffer.openText(`${this.options.sourcePath} (rendered preview)`, '');
    return textBuffer;
  }

  protected referenceIsDead(target: string): boolean {
    // The first paint for a new parse revision refreshes every authored target once. Later
    // paints read only this map, so the render loop performs no repeated filesystem probes.
    this.refreshReferenceVerdicts();
    return this.referenceDeadByTarget.get(target) ?? false;
  }

  protected refreshReferenceVerdicts(): void {
    if (this.referenceVerdictRevision === this.preview.parsedRevision) return;
    this.referenceVerdictRevision = this.preview.parsedRevision;
    this.referenceDeadByTarget.clear();
    for (const target of this.preview.referenceTargets()) {
      if (this.referenceDeadByTarget.has(target)) continue;
      this.referenceDeadByTarget.set(
        target,
        !this.options.referenceIsExternal(target) &&
          this.options.resolveReference(target) === null,
      );
    }
  }

  /** Which side of the source the rendered pane sits on. Fixed for the life of one split: the
   *  mount identity includes the side, so a settings flip rebuilds the split. */
  get previewSide(): MarkdownPreviewSide {
    return this.options.previewSide ?? 'left';
  }

  protected createSplitterElement(): SplitterElement.Model {
    return new SplitterElement.Class({
      renderer: this.renderer,
      identifier: 'markdown-preview-divider',
      orientation: 'vertical',
      reportUnit: 'ratio',
      // The tracked size is ALWAYS the source pane's share. With the preview on the left the
      // source pane sits right of the divider, so a rightward pointer move SHRINKS it — the
      // inverted pointer direction keeps the divider following the pointer on either side.
      pointerDirection: () => (this.previewSide === 'left' ? -1 : 1),
      initialSize: this.splitRatioSetting.value.value,
      minimumSize: 0.2,
      maximumSize: 0.8,
      currentSize: () => this.splitRatioSetting.value.value,
      currentExtentCells: () => this.paneExtentWidth(),
      onSizeChange: (ratio) => {
        this.splitRatioSetting.value.value = ratio;
        this.update();
      },
      onDragEnd: () => {
        this.splitRatioSetting.save();
        this.update();
      },
    });
  }

  protected createTransientSplitRatioSetting(): RegisteredSetting<number> {
    return {
      value: ref(0.5),
      save: () => {},
      dispose: () => {},
    };
  }

  protected createTransientScrollSyncSetting(): RegisteredSetting<boolean> {
    return {
      value: ref(true),
      save: () => {},
      dispose: () => {},
    };
  }

  protected createPreviewViewport(): ScrollableTextViewport.Instance {
    // invariant: A scrollable text surface is drag-selectable with edge auto-scroll (src/modules/ui/ui.invariants.md)
    // invariant: One scrollbar painter gives each axis equal visual weight (src/modules/ui/ui.invariants.md)
    return new ScrollableTextViewport.Class({
      renderer: this.renderer,
      settings: this.options.settings,
      parent: this.previewPaneRenderable,
      id: 'markdown-preview',
      extent: () => ({
        contentRows: this.preview.totalRows(this.previewViewportWidth()),
        contentColumns: this.preview.totalColumns(this.previewViewportWidth()),
        viewportRows: this.previewViewportHeight(),
        viewportColumns: this.previewViewportWidth(),
      }),
      colors: () => ({
        track: this.theme.palette.bg,
        thumb: this.theme.palette.dim,
      }),
      onScroll: () => {
        this.synchronizePreviewPositionFromViewport();
        this.renderer.requestRender();
      },
      onScrollbarInput: () => this.focusPreview(),
      selection: {
        viewportRectangle: () => ({
          leftColumn: this.previewRenderable.bodyRenderable.x,
          rightColumn:
            this.previewRenderable.bodyRenderable.x +
            Math.max(1, this.previewViewportWidth()) -
            1,
          topRow: this.previewRenderable.bodyRenderable.y,
          bottomRow:
            this.previewRenderable.bodyRenderable.y +
            Math.max(1, this.previewViewportHeight()) -
            1,
        }),
        positionAtCell: (screenColumn, screenRow) =>
          this.previewRenderable.positionAtCell(screenColumn, screenRow),
        lineGraphemeCount: (lineIndex) =>
          TextCoordinates.Class.graphemeCount(
            this.previewTextBuffer.document.line(lineIndex),
          ),
        begin: (position, pointerDisplayColumn) => {
          this.focusPreview();
          this.previewTextBuffer.cursor.set(
            position.line,
            position.column,
            pointerDisplayColumn,
          );
          this.previewTextBuffer.cursor.setAnchorHere();
          this.selectionRevision.value += 1;
        },
        extend: (position, pointerDisplayColumn) => {
          this.previewTextBuffer.cursor.set(
            position.line,
            position.column,
            pointerDisplayColumn,
          );
          this.selectionRevision.value += 1;
          this.applyPreviewSelection();
        },
        finish: () => {
          if (!this.previewTextBuffer.cursor.hasSelection) {
            this.previewTextBuffer.cursor.clearSelection();
          }
          this.selectionRevision.value += 1;
          this.applyPreviewSelection();
        },
      },
    });
  }

  focusSource(): void {
    if (this.options.viewOnly) return;
    this.focusedPane.value = 'source';
  }

  focusPreview(): void {
    this.focusedPane.value = 'preview';
  }

  get previewFocused(): boolean {
    return this.focusedPane.value === 'preview';
  }

  previewScrollSnapshot(): MarkdownPreviewScrollSnapshot {
    const viewportColumns = this.previewViewportWidth();
    const viewportRows = this.previewViewportHeight();
    return {
      scrollTop: this.previewViewport.scrollTop,
      scrollLeft: this.previewViewport.scrollLeft,
      contentRows: this.preview.totalRows(viewportColumns),
      contentColumns: this.preview.totalColumns(viewportColumns),
      viewportRows,
      viewportColumns,
    };
  }

  get wordWrapEnabled(): boolean {
    return this.preview.wordWrapEnabled.value;
  }

  toggleWordWrap(): void {
    this.preview.toggleWordWrap();
    this.previewViewport.reconcileExtent();
    this.update();
  }

  goToSourceLine(oneBasedLine: number): void {
    this.revealSourceLine(Math.max(0, oneBasedLine - 1));
  }

  goToBottom(): void {
    this.previewViewport.haltMomentum();
    this.pendingBottomReveal = true;
    this.applyPendingBottomReveal();
    this.update();
  }

  protected applyPendingBottomReveal(): boolean {
    if (
      !this.pendingBottomReveal ||
      this.preview.parsedRevision !== this.options.source.revision.value
    ) {
      return false;
    }
    this.pendingBottomReveal = false;
    this.previewViewport.scrollToRow(
      Math.max(
        0,
        this.preview.totalRows(this.previewViewportWidth()) -
          this.previewViewportHeight(),
      ),
    );
    return true;
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
    this.previewViewport.reconcileExtent();
    this.synchronizePreviewPositionFromViewport();
    const explicitSourceRevealApplied = this.applyPendingSourceReveal();
    this.applyPendingBottomReveal();
    if (!explicitSourceRevealApplied) this.synchronizeScrollFollower();
    const palette = this.theme.palette;
    this.rootRenderable.backgroundColor = palette.bg;
    this.previewPaneRenderable.backgroundColor = palette.bg;
    this.previewPaneRenderable.borderColor = this.previewFocused
      ? palette.borderActive
      : palette.border;
    this.previewPaneRenderable.titleColor = this.previewFocused
      ? palette.accent
      : palette.dim;
    this.splitterElement.updateAppearance(palette);
    this.previewRenderable.setHoveredReferenceKey(
      this.hoveredReferenceKey.value,
    );
    this.applyPreviewSelection();
    this.previewViewport.updateScrollbars({
      top: 0,
      left: 0,
      width: this.previewViewportWidth(),
      height: this.previewViewportHeight(),
    });
  }

  protected synchronizePreviewPositionFromViewport(): void {
    const width = this.previewViewportWidth();
    this.preview.scrollTo(
      this.previewViewport.scrollTop,
      width,
      this.previewViewportHeight(),
    );
    this.preview.scrollHorizontallyTo(this.previewViewport.scrollLeft, width);
  }

  /** Follow an explicit source jump after the preview has parsed that same source revision. */
  revealSourceLine(sourceLine: number): void {
    this.previewViewport.haltMomentum();
    this.pendingSourceRevealLine = sourceLine;
    this.update();
  }

  protected applyPendingSourceReveal(): boolean {
    const sourceLine = this.pendingSourceRevealLine;
    if (
      sourceLine === null ||
      this.preview.parsedRevision !== this.options.source.revision.value
    ) {
      return false;
    }
    this.pendingSourceRevealLine = null;
    this.preview.revealSourceLine(
      sourceLine,
      this.previewViewportWidth(),
      this.previewViewportHeight(),
    );
    this.previewViewport.scrollToRow(this.preview.scrollTop.value);
    this.captureSynchronizedScrollState();
    return true;
  }

  /** Frame hook for preview momentum, edge autoscroll, async parse landing, and first-layout sizing. */
  tick(deltaTimeSeconds: number): boolean {
    const viewportMoving = this.previewViewport.tick(deltaTimeSeconds);
    const laidOutWidth = Number(this.rootRenderable.width) || 0;
    const layoutChanged = laidOutWidth !== this.lastLaidOutWidth;
    if (layoutChanged) this.lastLaidOutWidth = laidOutWidth;
    const scrollFollowerChanged = this.synchronizeScrollFollower();
    if (viewportMoving || layoutChanged || scrollFollowerChanged) {
      this.update();
    }
    return viewportMoving || layoutChanged || scrollFollowerChanged;
  }

  protected synchronizeScrollFollower(): boolean {
    if (this.options.viewOnly) return false;
    const sourceScrollTop = this.options.sourceScrollTop();
    const previewScrollTop = this.previewViewport.scrollTop;
    const previewWidth = this.previewViewportWidth();
    const previewRevision = this.preview.parsedRevision;
    if (!this.scrollSyncSetting.value.value) {
      this.captureSynchronizedScrollState();
      return false;
    }
    if (previewRevision !== this.options.source.revision.value) return false;

    const leader = this.focusedPane.value;
    const synchronizationIsCurrent =
      this.lastScrollSyncLeader === leader &&
      this.lastSynchronizedSourceScrollTop === sourceScrollTop &&
      this.lastSynchronizedPreviewScrollTop === previewScrollTop &&
      this.lastSynchronizedPreviewRevision === previewRevision &&
      this.lastSynchronizedPreviewWidth === previewWidth;
    if (synchronizationIsCurrent) return false;

    let followerChanged = false;
    if (leader === 'source') {
      const targetRenderedRow =
        sourceScrollTop === 0
          ? 0
          : this.preview.renderedRowForSourceLine(
              this.options.sourceLineAtViewportTop(),
              previewWidth,
            );
      if (
        targetRenderedRow !== null &&
        targetRenderedRow !== this.previewViewport.scrollTop
      ) {
        this.previewViewport.scrollToRow(targetRenderedRow);
        followerChanged = true;
      }
    } else {
      const targetSourceLine =
        previewScrollTop === 0
          ? 0
          : this.preview.sourceLineForRenderedRow(
              previewScrollTop,
              previewWidth,
            );
      if (targetSourceLine !== null) {
        this.options.scrollSourceLineToViewportTop(targetSourceLine);
        followerChanged = this.options.sourceScrollTop() !== sourceScrollTop;
      }
    }
    this.captureSynchronizedScrollState();
    return followerChanged;
  }

  protected captureSynchronizedScrollState(): void {
    this.lastScrollSyncLeader = this.focusedPane.value;
    this.lastSynchronizedSourceScrollTop = this.options.sourceScrollTop();
    this.lastSynchronizedPreviewScrollTop = this.previewViewport.scrollTop;
    this.lastSynchronizedPreviewRevision = this.preview.parsedRevision;
    this.lastSynchronizedPreviewWidth = this.previewViewportWidth();
  }

  moveByKeyboardRows(rowDelta: number): void {
    this.previewViewport.scrollRowsBy(rowDelta);
    this.update();
  }

  pageByKeyboard(direction: -1 | 1): void {
    this.moveByKeyboardRows(direction * this.previewViewportHeight());
  }

  async copySelection(): Promise<number> {
    this.synchronizeRenderedPreviewDocument();
    return this.previewTextBuffer.copySelection();
  }

  selectAll(): void {
    this.synchronizeRenderedPreviewDocument();
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
    this.previewViewport.scrollToRow(match.line);
    this.selectionRevision.value += 1;
    this.update();
  }

  protected synchronizeRenderedPreviewDocument(): boolean {
    const previewWidth = this.previewViewportWidth();
    const borderSignature = Object.values(this.theme.tableBorders).join('');
    if (
      this.renderedPreviewRevision === this.preview.parsedRevision &&
      this.renderedPreviewWidth === previewWidth &&
      this.renderedPreviewBorderSignature === borderSignature
    ) {
      return false;
    }
    const renderedText = this.preview
      .allRows(previewWidth, this.theme.tableBorders)
      .map((row) => this.preview.textForRow(row))
      .join('\n');
    this.renderedPreviewRevision = this.preview.parsedRevision;
    this.renderedPreviewWidth = previewWidth;
    this.renderedPreviewBorderSignature = borderSignature;
    if (renderedText === this.renderedPreviewText) return false;
    this.renderedPreviewText = renderedText;
    this.previewTextBuffer.replaceText(renderedText);
    this.options.findBar
      .engineFor(this.previewFindTargetIdentifier())
      ?.findAll();
    this.selectionRevision.value += 1;
    return true;
  }

  protected applyPreviewSelection(): void {
    const selection = this.previewTextBuffer.cursor.selectionRange();
    const firstVisibleRow = this.previewViewport.scrollTop;
    const firstVisibleColumn = this.previewViewport.scrollLeft;
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
    const focusRow = Math.min(
      viewportHeight - 1,
      selection.end.line - firstVisibleRow,
    );
    const anchorColumn =
      selection.start.line >= firstVisibleRow
        ? Math.max(
            0,
            TextCoordinates.Class.displayColumn(
              this.previewTextBuffer.document.line(selection.start.line),
              selection.start.col,
            ) - firstVisibleColumn,
          )
        : 0;
    const focusColumn =
      selection.end.line < firstVisibleRow + viewportHeight
        ? Math.max(
            0,
            TextCoordinates.Class.displayColumn(
              this.previewTextBuffer.document.line(selection.end.line),
              selection.end.col,
            ) - firstVisibleColumn,
          )
        : this.previewViewportWidth();
    this.previewRenderable.setSelectionRange(
      anchorColumn,
      anchorRow,
      focusColumn,
      focusRow,
    );
  }

  protected bindPreviewEvents(): void {
    const previewBody = this.previewRenderable.bodyRenderable;
    previewBody.onMouseDown = (event) => {
      this.focusPreview();
      // ONE hit test per press, shared by every meaning a press can carry, so the modified click,
      // the double click, and the drag can never disagree about what sits under the pointer.
      const reference = this.referenceAt(event.x, event.y);
      const pressIsSecondOnTheSameSpan =
        event.button === 0 &&
        this.previewDoubleClick.recordPressAndDetectDoubleClick(
          // A press away from any reference still resets the gesture: its identity is the CELL,
          // so two presses on ordinary prose never masquerade as a link activation.
          reference?.hit.key ?? `cell:${event.x},${event.y}`,
        ) &&
        reference !== null;
      // OpenTUI exposes terminal Meta/Super mouse modifiers through the SGR alt bit. Supporting
      // ctrl OR alt therefore covers Ctrl-click and terminal Cmd/Meta-click without a second path.
      const pressIsModifiedActivation =
        event.button === 0 &&
        (event.modifiers.ctrl || event.modifiers.alt) &&
        reference !== null;
      if (
        reference &&
        (pressIsModifiedActivation || pressIsSecondOnTheSameSpan)
      ) {
        // invariant: A file reference opens from rendered Markdown (src/modules/markdown/markdown.invariants.md)
        if (reference.path !== null) {
          this.linkNotice.value = null;
          this.options.openReference(reference.path);
        } else {
          // An authored link that cannot open still answers the activation — never silently.
          // invariant: An unresolvable Markdown link states why (src/modules/markdown/markdown.invariants.md)
          this.options.notifyUnresolvedReference(
            reference.hit.target,
            event.x,
            event.y,
            'activate',
          );
        }
        return;
      }
      this.synchronizeRenderedPreviewDocument();
      this.previewViewport.beginDrag(event.x, event.y);
    };
    previewBody.onMouseDrag = (event) =>
      this.previewViewport.dragTo(event.x, event.y);
    previewBody.onMouseUp = () => this.previewViewport.endDrag();
    previewBody.onMouseDragEnd = () => this.previewViewport.endDrag();
    previewBody.onMouseScroll = (event) => {
      this.focusPreview();
      this.previewViewport.handleWheel(event);
    };
    previewBody.onMouseMove = (event) => {
      const reference = this.referenceAt(event.x, event.y);
      this.hoveredReferenceKey.value = reference?.hit.key ?? null;
      this.hoveredReferencePath.value = reference?.path ?? null;
      this.previewRenderable.setHoveredReferenceKey(
        this.hoveredReferenceKey.value,
      );
      if (reference?.path != null) {
        this.options.showReferenceTooltip(reference.path, event.x, event.y);
      } else if (reference) {
        // Hovering an unresolvable authored link explains it before any click is spent.
        this.options.notifyUnresolvedReference(
          reference.hit.target,
          event.x,
          event.y,
          'hover',
        );
      } else {
        this.options.clearReferenceTooltip();
      }
      this.renderer.requestRender();
    };
    previewBody.onMouseOut = () => this.clearHoveredReference();
    this.previewPaneRenderable.onMouseMove = (event) => {
      const pointerIsInsideBody =
        event.x >= previewBody.x &&
        event.x < previewBody.x + previewBody.width &&
        event.y >= previewBody.y &&
        event.y < previewBody.y + previewBody.height;
      if (!pointerIsInsideBody) this.clearHoveredReference();
    };
  }

  protected clearHoveredReference(): void {
    this.hoveredReferenceKey.value = null;
    this.hoveredReferencePath.value = null;
    this.previewRenderable.setHoveredReferenceKey(null);
    this.options.clearReferenceTooltip();
    this.renderer.requestRender();
  }

  clearPointerHover(): void {
    this.clearHoveredReference();
  }

  /** The reference under a cell, resolved where possible. An authored link stays a reference even
   *  when its target does not resolve — the user must hear WHY it will not open. An inline-code
   *  span is only a reference while it resolves; unresolved backtick text is ordinary prose. */
  protected referenceAt(
    screenColumn: number,
    screenRow: number,
  ): { hit: MarkdownReferenceHit; path: string | null } | null {
    const hit = this.previewRenderable.referenceAtCell(screenColumn, screenRow);
    if (!hit) return null;
    const path = this.options.resolveReference(hit.target);
    if (path === null && !hit.explicitLink) return null;
    return { hit, path };
  }

  protected paneExtentWidth(): number {
    const dividerWidth = this.options.viewOnly ? 0 : 1;
    return Math.max(
      2,
      (Number(this.rootRenderable.width) || 80) - dividerWidth,
    );
  }

  protected sourcePaneWidth(): number {
    const ratio = Math.max(
      0.2,
      Math.min(0.8, this.splitRatioSetting.value.value),
    );
    return Math.max(1, Math.round(this.paneExtentWidth() * ratio));
  }

  protected synchronizePaneGeometry(): void {
    if (this.options.viewOnly) {
      this.previewPaneRenderable.width = '100%';
      return;
    }
    const sourcePaneWidth = this.sourcePaneWidth();
    this.options.sourceRenderable.width = sourcePaneWidth;
    this.options.sourceRenderable.height = '100%';
    this.previewPaneRenderable.width = Math.max(
      1,
      this.paneExtentWidth() - sourcePaneWidth,
    );
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
      if (!this.options.viewOnly) {
        this.rootRenderable.remove(this.options.sourceRenderable);
        this.options.sourceRenderable.flexGrow = 1;
        this.options.sourceRenderable.flexShrink = 1;
        this.options.sourceRenderable.width = '100%';
      }
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

export type MarkdownPreviewSide = 'left' | 'right';

export interface MarkdownSplitViewOptions {
  source: MarkdownSource;
  sourcePath: string;
  sourceRenderable: BoxRenderable;
  parentRenderable: BoxRenderable;
  settings: Settings.Instance;
  splitRatioSetting?: RegisteredSetting<number>;
  scrollSyncSetting?: RegisteredSetting<boolean>;
  /** Show only rendered Markdown. The source document stays live but its editor is not mounted. */
  viewOnly?: boolean;
  /** Which side of the source the rendered pane occupies. Defaults to 'left'. */
  previewSide?: MarkdownPreviewSide;
  findBar: FindBar.Instance;
  sourceScrollTop(): number;
  sourceLineAtViewportTop(): number;
  scrollSourceLineToViewportTop(lineIndex: number): void;
  resolveReference(reference: string): string | null;
  referenceIsExternal(reference: string): boolean;
  openReference(path: string): void;
  showReferenceTooltip(
    path: string,
    screenColumn: number,
    screenRow: number,
  ): void;
  clearReferenceTooltip(): void;
  /** State why an authored link cannot open (external scheme, or no such file). `hover` explains
   *  in place; `activate` additionally answers the spent click where the status bar shows it. */
  notifyUnresolvedReference(
    target: string,
    screenColumn: number,
    screenRow: number,
    gesture: 'hover' | 'activate',
  ): void;
}

type MarkdownSplitPane = 'source' | 'preview';

export interface MarkdownPreviewScrollSnapshot {
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly contentRows: number;
  readonly contentColumns: number;
  readonly viewportRows: number;
  readonly viewportColumns: number;
}
