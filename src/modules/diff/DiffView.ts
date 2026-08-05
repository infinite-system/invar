import { Static } from 'ivue/extras';
import {
  BoxRenderable,
  StyledText,
  TextRenderable,
  bg,
  dim,
  fg,
  type BoxOptions,
  type CliRenderer,
  type Renderable,
  type ScrollBarOptions,
  type ScrollBarRenderable,
  type TextChunk,
  type TextOptions,
} from '@opentui/core';
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import { TextCoordinates } from '../text/TextCoordinates';
import { ReadOnlyTextBuffer } from '../text/ReadOnlyTextBuffer';
import { SplitterModel } from '../layout/SplitterModel';
import { SplitterElement } from '../ui/SplitterElement';
import {
  Highlighter,
  type LangId,
  type Role,
  type Span,
} from '../syntax/Highlighter';
import { LanguageRegistry } from '../syntax/LanguageRegistry';
import type { Theme } from '../theme/Theme';
import type { Palette } from '../theme/ThemePalettes';
import { ScrollbarGeometry, type BarGeometry } from '../ui/ScrollbarGeometry';
import { SelectableText } from '../ui/SelectableText';
import {
  SelectionDragBehavior,
  type SelectionDragPosition,
} from '../ui/SelectionDragBehavior';
import { SolidThumbScrollBar } from '../ui/SolidThumbScrollBar';
import {
  Momentum,
  type ScrollMomentum,
  type MomentumOptions,
} from '../system/Momentum';
import { Logging } from '../system/Logging';
import type { Settings } from '../settings/Settings';
import type { RegisteredSetting } from '../settings/SettingContribution.interface';
import type { FindBar, FindBarTarget } from '../search/FindBar';
import type { FindInBufferMatch } from '../search/FindInBuffer';
import {
  DiffAlignment,
  type AlignedRowKind,
  type DiffAlignmentResult,
} from './DiffAlignment';
import type { DocumentSyntaxReader } from '../syntax/DocumentSyntaxSource.interface';

// Standalone side-by-side diff projection. The reviewer supplies callbacks and may mount this under
// any renderable; RootView and tab ownership deliberately remain outside this module.
//
// The shared scroll-coordinate methods are intentionally independent of diff row semantics. They
// are the extraction seam for a future generic synchronized split pane; this module does not build
// that abstraction prematurely.
//
// invariant: Both panes share every aligned row (src/modules/diff/diff.invariants.md)
// invariant: Diff rendering stays viewport bounded (src/modules/diff/diff.invariants.md)
// invariant: One writer per scroll regime per frame (src/modules/ui/ui.invariants.md)
// invariant: A scrollbar track is derived per frame from its region rect (src/modules/ui/ui.invariants.md)
class $DiffView {
  protected static get $overviewKindsByAlignment(): WeakMap<
    DiffAlignmentResult,
    Map<number, readonly (AlignedRowKind | null)[]>
  > {
    const overviewKindsByAlignment = new WeakMap<
      DiffAlignmentResult,
      Map<number, readonly (AlignedRowKind | null)[]>
    >();
    return overviewKindsByAlignment;
  }
  /** Project existing change blocks into one kind per overview-track row without recomputing a diff. */
  static overviewKinds(
    alignment: DiffAlignmentResult,
    trackHeight: number,
  ): Array<AlignedRowKind | null> {
    const normalizedTrackHeight = Math.max(0, Math.floor(trackHeight));
    const totalAlignedRows = alignment.alignedRows.length;
    if (normalizedTrackHeight === 0 || totalAlignedRows === 0) return [];
    let overviewKindsByHeight = this.$overviewKindsByAlignment.get(alignment);
    if (!overviewKindsByHeight) {
      overviewKindsByHeight = new Map();
      this.$overviewKindsByAlignment.set(alignment, overviewKindsByHeight);
    }
    const cachedOverviewKinds = overviewKindsByHeight.get(
      normalizedTrackHeight,
    );
    if (cachedOverviewKinds) return [...cachedOverviewKinds];

    let changeBlockIndex = 0;
    const overviewKinds = Array.from(
      { length: normalizedTrackHeight },
      (_unusedValue, trackRowIndex) => {
        const bandStartAlignedRow =
          (trackRowIndex / normalizedTrackHeight) * totalAlignedRows;
        const bandEndAlignedRow =
          ((trackRowIndex + 1) / normalizedTrackHeight) * totalAlignedRows;
        while (
          changeBlockIndex < alignment.changeBlocks.length &&
          (alignment.changeBlocks[changeBlockIndex]
            ?.endAlignedRowIndexExclusive ?? 0) <= bandStartAlignedRow
        ) {
          changeBlockIndex++;
        }
        const overlappingChangeBlock = alignment.changeBlocks[changeBlockIndex];
        if (
          !overlappingChangeBlock ||
          overlappingChangeBlock.startAlignedRowIndex >= bandEndAlignedRow
        ) {
          return null;
        }
        return (
          alignment.alignedRows[overlappingChangeBlock.startAlignedRowIndex]
            ?.kind ?? null
        );
      },
    );
    overviewKindsByHeight.set(normalizedTrackHeight, overviewKinds);
    return [...overviewKinds];
  }
  constructor(
    public readonly renderer: CliRenderer,
    public readonly theme: Theme.Instance,
    public readonly options: DiffViewOptions,
  ) {
    this.alignment = this.DiffAlignment.align(
      options.previousVersionText,
      options.currentVersionText,
    );
    this.previousVersionLines = this.DiffAlignment.splitLines(
      options.previousVersionText,
    );
    this.currentVersionLines = this.DiffAlignment.splitLines(
      options.currentVersionText,
    );
    this.previousTextBuffer = this.createReadOnlyTextBuffer(
      options.previousVersionPath ?? 'previous version',
      options.previousVersionText,
    );
    this.currentTextBuffer = this.createReadOnlyTextBuffer(
      options.currentVersionPath ?? 'current version',
      options.currentVersionText,
    );
    this.contentWidth = Math.max(
      this.previousTextBuffer.document.maximumLineWidth,
      this.currentTextBuffer.document.maximumLineWidth,
    );
    this.rootRenderable = this.createBoxRenderable({
      id: 'diff-view',
      width: '100%',
      height: '100%',
      flexDirection: 'column',
    });
    this.headerRenderable = this.createTextRenderable({
      id: 'diff-toolbar',
      height: 1,
      width: '100%',
      content: '',
    });
    this.bodyRenderable = this.createBoxRenderable({
      id: 'diff-body',
      flexGrow: 1,
      width: '100%',
      flexDirection: 'row',
      overflow: 'hidden',
    });
    this.previousPaneRenderables = this.createPaneRenderables('previous');
    this.currentPaneRenderables = this.createPaneRenderables('current');
    this.paneSplitterElement = new SplitterElement.Class({
      renderer,
      identifier: 'diff-pane-divider',
      orientation: 'vertical',
      reportUnit: 'ratio',
      initialSize: 0.5,
      minimumSize: 0.15,
      maximumSize: 0.85,
      currentSize: () => this.paneSplitRatio(),
      currentExtentCells: () => this.paneExtentWidth(),
      onSizeChange: (ratio) => {
        if (this.splitRatioSetting) this.splitRatioSetting.value.value = ratio;
        this.update();
      },
      onDragEnd: () => {
        this.splitRatioSetting?.save();
        this.update();
      },
    });
    this.paneSplitter = this.paneSplitterElement.model;
    this.paneDividerRenderable = this.paneSplitterElement.renderable;
    this.overviewRulerRenderable = this.createTextRenderable({
      id: 'diff-overview-ruler',
      content: '',
      position: 'absolute',
      width: 1,
      wrapMode: 'none',
      selectable: false,
    });
    this.verticalScrollbarRenderable = this.createScrollBarRenderable({
      id: 'diff-scrollbar-vertical',
      orientation: 'vertical',
      position: 'absolute',
      width: 1,
      showArrows: false,
      onChange: (reportedPosition) =>
        this.onVerticalScrollbarChanged(reportedPosition),
    });
    this.horizontalScrollbarRenderable = this.createScrollBarRenderable({
      id: 'diff-scrollbar-horizontal',
      orientation: 'horizontal',
      position: 'absolute',
      height: 1,
      showArrows: false,
      onChange: (reportedPosition) =>
        this.onHorizontalScrollbarChanged(reportedPosition),
    });

    this.headerRenderable.onMouseDown = (event) =>
      this.onHeaderMouseDown(event.x);
    this.headerRenderable.onMouseMove = (event) =>
      this.onHeaderMouseMove(event.x, event.y);
    this.headerRenderable.onMouseOut = () => this.options.onClearTooltip?.();
    this.bodyRenderable.onMouseScroll = (event) =>
      this.onBodyMouseScroll(
        event.scroll?.direction,
        event.modifiers.alt || event.modifiers.shift,
      );
    this.previousSelectionDragBehavior =
      this.createSelectionDragBehavior('previous');
    this.currentSelectionDragBehavior =
      this.createSelectionDragBehavior('current');
    this.bindPaneSelectionEvents('previous');
    this.bindPaneSelectionEvents('current');
    this.rootRenderable.add(this.headerRenderable);
    this.bodyRenderable.add(this.previousPaneRenderables.pane);
    this.bodyRenderable.add(this.paneDividerRenderable);
    this.bodyRenderable.add(this.currentPaneRenderables.pane);
    this.bodyRenderable.add(this.overviewRulerRenderable);
    this.bodyRenderable.add(this.verticalScrollbarRenderable);
    this.bodyRenderable.add(this.horizontalScrollbarRenderable);
    this.rootRenderable.add(this.bodyRenderable);
    (options.parentRenderable ?? renderer.root).add(this.rootRenderable);
    this.update();
  }

  protected get DiffAlignment() {
    return DiffAlignment.Class;
  }

  protected get TextCoordinates() {
    return TextCoordinates.Class;
  }

  protected get Highlighter() {
    return Highlighter.Class;
  }

  protected get LanguageRegistry() {
    return LanguageRegistry.Class;
  }

  protected get Momentum() {
    return Momentum.Class;
  }

  protected get ReadOnlyTextBuffer() {
    return ReadOnlyTextBuffer.Class;
  }

  protected get ScrollbarGeometry() {
    return ScrollbarGeometry.Class;
  }

  protected get SelectableText() {
    return SelectableText.Class;
  }

  protected get SelectionDragBehavior() {
    return SelectionDragBehavior.Class;
  }

  protected get SolidThumbScrollBar() {
    return SolidThumbScrollBar.Class;
  }

  protected get SplitterModel() {
    return SplitterModel.Class;
  }

  /** The bright accent for a changed row's GUTTER MARKER (line number tint) — the same hues the git
   *  panel uses for add/modify/delete. Distinct from the row's background fill below. */
  protected changedRowColor(
    kind: AlignedRowKind,
    palette: Palette,
  ): string | null {
    switch (kind) {
      case 'added':
        return palette.added;
      case 'deleted':
        return palette.deleted;
      case 'modified':
        return palette.modified;
      case 'equal':
        return null;
    }
  }

  /** The muted BACKGROUND fill for a changed row — theme-fitting (not the neon accent), so code text on
   *  top stays legible on a near-black editor. Null for unchanged rows (no fill). */
  protected changedRowBackground(
    kind: AlignedRowKind,
    palette: Palette,
  ): string | null {
    switch (kind) {
      case 'added':
        return palette.diffAddedBg;
      case 'deleted':
        return palette.diffDeletedBg;
      case 'modified':
        return palette.diffModifiedBg;
      case 'equal':
        return null;
    }
  }

  protected syntaxRoleColor(role: Role, palette: Palette): string {
    switch (role) {
      case 'keyword':
        return palette.keyword;
      case 'string':
        return palette.string;
      case 'number':
        return palette.number;
      case 'comment':
        return palette.comment;
      case 'func':
        return palette.func;
      case 'type':
        return palette.type;
      case 'operator':
        return palette.operator;
      case 'added':
        return palette.added;
      case 'removed':
        return palette.deleted;
      case 'variable':
        return palette.variable;
      case 'text':
        return palette.fg;
    }
    return palette.fg;
  }

  readonly alignment: DiffAlignmentResult;
  readonly previousVersionLines: readonly string[];
  readonly currentVersionLines: readonly string[];
  readonly contentWidth: number;
  readonly rootRenderable: BoxRenderable;
  protected readonly headerRenderable: TextRenderable;
  protected readonly bodyRenderable: BoxRenderable;
  protected readonly previousPaneRenderables: DiffPaneRenderables;
  protected readonly currentPaneRenderables: DiffPaneRenderables;
  protected readonly paneDividerRenderable: BoxRenderable;
  protected readonly paneSplitter: SplitterModel.Instance;
  protected readonly paneSplitterElement: SplitterElement.Model;
  protected readonly overviewRulerRenderable: TextRenderable;
  protected readonly verticalScrollbarRenderable: ScrollBarRenderable;
  protected readonly horizontalScrollbarRenderable: ScrollBarRenderable;
  protected readonly previousSelectionDragBehavior: SelectionDragBehavior.Model;
  protected readonly currentSelectionDragBehavior: SelectionDragBehavior.Model;
  // Presentation geometry only. Projection and hit-testing share these values, but update() does
  // not mutate reactive model state and therefore cannot create a render-invalidation loop.
  protected headerSegments: HeaderSegment[] = [];
  protected isApplyingScrollbarGeometry = false;
  protected verticalReportedToTrueScale = 1;
  protected horizontalReportedToTrueScale = 1;
  protected activeSelectionSide: 'previous' | 'current' | null = null;
  protected activeSelectionBuffer: ReadOnlyTextBuffer.Model | null = null;
  protected readonly previousTextBuffer: ReadOnlyTextBuffer.Model;
  protected readonly currentTextBuffer: ReadOnlyTextBuffer.Model;
  protected focusedFindSide: 'previous' | 'current' = 'current';
  protected findBarSource: FindBar.Instance | null = null;
  protected findIdentifier = 'diff';

  get alignedRowScrollOffset() {
    return ref(0);
  }
  get horizontalScrollOffset() {
    return ref(0);
  }
  get verticalScrollMomentum() {
    return shallowRef<ScrollMomentum>(this.Momentum.AT_REST);
  }
  get horizontalScrollMomentum() {
    return shallowRef<ScrollMomentum>(this.Momentum.AT_REST);
  }
  get activeChangeBlockNumber() {
    return ref(this.alignment.changeBlocks.length > 0 ? 1 : 0);
  }
  get selectionRevision() {
    return ref(0);
  }

  // Live scroll physics: like Workspace, the fling profile reads its ceiling/gain/friction from the
  // Settings store when attached, so the diff pane obeys the same Ctrl+, tuning as the editor
  // (no restart). Unattached (tests) falls back to the tuned VERTICAL_MOMENTUM default. Both axes use
  // the one profile: a horizontal axis on a slower curve reads as lag next to the vertical fling.
  protected settingsSource: Settings.Instance | null = null;
  protected splitRatioSetting: RegisteredSetting<number> | null = null;
  attachSettings(
    settings: Settings.Instance,
    splitRatioSetting?: RegisteredSetting<number>,
  ): void {
    this.settingsSource = settings;
    this.splitRatioSetting = splitRatioSetting ?? null;
    if (splitRatioSetting) {
      this.paneSplitter.size.value = splitRatioSetting.value.value;
    }
    this.update();
  }
  protected get flingMomentum(): MomentumOptions {
    const settings = this.settingsSource;
    if (!settings) return this.Momentum.verticalOptions;
    return {
      impulse: settings.scrollAccelGain.value,
      max: settings.verticalFlingCeiling.value,
      decayPerSec: settings.scrollFriction.value,
      stopVelocity: this.Momentum.verticalOptions.stopVelocity,
      maximumGlideDurationMilliseconds:
        settings.maximumGlideDurationMilliseconds.value,
    };
  }

  // --- owned-resource seams ---

  createBoxRenderable(options: BoxOptions): BoxRenderable {
    return new BoxRenderable(this.renderer, options);
  }

  createTextRenderable(options: TextOptions): TextRenderable {
    return new TextRenderable(this.renderer, options);
  }

  createScrollBarRenderable(options: ScrollBarOptions): ScrollBarRenderable {
    return new this.SolidThumbScrollBar(this.renderer, options);
  }

  createReadOnlyTextBuffer(
    path: string,
    text: string,
  ): ReadOnlyTextBuffer.Model {
    const textBuffer = new this.ReadOnlyTextBuffer();
    textBuffer.openText(path, text);
    return textBuffer;
  }

  attachFindBar(findBar: FindBar.Instance, identifier: string): void {
    this.findBarSource = findBar;
    this.findIdentifier = identifier;
    this.update();
  }

  findTarget(): FindBarTarget {
    // invariant: Diff panes keep independent find state (src/modules/diff/diff.invariants.md)
    const side = this.focusedFindSide;
    const textBuffer =
      side === 'previous' ? this.previousTextBuffer : this.currentTextBuffer;
    return textBuffer.findTarget(this.findTargetIdentifier(side), (match) =>
      this.revealFindMatch(side, match),
    );
  }

  createPaneRenderables(side: 'previous' | 'current'): DiffPaneRenderables {
    const pane = this.createBoxRenderable({
      id: `diff-${side}-pane`,
      width: '50%',
      height: '100%',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
    });
    const title = this.createTextRenderable({
      id: `diff-${side}-title`,
      width: '100%',
      height: 1,
      content: '',
    });
    const content = this.createBoxRenderable({
      id: `diff-${side}-content`,
      width: '100%',
      flexGrow: 1,
      flexDirection: 'row',
      overflow: 'hidden',
    });
    const gutter = this.createTextRenderable({
      id: `diff-${side}-gutter`,
      content: '',
      wrapMode: 'none',
      selectable: false,
    });
    const code = new this.SelectableText(this.renderer, {
      id: `diff-${side}-code`,
      content: '',
      wrapMode: 'none',
      selectable: false,
      flexGrow: 1,
      overflow: 'hidden',
    });
    content.add(gutter);
    content.add(code);
    pane.add(title);
    pane.add(content);
    return { pane, title, content, gutter, code };
  }

  // --- shared synchronized-scroll substrate ---

  setSharedScrollCoordinate(
    alignedRowIndex: number,
    displayColumnIndex: number,
  ): void {
    this.haltScrollMomentum();
    this.alignedRowScrollOffset.value =
      this.clampAlignedRowOffset(alignedRowIndex);
    this.horizontalScrollOffset.value =
      this.clampHorizontalOffset(displayColumnIndex);
    this.synchronizeActiveChangeBlockNumber();
    this.update();
  }

  impulseVerticalScroll(deltaRows: number): void {
    this.Momentum.queueImpulse(this.verticalScrollMomentum.value, deltaRows);
  }

  impulseHorizontalScroll(deltaColumns: number): void {
    this.Momentum.queueImpulse(
      this.horizontalScrollMomentum.value,
      deltaColumns,
    );
  }

  tickScrollMomentum(deltaTimeSeconds: number): boolean {
    const verticalStep = this.Momentum.stepMomentum(
      this.verticalScrollMomentum.value,
      deltaTimeSeconds,
      this.flingMomentum,
    );
    const horizontalStep = this.Momentum.stepMomentum(
      this.horizontalScrollMomentum.value,
      deltaTimeSeconds,
      this.flingMomentum,
    );
    this.verticalScrollMomentum.value = verticalStep.momentum;
    this.horizontalScrollMomentum.value = horizontalStep.momentum;
    if (verticalStep.rows !== 0) {
      this.alignedRowScrollOffset.value = this.clampAlignedRowOffset(
        this.alignedRowScrollOffset.value + verticalStep.rows,
      );
      this.synchronizeActiveChangeBlockNumber();
    }
    if (horizontalStep.rows !== 0) {
      this.horizontalScrollOffset.value = this.clampHorizontalOffset(
        this.horizontalScrollOffset.value + horizontalStep.rows,
      );
    }
    const selectionAutoscrolling =
      this.previousSelectionDragBehavior.tick(deltaTimeSeconds) ||
      this.currentSelectionDragBehavior.tick(deltaTimeSeconds);
    if (
      verticalStep.rows !== 0 ||
      horizontalStep.rows !== 0 ||
      selectionAutoscrolling
    )
      this.update();
    return (
      this.Momentum.isMoving(verticalStep.momentum) ||
      this.Momentum.isMoving(horizontalStep.momentum) ||
      selectionAutoscrolling
    );
  }

  moveByKeyboardAlignedRows(deltaRows: number): void {
    this.verticalScrollMomentum.value = this.Momentum.halt();
    this.alignedRowScrollOffset.value = this.clampAlignedRowOffset(
      this.alignedRowScrollOffset.value + deltaRows,
    );
    this.synchronizeActiveChangeBlockNumber();
    this.update();
  }

  moveByKeyboardColumns(deltaColumns: number): void {
    this.horizontalScrollMomentum.value = this.Momentum.halt();
    this.horizontalScrollOffset.value = this.clampHorizontalOffset(
      this.horizontalScrollOffset.value + deltaColumns,
    );
    this.update();
  }

  pageByKeyboard(direction: -1 | 1): void {
    this.moveByKeyboardAlignedRows(direction * this.viewportAlignedRowCount());
  }

  haltScrollMomentum(): void {
    this.verticalScrollMomentum.value = this.Momentum.halt();
    this.horizontalScrollMomentum.value = this.Momentum.halt();
  }

  // --- toolbar actions and callback seams ---

  openFull(): void {
    this.options.onOpenFull?.();
  }

  jumpToNextChange(): void {
    const nextAlignedRowIndex =
      this.DiffAlignment.nextChangeBlockStart(
        this.alignment.changeBlocks,
        this.alignedRowScrollOffset.value,
      ) ??
      this.alignment.changeBlocks[0]?.startAlignedRowIndex ??
      null;
    if (nextAlignedRowIndex === null) return;
    this.verticalScrollMomentum.value = this.Momentum.halt();
    this.alignedRowScrollOffset.value =
      this.clampAlignedRowOffset(nextAlignedRowIndex);
    this.activeChangeBlockNumber.value =
      this.changeBlockNumberAt(nextAlignedRowIndex) ?? 0;
    this.update();
    this.options.onNextChange?.(
      this.activeChangeBlockNumber.value,
      this.alignment.changeBlocks.length,
      nextAlignedRowIndex,
    );
  }

  jumpToPreviousChange(): void {
    const previousAlignedRowIndex =
      this.DiffAlignment.previousChangeBlockStart(
        this.alignment.changeBlocks,
        this.alignedRowScrollOffset.value,
      ) ??
      this.alignment.changeBlocks[this.alignment.changeBlocks.length - 1]
        ?.startAlignedRowIndex ??
      null;
    if (previousAlignedRowIndex === null) return;
    this.verticalScrollMomentum.value = this.Momentum.halt();
    this.alignedRowScrollOffset.value = this.clampAlignedRowOffset(
      previousAlignedRowIndex,
    );
    this.activeChangeBlockNumber.value =
      this.changeBlockNumberAt(previousAlignedRowIndex) ?? 0;
    this.update();
    this.options.onPrevChange?.(
      this.activeChangeBlockNumber.value,
      this.alignment.changeBlocks.length,
      previousAlignedRowIndex,
    );
  }

  headerGeometry(): readonly DiffHeaderSegmentGeometry[] {
    const row = Number(this.headerRenderable.y);
    const left = Number(this.headerRenderable.x);
    return this.headerSegments.map((segment) => ({
      kind: segment.kind,
      row,
      startColumn: left + segment.startColumn,
      endColumnExclusive: left + segment.endColumnExclusive,
    }));
  }

  overviewRulerGeometry(): DiffOverviewRulerGeometry | null {
    const bodyWidth = Math.max(1, Number(this.bodyRenderable.width) || 1);
    const bodyHeight = Math.max(1, Number(this.bodyRenderable.height) || 1);
    const geometry = this.ScrollbarGeometry.scrollbarGeometry(
      'vertical',
      { top: 0, left: 0, width: bodyWidth, height: bodyHeight },
      {
        scrollSize: this.alignment.alignedRows.length,
        viewportSize: this.viewportAlignedRowCount(),
        scrollPosition: this.alignedRowScrollOffset.value,
      },
    );
    if (!geometry) return null;
    return {
      top: Number(this.bodyRenderable.y) + geometry.trackTop,
      left: Number(this.bodyRenderable.x) + Math.max(0, geometry.trackLeft - 1),
      height: geometry.trackLength,
    };
  }

  // --- projection ---

  update(): void {
    const palette = this.theme.palette;
    this.synchronizePaneSplitGeometry();
    this.rootRenderable.backgroundColor = palette.bg;
    this.headerRenderable.bg = palette.statusBg;
    this.bodyRenderable.backgroundColor = palette.bg;
    this.paneSplitterElement.updateAppearance(palette);
    this.previousPaneRenderables.title.bg = palette.panel;
    this.currentPaneRenderables.title.bg = palette.panel;
    // invariant: Base and current stay unambiguous (src/modules/diff/diff.invariants.md)
    this.previousPaneRenderables.title.content = new StyledText([
      fg(palette.dim)(
        ` Base (HEAD) — ${this.options.previousVersionPath ?? 'previous version'}`,
      ),
    ]);
    this.currentPaneRenderables.title.content = new StyledText([
      fg(palette.accent)(
        ` Current (working) — ${this.options.currentVersionPath ?? 'current version'}`,
      ),
    ]);
    this.headerRenderable.content = this.renderHeader(palette);

    const previousRenderedPane = this.renderPane('previous', palette);
    const currentRenderedPane = this.renderPane('current', palette);
    this.previousPaneRenderables.gutter.content = previousRenderedPane.gutter;
    this.previousPaneRenderables.code.content = previousRenderedPane.code;
    this.currentPaneRenderables.gutter.content = currentRenderedPane.gutter;
    this.currentPaneRenderables.code.content = currentRenderedPane.code;
    this.previousPaneRenderables.gutter.fg = palette.dim;
    this.previousPaneRenderables.code.fg = palette.fg;
    this.currentPaneRenderables.gutter.fg = palette.dim;
    this.currentPaneRenderables.code.fg = palette.fg;
    this.previousPaneRenderables.code.selectionBg = palette.selection;
    this.currentPaneRenderables.code.selectionBg = palette.selection;
    this.applyPaneSelection('previous');
    this.applyPaneSelection('current');
    this.synchronizeScrollbars(palette);
    this.renderer.requestRender();
  }

  renderHeader(palette: Palette): StyledText {
    // invariant: Base and current stay unambiguous (src/modules/diff/diff.invariants.md)
    const glyphVocabulary = this.theme.glyphVocabulary;
    const openLabel = ' Open current ';
    const previousLabel = ` ${glyphVocabulary.diffPreviousChange} `;
    const nextLabel = ` ${glyphVocabulary.diffNextChange} `;
    const changeCounter = `${this.activeChangeBlockNumber.value} of ${this.alignment.changeBlocks.length} changes`;
    const headerSegments: HeaderSegment[] = [];
    let nextColumn = 0;
    const appendSegment = (
      kind: HeaderSegment['kind'],
      label: string,
      color: string,
    ): TextChunk => {
      const startColumn = nextColumn;
      nextColumn += this.TextCoordinates.lineWidth(label);
      headerSegments.push({
        kind,
        startColumn,
        endColumnExclusive: nextColumn,
      });
      return fg(color)(label);
    };
    const counterText = ` ${changeCounter}`;
    const chunks: TextChunk[] = [fg(palette.fg)(counterText)];
    nextColumn += this.TextCoordinates.lineWidth(counterText);
    const headerWidth = Math.max(
      1,
      Number(this.headerRenderable.width) ||
        Number(this.bodyRenderable.width) ||
        80,
    );
    const laidOutCurrentPaneStart =
      Number(this.currentPaneRenderables.pane.x) -
      Number(this.bodyRenderable.x);
    const ratioCurrentPaneStart = this.previousPaneWidth() + 1;
    const currentPaneStart =
      laidOutCurrentPaneStart > 0
        ? laidOutCurrentPaneStart
        : ratioCurrentPaneStart;
    const actionGroupWidth = this.TextCoordinates.lineWidth(
      previousLabel + nextLabel + openLabel,
    );
    const openSegmentStart = Math.max(
      nextColumn,
      Math.min(currentPaneStart, headerWidth - actionGroupWidth),
      headerWidth - actionGroupWidth,
    );
    if (openSegmentStart > nextColumn) {
      chunks.push(
        fg(palette.statusBg)(' '.repeat(openSegmentStart - nextColumn)),
      );
      nextColumn = openSegmentStart;
    }
    chunks.push(
      appendSegment('previousChange', previousLabel, palette.dim),
      appendSegment('nextChange', nextLabel, palette.dim),
      appendSegment('openFull', openLabel, palette.accent),
    );
    this.headerSegments = headerSegments;
    return new StyledText(chunks);
  }

  renderPane(side: 'previous' | 'current', palette: Palette): RenderedDiffPane {
    // invariant: Diff rendering stays viewport bounded (src/modules/diff/diff.invariants.md)
    const firstAlignedRowIndex = this.alignedRowScrollOffset.value;
    const visibleAlignedRows = this.alignment.alignedRows.slice(
      firstAlignedRowIndex,
      firstAlignedRowIndex + this.viewportAlignedRowCount(),
    );
    const gutterWidth = this.gutterWidth(side);
    const codeViewportWidth = this.codeViewportWidth(side);
    const language = this.languageForSide(side);
    const gutterChunks: TextChunk[] = [];
    const codeChunks: TextChunk[] = [];

    visibleAlignedRows.forEach((alignedRow, visibleAlignedRowIndex) => {
      const lineNumber =
        side === 'previous'
          ? alignedRow.leftLineNumber
          : alignedRow.rightLineNumber;
      const isFillerRow = lineNumber === null;
      // Marker = bright accent for the gutter line-number tint; background = the muted row fill.
      const rowMarkerColor = this.changedRowColor(alignedRow.kind, palette);
      const rowBackgroundColor = this.changedRowBackground(
        alignedRow.kind,
        palette,
      );
      const gutterText = isFillerRow
        ? ' '.repeat(gutterWidth)
        : `${String(lineNumber).padStart(gutterWidth - 1, ' ')} `;
      const gutterChunk = fg(
        isFillerRow ? palette.dim : (rowMarkerColor ?? palette.dim),
      )(gutterText);
      gutterChunks.push(
        isFillerRow
          ? dim(
              rowBackgroundColor
                ? bg(rowBackgroundColor)(gutterChunk)
                : gutterChunk,
            )
          : rowBackgroundColor
            ? bg(rowBackgroundColor)(gutterChunk)
            : gutterChunk,
      );

      // Unified-diff prefix in the first code column: '+' added, '-' removed, ' ' otherwise. A
      // modified row shows '-' on the previous (old) side and '+' on the current (new) side. One cell
      // is reserved for it so every row's code aligns.
      const diffPrefix = isFillerRow
        ? ' '
        : alignedRow.kind === 'added'
          ? '+'
          : alignedRow.kind === 'deleted'
            ? '-'
            : alignedRow.kind === 'modified'
              ? side === 'previous'
                ? '-'
                : '+'
              : ' ';
      const prefixChunk = fg(rowMarkerColor ?? palette.dim)(diffPrefix);
      codeChunks.push(
        rowBackgroundColor ? bg(rowBackgroundColor)(prefixChunk) : prefixChunk,
      );
      const codeContentWidth = Math.max(1, codeViewportWidth - 1);

      if (isFillerRow) {
        const fillerChunk = dim(fg(palette.dim)(' '.repeat(codeContentWidth)));
        codeChunks.push(
          rowBackgroundColor
            ? bg(rowBackgroundColor)(fillerChunk)
            : fillerChunk,
        );
      } else {
        const sourceLine = this.lineForSide(side, lineNumber);
        const visibleLineWindow = this.sliceLineWindowDetails(
          sourceLine,
          codeContentWidth,
        );
        const visibleLine = visibleLineWindow.text;
        const lineChunks = this.highlightLine(
          visibleLine,
          language,
          palette,
          rowBackgroundColor,
          side,
          lineNumber - 1,
          visibleLineWindow.startGrapheme,
          this.options.documentSyntax?.spansForLine(
            side === 'previous'
              ? this.previousTextBuffer.document
              : this.currentTextBuffer.document,
            lineNumber - 1,
          ),
        );
        codeChunks.push(...lineChunks);
        const remainingColumns = Math.max(
          0,
          codeContentWidth - this.TextCoordinates.lineWidth(visibleLine),
        );
        if (remainingColumns > 0) {
          const paddingChunk = fg(palette.fg)(' '.repeat(remainingColumns));
          codeChunks.push(
            rowBackgroundColor
              ? bg(rowBackgroundColor)(paddingChunk)
              : paddingChunk,
          );
        }
      }

      if (visibleAlignedRowIndex < visibleAlignedRows.length - 1) {
        gutterChunks.push(fg(palette.fg)('\n'));
        codeChunks.push(fg(palette.fg)('\n'));
      }
    });
    return {
      gutter: new StyledText(gutterChunks),
      code: new StyledText(codeChunks),
    };
  }

  highlightLine(
    visibleLine: string,
    language: LangId,
    palette: Palette,
    rowBackgroundColor: string | null,
    side?: 'previous' | 'current',
    lineIndex?: number,
    visibleStartGrapheme = 0,
    logicalLineSpans?: readonly Span[],
  ): TextChunk[] {
    // The optional spans come from the same document syntax source used by the editable view.
    const findEngine = side
      ? this.findBarSource?.engineFor(this.findTargetIdentifier(side))
      : null;
    const lineMatches =
      lineIndex === undefined
        ? []
        : (findEngine?.matches.value.filter(
            (match) => match.line === lineIndex,
          ) ?? []);
    const visibleGraphemeCount =
      this.TextCoordinates.graphemeCount(visibleLine);
    const visibleSpans = logicalLineSpans
      ? this.Highlighter.sliceSpans(
          logicalLineSpans,
          visibleStartGrapheme,
          visibleStartGrapheme + visibleGraphemeCount,
        )
      : this.Highlighter.highlightLine(visibleLine, language);
    const boundaries = new Set<number>([0, visibleGraphemeCount]);
    for (const match of lineMatches) {
      boundaries.add(
        Math.max(
          0,
          Math.min(
            visibleGraphemeCount,
            match.startColumn - visibleStartGrapheme,
          ),
        ),
      );
      boundaries.add(
        Math.max(
          0,
          Math.min(
            visibleGraphemeCount,
            match.endColumn - visibleStartGrapheme,
          ),
        ),
      );
    }
    const orderedBoundaries = [...boundaries].sort(
      (first, second) => first - second,
    );
    const chunks: TextChunk[] = [];
    for (
      let boundaryIndex = 0;
      boundaryIndex < orderedBoundaries.length - 1;
      boundaryIndex += 1
    ) {
      const segmentStart = orderedBoundaries[boundaryIndex]!;
      const segmentEnd = orderedBoundaries[boundaryIndex + 1]!;
      if (segmentEnd <= segmentStart) continue;
      const segmentText = visibleLine.slice(
        this.TextCoordinates.graphemeToU16(visibleLine, segmentStart),
        this.TextCoordinates.graphemeToU16(visibleLine, segmentEnd),
      );
      const findHighlighted = lineMatches.some(
        (match) =>
          match.startColumn < visibleStartGrapheme + segmentEnd &&
          match.endColumn > visibleStartGrapheme + segmentStart,
      );
      for (const highlightedSpan of this.Highlighter.sliceSpans(
        visibleSpans,
        segmentStart,
        segmentEnd,
      )) {
        let syntaxChunk = fg(
          this.syntaxRoleColor(highlightedSpan.role, palette),
        )(highlightedSpan.text);
        if (findHighlighted) syntaxChunk = bg(palette.cursorLine)(syntaxChunk);
        else if (rowBackgroundColor)
          syntaxChunk = bg(rowBackgroundColor)(syntaxChunk);
        chunks.push(syntaxChunk);
      }
    }
    return chunks;
  }

  sliceLineWindow(sourceLine: string, codeViewportWidth: number): string {
    return this.sliceLineWindowDetails(sourceLine, codeViewportWidth).text;
  }

  protected sliceLineWindowDetails(
    sourceLine: string,
    codeViewportWidth: number,
  ): { text: string; startGrapheme: number } {
    const horizontalScrollOffset = this.horizontalScrollOffset.value;
    if (
      horizontalScrollOffset === 0 &&
      sourceLine.length <= codeViewportWidth
    ) {
      return { text: sourceLine, startGrapheme: 0 };
    }
    let startGraphemeIndex = this.TextCoordinates.graphemeAtDisplayColumn(
      sourceLine,
      horizontalScrollOffset,
    );
    if (
      this.TextCoordinates.displayColumn(sourceLine, startGraphemeIndex) <
      horizontalScrollOffset
    ) {
      startGraphemeIndex++;
    }
    const endGraphemeIndex =
      this.TextCoordinates.graphemeAtDisplayColumn(
        sourceLine,
        horizontalScrollOffset + codeViewportWidth,
      ) + 1;
    return {
      text: sourceLine.slice(
        this.TextCoordinates.graphemeToU16(sourceLine, startGraphemeIndex),
        this.TextCoordinates.graphemeToU16(sourceLine, endGraphemeIndex),
      ),
      startGrapheme: startGraphemeIndex,
    };
  }

  synchronizeScrollbars(palette: Palette): void {
    const bodyWidth = Math.max(1, Number(this.bodyRenderable.width) || 1);
    const bodyHeight = Math.max(1, Number(this.bodyRenderable.height) || 1);
    const region = { top: 0, left: 0, width: bodyWidth, height: bodyHeight };
    const verticalScrollState = {
      scrollSize: this.alignment.alignedRows.length,
      viewportSize: this.viewportAlignedRowCount(),
      scrollPosition: this.alignedRowScrollOffset.value,
    };
    const verticalGeometry = this.ScrollbarGeometry.scrollbarGeometry(
      'vertical',
      region,
      verticalScrollState,
    );
    this.verticalScrollbarRenderable.slider.backgroundColor = palette.panel;
    this.verticalScrollbarRenderable.slider.foregroundColor = palette.dim;
    this.horizontalScrollbarRenderable.slider.backgroundColor = palette.panel;
    this.horizontalScrollbarRenderable.slider.foregroundColor = palette.dim;
    if (process.env.TUI_DEBUG_BARS === '1') {
      Logging.Class.info(
        `bar ${this.verticalScrollbarRenderable.id}: ` +
          `scrollSize=${verticalScrollState.scrollSize} ` +
          `viewportSize=${verticalScrollState.viewportSize} ` +
          `scrollPosition=${verticalScrollState.scrollPosition}`,
      );
    }
    this.applyScrollbarGeometry(
      this.verticalScrollbarRenderable,
      'vertical',
      verticalGeometry,
      this.alignment.alignedRows.length,
    );
    this.synchronizeOverviewRuler(verticalGeometry, palette);
    this.applyScrollbarGeometry(
      this.horizontalScrollbarRenderable,
      'horizontal',
      this.ScrollbarGeometry.scrollbarGeometry('horizontal', region, {
        scrollSize: this.contentWidth,
        viewportSize: this.sharedCodeViewportWidth(),
        scrollPosition: this.horizontalScrollOffset.value,
      }),
      this.contentWidth,
    );
  }

  protected synchronizeOverviewRuler(
    verticalGeometry: BarGeometry | null,
    palette: Palette,
  ): void {
    // invariant: The overview ruler locates every change block (src/modules/diff/diff.invariants.md)
    if (!verticalGeometry) {
      this.overviewRulerRenderable.visible = false;
      this.overviewRulerRenderable.content = '';
      return;
    }
    this.overviewRulerRenderable.visible = true;
    this.overviewRulerRenderable.top = verticalGeometry.trackTop;
    this.overviewRulerRenderable.left = Math.max(
      0,
      verticalGeometry.trackLeft - 1,
    );
    this.overviewRulerRenderable.height = verticalGeometry.trackLength;
    const diffViewClass = this.constructor as typeof $DiffView;
    const overviewKinds = diffViewClass.overviewKinds(
      this.alignment,
      verticalGeometry.trackLength,
    );
    const overviewChunks: TextChunk[] = [];
    overviewKinds.forEach((kind, trackRowIndex) => {
      const color = kind ? this.changedRowColor(kind, palette) : null;
      overviewChunks.push(
        bg(color ?? palette.panel)(fg(color ?? palette.panel)(' ')),
      );
      if (trackRowIndex < overviewKinds.length - 1)
        overviewChunks.push(fg(palette.panel)('\n'));
    });
    this.overviewRulerRenderable.content = new StyledText(overviewChunks);
  }

  applyScrollbarGeometry(
    scrollbarRenderable: ScrollBarRenderable,
    orientation: 'vertical' | 'horizontal',
    geometry: BarGeometry | null,
    scrollSize: number,
  ): void {
    if (!geometry) {
      scrollbarRenderable.visible = false;
      scrollbarRenderable.scrollSize = 0;
      if (orientation === 'vertical') this.verticalReportedToTrueScale = 0;
      else this.horizontalReportedToTrueScale = 0;
      return;
    }
    scrollbarRenderable.visible = true;
    scrollbarRenderable.top = geometry.trackTop;
    scrollbarRenderable.left = geometry.trackLeft;
    if (orientation === 'vertical')
      scrollbarRenderable.height = geometry.trackLength;
    else scrollbarRenderable.width = geometry.trackLength;
    this.isApplyingScrollbarGeometry = true;
    try {
      scrollbarRenderable.scrollSize = scrollSize;
      scrollbarRenderable.viewportSize = geometry.reportedViewportSize;
      scrollbarRenderable.scrollPosition = geometry.reportedPosition;
    } finally {
      this.isApplyingScrollbarGeometry = false;
    }
    if (orientation === 'vertical')
      this.verticalReportedToTrueScale = geometry.reportedToTrueScale;
    else this.horizontalReportedToTrueScale = geometry.reportedToTrueScale;
  }

  // --- draggable persisted pane split ---

  protected paneExtentWidth(): number {
    // One divider cell plus one overview-ruler cell and one vertical-scrollbar cell are outside the
    // two pane widths. The ruler and scrollbar are absolute, but reserving them keeps current text
    // from rendering beneath the scroll axis.
    //
    // On the FIRST frame Yoga has not measured the flex-sized bodyRenderable yet, so its `.width` is 0.
    // Falling back to a hardcoded 80 there sized both panes to ~80/actual (≈60%) until the next frame
    // corrected it. Instead fall back to the DEFINITE-size parent host (diffContainer, laid out before
    // the diff opened) — then the renderer width — so the extent is correct on frame 1.
    const measuredBodyWidth = Number(this.bodyRenderable.width) || 0;
    const parentHost = this.options.parentRenderable ?? this.renderer.root;
    const extentWidth =
      measuredBodyWidth ||
      Number(parentHost.width) ||
      Number(this.renderer.width) ||
      80;
    return Math.max(2, extentWidth - 3);
  }

  protected paneSplitRatio(): number {
    const ratio =
      this.splitRatioSetting?.value.value ?? this.paneSplitter.size.value;
    return Math.max(0.15, Math.min(0.85, ratio));
  }

  protected previousPaneWidth(): number {
    return Math.max(
      1,
      Math.round(this.paneExtentWidth() * this.paneSplitRatio()),
    );
  }

  protected synchronizePaneSplitGeometry(): void {
    // invariant: The diff pane split stays draggable and persistent (src/modules/diff/diff.invariants.md)
    const previousPaneWidth = this.previousPaneWidth();
    this.previousPaneRenderables.pane.width = previousPaneWidth;
    this.currentPaneRenderables.pane.width = Math.max(
      1,
      this.paneExtentWidth() - previousPaneWidth,
    );
    this.paneSplitter.setExtentCells(this.paneExtentWidth());
  }

  // --- editor-parity selection and drag autoscroll ---

  protected paneRenderables(side: 'previous' | 'current'): DiffPaneRenderables {
    return side === 'previous'
      ? this.previousPaneRenderables
      : this.currentPaneRenderables;
  }

  protected createSelectionDragBehavior(
    side: 'previous' | 'current',
  ): SelectionDragBehavior.Model {
    // invariant: Diff selection reuses shared drag behavior (src/modules/diff/diff.invariants.md)
    return new this.SelectionDragBehavior({
      viewportRectangle: () => {
        const codeRenderable = this.paneRenderables(side).code;
        return {
          leftColumn: codeRenderable.x,
          rightColumn:
            codeRenderable.x + Math.max(1, this.codeViewportWidth(side)) - 1,
          topRow: codeRenderable.y,
          bottomRow:
            codeRenderable.y + Math.max(1, this.viewportAlignedRowCount()) - 1,
        };
      },
      positionAtCell: (screenColumn, screenRow) =>
        this.selectionPositionAtCell(side, screenColumn, screenRow),
      horizontalScrollPosition: () => this.horizontalScrollOffset.value,
      horizontalScrollingEnabled: () => true,
      lineGraphemeCount: (lineIndex) =>
        this.activeSelectionBuffer
          ? this.TextCoordinates.graphemeCount(
              this.activeSelectionBuffer.document.line(lineIndex),
            )
          : 0,
      beginSelection: (position, pointerDisplayColumn) => {
        this.activateSelection(side, position, pointerDisplayColumn);
      },
      extendSelection: (position, pointerDisplayColumn) => {
        if (this.activeSelectionSide !== side || !this.activeSelectionBuffer)
          return;
        this.activeSelectionBuffer.cursor.set(
          position.line,
          position.column,
          pointerDisplayColumn,
        );
        this.selectionRevision.value += 1;
        this.update();
      },
      finishSelection: () => {
        if (this.activeSelectionSide !== side || !this.activeSelectionBuffer)
          return;
        if (!this.activeSelectionBuffer.cursor.hasSelection) {
          this.activeSelectionBuffer.cursor.clearSelection();
        }
        this.selectionRevision.value += 1;
        this.update();
      },
      scrollColumns: (columnDelta) => {
        this.horizontalScrollOffset.value = this.clampHorizontalOffset(
          this.horizontalScrollOffset.value + columnDelta,
        );
      },
      scrollRows: (rowDelta) => {
        this.alignedRowScrollOffset.value = this.clampAlignedRowOffset(
          this.alignedRowScrollOffset.value + rowDelta,
        );
        this.synchronizeActiveChangeBlockNumber();
      },
      haltCompetingScroll: () => this.haltScrollMomentum(),
    });
  }

  protected bindPaneSelectionEvents(side: 'previous' | 'current'): void {
    const codeRenderable = this.paneRenderables(side).code;
    const selectionDragBehavior =
      side === 'previous'
        ? this.previousSelectionDragBehavior
        : this.currentSelectionDragBehavior;
    codeRenderable.onMouseDown = (event) =>
      selectionDragBehavior.begin(event.x, event.y);
    codeRenderable.onMouseDrag = (event) =>
      selectionDragBehavior.drag(event.x, event.y);
    codeRenderable.onMouseUp = () => selectionDragBehavior.end();
    codeRenderable.onMouseDragEnd = () => selectionDragBehavior.end();
  }

  protected selectionPositionAtCell(
    side: 'previous' | 'current',
    screenColumn: number,
    screenRow: number,
  ): SelectionDragPosition | null {
    const codeRenderable = this.paneRenderables(side).code;
    const visibleRowIndex = Math.max(
      0,
      Math.min(
        screenRow - codeRenderable.y,
        this.viewportAlignedRowCount() - 1,
      ),
    );
    const alignedRowIndex = Math.max(
      0,
      Math.min(
        this.alignedRowScrollOffset.value + visibleRowIndex,
        this.alignment.alignedRows.length - 1,
      ),
    );
    const lineNumber = this.nearestLineNumber(side, alignedRowIndex);
    if (lineNumber === null) return null;
    const sourceLine = this.lineForSide(side, lineNumber);
    // The first code cell is the unified-diff prefix (+/-/space), so the code content starts one cell
    // right of the renderable — subtract that prefix column when mapping the pointer to a source column.
    const displayColumn =
      this.horizontalScrollOffset.value +
      Math.max(0, screenColumn - codeRenderable.x - 1);
    return {
      line: lineNumber - 1,
      column: this.TextCoordinates.graphemeAtDisplayColumn(
        sourceLine,
        displayColumn,
      ),
    };
  }

  protected nearestLineNumber(
    side: 'previous' | 'current',
    alignedRowIndex: number,
  ): number | null {
    const lineNumberAt = (candidateAlignedRowIndex: number): number | null => {
      const alignedRow = this.alignment.alignedRows[candidateAlignedRowIndex];
      if (!alignedRow) return null;
      return side === 'previous'
        ? alignedRow.leftLineNumber
        : alignedRow.rightLineNumber;
    };
    const directLineNumber = lineNumberAt(alignedRowIndex);
    if (directLineNumber !== null) return directLineNumber;
    for (
      let distance = 1;
      distance < this.alignment.alignedRows.length;
      distance += 1
    ) {
      const precedingLineNumber = lineNumberAt(alignedRowIndex - distance);
      if (precedingLineNumber !== null) return precedingLineNumber;
      const followingLineNumber = lineNumberAt(alignedRowIndex + distance);
      if (followingLineNumber !== null) return followingLineNumber;
    }
    return null;
  }

  protected activateSelection(
    side: 'previous' | 'current',
    position: SelectionDragPosition,
    pointerDisplayColumn: number,
  ): void {
    this.focusedFindSide = side;
    if (side === 'previous') this.currentSelectionDragBehavior.end();
    else this.previousSelectionDragBehavior.end();
    this.previousTextBuffer.cursor.clearSelection();
    this.currentTextBuffer.cursor.clearSelection();
    this.activeSelectionBuffer =
      side === 'previous' ? this.previousTextBuffer : this.currentTextBuffer;
    this.activeSelectionSide = side;
    this.activeSelectionBuffer.cursor.set(
      position.line,
      position.column,
      pointerDisplayColumn,
    );
    this.activeSelectionBuffer.cursor.setAnchorHere();
    this.selectionRevision.value += 1;
    this.update();
  }

  protected findTargetIdentifier(side: 'previous' | 'current'): string {
    return `${this.findIdentifier}:${side}`;
  }

  protected revealFindMatch(
    side: 'previous' | 'current',
    match: FindInBufferMatch,
  ): void {
    this.focusedFindSide = side;
    const matchingAlignedRowIndex = this.alignment.alignedRows.findIndex(
      (alignedRow) => {
        const lineNumber =
          side === 'previous'
            ? alignedRow.leftLineNumber
            : alignedRow.rightLineNumber;
        return lineNumber === match.line + 1;
      },
    );
    if (matchingAlignedRowIndex >= 0) {
      this.alignedRowScrollOffset.value = this.clampAlignedRowOffset(
        matchingAlignedRowIndex,
      );
    }
    this.activateSelection(
      side,
      { line: match.line, column: match.endColumn },
      match.endColumn,
    );
    if (this.activeSelectionBuffer) {
      this.activeSelectionBuffer.cursor.anchor.value = {
        line: match.line,
        col: match.startColumn,
      };
    }
    this.selectionRevision.value += 1;
    this.update();
  }

  selectionCharacterCount(): number {
    void this.selectionRevision.value;
    return this.activeSelectionBuffer?.selectionText().length ?? 0;
  }

  selectionRange(): {
    side: 'previous' | 'current';
    start: { line: number; col: number };
    end: { line: number; col: number };
  } | null {
    void this.selectionRevision.value;
    const range = this.activeSelectionBuffer?.cursor.selectionRange();
    if (!range || !this.activeSelectionSide) return null;
    return {
      side: this.activeSelectionSide,
      start: range.start,
      end: range.end,
    };
  }

  /** Select the whole of whichever read-only side currently owns the selection. No side selected yet
   *  means there is nothing to select all OF, so it is a no-op rather than an arbitrary choice.
   *  invariant: Diff panes keep independent find state (src/modules/diff/diff.invariants.md) */
  selectAllInActivePane(): void {
    this.activeSelectionBuffer?.selectAll();
  }

  async copySelection(): Promise<number> {
    return this.activeSelectionBuffer?.copySelection() ?? 0;
  }

  protected applyPaneSelection(side: 'previous' | 'current'): void {
    const codeRenderable = this.paneRenderables(side).code;
    const selectionRange = this.activeSelectionBuffer?.cursor.selectionRange();
    if (this.activeSelectionSide !== side || !selectionRange) {
      codeRenderable.clearSelectionRange();
      return;
    }
    const inclusiveEndLine =
      selectionRange.end.col === 0 &&
      selectionRange.end.line > selectionRange.start.line
        ? selectionRange.end.line - 1
        : selectionRange.end.line;
    const visibleAlignedRows = this.alignment.alignedRows.slice(
      this.alignedRowScrollOffset.value,
      this.alignedRowScrollOffset.value + this.viewportAlignedRowCount(),
    );
    const selectedVisibleRows = visibleAlignedRows
      .map((alignedRow, visibleRowIndex) => ({
        visibleRowIndex,
        lineNumber:
          side === 'previous'
            ? alignedRow.leftLineNumber
            : alignedRow.rightLineNumber,
      }))
      .filter(
        (entry): entry is { visibleRowIndex: number; lineNumber: number } =>
          entry.lineNumber !== null &&
          entry.lineNumber - 1 >= selectionRange.start.line &&
          entry.lineNumber - 1 <= inclusiveEndLine,
      );
    const firstSelectedVisibleRow = selectedVisibleRows[0];
    const lastSelectedVisibleRow =
      selectedVisibleRows[selectedVisibleRows.length - 1];
    if (!firstSelectedVisibleRow || !lastSelectedVisibleRow) {
      codeRenderable.clearSelectionRange();
      return;
    }
    const viewportWidth = this.codeViewportWidth(side);
    const firstLineIndex = firstSelectedVisibleRow.lineNumber - 1;
    const lastLineIndex = lastSelectedVisibleRow.lineNumber - 1;
    const startDisplayColumn =
      firstLineIndex === selectionRange.start.line
        ? this.TextCoordinates.displayColumn(
            this.lineForSide(side, firstSelectedVisibleRow.lineNumber),
            selectionRange.start.col,
          ) - this.horizontalScrollOffset.value
        : 0;
    const endDisplayColumn =
      lastLineIndex === selectionRange.end.line
        ? this.TextCoordinates.displayColumn(
            this.lineForSide(side, lastSelectedVisibleRow.lineNumber),
            selectionRange.end.col,
          ) - this.horizontalScrollOffset.value
        : viewportWidth;
    // Shift the highlight right by the unified-diff prefix column so it lands over the code, not the
    // +/- marker (mirrors the -1 the pointer hit-test applies).
    const diffPrefixColumns = 1;
    codeRenderable.setSelectionRange(
      diffPrefixColumns +
        Math.max(
          0,
          Math.min(startDisplayColumn, viewportWidth - diffPrefixColumns),
        ),
      firstSelectedVisibleRow.visibleRowIndex,
      diffPrefixColumns +
        Math.max(
          0,
          Math.min(endDisplayColumn, viewportWidth - diffPrefixColumns),
        ),
      lastSelectedVisibleRow.visibleRowIndex,
    );
  }

  // --- input normalization ---

  onHeaderMouseDown(screenColumn: number): void {
    const localColumn = screenColumn - this.headerRenderable.x;
    const headerSegment = this.headerSegments.find(
      (segment) =>
        localColumn >= segment.startColumn &&
        localColumn < segment.endColumnExclusive,
    );
    if (headerSegment?.kind === 'openFull') this.openFull();
    else if (headerSegment?.kind === 'nextChange') this.jumpToNextChange();
    else if (headerSegment?.kind === 'previousChange')
      this.jumpToPreviousChange();
  }

  onHeaderMouseMove(screenColumn: number, screenRow: number): void {
    const localColumn = screenColumn - this.headerRenderable.x;
    const headerSegment = this.headerSegments.find(
      (segment) =>
        localColumn >= segment.startColumn &&
        localColumn < segment.endColumnExclusive,
    );
    if (headerSegment?.kind === 'previousChange') {
      this.options.onPointTooltip?.('Previous change', screenColumn, screenRow);
    } else if (headerSegment?.kind === 'nextChange') {
      this.options.onPointTooltip?.('Next change', screenColumn, screenRow);
    } else {
      this.options.onClearTooltip?.();
    }
  }

  onBodyMouseScroll(
    direction: 'up' | 'down' | 'left' | 'right' | undefined,
    isHorizontalModifierPressed: boolean,
  ): void {
    const isHorizontalDirection =
      direction === 'left' ||
      direction === 'right' ||
      isHorizontalModifierPressed;
    if (isHorizontalDirection) {
      this.impulseHorizontalScroll(
        direction === 'left' || direction === 'up' ? -1 : 1,
      );
    } else {
      this.impulseVerticalScroll(direction === 'up' ? -1 : 1);
    }
  }

  onVerticalScrollbarChanged(reportedPosition: number): void {
    if (this.isApplyingScrollbarGeometry) return;
    this.verticalScrollMomentum.value = this.Momentum.halt();
    this.alignedRowScrollOffset.value = this.clampAlignedRowOffset(
      Math.round(reportedPosition * this.verticalReportedToTrueScale),
    );
    this.synchronizeActiveChangeBlockNumber();
    this.update();
  }

  onHorizontalScrollbarChanged(reportedPosition: number): void {
    if (this.isApplyingScrollbarGeometry) return;
    this.horizontalScrollMomentum.value = this.Momentum.halt();
    this.horizontalScrollOffset.value = this.clampHorizontalOffset(
      Math.round(reportedPosition * this.horizontalReportedToTrueScale),
    );
    this.update();
  }

  // --- derived geometry and data ---

  viewportAlignedRowCount(): number {
    const bodyHeight =
      Number(this.bodyRenderable.height) ||
      Number(this.rootRenderable.height) - 1;
    return Math.max(1, bodyHeight - 2);
  }

  codeViewportWidth(side: 'previous' | 'current'): number {
    const laidOutCodeWidth = Number(this.paneRenderables(side).code.width) || 0;
    if (laidOutCodeWidth > 1) return Math.max(1, laidOutCodeWidth - 1);
    const fallbackPaneWidth =
      side === 'previous'
        ? this.previousPaneWidth()
        : this.paneExtentWidth() - this.previousPaneWidth();
    return Math.max(1, fallbackPaneWidth - this.gutterWidth(side));
  }

  sharedCodeViewportWidth(): number {
    return Math.min(
      this.codeViewportWidth('previous'),
      this.codeViewportWidth('current'),
    );
  }

  gutterWidth(side: 'previous' | 'current'): number {
    const lineCount =
      side === 'previous'
        ? this.previousVersionLines.length
        : this.currentVersionLines.length;
    return Math.max(2, String(Math.max(1, lineCount)).length + 1);
  }

  lineForSide(side: 'previous' | 'current', lineNumber: number): string {
    const lines =
      side === 'previous'
        ? this.previousVersionLines
        : this.currentVersionLines;
    return lines[lineNumber - 1] ?? '';
  }

  languageForSide(side: 'previous' | 'current'): LangId {
    const path =
      side === 'previous'
        ? this.options.previousVersionPath
        : this.options.currentVersionPath;
    return this.LanguageRegistry.forPath(path ?? 'diff.txt');
  }

  clampAlignedRowOffset(alignedRowIndex: number): number {
    const maximumAlignedRowOffset = Math.max(
      0,
      this.alignment.alignedRows.length - this.viewportAlignedRowCount(),
    );
    return Math.max(
      0,
      Math.min(Math.round(alignedRowIndex), maximumAlignedRowOffset),
    );
  }

  clampHorizontalOffset(displayColumnIndex: number): number {
    const maximumHorizontalOffset = Math.max(
      0,
      this.contentWidth - this.sharedCodeViewportWidth(),
    );
    return Math.max(
      0,
      Math.min(Math.round(displayColumnIndex), maximumHorizontalOffset),
    );
  }

  synchronizeActiveChangeBlockNumber(): void {
    if (this.alignment.changeBlocks.length === 0) {
      this.activeChangeBlockNumber.value = 0;
      return;
    }
    const alignedRowIndex = this.alignedRowScrollOffset.value;
    const followingChangeBlockIndex =
      this.changeBlockIndexAtOrAfter(alignedRowIndex);
    this.activeChangeBlockNumber.value =
      followingChangeBlockIndex < this.alignment.changeBlocks.length
        ? followingChangeBlockIndex + 1
        : this.alignment.changeBlocks.length;
  }

  changeBlockNumberAt(alignedRowIndex: number): number | null {
    const candidateChangeBlockIndex =
      this.changeBlockIndexAtOrAfter(alignedRowIndex);
    const candidateChangeBlock =
      this.alignment.changeBlocks[candidateChangeBlockIndex];
    return candidateChangeBlock &&
      alignedRowIndex >= candidateChangeBlock.startAlignedRowIndex &&
      alignedRowIndex < candidateChangeBlock.endAlignedRowIndexExclusive
      ? candidateChangeBlockIndex + 1
      : null;
  }

  protected changeBlockIndexAtOrAfter(alignedRowIndex: number): number {
    let lowerBoundIndex = 0;
    let upperBoundIndex = this.alignment.changeBlocks.length;
    while (lowerBoundIndex < upperBoundIndex) {
      const middleIndex = Math.floor((lowerBoundIndex + upperBoundIndex) / 2);
      const middleChangeBlock = this.alignment.changeBlocks[middleIndex];
      if (
        middleChangeBlock &&
        middleChangeBlock.endAlignedRowIndexExclusive <= alignedRowIndex
      ) {
        lowerBoundIndex = middleIndex + 1;
      } else {
        upperBoundIndex = middleIndex;
      }
    }
    return lowerBoundIndex;
  }

  dispose(): void {
    try {
      this.activeSelectionBuffer = null;
      this.previousTextBuffer.dispose();
      this.currentTextBuffer.dispose();
      (this.options.parentRenderable ?? this.renderer.root).remove(
        this.rootRenderable,
      );
      this.rootRenderable.destroyRecursively();
    } catch {
      // Disposal is idempotent from the caller's perspective.
    }
  }
}

export namespace DiffView {
  export const $Class = Static($DiffView);
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface DiffViewCallbacks {
  onOpenFull?: () => void;
  onNextChange?: (
    changeNumber: number,
    totalChanges: number,
    alignedRowIndex: number,
  ) => void;
  onPrevChange?: (
    changeNumber: number,
    totalChanges: number,
    alignedRowIndex: number,
  ) => void;
  onPointTooltip?: (text: string, column: number, row: number) => void;
  onClearTooltip?: () => void;
}

export interface DiffViewOptions extends DiffViewCallbacks {
  previousVersionText: string;
  currentVersionText: string;
  previousVersionPath?: string;
  currentVersionPath?: string;
  documentSyntax?: DocumentSyntaxReader;
  parentRenderable?: Renderable;
}

export interface DiffHeaderSegmentGeometry {
  readonly kind: 'openFull' | 'nextChange' | 'previousChange';
  readonly row: number;
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

export interface DiffOverviewRulerGeometry {
  readonly top: number;
  readonly left: number;
  readonly height: number;
}

interface HeaderSegment {
  kind: 'openFull' | 'nextChange' | 'previousChange';
  startColumn: number;
  endColumnExclusive: number;
}

interface RenderedDiffPane {
  gutter: StyledText;
  code: StyledText;
}

interface DiffPaneRenderables {
  pane: BoxRenderable;
  title: TextRenderable;
  content: BoxRenderable;
  gutter: TextRenderable;
  code: SelectableText.Model;
}
