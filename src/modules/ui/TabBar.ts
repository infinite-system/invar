// The tab-bar controller: owns the behaviour of both tab strips — the workspace/project bar and the
// buffer bar — i.e. all interaction state (segments, hover, pressed, reveal), the mouse handlers, the
// segment hit-testers, the pan/dropdown helpers, and the two render shims that call TabBarRenderer.
// Extracted from RootView's closure as a pane controller.
//
// RootView still CONSTRUCTS the two renderables and owns the layout/mount (the workspace bar can sit
// top or left); it passes the renderables in and calls renderWorkspace()/renderBuffer() each frame.
// This controller wires the handlers onto them and holds the state the renders read.
import {
  StyledText,
  type TextRenderable,
  type CliRenderer,
} from '@opentui/core';
import { Reactive } from 'ivue';
import { Files } from '../system/Files';
import {
  TabBarRenderer,
  type TabBarSegment,
  type TabBarHover,
  type WorkspaceTabBarSegment,
  type WorkspaceTabBarHover,
  type BreadcrumbBarSegment,
} from './TabBarRenderer';
import type { Palette } from '../theme/ThemePalettes';
import { ThemeIcons } from '../theme/ThemeIcons';
import type { TabStrip } from './TabStrip';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type { Theme } from '../theme/Theme';
import type { Tooltip } from './Tooltip';
import type { OverlayCoordinator } from './OverlayCoordinator';
import type {
  BoundedListPopup,
  BoundedListPopupItem,
} from './BoundedListPopup';
import type { QuickOpen } from '../search/QuickOpen';
import type { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import { BreadcrumbPicker } from './BreadcrumbPicker';
class $TabBar {
  protected workspaceSegments: WorkspaceTabBarSegment[] = [];
  protected workspaceHover: WorkspaceTabBarHover = null;
  protected lastRevealedWorkspaceIndex = -1;
  protected bufferSegments: TabBarSegment[] = [];
  protected bufferHover: TabBarHover = null;
  protected arrowPressed: 'arrowLeft' | 'arrowRight' | null = null;
  protected previewPressed = false;
  protected closePressed: number | null = null; // index of the tab whose ✕ is being pressed
  protected lastRevealedActiveIndex = -1;
  protected breadcrumbSegments: BreadcrumbBarSegment[] = [];
  protected breadcrumbHoveredSourceIndex: number | null = null;
  protected readonly breadcrumbPicker: BreadcrumbPicker.Model;
  constructor(protected readonly dependencies: TabBarDependencies) {
    this.breadcrumbPicker = this.createBreadcrumbPicker();
    this.wireWorkspaceHandlers();
    this.wireBufferHandlers();
    this.wireBreadcrumbHandlers();
  }
  /** Render the workspace/project strip; keeps the reveal index + hit-test segments. */
  renderWorkspace(): StyledText {
    const { workspaceTabStrip, workspaceTabBar, renderer, readPalette } =
      this.dependencies;
    const result = TabBarRenderer.Class.renderWorkspace({
      strip: workspaceTabStrip,
      palette: readPalette(),
      hover: this.workspaceHover,
      lastRevealedIndex: this.lastRevealedWorkspaceIndex,
      barWidthValue: Number(workspaceTabBar.width),
      barHeightValue: Number(workspaceTabBar.height),
      rendererWidth: renderer.width,
      rendererHeight: renderer.height,
    });
    this.workspaceSegments = result.segments;
    this.lastRevealedWorkspaceIndex = result.revealedIndex;
    return result.text;
  }
  /** Render the buffer strip; keeps the reveal index + hit-test segments. */
  renderBuffer(): StyledText {
    const { bufferTabStrip, tabBar, workspaceSet, theme, readPalette } =
      this.dependencies;
    const result = TabBarRenderer.Class.renderBuffer({
      strip: bufferTabStrip,
      palette: readPalette(),
      barWidth: tabBar.width as number,
      hover: this.bufferHover,
      closePressed: this.closePressed,
      previewPressed: this.previewPressed,
      arrowPressed: this.arrowPressed,
      lastRevealedIndex: this.lastRevealedActiveIndex,
      activeFileIsMarkdown: workspaceSet.active.activeFileIsMarkdown,
      showingMarkdownPreview: workspaceSet.active.showingMarkdownPreview,
      previewIcon: theme.actionIcons.preview,
      projectRoot: workspaceSet.active.root,
      // The between-tab powerline separator comes from the theme's ladder — no inline glyph ladder.
      // invariant: Appearance is data with a capability fallback (project.invariants.md)
      separatorGlyph: ThemeIcons.Class.tabSeparatorFor(theme.glyphLevel.value),
    });
    this.bufferSegments = result.segments;
    this.lastRevealedActiveIndex = result.revealedIndex;
    return result.text;
  }
  renderBreadcrumb(): StyledText {
    const { bufferTabStrip, breadcrumbBar, workspaceSet, readPalette } =
      this.dependencies;
    const navigationHistory = workspaceSet.active.navigationHistory;
    const result = TabBarRenderer.Class.renderBreadcrumb({
      strip: bufferTabStrip,
      palette: readPalette(),
      barWidth: breadcrumbBar.width as number,
      projectRoot: workspaceSet.active.root,
      canGoBack: navigationHistory.canGoBack,
      canGoForward: navigationHistory.canGoForward,
      hoveredSourceIndex: this.breadcrumbHoveredSourceIndex,
    });
    this.breadcrumbSegments = result.segments;
    return result.text;
  }
  protected workspaceSegmentAt(
    primaryCoordinate: number,
  ): WorkspaceTabBarSegment | null {
    return (
      this.workspaceSegments.find(
        (segment) =>
          primaryCoordinate >= segment.primaryStart &&
          primaryCoordinate < segment.primaryEnd,
      ) ?? null
    );
  }
  protected bufferSegmentAt(localColumn: number): TabBarSegment | null {
    return (
      this.bufferSegments.find(
        (segment) => localColumn >= segment.start && localColumn < segment.end,
      ) ?? null
    );
  }
  protected breadcrumbSegmentAt(
    localColumn: number,
  ): BreadcrumbBarSegment | null {
    return (
      this.breadcrumbSegments.find(
        (segment) => localColumn >= segment.start && localColumn < segment.end,
      ) ?? null
    );
  }
  protected createBreadcrumbPicker(): BreadcrumbPicker.Model {
    return new BreadcrumbPicker.Class({
      popup: this.dependencies.boundedListPopup,
      overlayCoordinator: this.dependencies.overlayCoordinator,
      workspaceSet: this.dependencies.workspaceSet,
    });
  }
  // The arrows PAN the strip viewport only — they never change the active buffer (the render clamps
  // the offset, so panning past an end is a no-op and the arrow reads as disabled there).
  protected scrollTabsLeft(): void {
    const { bufferTabStrip, renderer } = this.dependencies;
    if (bufferTabStrip.scrollOffset.value > 0) {
      bufferTabStrip.pan(-1);
      renderer.requestRender();
    }
  }
  protected scrollTabsRight(): void {
    this.dependencies.bufferTabStrip.pan(1); // clamped to maxScrollOffset in renderBuffer
    this.dependencies.renderer.requestRender();
  }
  // Clicking the count badge opens a bounded list of ALL open buffers. Selecting a row focuses it.
  protected openTabDropdown(anchorColumn: number): void {
    const { workspaceSet, overlayCoordinator, boundedListPopup, tabBar } =
      this.dependencies;
    const items: BoundedListPopupItem[] = workspaceSet.active.buffers
      .tabs()
      .map((tab, index) => ({
        identifier: String(index),
        label: `${Files.Class.basename(tab.path)}${tab.dirty ? ' (modified)' : ''}`,
        searchText: tab.path,
        selected: tab.active,
      }));
    overlayCoordinator.openExclusiveOverlay('boundedListPopup', () =>
      boundedListPopup.openAt(
        items,
        {
          column: (tabBar.x as number) + anchorColumn,
          row: tabBar.y as number,
        },
        (item) => workspaceSet.active.activateTab(Number(item.identifier)),
        {
          title: 'Open Buffers',
          selectedItemIdentifier: String(
            workspaceSet.active.buffers.activeIndex.value,
          ),
          minimumWidth: 28,
        },
      ),
    );
  }
  protected wireWorkspaceHandlers(): void {
    const {
      workspaceTabBar,
      workspaceTabStrip,
      workspaceSet,
      tooltip,
      overlayCoordinator,
      quickOpen,
      renderer,
    } = this.dependencies;
    workspaceTabBar.onMouseDown = (event) => {
      tooltip.clear();
      const vertical = workspaceTabStrip.orientation.value === 'vertical';
      const primaryCoordinate = vertical
        ? event.y - Number(workspaceTabBar.y)
        : event.x - Number(workspaceTabBar.x);
      const crossAxisCoordinate = vertical
        ? event.x - Number(workspaceTabBar.x)
        : event.y - Number(workspaceTabBar.y);
      const segment = this.workspaceSegmentAt(primaryCoordinate);
      if (!segment) return;
      if (segment.kind === 'tab') {
        // Horizontal tabs are two rows; the close ✕ sits on row 0 only, so the cross axis gates it.
        const closeHit = vertical
          ? crossAxisCoordinate === segment.closeCrossAxisCoordinate
          : primaryCoordinate === segment.closePrimaryCoordinate &&
            crossAxisCoordinate === 0;
        if (closeHit && workspaceSet.count > 1)
          workspaceSet.close(segment.workspaceIndex);
        else workspaceSet.activate(segment.workspaceIndex);
      } else if (segment.kind === 'panBackward') {
        workspaceTabStrip.pan(-1);
      } else if (segment.kind === 'panForward') {
        workspaceTabStrip.pan(1);
      } else {
        overlayCoordinator.openExclusiveOverlay('quickOpen', () =>
          quickOpen.showWorkspacePath(workspaceSet.active.root),
        );
      }
      renderer.requestRender();
    };
    workspaceTabBar.onMouseMove = (event) => {
      const vertical = workspaceTabStrip.orientation.value === 'vertical';
      const primaryCoordinate = vertical
        ? event.y - Number(workspaceTabBar.y)
        : event.x - Number(workspaceTabBar.x);
      const crossAxisCoordinate = vertical
        ? event.x - Number(workspaceTabBar.x)
        : event.y - Number(workspaceTabBar.y);
      const segment = this.workspaceSegmentAt(primaryCoordinate);
      let nextHover: WorkspaceTabBarHover = null;
      if (segment?.kind === 'tab') {
        // Horizontal tabs are two rows; the close ✕ sits on row 0 only, so the cross axis gates it.
        const closeHit = vertical
          ? crossAxisCoordinate === segment.closeCrossAxisCoordinate
          : primaryCoordinate === segment.closePrimaryCoordinate &&
            crossAxisCoordinate === 0;
        nextHover = {
          kind: closeHit ? 'close' : 'tab',
          workspaceIndex: segment.workspaceIndex,
        };
        const workspaceTab = workspaceSet.tabs()[segment.workspaceIndex];
        tooltip.point(
          closeHit
            ? 'Close project (Ctrl+Shift+W)'
            : `Switch project: ${workspaceTab?.name ?? ''} (Ctrl+Shift+PageUp/PageDown)`,
          event.x,
          event.y,
        );
      } else if (segment) {
        nextHover = { kind: segment.kind, workspaceIndex: -1 };
        tooltip.point(
          segment.kind === 'add'
            ? 'Open project folder (Ctrl+Shift+O)'
            : 'Pan project tabs without switching',
          event.x,
          event.y,
        );
      } else {
        tooltip.clear();
      }
      if (JSON.stringify(nextHover) !== JSON.stringify(this.workspaceHover)) {
        this.workspaceHover = nextHover;
        renderer.requestRender();
      }
    };
    workspaceTabBar.onMouseOut = () => {
      this.workspaceHover = null;
      tooltip.clear();
      renderer.requestRender();
    };
  }
  protected wireBufferHandlers(): void {
    const { tabBar, workspaceSet, tooltip, keybindings, renderer } =
      this.dependencies;
    tabBar.onMouseDown = (event) => {
      tooltip.clear();
      const localColumn = event.x - (tabBar.x as number);
      const segment = this.bufferSegmentAt(localColumn);
      if (!segment) return;
      if (segment.kind === 'tab') {
        if (localColumn === segment.closeColumn) {
          this.closePressed = segment.index; // show the pressed ✕ before the close/confirm
          renderer.requestRender();
          workspaceSet.active.requestCloseTab(segment.index);
        } else workspaceSet.active.activateTab(segment.index);
      } else if (segment.kind === 'badge') {
        this.openTabDropdown(segment.start);
      } else if (segment.kind === 'previewToggle') {
        this.previewPressed = true;
        workspaceSet.active.toggleMarkdownPreview();
        renderer.requestRender();
      } else {
        this.arrowPressed = segment.kind; // pressed colour shows until release
        if (segment.kind === 'arrowLeft') this.scrollTabsLeft();
        else this.scrollTabsRight();
        renderer.requestRender();
      }
    };
    tabBar.onMouseUp = () => {
      if (
        this.arrowPressed ||
        this.previewPressed ||
        this.closePressed !== null
      ) {
        this.arrowPressed = null;
        this.previewPressed = false;
        this.closePressed = null;
        renderer.requestRender();
      }
    };
    tabBar.onMouseMove = (event) => {
      const localColumn = event.x - (tabBar.x as number);
      const segment = this.bufferSegmentAt(localColumn);
      let next: TabBarHover = null;
      if (segment?.kind === 'tab') {
        next = {
          kind: localColumn === segment.closeColumn ? 'close' : 'tab',
          index: segment.index,
        };
      } else if (segment) {
        next = { kind: segment.kind, index: -1 };
      }
      if (segment?.kind === 'previewToggle') {
        const bindingHint = keybindings.bindingHint(
          'markdown.togglePreview',
          'editor',
        );
        tooltip.point(
          `Toggle Markdown preview${bindingHint ? ` (${bindingHint})` : ''}`,
          event.x,
          event.y,
        );
      } else if (
        segment?.kind === 'arrowLeft' ||
        segment?.kind === 'arrowRight'
      ) {
        tooltip.point('Pan file tabs without switching', event.x, event.y);
      } else if (segment?.kind === 'badge') {
        tooltip.point('Show all open files', event.x, event.y);
      } else {
        tooltip.clear();
      }
      if (JSON.stringify(next) !== JSON.stringify(this.bufferHover)) {
        this.bufferHover = next;
        renderer.requestRender();
      }
    };
    tabBar.onMouseOut = () => {
      if (
        this.bufferHover ||
        this.arrowPressed ||
        this.previewPressed ||
        this.closePressed !== null
      ) {
        this.bufferHover = null;
        this.arrowPressed = null;
        this.previewPressed = false;
        this.closePressed = null;
        tooltip.clear();
        renderer.requestRender();
      }
    };
  }
  protected wireBreadcrumbHandlers(): void {
    const { breadcrumbBar, workspaceSet, tooltip, keybindings, renderer } =
      this.dependencies;
    const controlsShown = (): boolean =>
      workspaceSet.active.editor.hasDocument.value &&
      workspaceSet.active.editorSurfaces.activeDocumentIsPresented;
    breadcrumbBar.onMouseDown = (event) => {
      if (!controlsShown()) return;
      tooltip.clear();
      const localColumn = event.x - Number(breadcrumbBar.x);
      const navigationButton =
        TabBarRenderer.Class.breadcrumbNavButtonAt(localColumn);
      if (navigationButton === 'back') {
        workspaceSet.active.navigateBack();
        return;
      }
      if (navigationButton === 'forward') {
        workspaceSet.active.navigateForward();
        return;
      }
      const segment = this.breadcrumbSegmentAt(localColumn);
      if (!segment) return;
      this.breadcrumbPicker.show(segment, {
        column: Number(breadcrumbBar.x) + segment.start,
        row: Number(breadcrumbBar.y),
      });
    };
    breadcrumbBar.onMouseMove = (event) => {
      if (!controlsShown()) return;
      const localColumn = event.x - Number(breadcrumbBar.x);
      const navigationButton =
        TabBarRenderer.Class.breadcrumbNavButtonAt(localColumn);
      const segment = this.breadcrumbSegmentAt(localColumn);
      const nextHoveredSourceIndex = navigationButton
        ? null
        : (segment?.sourceIndex ?? null);
      if (navigationButton === 'back') {
        const bindingHint = keybindings.bindingHint(
          'navigation.back',
          'editor',
        );
        tooltip.point(
          `Go Back${bindingHint ? ` (${bindingHint})` : ''}`,
          event.x,
          event.y,
        );
      } else if (navigationButton === 'forward') {
        const bindingHint = keybindings.bindingHint(
          'navigation.forward',
          'editor',
        );
        tooltip.point(
          `Go Forward${bindingHint ? ` (${bindingHint})` : ''}`,
          event.x,
          event.y,
        );
      } else if (segment) {
        tooltip.point(`Browse ${segment.label}`, event.x, event.y);
      } else {
        tooltip.clear();
      }
      if (nextHoveredSourceIndex !== this.breadcrumbHoveredSourceIndex) {
        this.breadcrumbHoveredSourceIndex = nextHoveredSourceIndex;
        renderer.requestRender();
      }
    };
    breadcrumbBar.onMouseOut = () => {
      if (this.breadcrumbHoveredSourceIndex !== null) {
        this.breadcrumbHoveredSourceIndex = null;
        renderer.requestRender();
      }
      tooltip.clear();
    };
  }
}
export namespace TabBar {
  export const $Class = $TabBar;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}
export interface TabBarDependencies {
  renderer: CliRenderer;
  tabBar: TextRenderable;
  breadcrumbBar: TextRenderable;
  workspaceTabBar: TextRenderable;
  bufferTabStrip: TabStrip.Instance;
  workspaceTabStrip: TabStrip.Instance;
  workspaceSet: WorkspaceSet.Instance;
  theme: Theme.Instance;
  tooltip: Tooltip.Instance;
  overlayCoordinator: OverlayCoordinator.Instance;
  boundedListPopup: BoundedListPopup.Instance;
  quickOpen: QuickOpen.Instance;
  keybindings: KeybindingRegistry.Instance;
  readPalette: () => Palette;
}
