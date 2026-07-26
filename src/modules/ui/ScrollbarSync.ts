import {
  type BoxRenderable,
  type CliRenderer,
  type ScrollBarRenderable,
} from '@opentui/core';
import { Reactive } from 'ivue';
import { EditorWrap } from '../editor/EditorWrap';
import type { Theme } from '../theme/Theme';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import { ScrollbarGeometry } from './ScrollbarGeometry';
import { SolidThumbScrollBar } from './SolidThumbScrollBar';
import type { Tooltip } from './Tooltip';

// invariant: A scrollbar track is derived per frame from its region rect (ui.invariants.md)
// invariant: One writer per scroll regime per frame (ui.invariants.md)
class $ScrollbarSync {
  protected readonly barScales = new Map<object, number>();
  protected applying = false;
  protected readonly editorVerticalBar: ScrollBarRenderable;
  protected readonly editorHorizontalBar: ScrollBarRenderable;
  protected readonly treeVerticalBar: ScrollBarRenderable;
  protected readonly treeHorizontalBar: ScrollBarRenderable;

  constructor(protected readonly dependencies: ScrollbarSyncDependencies) {
    const makeBar = (
      identifier: string,
      orientation: 'vertical' | 'horizontal',
      onChange: (position: number) => void,
    ): ScrollBarRenderable =>
      new SolidThumbScrollBar.Class(dependencies.renderer, {
        id: identifier,
        orientation,
        position: 'absolute',
        ...(orientation === 'vertical'
          ? { width: dependencies.scrollbarThicknessCells() }
          : { height: dependencies.scrollbarThicknessCells() }),
        showArrows: false,
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
    this.treeVerticalBar = makeBar(
      'tree-scrollbar-v',
      'vertical',
      (position) => {
        workspace().haltTreeScroll();
        workspace().tree.scrollTop.value = this.truePosition(
          this.treeVerticalBar,
          position,
        );
      },
    );
    this.treeHorizontalBar = makeBar(
      'tree-scrollbar-h',
      'horizontal',
      (position) => {
        workspace().haltTreeHorizontalScroll();
        workspace().tree.scrollLeft.value = this.truePosition(
          this.treeHorizontalBar,
          position,
        );
      },
    );
    dependencies.editorArea.add(this.editorVerticalBar);
    dependencies.editorArea.add(this.editorHorizontalBar);
    dependencies.sidebar.add(this.treeVerticalBar);
    dependencies.sidebar.add(this.treeHorizontalBar);
    for (const bar of [this.editorHorizontalBar, this.treeHorizontalBar]) {
      bar.onMouseMove = (event) =>
        dependencies.tooltip.point(
          'Horizontal scroll — drag or Option+wheel',
          event.x,
          event.y,
        );
      bar.onMouseOut = () => dependencies.tooltip.clear();
    }
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
    bar: ScrollBarRenderable,
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
    bar.visible = true;
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
  }

  syncPaneViewportGeometry(): boolean {
    if (this.dependencies.primaryDockHost.activeContent?.id !== 'files') {
      return false;
    }
    const tree = this.dependencies.workspaceSet.active.tree;
    const viewportHeight = Math.max(
      1,
      Number(this.dependencies.sidebar.height) - 2,
    );
    const viewportWidth = Math.max(
      1,
      this.dependencies.sidebarWidth() -
        2 -
        this.dependencies.scrollbarThicknessCells(),
    );
    const changed =
      tree.viewportHeight.value !== viewportHeight ||
      tree.viewportWidth.value !== viewportWidth;
    tree.viewportHeight.value = viewportHeight;
    tree.viewportWidth.value = viewportWidth;
    tree.clampHorizontalScroll();
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
        this.dependencies.codeBody.x - (this.dependencies.editorArea.x + 1),
      ),
      width: Math.max(1, Number(this.dependencies.codeBody.width)),
      height: editorHeight,
    };
    this.applyBar(this.editorVerticalBar, 'vertical', editorRegion, {
      scrollSize: editor.hasDocument.value
        ? editor.wordWrap.value
          ? EditorWrap.Class.totalVisualRows(
              editor.document,
              editor.wrapWidth(),
            )
          : editor.document.lineCount
        : 0,
      viewportSize: editorHeight,
      scrollPosition: editor.viewport.scrollTop.value,
    });
    this.applyBar(this.editorHorizontalBar, 'horizontal', editorRegion, {
      scrollSize:
        editor.hasDocument.value && !editor.wordWrap.value
          ? editor.document.maximumLineWidth
          : 0,
      viewportSize: editorWidth,
      scrollPosition: editor.viewport.scrollLeft.value,
    });
    const filesVisible =
      this.dependencies.primaryDockHost.activeContent?.id === 'files';
    const sidebarRegion = {
      top: 0,
      left: 0,
      width: this.dependencies.sidebarWidth() - 2,
      height: Math.max(1, Number(this.dependencies.sidebar.height) - 2),
    };
    this.applyBar(this.treeVerticalBar, 'vertical', sidebarRegion, {
      scrollSize: filesVisible ? workspace.tree.rows.length : 0,
      viewportSize: sidebarRegion.height,
      scrollPosition: workspace.tree.scrollTop.value,
    });
    this.applyBar(this.treeHorizontalBar, 'horizontal', sidebarRegion, {
      scrollSize: filesVisible ? workspace.tree.contentWidth : 0,
      viewportSize: workspace.tree.viewportWidth.value,
      scrollPosition: workspace.tree.scrollLeft.value,
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
  codeBody: { x: number; width: number | string };
  sidebar: BoxRenderable;
  primaryDockHost: import('./PanelHost').PanelHost.Instance;
  tooltip: Tooltip.Instance;
  editorViewportHeight: () => number;
  editorViewportWidth: () => number;
  sidebarWidth: () => number;
  scrollbarThicknessCells: () => number;
}
