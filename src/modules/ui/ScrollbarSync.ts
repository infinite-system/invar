import {
  type BoxRenderable,
  type CliRenderer,
  type ScrollBarRenderable,
} from '@opentui/core';
import { Reactive } from 'ivue';
import { EditorWrap } from '../editor/EditorWrap';
import { Logging } from '../system/Logging';
import type { Theme } from '../theme/Theme';
import type { Palette } from '../theme/ThemePalettes';
import type { EditorDecorationColor } from '../workspace/GutterDecorations';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import { OverviewRuler, type OverviewRulerMark } from './OverviewRuler';
import { ScrollbarGeometry } from './ScrollbarGeometry';
import { SolidThumbScrollBar } from './SolidThumbScrollBar';
import type { Tooltip } from './Tooltip';

// invariant: A scrollbar track is derived per frame from its region rect (src/modules/ui/ui.invariants.md)
// invariant: One writer per scroll regime per frame (src/modules/ui/ui.invariants.md)
// invariant: The editor overview derives from the decoration snapshot (src/modules/ui/ui.invariants.md)
class $ScrollbarSync {
  protected readonly barScales = new Map<object, number>();
  protected applying = false;
  protected readonly editorVerticalBar: SolidThumbScrollBar.Model;
  protected readonly editorHorizontalBar: SolidThumbScrollBar.Model;
  protected readonly primaryDockVerticalBar: SolidThumbScrollBar.Model;
  protected readonly primaryDockHorizontalBar: SolidThumbScrollBar.Model;
  protected readonly rightDockVerticalBar: SolidThumbScrollBar.Model;
  protected readonly editorOverviewRuler = new OverviewRuler.Class();
  protected editorOverviewMarks: readonly OverviewRulerMark[] = [];
  protected paintedEditorOverviewMarks: readonly OverviewRulerMark[] | null =
    null;
  protected paintedEditorOverviewPaletteSignature = '';

  constructor(protected readonly dependencies: ScrollbarSyncDependencies) {
    const makeBar = (
      identifier: string,
      orientation: 'vertical' | 'horizontal',
      onChange: (position: number) => void,
    ): SolidThumbScrollBar.Model =>
      new SolidThumbScrollBar.Class(dependencies.renderer, {
        id: identifier,
        orientation,
        position: 'absolute',
        ...(orientation === 'vertical'
          ? { width: dependencies.scrollbarThicknessCells() }
          : { height: dependencies.scrollbarThicknessCells() }),
        showArrows: false,
        visible: false,
        onChange: (position) => {
          if (!this.applying) onChange(position);
        },
      });
    const workspace = () => dependencies.workspaceSet.active;
    this.editorVerticalBar = makeBar(
      'editor-scrollbar-v',
      'vertical',
      (position) => {
        workspace().editor.viewport.haltScrollMomentum();
        workspace().editor.viewport.scrollTop.value = this.truePosition(
          this.editorVerticalBar,
          position,
        );
      },
    );
    this.editorHorizontalBar = makeBar(
      'editor-scrollbar-h',
      'horizontal',
      (position) => {
        workspace().editor.viewport.haltScrollMomentum();
        workspace().editor.viewport.scrollLeft.value = this.truePosition(
          this.editorHorizontalBar,
          position,
        );
      },
    );
    this.primaryDockVerticalBar = makeBar(
      'primary-dock-scrollbar-v',
      'vertical',
      (position) => {
        const content = dependencies.primaryDockHost.activeContent;
        content?.haltScrollMomentum?.();
        content?.scrollToLine?.(
          this.truePosition(this.primaryDockVerticalBar, position),
        );
      },
    );
    this.primaryDockHorizontalBar = makeBar(
      'primary-dock-scrollbar-h',
      'horizontal',
      (position) => {
        const content = dependencies.primaryDockHost.activeContent;
        content?.haltHorizontalScrollMomentum?.();
        content?.scrollToColumn?.(
          this.truePosition(this.primaryDockHorizontalBar, position),
        );
      },
    );
    this.rightDockVerticalBar = makeBar(
      'right-dock-scrollbar-v',
      'vertical',
      (position) => {
        const content = dependencies.rightDockHost.activeContent;
        content?.haltScrollMomentum?.();
        content?.scrollToLine?.(
          this.truePosition(this.rightDockVerticalBar, position),
        );
      },
    );
    dependencies.editorArea.add(this.editorVerticalBar);
    dependencies.editorArea.add(this.editorHorizontalBar);
    dependencies.sidebar.add(this.primaryDockVerticalBar);
    dependencies.sidebar.add(this.primaryDockHorizontalBar);
    dependencies.rightDockBox.add(this.rightDockVerticalBar);
    for (const bar of [
      this.editorHorizontalBar,
      this.primaryDockHorizontalBar,
    ]) {
      bar.onMouseMove = (event) =>
        dependencies.tooltip.point(
          'Horizontal scroll — drag or Option+wheel',
          event.x,
          event.y,
        );
      bar.onMouseOut = () => dependencies.tooltip.clear();
    }
    this.editorVerticalBar.onMouseMove = (event) => {
      const trackOffset = event.y - Number(this.editorVerticalBar.y);
      const mark = this.editorOverviewMarks.find(
        (candidate) => candidate.trackOffset === trackOffset,
      );
      if (mark) {
        dependencies.tooltip.point(
          mark.hoverLabels.join(' · '),
          event.x,
          event.y,
        );
      } else {
        dependencies.tooltip.clear();
      }
    };
    this.editorVerticalBar.onMouseOut = () => dependencies.tooltip.clear();
  }

  protected truePosition(
    bar: ScrollBarRenderable,
    reportedPosition: number,
  ): number {
    return Math.max(
      0,
      Math.round(reportedPosition * (this.barScales.get(bar) ?? 1)),
    );
  }

  protected applyBar(
    bar: SolidThumbScrollBar.Model,
    orientation: 'vertical' | 'horizontal',
    region: { top: number; left: number; width: number; height: number },
    scroll: {
      scrollSize: number;
      viewportSize: number;
      scrollPosition: number;
    },
  ): void {
    const geometry = ScrollbarGeometry.Class.scrollbarGeometry(
      orientation,
      region,
      scroll,
    );
    if (!geometry) {
      bar.visible = false;
      bar.scrollSize = 0;
      this.barScales.set(bar, 0);
      return;
    }
    const thickness = this.dependencies.scrollbarThicknessCells();
    const palette = this.dependencies.theme.palette;
    bar.visible = true;
    bar.slider.backgroundColor = palette.panel;
    bar.slider.foregroundColor = palette.dim;
    bar.top =
      orientation === 'vertical'
        ? geometry.trackTop
        : geometry.trackTop - thickness + 1;
    bar.left =
      orientation === 'vertical'
        ? geometry.trackLeft - thickness + 1
        : geometry.trackLeft;
    bar.width = orientation === 'vertical' ? thickness : geometry.trackLength;
    bar.height = orientation === 'vertical' ? geometry.trackLength : thickness;
    const slider = (
      bar as unknown as {
        slider?: {
          width?: number;
          height?: number;
        };
      }
    ).slider;
    if (slider) {
      if (orientation === 'vertical') slider.width = thickness;
      else slider.height = thickness;
    }
    this.applying = true;
    try {
      bar.scrollSize = scroll.scrollSize;
      bar.viewportSize = geometry.reportedViewportSize;
      bar.scrollPosition = geometry.reportedPosition;
    } finally {
      this.applying = false;
    }
    this.barScales.set(bar, geometry.reportedToTrueScale);
    if (process.env.TUI_DEBUG_BARS === '1') {
      Logging.Class.info(
        `bar ${bar.id}: scrollSize=${scroll.scrollSize} ` +
          `viewportSize=${scroll.viewportSize} ` +
          `scrollPosition=${scroll.scrollPosition} thickness=${thickness} ` +
          `trackLeft=${geometry.trackLeft} -> left=${bar.left} top=${bar.top} ` +
          `laidX=${bar.x} laidY=${bar.y} laidW=${bar.width} laidH=${bar.height} ` +
          `sliderViewPort=${bar.slider.viewPortSize} sliderMax=${bar.slider.max} ` +
          `sliderValue=${bar.slider.value} sliderH=${bar.slider.height}`,
      );
    }
  }

  protected decorationColor(
    color: EditorDecorationColor,
    palette: Palette,
  ): string {
    if (color === 'added') return palette.added;
    if (color === 'modified') return palette.modified;
    if (color === 'deleted') return palette.deleted;
    if (color === 'error') return palette.error;
    if (color === 'warning') return palette.warning;
    return palette.info;
  }

  protected synchronizeEditorOverview(trackLength: number): void {
    const workspace = this.dependencies.workspaceSet.active;
    const handle = workspace.activeDocumentHandle;
    if (!this.editorVerticalBar.visible || !handle || !handle.document) {
      this.editorOverviewMarks = [];
      this.editorVerticalBar.setOverviewMarks([]);
      this.paintedEditorOverviewMarks = null;
      this.paintedEditorOverviewPaletteSignature = '';
      return;
    }

    const document = handle.document;
    const snapshot = workspace.gutterDecorations.snapshotFor(handle);
    const editor = workspace.editor;
    const wrapWidth = editor.visualWrapWidth();
    const foldedRanges = editor.collapsedFoldRanges;
    const visualRowCount = editor.totalVisualRows();
    const marks = this.editorOverviewRuler.project(
      snapshot,
      {
        key: [
          document.revision.value,
          wrapWidth ?? 'none',
          editor.foldRevision.value,
        ].join(':'),
        rowCount: visualRowCount,
        rowOfLine: (lineIndex) =>
          EditorWrap.Class.visualRowOfLine(
            document,
            lineIndex,
            wrapWidth,
            foldedRanges,
          ),
      },
      trackLength,
    );
    this.editorOverviewMarks = marks;
    const palette = this.dependencies.theme.palette;
    const overviewMarkGlyph = this.dependencies.theme.glyph('overviewMark');
    const paletteSignature = [
      palette.added,
      palette.modified,
      palette.deleted,
      palette.error,
      palette.warning,
      palette.info,
      overviewMarkGlyph,
    ].join(':');
    if (
      this.paintedEditorOverviewMarks === marks &&
      this.paintedEditorOverviewPaletteSignature === paletteSignature
    ) {
      return;
    }
    this.editorVerticalBar.setOverviewMarks(
      marks.map((mark) => ({
        trackOffset: mark.trackOffset,
        color: this.decorationColor(mark.color, palette),
        glyph: overviewMarkGlyph,
      })),
    );
    this.paintedEditorOverviewMarks = marks;
    this.paintedEditorOverviewPaletteSignature = paletteSignature;
  }

  syncPaneViewportGeometry(): boolean {
    let changed = false;
    for (const pane of [
      {
        content: this.dependencies.primaryDockHost.activeContent,
        columns: Math.max(1, this.dependencies.sidebarWidth() - 2),
        rows: Math.max(1, Number(this.dependencies.sidebar.height) - 2),
      },
      {
        content: this.dependencies.rightDockHost.activeContent,
        columns: Math.max(1, Number(this.dependencies.rightDockBox.width) - 2),
        rows: Math.max(1, Number(this.dependencies.rightDockBox.height) - 2),
      },
    ]) {
      if (!pane.content) continue;
      const originalViewportHeight = pane.content.scrollViewportRows;
      const originalViewportWidth = pane.content.scrollViewportColumns;
      pane.content.onResize(pane.columns, pane.rows);
      changed =
        pane.content.scrollViewportRows !== originalViewportHeight ||
        pane.content.scrollViewportColumns !== originalViewportWidth ||
        changed;
    }
    return changed;
  }

  syncScrollbars(): void {
    const workspace = this.dependencies.workspaceSet.active;
    const editor = workspace.editor;
    const editorHeight = this.dependencies.editorViewportHeight();
    const editorWidth = this.dependencies.editorViewportWidth();
    const editorRegion = {
      top: 0,
      left: Math.max(
        0,
        this.dependencies.codeSurface.x - (this.dependencies.editorArea.x + 1),
      ),
      width: Math.max(1, Number(this.dependencies.codeSurface.width)),
      height: editorHeight,
    };
    this.applyBar(this.editorVerticalBar, 'vertical', editorRegion, {
      scrollSize: editor.hasDocument.value ? editor.totalVisualRows() : 0,
      viewportSize: editorHeight,
      scrollPosition: editor.viewport.scrollTop.value,
    });
    this.synchronizeEditorOverview(
      this.editorVerticalBar.visible
        ? Number(this.editorVerticalBar.height)
        : 0,
    );
    this.applyBar(this.editorHorizontalBar, 'horizontal', editorRegion, {
      scrollSize:
        editor.hasDocument.value && !editor.wordWrap.value
          ? editor.document.maximumLineWidth
          : 0,
      viewportSize: editorWidth,
      scrollPosition: editor.viewport.scrollLeft.value,
    });
    const primaryDockContent = this.dependencies.primaryDockHost.visible.value
      ? this.dependencies.primaryDockHost.activeContent
      : null;
    const sidebarRegion = {
      top: 0,
      left: 0,
      width: this.dependencies.sidebarWidth() - 2,
      height: Math.max(1, Number(this.dependencies.sidebar.height) - 2),
    };
    this.applyBar(this.primaryDockVerticalBar, 'vertical', sidebarRegion, {
      scrollSize: primaryDockContent?.scrollContentRows ?? 0,
      viewportSize:
        primaryDockContent?.scrollViewportRows ?? sidebarRegion.height,
      scrollPosition: primaryDockContent?.scrollTop ?? 0,
    });
    this.applyBar(this.primaryDockHorizontalBar, 'horizontal', sidebarRegion, {
      scrollSize: primaryDockContent?.scrollContentColumns ?? 0,
      viewportSize:
        primaryDockContent?.scrollViewportColumns ?? sidebarRegion.width,
      scrollPosition: primaryDockContent?.scrollLeft ?? 0,
    });
    const rightDockContent = this.dependencies.rightDockHost.visible.value
      ? this.dependencies.rightDockHost.activeContent
      : null;
    const rightDockRegion = {
      top: rightDockContent?.scrollbarRowOffset ?? 0,
      left: 0,
      width: Math.max(1, Number(this.dependencies.rightDockBox.width) - 2),
      height:
        rightDockContent?.scrollViewportRows ??
        Math.max(1, Number(this.dependencies.rightDockBox.height) - 2),
    };
    this.applyBar(this.rightDockVerticalBar, 'vertical', rightDockRegion, {
      scrollSize: rightDockContent?.scrollContentRows ?? 0,
      viewportSize:
        rightDockContent?.scrollViewportRows ?? rightDockRegion.height,
      scrollPosition: rightDockContent?.scrollTop ?? 0,
    });
  }
}

export namespace ScrollbarSync {
  export const $Class = $ScrollbarSync;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface ScrollbarSyncDependencies {
  renderer: CliRenderer;
  workspaceSet: WorkspaceSet.Instance;
  theme: Theme.Instance;
  editorArea: BoxRenderable;
  /** The source-text content's painted region, reported by the content that owns it — the host
   *  does not hold that renderable. Only the left edge and width matter to a scrollbar track. */
  codeSurface: { x: number; width: number | string };
  sidebar: BoxRenderable;
  rightDockBox: BoxRenderable;
  primaryDockHost: import('./PanelHost').PanelHost.Instance;
  rightDockHost: import('./PanelHost').PanelHost.Instance;
  tooltip: Tooltip.Instance;
  editorViewportHeight: () => number;
  editorViewportWidth: () => number;
  sidebarWidth: () => number;
  scrollbarThicknessCells: () => number;
}
