// The root frame, rendered from workspace + theme state. A column of
// [ main row: files sidebar | editor ] over a status bar. `update()` re-syncs content from
// state after each input (one-way flow: state → view, never the reverse).
//
// invariant: ivue owns state and OpenTUI owns projection (project.invariants.md)
// invariant: The terminal shows a bounded viewport (project.invariants.md)
// invariant: Cost tracks the actively observed set (project.invariants.md)
import {
  BoxRenderable,
  TextRenderable,
  StyledText,
  fg,
  bg,
  bold,
  type TextChunk,
  type CliRenderer,
  type MouseEvent,
} from '@opentui/core';
import { Static } from 'ivue/extras';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type { App } from '../app/App';
import type { Theme } from '../theme/Theme';
import type { CommandRegistry } from '../commands/CommandRegistry';
import type { Palette } from '../theme/ThemePalettes';
import { Files } from '../system/Files';
import { TextCoordinates } from '../text/TextCoordinates';
import {
  EditorFrameAttribution,
  type EditorFrameAttributionSnapshot,
} from '../editor/EditorFrameAttribution';
import { CommandBar } from './CommandBar';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';
import { ScrollGesture, type WheelModifiers } from './ScrollGesture';
import { Sidebar } from './Sidebar';
import { ActivityBar } from './ActivityBar';
import type { ActivitySurface } from './ActivitySurface';
import { EditorColumnDefault } from './EditorColumnDefault';
import { EditorContentMount } from './EditorContentMount';
import { ImagePreview } from '../image/ImagePreview';
import { ImageRenderers } from '../image/ImageRenderers';
import { PixelImageMount } from '../image/PixelImageMount';
import {
  TerminalCapabilities,
  type ReportedGraphicsCapabilities,
} from '../theme/TerminalCapabilities';
import { shallowRef } from 'vue';
import { ScrollbarSync } from './ScrollbarSync';
import { OverlayLayer } from './OverlayLayer';
import { HoverCard } from './HoverCard';
import { ScrollbarGeometry } from './ScrollbarGeometry';
import { SolidThumbScrollBar } from './SolidThumbScrollBar';
import type {
  PaneContent,
  PaneNativeSurfacePort,
  PaneScrollPort,
  PaneSurfaceRegion,
} from './PaneContent.interface';
import { PaneProjection } from './PaneProjection';
import type { ContextMenu, ContextMenuItem } from './ContextMenu';
import type { BoundedListPopup } from './BoundedListPopup';
import type { OverlayCoordinator } from './OverlayCoordinator';
import type { ShortcutHelp } from './ShortcutHelp';
import type { Tooltip } from './Tooltip';
import type { SettingsPanel } from '../settings/SettingsPanel';
import type { ScrollModifier } from '../settings/Settings';
import type { FindBar, FindBarTarget } from '../search/FindBar';
import type { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import type { QuickOpen } from '../search/QuickOpen';
import type { GoToLinePrompt } from '../navigation/GoToLinePrompt';
import type { Dialog } from './Dialog';
import { PaneSplitters } from './PaneSplitters';
import { SplitterElement } from './SplitterElement';
import { Logging } from '../system/Logging';
import { Momentum } from '../system/Momentum';
import type { TabStrip } from './TabStrip';
import type { PanelHost } from './PanelHost';
import { PanelContentsList } from './PanelContentsList';
import { DragReorder } from './DragReorder';
import { RenderRequest } from './RenderRequest';
import {
  PanelTabBar,
  type PanelTabBarAction,
  type PanelTabBarEditorFrameProjection,
  type PanelTabBarProjection,
} from './PanelTabBar';
import {
  LayoutModel,
  type LayoutModelOptions,
  type LayoutPreset,
  type LayoutSlotGeometry,
} from '../layout/LayoutModel';
import type { LayoutSlots } from '../layout/LayoutSlots';
import type { StatusBarSegments } from './StatusBarSegments';
import type {
  EditorSurfaceContent,
  EditorSurfaceContents,
} from './EditorSurfaceContents';

// invariant: Construction goes through overridable seams (project.invariants.md)
class $RootView {
  public static buildRootView(
    renderer: CliRenderer,
    workspaceSet: WorkspaceSet.Instance,
    bufferTabStrip: TabStrip.Instance,
    workspaceTabStrip: TabStrip.Instance,
    theme: Theme.Instance,
    keybindings: KeybindingRegistry.Instance,
    commands: CommandRegistry.Instance,
    app: App.Instance,
    contextMenu: ContextMenu.Instance,
    boundedListPopup: BoundedListPopup.Instance,
    tooltip: Tooltip.Instance,
    settingsPanel: SettingsPanel.Instance,
    findBar: FindBar.Instance,
    quickOpen: QuickOpen.Instance,
    goToLinePrompt: GoToLinePrompt.Instance,
    quitConfirmation: Dialog.Model,
    shortcutHelp: ShortcutHelp.Instance,
    overlayCoordinator: OverlayCoordinator.Instance,
    panelHost: PanelHost.Instance,
    primaryDockHost: PanelHost.Instance,
    rightDockHost: PanelHost.Instance,
    activitySurface: ActivitySurface.Model,
    statusBarSegments: StatusBarSegments.Model,
    editorSurfaceContents: EditorSurfaceContents.Model,
    editorColumnDefault: EditorColumnDefault.Model,
    toggleTerminal: () => void,
    openPanelAddPopup: (anchor: { column: number; row: number }) => void,
    openPanelPaneAddPopup: (
      anchor: { column: number; row: number },
      splitTargetIdentifier?: string,
    ) => void,
    toggleRightDock: () => void,
    activateQuickOpen: () => void,
    revealFindMatch: () => void,
    layoutSlots: LayoutSlots.Instance,
  ): RootView {
    const root = renderer.root;
    const editorFrameAttribution = new EditorFrameAttribution.Class();
    const readPalette = () => theme.palette;
    const settings = settingsPanel.settings;
    // OpenTUI captures a drag target only on the FIRST drag event, resolved at the pointer's CURRENT
    // cell — so a thin (1-cell) grab strip is abandoned the instant the pointer moves off it and
    // onMouseDrag never fires. Grabbing the capture explicitly on mousedown (via the same `_ctx` mouse
    // context the tooltip masks addToHitGrid through) routes EVERY subsequent drag to that renderable
    // regardless of where the pointer travels — the robust pattern for any thin divider/thumb. OpenTUI
    // releases the capture itself on the up event (firing drag-end), so no manual clear is needed.
    // Sidebar↔editor width divider: a vertical SplitterModel in CELLS whose size IS the sidebar width.
    // The live width is `layoutSlots.primaryDockColumns`, which the WORKSPACE owns — the layout
    // module's per-workspace contribution swaps it on every workspace switch. `settings.sidebarWidth`
    // stays the width a fresh workspace starts at; the settings panel writes it and Bootstrap
    // forwards that edit to the workspace on screen, so changing it in Ctrl+, still resizes live.
    // invariant: Layout slot sizes are workspace scoped (src/modules/layout/layout.invariants.md)
    const sidebarWidth = (): number =>
      Math.round(layoutSlots.primaryDockColumns.value);
    const column = new BoxRenderable(renderer, {
      id: 'root-column',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: readPalette().bg,
    });
    const mainRow = new BoxRenderable(renderer, {
      id: 'main-row',
      flexDirection: 'row',
      flexGrow: 1,
      // minHeight:0 lets the main row SHRINK below its content's natural height so the fixed-height
      // bottom panel (terminal) gets its full rows ON SCREEN instead of overflowing under the status
      // bar. Without it a flex item's min-height defaults to its content size and never yields the
      // rows a fixed sibling needs. (The *scrollable pane height is an input* invariant's shrink fix.)
      minHeight: 0,
      width: '100%',
    });
    const layoutCanvas = new BoxRenderable(renderer, {
      id: 'layout-canvas',
      position: 'relative',
      flexGrow: 1,
      height: '100%',
    });
    // The project-layer tab strip is ONE renderable + ONE TabStrip model. The setting moves that same
    // strip between the horizontal top slot and the vertical left slot; it never duplicates state.
    // The top strip is TWO rows: the project name over its worktree/branch detail.
    const workspaceTabBar = new TextRenderable(renderer, {
      id: 'workspace-tab-strip',
      content: '',
      width: '100%',
      height: 2,
      wrapMode: 'none',
    });
    if (settings.workspaceTabPosition.value === 'left') {
      workspaceTabBar.width = 22;
      workspaceTabBar.height = '100%';
    }
    const commandBar = new CommandBar.Class({
      renderer,
      workspaceSet,
      theme,
      tooltip,
      overlayCoordinator,
      boundedListPopup,
      quickOpen,
      keybindings,
      currentLayoutValues: () => ({
        primaryDockVisible: primaryDockHost.visible.value,
        rightDockVisible: rightDockHost.visible.value,
        bottomPanelVisible: panelHost.visible.value,
        sidebarPosition: settings.sidebarPosition.value,
        panelAlignment: settings.panelAlignment.value,
        leftDockVerticalSpan: settings.leftDockVerticalSpan.value,
        rightDockVerticalSpan: settings.rightDockVerticalSpan.value,
      }),
      applyLayoutPreset: (preset: LayoutPreset) => {
        settings.sidebarPosition.value = preset.sidebarPosition;
        settings.panelAlignment.value = preset.panelAlignment;
        settings.leftDockVerticalSpan.value = preset.leftDockVerticalSpan;
        settings.rightDockVerticalSpan.value = preset.rightDockVerticalSpan;
        if (preset.primaryDockVisible) primaryDockHost.show();
        else primaryDockHost.hide();
        if (preset.rightDockVisible) rightDockHost.show();
        else rightDockHost.hide();
        if (preset.bottomPanelVisible) panelHost.show();
        else panelHost.hide();
        settings.save();
        renderer.requestRender();
      },
    });
    const sidebar = new BoxRenderable(renderer, {
      id: 'sidebar',
      position: 'absolute',
      width: sidebarWidth(),
      height: '100%',
      border: true,
      borderStyle: 'rounded',
      title: 'Files',
      backgroundColor: readPalette().panel,
    });
    const sidebarBody = new TextRenderable(renderer, {
      id: 'sidebar-body',
      content: '',
    });
    sidebar.add(sidebarBody);
    // The editor column stacks a breadcrumb row and a 1-row TAB BAR above the bordered editor area. Wrapping (rather than
    // adding the tab bar INSIDE editorArea) leaves editorArea's border, gutter/code layout, scrollbar
    // geometry, and layout-anchored caret coords (codeBody.x/y) completely unchanged.
    const editorColumn = new BoxRenderable(renderer, {
      id: 'editor-column',
      position: 'absolute',
      height: '100%',
      flexDirection: 'column',
    });
    const tabBar = new TextRenderable(renderer, {
      id: 'editor-tab-bar',
      content: '',
      height: 1,
      width: '100%',
    });
    // The breadcrumb row sits above the buffer-tab strip. It always shows history controls and adds
    // the current editor-area occupant's `project › dir › file` path when one exists.
    const breadcrumbBar = new TextRenderable(renderer, {
      id: 'editor-breadcrumb-bar',
      content: '',
      height: 1,
      width: '100%',
    });
    const editorArea = new BoxRenderable(renderer, {
      id: 'editor-area',
      flexGrow: 1,
      width: '100%',
      border: true,
      borderStyle: 'rounded',
      flexDirection: 'row',
      title: 'Editor',
    });
    // The gutter and code renderables are NOT built here: the editor area is the SLOT, and the
    // registered default content mounts its own surfaces into it (below), exactly as a terminal owns
    // its own. invariant: The source text editor is a pane content citizen (src/modules/ui/ui.invariants.md)
    // The empty-slot notice. It is mounted ONLY while no content occupies the column, so an editor
    // that is simply not installed reads as a stated affordance rather than an empty document or a
    // crash. Built here because the SLOT is the host's, and so is the sentence about it being empty.
    const editorColumnEmptyNotice = new TextRenderable(renderer, {
      id: 'editor-column-empty',
      content: '',
      flexGrow: 1,
    });
    let editorColumnEmptyNoticeMounted = false;
    function synchronizeEmptyColumnNotice(
      content: PaneContent | null,
      palette: Palette,
    ): void {
      const shouldMount = content === null;
      if (shouldMount !== editorColumnEmptyNoticeMounted) {
        if (shouldMount) editorArea.add(editorColumnEmptyNotice);
        else editorArea.remove(editorColumnEmptyNotice);
        editorColumnEmptyNoticeMounted = shouldMount;
      }
      if (!shouldMount) return;
      editorColumnEmptyNotice.fg = palette.dim;
      editorColumnEmptyNotice.content = [
        '',
        '   No editor content is installed.',
        '',
        '   The workspace is still open — files, search, and tabs all work.',
        '   Install a source-text editor in Extensions (Ctrl+Shift+X).',
        '',
      ].join('\n');
    }
    editorColumn.add(breadcrumbBar);
    editorColumn.add(tabBar);
    editorColumn.add(editorArea);
    const editorFrameActionRenderable = new TextRenderable(renderer, {
      id: 'editor-frame-action-bar',
      content: '',
      position: 'absolute',
      width: 0,
      height: 1,
      wrapMode: 'none',
      selectable: false,
      zIndex: 60,
    });
    layoutCanvas.add(editorFrameActionRenderable);
    // A definite-size host for whichever CONTRIBUTED surface claims the editor column, swapped IN
    // PLACE of editorArea (add/remove, not runtime flex toggling — OpenTUI doesn't re-lay-out on a
    // runtime flexGrow/height change). flexGrow:1 mirrors editorArea, so a surface sized height:100%
    // inside gets a real box. Not added until a surface claims the column.
    const surfaceContainer = new BoxRenderable(renderer, {
      id: 'editor-surface-container',
      flexGrow: 1,
      width: '100%',
      flexDirection: 'column',
    });
    // Draggable sidebar↔editor divider (1-cell bar). onMouseDrag fires globally while the button is
    // held (even off the bar), so a drag resizes smoothly; the model clamps to [min,max] + persists.
    const paneSplitters = new PaneSplitters.Class({
      renderer,
      settings,
      layoutSlots,
      // Both splitters read the same options as the painted slots. A divider cannot offer a width
      // that the layout refuses at the current terminal size.
      // invariant: Each dock stays a bounded minority of the row (src/modules/layout/layout.invariants.md)
      maximumSidebarSize: () =>
        LayoutModel.Class.maximumPrimaryDockColumns(
          buildLayoutModelOptions(currentLayoutColumns, currentLayoutRows),
        ),
    });
    const sidebarDivider = paneSplitters.sidebar.renderable;
    const maximumRightDockSize = (): number =>
      LayoutModel.Class.maximumRightDockColumns(
        buildLayoutModelOptions(currentLayoutColumns, currentLayoutRows),
      );
    const rightDockSplitter = new SplitterElement.Class({
      renderer,
      identifier: 'right-dock-divider',
      orientation: 'vertical',
      reportUnit: 'cells',
      initialSize: layoutSlots.rightDockColumns.value,
      minimumSize: () => Math.min(16, maximumRightDockSize()),
      // The live bound, not a fixed 70: the same generator the layout clamps with, so the divider
      // stops exactly where the painted dock stops at this terminal width.
      // invariant: Each dock stays a bounded minority of the row (src/modules/layout/layout.invariants.md)
      maximumSize: maximumRightDockSize,
      pointerDirection: -1,
      // Same two meanings as the sidebar divider: the live slot belongs to this workspace, the
      // setting is what the next fresh workspace starts at.
      // invariant: Layout slot sizes are workspace scoped (src/modules/layout/layout.invariants.md)
      currentSize: () => layoutSlots.rightDockColumns.value,
      onDragStart: () => {
        rightDockHost.focus();
        panelHost.blur();
      },
      onSizeChange: (width) => {
        layoutSlots.rightDockColumns.value = Math.round(width);
      },
      onDragEnd: () => {
        settings.rightDockWidth.value = layoutSlots.rightDockColumns.value;
        settings.save();
      },
    });
    // OpenTUI fires BOTH drag-end AND up on release, so guard the persist with an active-drag flag —
    // otherwise the release saves twice (still a per-drag write, but the invariant is exactly one).
    // SHARED-FILE CHANGE (activity bar, Task 7): the VS-Code activity bar is a self-contained pane
    // controller. RootView constructs it, mounts its 4-col `bar` at the FAR LEFT of the main row (before
    // the sidebar), and calls activityBar.update() each frame. It owns no active-view state — clicks +
    // its keybindings switch the per-workspace Workspace.primaryPaneContentIdentifier through
    // Workspace.focusPrimaryPane.
    const activityBar = new ActivityBar.Class({
      renderer,
      identifier: 'activity-bar',
      activitySurface,
      tooltip,
      keybindings,
      commands,
      activityAccent: () => theme.glyph('activityAccentBar'),
      glyphLevel: () => theme.glyphLevel.value,
    });
    const rightActivityBar = new ActivityBar.Class({
      renderer,
      identifier: 'right-activity-bar',
      activitySurface,
      tooltip,
      keybindings,
      commands,
      activityAccent: () => theme.glyph('activityAccentBar'),
      glyphLevel: () => theme.glyphLevel.value,
    });
    const mountedPrimaryDockSplitters = new Set<SplitterElement.Model>();
    const synchronizePrimaryDockSplitters = (palette: Palette): void => {
      const activeSplitters = primaryDockHost.visible.value
        ? (primaryDockHost.activeContent?.splitters?.() ?? [])
        : [];
      const activeElements = new Set(
        activeSplitters.map((splitter) => splitter.element),
      );
      for (const content of primaryDockHost.orderedContents) {
        for (const splitter of content.splitters?.() ?? []) {
          if (!mountedPrimaryDockSplitters.has(splitter.element)) {
            sidebar.add(splitter.element.renderable);
            mountedPrimaryDockSplitters.add(splitter.element);
          }
        }
      }
      for (const splitterElement of mountedPrimaryDockSplitters) {
        if (!activeElements.has(splitterElement)) {
          splitterElement.renderable.visible = false;
        }
        splitterElement.updateAppearance(palette);
      }
      for (const splitter of activeSplitters) {
        splitter.element.setGeometry(splitter.geometry());
        splitter.element.updateAppearance(palette);
      }
    };
    layoutCanvas.add(activityBar.bar);
    layoutCanvas.add(sidebar);
    layoutCanvas.add(sidebarDivider);
    layoutCanvas.add(editorColumn);
    layoutCanvas.add(rightActivityBar.bar);
    const rightDockBox = new BoxRenderable(renderer, {
      id: 'right-dock',
      position: 'absolute',
      border: true,
      borderStyle: 'rounded',
      flexDirection: 'column',
      title: 'Right Dock',
      visible: false,
    });
    const rightDockBody = new TextRenderable(renderer, {
      id: 'right-dock-body',
      content: '',
      wrapMode: 'none',
      width: '100%',
      height: '100%',
    });
    rightDockBox.add(rightDockBody);
    rightDockBox.onMouseDown = () => {
      rightDockHost.focus();
      renderer.requestRender();
    };
    rightDockBody.onMouseDown = (event: MouseEvent) => {
      rightDockHost.focus();
      rightDockHost.activeContent?.onPointerDown?.(
        Number(event.x) - Number(rightDockBody.x),
        Number(event.y) - Number(rightDockBody.y),
        {
          screenColumn: Number(event.x),
          screenRow: Number(event.y),
          button: event.button,
          modifiers: event.modifiers,
        },
      );
      renderer.requestRender();
    };
    rightDockBody.onMouseMove = (event: MouseEvent) => {
      const content = rightDockHost.activeContent;
      const localColumn = Number(event.x) - Number(rightDockBody.x);
      const localRow = Number(event.y) - Number(rightDockBody.y);
      content?.onPointerMove?.(localColumn, localRow);
      const tooltipText = content?.tooltipAt?.(localColumn, localRow) ?? null;
      if (tooltipText) {
        tooltip.point(tooltipText, Number(event.x), Number(event.y));
      } else {
        tooltip.clear();
      }
      renderer.requestRender();
    };
    rightDockBody.onMouseOut = () => {
      rightDockHost.activeContent?.onPointerOut?.();
      tooltip.clear();
      renderer.requestRender();
    };
    rightDockBody.onMouseScroll = (event) => {
      const direction = event.scroll?.direction;
      if (direction !== 'up' && direction !== 'down') return;
      rightDockHost.activeContent?.onWheel?.(
        (direction === 'up' ? -1 : 1) * wheelStep(event),
        {
          column: Number(event.x) - Number(rightDockBody.x),
          row: Number(event.y) - Number(rightDockBody.y),
          modifiers: event.modifiers,
        },
      );
      renderer.requestRender();
    };
    layoutCanvas.add(rightDockSplitter.renderable);
    layoutCanvas.add(rightDockBox);
    mainRow.add(layoutCanvas);
    // The status bar is a self-contained pane controller: it owns its renderables (bar/text/`?` button),
    // the button's hover state, and its handlers. RootView mounts statusBar.bar and calls update().
    const statusBar = new StatusBar.Class({
      renderer,
      workspaceSet,
      app,
      shortcutHelp,
      overlayCoordinator,
      keybindings,
      tooltip,
      theme,
      settingsPanel,
      panelHost,
      rightDockHost,
      primaryDockHost,
      statusBarSegments,
      toggleTerminal,
      toggleRightDock,
    });
    // --- bottom panel slot (the composable PanelHost region) --------------------------------------
    // A full-width region below the main row, above the status bar, hosting the active PaneContent
    // (the terminal for tier S). It is a SLOT, not a hardwired terminal — RootView pulls
    // panelHost.activeContent.render() and never names the terminal. mainRow uses flexGrow (not a fixed
    // height), so a fixed-height panel here makes the main row shrink to fit — the panel height is an
    // INPUT from the splitter, never derived from its content.
    // invariant: A scrollable pane height is an input not an output (src/modules/ui/ui.invariants.md)
    // INTEGRATOR NOTE: this bottom-panel mount is the ONE shared RootView touch for the terminal; it is
    // independent of the activity-bar change landing in parallel (which touches the sidebar/left slot).
    const initialLayoutColumns = Math.max(
      1,
      renderer.width -
        (settings.workspaceTabPosition.value === 'left' ? 22 : 0),
    );
    const initialLayoutRows = Math.max(
      1,
      renderer.height -
        1 -
        1 -
        (settings.workspaceTabPosition.value === 'top' ? 2 : 0),
    );
    // The bottom panel's height is a workspace-owned slot like the two dock widths. Its default
    // depends on the terminal size, which only this view knows, so the view seeds the slot the
    // first time it is built and the layout module owns it from then on.
    // invariant: Layout slot sizes are workspace scoped (src/modules/layout/layout.invariants.md)
    if (layoutSlots.bottomPanelRows.value <= 0) {
      layoutSlots.bottomPanelRows.value =
        LayoutModel.Class.defaultBottomPanelRows(initialLayoutRows);
    }
    let currentLayoutColumns = initialLayoutColumns;
    let currentLayoutRows = initialLayoutRows;
    // One options object for every LayoutModel question — the resolve on each frame and the right-dock
    // splitter's live maximum. Both must read the same configuration, or the divider would allow a
    // width the layout then refuses.
    const buildLayoutModelOptions = (
      totalColumns: number,
      totalRows: number,
    ): LayoutModelOptions => ({
      totalColumns,
      totalRows,
      primaryDockVisible: primaryDockHost.visible.value,
      activityBarVisible: settings.showActivityBar.value,
      activityBarColumns: 4,
      sidebarColumns: sidebarWidth(),
      sidebarPosition: settings.sidebarPosition.value,
      rightDockVisible: rightDockHost.visible.value,
      rightDockColumns: layoutSlots.rightDockColumns.value,
      rightActivityBarVisible: settings.showRightActivityBar.value,
      bottomPanelVisible: panelHost.visible.value,
      bottomPanelExpanded: panelHost.expanded.value,
      bottomPanelRows: layoutSlots.bottomPanelRows.value,
      panelAlignment: settings.panelAlignment.value,
      leftDockVerticalSpan: settings.leftDockVerticalSpan.value,
      rightDockVerticalSpan: settings.rightDockVerticalSpan.value,
    });
    const panelBox = new BoxRenderable(renderer, {
      id: 'panel-box',
      position: 'absolute',
      height: layoutSlots.bottomPanelRows.value,
      flexShrink: 0,
      border: false,
      flexDirection: 'row', // visible split cells lay out left-to-right; one cell = the degenerate case
      title: '',
      backgroundColor: readPalette().panel,
    });
    // The panel's content area gets a STATED affordance when it holds no
    // instances, exactly as the editor column does when no editor is installed.
    // A panel that empties must never read as a blank region the user has to
    // guess about; the instances list keeps its + button and this says what to do.
    const panelEmptyNotice = new TextRenderable(renderer, {
      id: 'panel-empty-notice',
      content: '',
      flexGrow: 1,
      height: '100%',
      wrapMode: 'none',
      selectable: false,
    });
    let panelEmptyNoticeMounted = false;
    const primaryDockRemainder = new BoxRenderable(renderer, {
      id: 'primary-dock-remainder',
      position: 'absolute',
      backgroundColor: readPalette().panel,
    });
    const rightDockRemainder = new BoxRenderable(renderer, {
      id: 'right-dock-remainder',
      position: 'absolute',
      backgroundColor: readPalette().panel,
    });
    const panelContentsList = new PanelContentsList.Class(
      panelHost,
      (targetIdentifier, anchor) =>
        openPanelPaneAddPopup(anchor, targetIdentifier),
      (anchor) => openPanelPaneAddPopup(anchor),
    );
    const panelContentsListRenderable = new TextRenderable(renderer, {
      id: 'panel-contents-list',
      content: '',
      width: 0,
      height: '100%',
      flexShrink: 0,
      wrapMode: 'none',
      selectable: false,
    });
    const capturePanelContentsListPointer = (): void => {
      const renderableWithContext = panelContentsListRenderable as unknown as {
        _ctx?: {
          setCapturedRenderable?: (renderable: unknown) => void;
        };
      };
      renderableWithContext._ctx?.setCapturedRenderable?.(
        panelContentsListRenderable,
      );
    };
    panelContentsListRenderable.onMouseDown = (event) => {
      capturePanelContentsListPointer();
      panelContentsList.pointerDown(
        Number(event.x) - Number(panelContentsListRenderable.x),
        Number(event.y) - Number(panelContentsListRenderable.y),
        Number(event.x),
        Number(event.y),
      );
      renderer.requestRender();
      RenderRequest.Class.afterCurrentTurn(() => renderer.requestRender());
    };
    panelContentsListRenderable.onMouseDrag = (event) => {
      panelContentsList.pointerDrag(
        Number(event.x) - Number(panelContentsListRenderable.x),
        Number(event.y) - Number(panelContentsListRenderable.y),
      );
      renderer.requestRender();
    };
    panelContentsListRenderable.onMouseMove = (event) => {
      const localColumn =
        Number(event.x) - Number(panelContentsListRenderable.x);
      const localRow = Number(event.y) - Number(panelContentsListRenderable.y);
      panelContentsList.pointerMove(localColumn, localRow);
      const tooltipText = panelContentsList.tooltipAt(localColumn, localRow);
      if (tooltipText)
        tooltip.point(tooltipText, Number(event.x), Number(event.y));
      else tooltip.clear();
      renderer.requestRender();
    };
    panelContentsListRenderable.onMouseOut = () => {
      panelContentsList.pointerOut();
      tooltip.clear();
      renderer.requestRender();
    };
    const finishPanelContentsListDrag = (): void => {
      panelContentsList.pointerUp();
    };
    panelContentsListRenderable.onMouseUp = finishPanelContentsListDrag;
    panelContentsListRenderable.onMouseDragEnd = finishPanelContentsListDrag;
    const panelContentsListSplitter = new SplitterElement.Class({
      renderer,
      identifier: 'panel-contents-list-divider',
      orientation: 'vertical',
      reportUnit: 'cells',
      initialSize: panelContentsList.width,
      minimumSize: 10,
      maximumSize: () =>
        Math.max(10, Math.min(40, layoutSlotGeometry.bottomPanel.width - 2)),
      pointerDirection: -1,
      currentSize: () => panelContentsList.width,
      onSizeChange: (width) => panelContentsList.setWidth(width),
      onDragEnd: () => panelHost.options.persistWorkspaceState?.(),
    });
    let panelMounted = false;
    // Pane contents may publish an external scroll extent (the terminal keeps its position in xterm).
    // This host supplies the same settings-derived physics and SolidThumbScrollBar projection to every
    // such content without learning its kind.
    const paneScrollPort: PaneScrollPort = {
      momentumOptions: () => ({
        impulse: settings.scrollAccelGain.value,
        max: settings.verticalFlingCeiling.value,
        decayPerSec: settings.scrollFriction.value,
        stopVelocity: Momentum.Class.verticalOptions.stopVelocity,
        maximumGlideDurationMilliseconds:
          settings.maximumGlideDurationMilliseconds.value,
      }),
      requestRender: () => renderer.requestRender(),
    };
    const contentsWithScrollPort = new WeakSet<PaneContent>();
    // Split-aware panel body: a reconciling POOL of cell views. Each visible cell is one TextRenderable
    // body; adjacent cells are separated by a 1-column divider whose drag re-flows the two it sits
    // between (a vertical ratio SplitterModel over the panel's inner width). ONE visible cell means no
    // divider and a full-width body — pixel-identical to the pre-split single-pane panel. The pool is
    // grown on demand and re-attached in order only when the visible-cell COUNT changes (rare), so steady
    // frames just update widths and content.
    interface PanelCellView {
      readonly container: BoxRenderable;
      readonly frameHeader: TextRenderable;
      readonly body: TextRenderable;
      readonly verticalScrollBar: SolidThumbScrollBar.Model;
      readonly verticalScrollBarState: {
        applyingGeometry: boolean;
        reportedToTrueScale: number;
      };
      readonly splitterElement: SplitterElement.Model | null;
      frameHeaderCloseHovered: boolean;
    }
    const panelCellViews: PanelCellView[] = [];
    let mountedPanelCellCount = -1;
    let mountedPanelContentsListVisible = false;
    // Cumulative width share up to and including the divider's LEFT cell — the [0,1] boundary a ratio
    // SplitterModel reports, so a drag anchors exactly where the divider currently sits.
    const panelBoundaryFraction = (dividerIndex: number): number => {
      const cells = panelHost.resolvedCells;
      let fraction = 0;
      for (
        let index = 0;
        index <= dividerIndex && index < cells.length;
        index += 1
      )
        fraction += cells[index]?.ratio ?? 0;
      return fraction;
    };
    const ensurePanelCellView = (index: number): PanelCellView => {
      const existing = panelCellViews[index];
      if (existing) return existing;
      const container = new BoxRenderable(renderer, {
        id: `panel-cell-region-${index}`,
        flexDirection: 'column',
        flexShrink: 0,
        height: '100%',
        minHeight: 0,
      });
      const body = new TextRenderable(renderer, {
        id: `panel-cell-${index}`,
        content: '',
        wrapMode: 'none',
        flexGrow: 1,
        minHeight: 0,
        width: '100%',
      });
      const frameHeader = new TextRenderable(renderer, {
        id: `panel-cell-${index}-frame-header`,
        content: '',
        wrapMode: 'none',
        height: 0,
        width: '100%',
        selectable: false,
      });
      const verticalScrollBarState = {
        applyingGeometry: false,
        reportedToTrueScale: 1,
      };
      const verticalScrollBar = new SolidThumbScrollBar.Class(renderer, {
        id: `panel-cell-${index}-scrollbar-v`,
        orientation: 'vertical',
        position: 'absolute',
        width: 1,
        showArrows: false,
        visible: false,
        zIndex: 50,
        onChange: (position) => {
          if (verticalScrollBarState.applyingGeometry) return;
          const content = panelHost.resolvedCells[index]?.content;
          if (!content?.scrollToLine) return;
          content.haltScrollMomentum?.();
          content.scrollToLine(
            Math.round(position * verticalScrollBarState.reportedToTrueScale),
          );
          renderer.requestRender();
        },
      });
      container.add(frameHeader);
      container.add(body);
      container.add(verticalScrollBar);
      // Focus follows a click at the cell grain. The active content owns its pointer behavior.
      body.onMouseDown = (event: MouseEvent) => {
        panelHost.focus();
        panelHost.focusCell(index);
        const localColumn = (event.x as number) - (body.x as number);
        const localRow = (event.y as number) - (body.y as number);
        panelHost.resolvedCells[index]?.content.onPointerDown?.(
          localColumn,
          localRow,
          {
            screenColumn: Number(event.x),
            screenRow: Number(event.y),
            button: event.button,
            modifiers: event.modifiers,
          },
        );
        renderer.requestRender();
      };
      body.onMouseMove = (event: MouseEvent) => {
        const content = panelHost.resolvedCells[index]?.content;
        const localColumn = Number(event.x) - Number(body.x);
        const localRow = Number(event.y) - Number(body.y);
        content?.onPointerMove?.(localColumn, localRow, {
          screenColumn: Number(event.x),
          screenRow: Number(event.y),
          button: event.button,
          modifiers: event.modifiers,
        });
        const tooltipText = content?.tooltipAt?.(localColumn, localRow) ?? null;
        if (tooltipText) {
          tooltip.point(tooltipText, Number(event.x), Number(event.y));
        } else {
          tooltip.clear();
        }
        renderer.requestRender();
      };
      body.onMouseOut = () => {
        panelHost.resolvedCells[index]?.content.onPointerOut?.();
        tooltip.clear();
        renderer.requestRender();
      };
      body.onMouseDrag = (event: MouseEvent) => {
        panelHost.resolvedCells[index]?.content.onPointerDrag?.(
          (event.x as number) - (body.x as number),
          (event.y as number) - (body.y as number),
          {
            screenColumn: Number(event.x),
            screenRow: Number(event.y),
            button: event.button,
            modifiers: event.modifiers,
          },
        );
        renderer.requestRender();
      };
      const endContentDrag = (event: MouseEvent): void => {
        panelHost.resolvedCells[index]?.content.onPointerUp?.(
          (event.x as number) - (body.x as number),
          (event.y as number) - (body.y as number),
          {
            screenColumn: Number(event.x),
            screenRow: Number(event.y),
            button: event.button,
            modifiers: event.modifiers,
          },
        );
        renderer.requestRender();
      };
      body.onMouseUp = endContentDrag;
      body.onMouseDragEnd = endContentDrag;
      // Vertical wheel input routes through the active pane content.
      body.onMouseScroll = (event) => {
        const content = panelHost.resolvedCells[index]?.content;
        if (!content?.onWheel) return;
        const direction = event.scroll?.direction;
        if (direction !== 'up' && direction !== 'down') return;
        content.onWheel((direction === 'up' ? -1 : 1) * wheelStep(event), {
          column: Number(event.x) - Number(body.x),
          row: Number(event.y) - Number(body.y),
          modifiers: event.modifiers,
        });
        renderer.requestRender();
      };
      frameHeader.onMouseDown = (event) => {
        const content = panelHost.resolvedCells[index]?.content;
        if (
          !content ||
          Number(event.x) <
            Number(frameHeader.x) + Number(frameHeader.width) - 3
        )
          return;
        panelHost.closeOpenContent(content.id);
        renderer.requestRender();
      };
      frameHeader.onMouseMove = (event) => {
        const closeHovered =
          Number(event.x) >=
          Number(frameHeader.x) + Number(frameHeader.width) - 3;
        const view = panelCellViews[index];
        if (view) view.frameHeaderCloseHovered = closeHovered;
        if (closeHovered)
          tooltip.point('Close instance', Number(event.x), Number(event.y));
        else tooltip.clear();
        renderer.requestRender();
      };
      frameHeader.onMouseOut = () => {
        const view = panelCellViews[index];
        if (view) view.frameHeaderCloseHovered = false;
        tooltip.clear();
        renderer.requestRender();
      };
      let splitterElement: SplitterElement.Model | null = null;
      if (index >= 1) {
        const dividerIndex = index - 1;
        splitterElement = new SplitterElement.Class({
          renderer,
          identifier: `panel-cell-divider-${dividerIndex}`,
          orientation: 'vertical',
          reportUnit: 'ratio',
          initialSize: 0.5,
          extentCells: 1,
          currentSize: () => panelBoundaryFraction(dividerIndex),
          currentExtentCells: () => Math.max(1, panelViewportColumns()),
          onDragStart: () => panelHost.focus(),
          onSizeChange: (fraction) => {
            panelHost.moveDivider(dividerIndex, fraction);
            renderer.requestRender();
          },
        });
      }
      const view: PanelCellView = {
        container,
        frameHeader,
        body,
        verticalScrollBar,
        verticalScrollBarState,
        splitterElement,
        frameHeaderCloseHovered: false,
      };
      panelCellViews[index] = view;
      return view;
    };
    // Mount exactly `count` cell views in left-to-right order (divider before each body from cell 1 on).
    // Only re-attaches when the count changes; unchanged frames skip all mount churn.
    const syncPanelCellMount = (count: number): void => {
      if (
        count === mountedPanelCellCount &&
        panelContentsList.visible === mountedPanelContentsListVisible
      ) {
        return;
      }
      for (const view of panelCellViews) {
        panelBox.remove(view.container);
        if (view.splitterElement)
          panelBox.remove(view.splitterElement.renderable);
      }
      panelBox.remove(panelContentsListRenderable);
      panelBox.remove(panelContentsListSplitter.renderable);
      if (panelEmptyNoticeMounted) {
        panelBox.remove(panelEmptyNotice);
        panelEmptyNoticeMounted = false;
      }
      if (count === 0) {
        panelBox.add(panelEmptyNotice);
        panelEmptyNoticeMounted = true;
      }
      for (let index = 0; index < count; index += 1) {
        const view = ensurePanelCellView(index);
        if (view.splitterElement) panelBox.add(view.splitterElement.renderable);
        panelBox.add(view.container);
      }
      if (panelContentsList.visible) {
        panelBox.add(panelContentsListSplitter.renderable);
        panelBox.add(panelContentsListRenderable);
      }
      mountedPanelCellCount = count;
      mountedPanelContentsListVisible = panelContentsList.visible;
    };
    let panelTabBarProjection: PanelTabBarProjection | null = null;
    // Draggable panel height: a HORIZONTAL SplitterModel in cells. The grab strip sits ABOVE the panel,
    // so dragging UP must GROW the panel — the pointer Y is negated before it reaches the model (up =
    // smaller Y = larger negated position = larger height). Reuses the shared splitter (min 3 rows).
    const panelSplitter = new SplitterElement.Class({
      renderer,
      identifier: 'panel-divider',
      orientation: 'horizontal',
      reportUnit: 'cells',
      initialSize: layoutSlots.bottomPanelRows.value,
      minimumSize: 3,
      maximumSize: () =>
        LayoutModel.Class.maximumUnexpandedBottomPanelRows(currentLayoutRows),
      pointerDirection: -1,
      currentSize: () => layoutSlots.bottomPanelRows.value,
      // The one-cell leading paint gap remains inside the splitter's drag hit geometry.
      leadingPaintPadCells: () =>
        panelTabBarProjection?.dragLeadingPaintPadCells ?? 0,
      onDragStart: () => panelHost.focus(),
      onSizeChange: (height) => {
        layoutSlots.bottomPanelRows.value = Math.round(height);
        renderer.requestRender();
      },
    });
    const panelDividerRenderable = panelSplitter.renderable;
    const panelControlBarRenderable = new TextRenderable(renderer, {
      id: 'panel-control-bar',
      content: '',
      position: 'absolute',
      width: 10,
      height: 1,
      wrapMode: 'none',
      selectable: false,
      zIndex: 60,
    });
    const panelTabBarRenderable = new TextRenderable(renderer, {
      id: 'panel-space-tab-bar',
      content: '',
      position: 'absolute',
      width: 0,
      height: 1,
      wrapMode: 'none',
      selectable: false,
      zIndex: 60,
    });
    const panelTabControlRenderable = new TextRenderable(renderer, {
      id: 'panel-space-add',
      content: '',
      position: 'absolute',
      width: 0,
      height: 1,
      wrapMode: 'none',
      selectable: false,
      zIndex: 60,
    });
    let editorFrameActionProjection: PanelTabBarEditorFrameProjection | null =
      null;
    let hoveredPanelTabIdentifier: string | null = null;
    let hoveredPanelEditorCommandIdentifier: string | null = null;
    let hoveredPanelControlBarAction: PanelTabBarAction | null = null;
    const panelTabDrag = new DragReorder.Class((identifier, targetIndex) =>
      panelHost.moveSpace(identifier, targetIndex),
    );
    editorFrameActionRenderable.onMouseDown = (event) => {
      editorContentMount.contributedSurface?.clearPointerHover?.();
      const actionBarColumn =
        Number(event.x) - Number(editorFrameActionRenderable.x);
      const editorAction = editorFrameActionProjection
        ? PanelTabBar.Class.editorActionAtColumn(
            editorFrameActionProjection,
            actionBarColumn,
          )
        : null;
      if (editorAction) {
        commands.run(editorAction.commandId);
      } else {
        return;
      }
      renderer.requestRender();
    };
    editorFrameActionRenderable.onMouseMove = (event) => {
      editorContentMount.contributedSurface?.clearPointerHover?.();
      const actionBarColumn =
        Number(event.x) - Number(editorFrameActionRenderable.x);
      const editorAction = editorFrameActionProjection
        ? PanelTabBar.Class.editorActionAtColumn(
            editorFrameActionProjection,
            actionBarColumn,
          )
        : null;
      const nextHoveredCommandIdentifier = editorAction?.commandId ?? null;
      if (
        hoveredPanelEditorCommandIdentifier !== nextHoveredCommandIdentifier
      ) {
        hoveredPanelEditorCommandIdentifier = nextHoveredCommandIdentifier;
        renderer.requestRender();
      }
      if (editorAction) {
        tooltip.point(editorAction.title, Number(event.x), Number(event.y));
      } else {
        tooltip.clear();
      }
    };
    editorFrameActionRenderable.onMouseOut = () => {
      if (hoveredPanelEditorCommandIdentifier !== null) {
        hoveredPanelEditorCommandIdentifier = null;
        renderer.requestRender();
      }
      tooltip.clear();
    };
    panelControlBarRenderable.onMouseDown = (event) => {
      panelHost.focus();
      const action = panelTabBarProjection
        ? PanelTabBar.Class.controlAtColumn(
            panelTabBarProjection,
            Number(event.x) -
              Number(panelControlBarRenderable.x) +
              layoutSlotGeometry.bottomPanelSplitter.width -
              panelTabBarProjection.splitterControlWidth,
          )
        : null;
      if (action?.action === 'expand') {
        panelHost.toggleExpanded();
      } else if (action?.action === 'close') {
        panelHost.hide();
      }
      renderer.requestRender();
    };
    panelControlBarRenderable.onMouseMove = (event) => {
      const control = panelTabBarProjection
        ? PanelTabBar.Class.controlAtColumn(
            panelTabBarProjection,
            Number(event.x) -
              Number(panelControlBarRenderable.x) +
              layoutSlotGeometry.bottomPanelSplitter.width -
              panelTabBarProjection.splitterControlWidth,
          )
        : null;
      const nextHoveredAction = control?.action ?? null;
      if (hoveredPanelControlBarAction !== nextHoveredAction) {
        hoveredPanelControlBarAction = nextHoveredAction;
        renderer.requestRender();
      }
      if (control) {
        tooltip.point(control.tooltip, Number(event.x), Number(event.y));
      } else {
        tooltip.clear();
      }
    };
    panelControlBarRenderable.onMouseOut = () => {
      if (hoveredPanelControlBarAction !== null) {
        hoveredPanelControlBarAction = null;
        renderer.requestRender();
      }
      tooltip.clear();
    };
    panelTabBarRenderable.onMouseDown = (event) => {
      const column = Number(event.x) - Number(panelTabBarRenderable.x);
      const close = panelTabBarProjection
        ? PanelTabBar.Class.tabCloseAtColumn(panelTabBarProjection, column)
        : null;
      const tab = panelTabBarProjection
        ? PanelTabBar.Class.tabAtColumn(panelTabBarProjection, column)
        : null;
      if (close) panelHost.closeOpenSpace(close.identifier);
      else if (tab) {
        const renderableWithContext = panelTabBarRenderable as unknown as {
          _ctx?: { setCapturedRenderable?: (renderable: unknown) => void };
        };
        renderableWithContext._ctx?.setCapturedRenderable?.(
          panelTabBarRenderable,
        );
        panelTabDrag.begin(tab.identifier);
        panelHost.selectSpace(tab.identifier);
        panelHost.focus();
      }
      renderer.requestRender();
    };
    panelTabBarRenderable.onMouseDrag = (event) => {
      const column = Number(event.x) - Number(panelTabBarRenderable.x);
      const targetIndex = panelTabBarProjection?.tabs.findIndex(
        (tab) => column >= tab.startColumn && column < tab.endColumn,
      );
      if (targetIndex === undefined || targetIndex < 0) return;
      if (panelTabDrag.move(targetIndex)) renderer.requestRender();
    };
    const finishPanelTabDrag = (): void => panelTabDrag.end();
    panelTabBarRenderable.onMouseUp = finishPanelTabDrag;
    panelTabBarRenderable.onMouseDragEnd = finishPanelTabDrag;
    panelTabBarRenderable.onMouseMove = (event) => {
      const column = Number(event.x) - Number(panelTabBarRenderable.x);
      const tab = panelTabBarProjection
        ? PanelTabBar.Class.tabAtColumn(panelTabBarProjection, column)
        : null;
      const nextIdentifier = tab?.identifier ?? null;
      if (nextIdentifier !== hoveredPanelTabIdentifier) {
        hoveredPanelTabIdentifier = nextIdentifier;
        renderer.requestRender();
      }
    };
    panelTabBarRenderable.onMouseOut = () => {
      hoveredPanelTabIdentifier = null;
      tooltip.clear();
    };
    panelTabControlRenderable.onMouseDown = (event) => {
      const column =
        Number(event.x) -
        Number(panelTabControlRenderable.x) +
        layoutSlotGeometry.bottomPanelTabs.width -
        (panelTabBarProjection?.tabControlWidth ?? 0);
      if (
        panelTabBarProjection &&
        PanelTabBar.Class.instancesToggleAtColumn(panelTabBarProjection, column)
      ) {
        panelHost.togglePanelList();
      } else if (
        panelTabBarProjection &&
        PanelTabBar.Class.spaceAddAtColumn(panelTabBarProjection, column)
      ) {
        openPanelAddPopup({
          column: Number(event.x),
          row: Number(event.y),
        });
      }
      renderer.requestRender();
    };
    panelTabControlRenderable.onMouseMove = (event) => {
      const column =
        Number(event.x) -
        Number(panelTabControlRenderable.x) +
        layoutSlotGeometry.bottomPanelTabs.width -
        (panelTabBarProjection?.tabControlWidth ?? 0);
      const add = panelTabBarProjection
        ? PanelTabBar.Class.spaceAddAtColumn(panelTabBarProjection, column)
        : null;
      const instances = panelTabBarProjection
        ? PanelTabBar.Class.instancesToggleAtColumn(
            panelTabBarProjection,
            column,
          )
        : null;
      hoveredPanelControlBarAction = add
        ? 'pane-add'
        : instances
          ? 'pane-list'
          : null;
      const tooltipText = add?.tooltip ?? instances?.tooltip ?? null;
      if (tooltipText)
        tooltip.point(tooltipText, Number(event.x), Number(event.y));
      else tooltip.clear();
      renderer.requestRender();
    };
    panelTabControlRenderable.onMouseOut = () => {
      hoveredPanelControlBarAction = null;
      tooltip.clear();
      renderer.requestRender();
    };
    // Clicking the panel focuses it (focus-follows-click). Blur-on-outside is handled in Bootstrap's
    // global mouse handler via panelContainsPoint.
    panelBox.onMouseDown = () => {
      panelHost.focus();
      renderer.requestRender();
    };
    function synchronizePanelMount(): void {
      const visible = panelHost.visible.value;
      if (visible === panelMounted) return;
      if (visible) {
        layoutCanvas.add(primaryDockRemainder);
        layoutCanvas.add(rightDockRemainder);
        layoutCanvas.add(panelDividerRenderable);
        layoutCanvas.add(panelControlBarRenderable);
        layoutCanvas.add(panelTabBarRenderable);
        layoutCanvas.add(panelTabControlRenderable);
        layoutCanvas.add(panelBox);
      } else {
        layoutCanvas.remove(primaryDockRemainder);
        layoutCanvas.remove(rightDockRemainder);
        layoutCanvas.remove(panelDividerRenderable);
        layoutCanvas.remove(panelControlBarRenderable);
        layoutCanvas.remove(panelTabBarRenderable);
        layoutCanvas.remove(panelTabControlRenderable);
        layoutCanvas.remove(panelBox);
      }
      panelMounted = visible;
    }
    // Resolved cell region of the flat panel slot. Read the current LayoutModel result,
    // not the renderable's previous Yoga box: absolute slot geometry is applied during this paint, so
    // layout read-back would be one frame stale when a quiet pane first opens.
    const panelViewportColumns = (): number =>
      panelHost.visible.value
        ? Math.max(
            1,
            layoutSlotGeometry.bottomPanel.width -
              (panelContentsList.visible ? panelContentsList.width + 1 : 0),
          )
        : 0;
    const panelViewportRows = (): number =>
      panelHost.visible.value
        ? Math.max(1, layoutSlotGeometry.bottomPanel.height)
        : 0;
    const panelContainsPoint = (x: number, y: number): boolean => {
      if (!panelHost.visible.value) return false;
      const boxX = panelBox.x as number;
      const boxY = panelBox.y as number;
      const boxWidth = panelBox.width as number;
      const boxHeight = panelBox.height as number;
      // Include both chrome rows above the box. Grabbing the splitter must not blur the terminal.
      return (
        statusBar.panelControlContainsPoint(x, y) ||
        (x >= boxX &&
          x < boxX + boxWidth &&
          y >= boxY - 2 &&
          y < boxY + boxHeight)
      );
    };
    const rightDockViewportColumns = (): number =>
      rightDockHost.visible.value
        ? Math.max(1, layoutSlotGeometry.rightDock.width - 2)
        : 0;
    const rightDockViewportRows = (): number =>
      rightDockHost.visible.value
        ? Math.max(1, layoutSlotGeometry.rightDock.height - 2)
        : 0;
    const rightDockContainsPoint = (x: number, y: number): boolean => {
      if (!rightDockHost.visible.value) return false;
      const boxLeft = Number(rightDockBox.x);
      const boxTop = Number(rightDockBox.y);
      return (
        statusBar.rightDockControlContainsPoint(x, y) ||
        (x >= boxLeft &&
          x < boxLeft + Number(rightDockBox.width) &&
          y >= boxTop &&
          y < boxTop + Number(rightDockBox.height))
      );
    };
    const activityBarContainsPoint = (x: number, y: number): boolean => {
      const contains = (bar: BoxRenderable): boolean =>
        bar.visible &&
        x >= Number(bar.x) &&
        x < Number(bar.x) + Number(bar.width) &&
        y >= Number(bar.y) &&
        y < Number(bar.y) + Number(bar.height);
      return contains(activityBar.bar) || contains(rightActivityBar.bar);
    };
    let layoutSlotGeometry: LayoutSlotGeometry = LayoutModel.Class.resolve(
      buildLayoutModelOptions(1, 1),
    );
    // Resolve from the renderer's accepted viewport. A previous positive Yoga size is the previous
    // frame on terminal resize and must never override this external input.
    // invariant: A controlling PTY resize reaches the renderer (src/modules/terminal/terminal.invariants.md)
    const synchronizeLayoutGeometry = (): void => {
      const totalColumns = Math.max(
        1,
        renderer.width -
          (settings.workspaceTabPosition.value === 'left' ? 22 : 0),
      );
      const totalRows = Math.max(
        1,
        renderer.height -
          1 -
          1 -
          (settings.workspaceTabPosition.value === 'top' ? 2 : 0),
      );
      currentLayoutColumns = totalColumns;
      currentLayoutRows = totalRows;
      layoutSlotGeometry = LayoutModel.Class.resolve(
        buildLayoutModelOptions(totalColumns, totalRows),
      );
      if (primaryDockHost.visible.value) {
        paneSplitters.sidebar.size = layoutSlotGeometry.sidebar.width;
      }
      if (rightDockHost.visible.value) {
        rightDockSplitter.size = layoutSlotGeometry.rightDock.width;
      }
      editorFrameAttribution.recordLayoutComputation();
      activityBar.bar.position = 'absolute';
      activityBar.bar.left = layoutSlotGeometry.activityBar.left;
      activityBar.bar.top = layoutSlotGeometry.activityBar.top;
      activityBar.bar.width = layoutSlotGeometry.activityBar.width;
      activityBar.bar.height = layoutSlotGeometry.activityBar.height;
      rightActivityBar.bar.position = 'absolute';
      rightActivityBar.bar.left = layoutSlotGeometry.rightActivityBar.left;
      rightActivityBar.bar.top = layoutSlotGeometry.rightActivityBar.top;
      rightActivityBar.bar.width = layoutSlotGeometry.rightActivityBar.width;
      rightActivityBar.bar.height = layoutSlotGeometry.rightActivityBar.height;
      sidebar.left = layoutSlotGeometry.sidebar.left;
      sidebar.top = layoutSlotGeometry.sidebar.top;
      sidebar.width = layoutSlotGeometry.sidebar.width;
      sidebar.height = layoutSlotGeometry.sidebar.height;
      sidebar.visible = primaryDockHost.visible.value;
      paneSplitters.sidebar.setGeometry({
        left: layoutSlotGeometry.sidebarSplitter.left,
        top: layoutSlotGeometry.sidebarSplitter.top,
        length: layoutSlotGeometry.sidebarSplitter.height,
        visible: primaryDockHost.visible.value,
      });
      editorColumn.left = layoutSlotGeometry.editorCenter.left;
      editorColumn.top = layoutSlotGeometry.editorCenter.top;
      editorColumn.width = layoutSlotGeometry.editorCenter.width;
      editorColumn.height = layoutSlotGeometry.editorCenter.height;
      rightDockSplitter.setGeometry({
        left: layoutSlotGeometry.rightDockSplitter.left,
        top: layoutSlotGeometry.rightDockSplitter.top,
        length: layoutSlotGeometry.rightDockSplitter.height,
        visible: rightDockHost.visible.value,
      });
      rightDockBox.visible = rightDockHost.visible.value;
      rightDockBox.left = layoutSlotGeometry.rightDock.left;
      rightDockBox.top = layoutSlotGeometry.rightDock.top;
      rightDockBox.width = layoutSlotGeometry.rightDock.width;
      rightDockBox.height = layoutSlotGeometry.rightDock.height;
      if (panelHost.visible.value) {
        primaryDockRemainder.left =
          layoutSlotGeometry.primaryDockRemainder.left;
        primaryDockRemainder.top = layoutSlotGeometry.primaryDockRemainder.top;
        primaryDockRemainder.width =
          layoutSlotGeometry.primaryDockRemainder.width;
        primaryDockRemainder.height =
          layoutSlotGeometry.primaryDockRemainder.height;
        rightDockRemainder.left = layoutSlotGeometry.rightDockRemainder.left;
        rightDockRemainder.top = layoutSlotGeometry.rightDockRemainder.top;
        rightDockRemainder.width = layoutSlotGeometry.rightDockRemainder.width;
        rightDockRemainder.height =
          layoutSlotGeometry.rightDockRemainder.height;
        panelTabBarProjection = PanelTabBar.Class.project({
          width: layoutSlotGeometry.bottomPanelSplitter.width,
          spaces: panelHost.spaces.value,
          activeSpaceId: panelHost.activeSpaceId.value,
          activeSpaceKind: panelHost.activeSpace?.kind ?? null,
          paneCount: panelHost.activeSpaceContents.length,
          paneListExpanded: panelHost.panelListExpanded.value,
          expanded: panelHost.expanded.value,
          focused: panelHost.focused.value,
          hoveredTabIdentifier: hoveredPanelTabIdentifier,
          hoveredAction: hoveredPanelControlBarAction,
          glyphVocabulary: theme.glyphVocabulary,
          glyphLevel: theme.glyphLevel.value,
          palette: readPalette(),
        });
        const separatorLeft = layoutSlotGeometry.bottomPanelSplitter.left;
        const separatorTop = layoutSlotGeometry.bottomPanelSplitter.top;
        panelSplitter.setGeometry({
          left: separatorLeft,
          top: separatorTop,
          length: panelTabBarProjection.dragWidth,
          visible: !panelHost.expanded.value,
        });
        panelControlBarRenderable.left =
          separatorLeft +
          layoutSlotGeometry.bottomPanelSplitter.width -
          panelTabBarProjection.splitterControlWidth;
        panelControlBarRenderable.top = separatorTop;
        panelControlBarRenderable.width =
          panelTabBarProjection.splitterControlWidth;
        panelControlBarRenderable.visible =
          panelTabBarProjection.splitterControlWidth > 0;
        panelControlBarRenderable.content =
          panelTabBarProjection.splitterControlText;
        panelTabBarRenderable.left = layoutSlotGeometry.bottomPanelTabs.left;
        panelTabBarRenderable.top = layoutSlotGeometry.bottomPanelTabs.top;
        panelTabBarRenderable.width =
          layoutSlotGeometry.bottomPanelTabs.width -
          panelTabBarProjection.tabControlWidth;
        panelTabBarRenderable.content = panelTabBarProjection.tabText;
        panelTabControlRenderable.left =
          layoutSlotGeometry.bottomPanelTabs.left +
          layoutSlotGeometry.bottomPanelTabs.width -
          panelTabBarProjection.tabControlWidth;
        panelTabControlRenderable.top = layoutSlotGeometry.bottomPanelTabs.top;
        panelTabControlRenderable.width = panelTabBarProjection.tabControlWidth;
        panelTabControlRenderable.content =
          panelTabBarProjection.tabControlText;
        panelBox.left = layoutSlotGeometry.bottomPanel.left;
        panelBox.top = layoutSlotGeometry.bottomPanel.top;
        panelBox.width = layoutSlotGeometry.bottomPanel.width;
        panelBox.height = layoutSlotGeometry.bottomPanel.height;
      }
      const editorActions = commands
        .actionsForSurface('editorFrame')
        .flatMap((command) => {
          const iconName = command.actionIcons?.editorFrame;
          const bindingHint = keybindings.bindingHint(command.id, 'editor');
          return iconName
            ? [
                {
                  commandId: command.id,
                  title: bindingHint
                    ? `${command.title} (${bindingHint})`
                    : command.title,
                  icon: theme.actionIcons[iconName],
                  toggled: command.toggled?.() ?? false,
                },
              ]
            : [];
        });
      editorFrameActionProjection = PanelTabBar.Class.projectEditorFrameActions(
        {
          width: Math.max(0, layoutSlotGeometry.editorCenter.width - 2),
          editorActions,
          hoveredCommandIdentifier: hoveredPanelEditorCommandIdentifier,
          palette: readPalette(),
          frameBorderColor: readPalette().borderActive,
        },
      );
      editorFrameActionRenderable.left =
        layoutSlotGeometry.editorCenter.left + 1;
      editorFrameActionRenderable.top =
        layoutSlotGeometry.editorCenter.top +
        layoutSlotGeometry.editorCenter.height -
        1;
      editorFrameActionRenderable.width = editorFrameActionProjection.width;
      editorFrameActionRenderable.visible =
        workspaceSet.activeEditor.hasDocument.value &&
        editorFrameActionProjection.width > 0;
      editorFrameActionRenderable.content = editorFrameActionProjection.text;
    };
    if (settings.workspaceTabPosition.value === 'left') {
      mainRow.add(workspaceTabBar, 0);
    } else {
      column.add(workspaceTabBar);
    }
    column.add(commandBar.bar);
    column.add(mainRow);
    column.add(statusBar.bar);
    root.add(column);
    // Scale map (reported->true position per bar) + intended thickness (cells; NEVER read back from
    // layout — pre-layout reads return 0).
    // ONE configured hit thickness for every pane and axis. Vertical bars fill that many columns.
    // Horizontal bars keep that many hit rows but the shared painter draws one lower-half trailing row,
    // compensating for the terminal cell's roughly 2:1 height:width aspect ratio.
    const scrollbarThicknessCells = (): number =>
      Math.max(1, Math.round(settings.scrollbarThickness.value));
    // True while applyBarGeometry is ASSIGNING scrollPosition: the widget fires onChange for
    // programmatic writes too, and treating those as user thumb-drags halted the momentum glide on
    // every paint (the 'wheel not smooth since scrollbars' regression). onChange handlers must act
    // only on USER-initiated changes — a real thumb drag then halts momentum and adopts authority.
    // Interior height of a bordered box = box height - 2 (top+bottom border).
    // invariant: A scrollable pane height is an input not an output (src/modules/ui/ui.invariants.md)
    const editorViewportHeight = () =>
      Math.max(1, (editorArea.height as number) - 2);
    // Layout-anchored (never hand-derived): the code renderable's own laid-out width, minus the one
    // column the overlay vertical scrollbar occupies — so the final column of a line is always
    // reachable and visible at max scrollLeft.
    const editorViewportWidth = () => {
      const laidOut = columnSurface()?.surfaceRegion()?.columns ?? 0;
      if (laidOut > 1) return Math.max(1, laidOut - 1);
      return Math.max(1, (editorArea.width as number) - 2 - 6);
    };
    // WHERE the caret is belongs to the content that owns the renderable it sits in — and an empty
    // column owns no renderable, so it anchors nothing.
    const editorCaretAnchor = (): { column: number; row: number } | null =>
      columnSurface()?.caretAnchor() ?? null;
    /** Grapheme-safe window over display columns; never splits a wide glyph at either edge. */
    // displayColumnWindow / padToDisplayWidth now live on TextCoordinates (the display-column-math
    // capability) so every pane renderer shares one horizontal-windowing primitive. Local aliases keep
    // the call sites terse.
    const displayColumnWindow = TextCoordinates.Class.displayColumnWindow;
    const padToDisplayWidth = TextCoordinates.Class.padToDisplayWidth;
    /**
     * Converge layout-derived pane inputs AFTER Yoga has laid out the frame. This is deliberately
     * outside update(): render stays model -> view only, while each pane model owns its live extent.
     */
    // The empty state and the gutter width moved with the surfaces that draw them, into
    // SourceTextPaneContent.
    // The wrap window, the coordinate mapping, the model-to-native selection sync and the selection
    // drag all live INSIDE the source-text pane content now, with the controller that owns them.
    // Workspace/project tabs and editor/buffer tabs are separate layers backed by the SAME TabStrip
    // capability, driven by the TabBar controller (below). The workspace strip changes orientation.
    let workspaceTabBarMountedPosition: 'top' | 'left' =
      settings.workspaceTabPosition.value;
    function synchronizeWorkspaceTabMount(): void {
      const position = settings.workspaceTabPosition.value;
      if (position === workspaceTabBarMountedPosition) return;
      if (position === 'left') {
        column.remove(workspaceTabBar);
        mainRow.add(workspaceTabBar, 0);
        workspaceTabBar.width = 22;
        workspaceTabBar.height = '100%';
      } else {
        mainRow.remove(workspaceTabBar);
        column.add(workspaceTabBar, 0);
        workspaceTabBar.width = '100%';
        workspaceTabBar.height = 2; // two rows: project name over worktree/branch detail
      }
      workspaceTabBarMountedPosition = position;
    }
    // The tab-bar CONTROLLER owns both strips' behaviour (handlers, segments, hover/pressed/reveal
    // state, the render shims). RootView keeps constructing + mounting the renderables (above) and the
    // layout-position mount (synchronizeWorkspaceTabMount); it just calls render*() each frame.
    const tabBarController = new TabBar.Class({
      renderer,
      tabBar,
      breadcrumbBar,
      workspaceTabBar,
      bufferTabStrip,
      workspaceTabStrip,
      workspaceSet,
      theme,
      tooltip,
      overlayCoordinator,
      boundedListPopup,
      quickOpen,
      keybindings,
      commands,
      readPalette,
    });
    // The editor tab bar. ONE geometry source: a layout pass produces positioned SEGMENTS that BOTH the
    // renderer and the click/hover hit-test consume — so a drawn cell and its hit-rect can never
    // disagree (the arrows-not-clickable bug was exactly that mismatch). Tabs fill from the left; the
    // overflow arrows pin to the RIGHT edge. Three visual states per target: idle → hover → pressed.
    // Hover/press state (view-only), driven by tab-bar mouse move/press.
    // The strip's VIEWPORT PAN offset (first visible tab), INDEPENDENT of the active tab — the overflow
    // arrows drive this and never change which buffer is active (VS Code's ‹ › pan the strip only).
    // Changing the active tab (click / Ctrl+PageUp-Down) auto-reveals it, but panning does not snap back.
    // Resolve a local column to a tab-bar segment (shared by click + hover — one geometry source).
    // The arrows PAN the strip viewport only — they never change the active buffer (the render clamps
    // the offset, so panning past an end is a no-op and the arrow reads as disabled there).
    // Clicking the count badge opens a dropdown of ALL open buffers (VS Code's overflow menu) — reusing
    // the ContextMenu machinery (modal, keyboard-navigable, Esc to close). Selecting a row jumps to it.
    // Builds the visible window as two aligned StyledTexts — the gutter (line numbers + current-line
    // marker) and the code (syntax colors only, NO gutter). Only the visible lines are tokenized
    // (flyweight). Returns null for the empty state.
    // Drive OpenTUI's native selection on the code renderable from the model selection, mapped into
    // code-local coords (x = display column, y = visible-line index). Clamps to the visible window.
    // invariant: The selected range renders with a background (src/modules/ui/ui.invariants.md)
    // renderStatus moved into the StatusBar controller (it composes the same parts from workspace/app
    // state + the markdown-preview-focused flag RootView passes to statusBar.update).
    // The editor content-area MOUNT controller owns what occupies the editor column (plain editor /
    // contributed surface / Markdown split) and the mounted instance lifecycle. update() calls
    // sync() each paint; the frame loop calls tickContributedSurface()/tickMarkdown(); readers (caret,
    // status, find target, editor pane) reach the mounted instances through its getters.
    const editorContentMount = new EditorContentMount.Class({
      renderer,
      theme,
      settings,
      findBar,
      workspaceSet,
      keybindings,
      tooltip,
      editorSurfaceContents,
      editorColumn,
      editorArea,
      surfaceContainer,
    });
    function findTarget(): FindBarTarget | null {
      // invariant: Markdown panes keep independent find state (src/modules/markdown/markdown.invariants.md)
      // invariant: Diff panes keep independent find state (src/modules/diff/diff.invariants.md)
      const contributedSurfaceTarget =
        editorContentMount.contributedSurface?.findTarget();
      if (contributedSurfaceTarget) return contributedSurfaceTarget;
      const editor = workspaceSet.activeEditor;
      if (!editor.hasDocument.value) return null;
      return {
        identifier: `source:${editor.document.path}`,
        document: editor.document,
        replaceAllowed: !editor.readOnly.value,
        revealMatch: (match) => {
          editorContentMount.contributedSurface?.yieldKeyboardToSourceEditor();
          workspaceSet.active.revealSourceLocation(match.line, match.endColumn);
          editor.cursor.anchor.value = {
            line: match.line,
            col: match.startColumn,
          };
        },
      };
    }
    function update(): void {
      const palette = readPalette();
      primaryDockRemainder.backgroundColor = palette.panel;
      rightDockRemainder.backgroundColor = palette.panel;
      const modalOverlayOwnsScreen = overlayLayer.modalOverlayOwnsScreen;
      synchronizeWorkspaceTabMount();
      synchronizePanelMount();
      editorContentMount.sync();
      column.backgroundColor = palette.panel;
      activityBar.setVisible(settings.showActivityBar.value);
      rightActivityBar.setVisible(settings.showRightActivityBar.value);
      synchronizeLayoutGeometry();
      commandBar.update();
      activityBar.update(palette);
      rightActivityBar.update(palette);
      sidebar.backgroundColor = palette.panel;
      const sidebarViewFocused =
        workspaceSet.active.focus.value === 'primaryPane';
      sidebar.borderColor = sidebarViewFocused
        ? palette.borderActive
        : palette.border;
      // Divider: brighten while hovered or dragging so it reads as a grab handle.
      paneSplitters.updateAppearance(palette);
      panelSplitter.updateAppearance(palette, palette.bg);
      panelContentsListSplitter.updateAppearance(palette);
      rightDockSplitter.updateAppearance(palette);
      sidebar.titleColor = sidebarViewFocused ? palette.accent : palette.dim;
      sidebar.title = primaryDockHost.activeContent?.title ?? '';
      editorArea.backgroundColor = palette.bg;
      const sourcePaneFocused =
        workspaceSet.active.focus.value === 'editor' &&
        workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget;
      editorArea.borderColor = sourcePaneFocused
        ? palette.borderActive
        : palette.border;
      // No filename legend on the editor-pane border: the path now lives in the buffer-tab breadcrumb
      // (project › dir › file). Keep the border BOX (the code surface's coords stay stable) but drop
      // the redundant '╭─README.md' legend. Safe: the app's find/paste source identity is the
      // document PATH, never this display title. The title and its colour come from the content —
      // a content only names a colour when the colour carries meaning.
      const editorColumnContent = columnContent();
      editorArea.title = editorColumnContent?.title ?? '';
      editorArea.titleColor =
        editorColumnContent?.titleColor ??
        (sourcePaneFocused ? palette.accent : palette.dim);
      // A surface presenting something other than the active buffer has no editor buffer tabs. Reclaim
      // that row for the surface; source buffers keep the stable one-row strip.
      const activeDocumentIsPresented =
        workspaceSet.active.editorSurfaces.activeDocumentIsPresented;
      tabBar.height = activeDocumentIsPresented ? 1 : 0;
      tabBar.content = activeDocumentIsPresented
        ? tabBarController.renderBuffer()
        : '';
      // History belongs to the editor AREA. Its current occupant supplies the path through the one
      // editor-surface contract; the shell never branches on comparison, preview, or source view.
      breadcrumbBar.content = tabBarController.renderBreadcrumb(
        editorContentMount.displayedPath,
      );
      workspaceTabBar.content = tabBarController.renderWorkspace();
      workspaceTabBar.fg = palette.fg;
      const primaryDockContent = primaryDockHost.activeContent;
      const primaryDockWidth = Math.max(1, Number(sidebar.width) - 2);
      const primaryDockHeight = Math.max(1, Number(sidebar.height) - 2);
      primaryDockContent?.onResize(primaryDockWidth, primaryDockHeight);
      // Every host paint site asks the ONE resolver, never the content's own render — a content
      // that paints its own renderables returns no cells and the body keeps what it had.
      // invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md)
      sidebarBody.content = primaryDockContent
        ? (PaneProjection.Class.paint(primaryDockContent, {
            width: primaryDockWidth,
            height: primaryDockHeight,
            palette,
            glyphLevel: theme.glyphLevel.value,
            colorDepth: theme.colorDepth.value,
            graphicsTier: resolvedGraphicsTier(),
            screenColumn: Number(sidebarBody.x),
            screenRow: Number(sidebarBody.y),
            screenObscured: overlayLayer.modalOverlayOwnsScreen,
            focused: primaryDockHost.focused.value,
          }) ?? sidebarBody.content)
        : '';
      sidebarBody.fg = palette.fg;
      synchronizePrimaryDockSplitters(palette);
      // The editor column is painted through the SAME seam as every dock and panel cell. Its default
      // content is the one native-surface citizen: the resolver hands it the region, it paints the
      // renderables it owns, and it returns no cells for the host to assign. With no content
      // registered the column paints its own empty-slot notice instead — an app with a stated
      // affordance, never a blank pane that reads as an empty document.
      // invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md)
      // invariant: The editor column's default occupant is a contribution (src/modules/ui/ui.invariants.md)
      synchronizeEmptyColumnNotice(editorColumnContent, palette);
      if (panelEmptyNoticeMounted) {
        const instanceLabel = panelHost.activeSpace?.label ?? 'instance';
        panelEmptyNotice.fg = palette.dim;
        panelEmptyNotice.content = [
          '',
          `   No ${instanceLabel} instances are open.`,
          '',
          `   Choose + ${instanceLabel} in the list to start one.`,
          '   The panel stays open until you close it yourself.',
          '',
        ].join('\n');
      }
      if (editorColumnContent) {
        PaneProjection.Class.paint(editorColumnContent, {
          width: editorViewportWidth(),
          height: editorViewportHeight(),
          palette,
          glyphLevel: theme.glyphLevel.value,
          colorDepth: theme.colorDepth.value,
          graphicsTier: resolvedGraphicsTier(),
          screenColumn: Number(editorArea.x),
          screenRow: Number(editorArea.y),
          screenObscured: overlayLayer.modalOverlayOwnsScreen,
          focused: sourcePaneFocused,
        });
      }
      if (rightDockHost.visible.value) {
        const rightDockFocused = rightDockHost.focused.value;
        const rightDockContent = rightDockHost.activeContent;
        rightDockBox.backgroundColor = palette.panel;
        rightDockBox.borderColor = rightDockFocused
          ? palette.borderActive
          : palette.border;
        rightDockBox.titleColor = rightDockFocused
          ? palette.accent
          : palette.dim;
        rightDockBox.title = rightDockContent?.title ?? 'Right Dock';
        rightDockBody.fg = palette.fg;
        rightDockBody.content = rightDockContent
          ? (PaneProjection.Class.paint(rightDockContent, {
              width: rightDockViewportColumns(),
              height: rightDockViewportRows(),
              palette,
              glyphLevel: theme.glyphLevel.value,
              colorDepth: theme.colorDepth.value,
              graphicsTier: resolvedGraphicsTier(),
              screenColumn: Number(rightDockBody.x),
              screenRow: Number(rightDockBody.y),
              screenObscured: overlayLayer.modalOverlayOwnsScreen,
              focused: rightDockFocused,
            }) ?? rightDockBody.content)
          : ' Right dock\n\n No content';
      }
      // Bottom panel slot: pull EACH visible cell's PaneContent into its own body (one body = the
      // terminal for tier S; two = agent | terminal side by side). The host is content-agnostic — RootView
      // never names the terminal here; it iterates the host's converged cell spans and paints each.
      // invariant: The panel renders exactly the visible pane content cells each frame (src/modules/ui/ui.invariants.md)
      // invariant: A split panel renders every visible cell into its own sub-region (src/modules/ui/ui.invariants.md)
      if (panelHost.visible.value) {
        const panelFocused = panelHost.focused.value;
        const focusedIndex = panelHost.focusedIndex.value;
        const spans = panelHost.cellSpans(panelViewportColumns());
        syncPanelCellMount(spans.length);
        panelBox.title = '';
        panelBox.backgroundColor = palette.panel;
        panelContentsListRenderable.visible = panelContentsList.visible;
        panelContentsListRenderable.width = panelContentsList.visible
          ? panelContentsList.width
          : 0;
        panelContentsListRenderable.content = panelContentsList.render(
          palette,
          theme.glyphVocabulary,
        );
        const cellRows = panelViewportRows();
        const panelContentTop = panelBox.y as number;
        const panelContentLeft = panelBox.x as number;
        const visibleContents = new Set<PaneContent>();
        spans.forEach((span, index) => {
          const view = panelCellViews[index];
          if (!view) return;
          const cellFocused = panelFocused && index === focusedIndex;
          view.container.width = span.columns;
          const frameHeaderRows = span.content.frameHeaderRows ?? 0;
          view.frameHeader.height = frameHeaderRows;
          view.frameHeader.visible = frameHeaderRows > 0;
          view.frameHeader.fg = palette.fg;
          const closeText = ` ${theme.glyphVocabulary.panelClose} `;
          const frameHeaderPadding = ' '.repeat(
            Math.max(
              0,
              span.columns - TextCoordinates.Class.lineWidth(closeText),
            ),
          );
          view.frameHeader.content = new StyledText([
            fg(palette.fg)(frameHeaderPadding),
            view.frameHeaderCloseHovered
              ? bg(palette.cursorLine)(fg(palette.accent)(closeText))
              : fg(palette.fg)(closeText),
          ]);
          view.body.fg = palette.fg;
          visibleContents.add(span.content);
          view.body.content =
            PaneProjection.Class.paint(span.content, {
              width: span.columns,
              height: Math.max(1, cellRows - frameHeaderRows),
              palette,
              glyphLevel: theme.glyphLevel.value,
              colorDepth: theme.colorDepth.value,
              graphicsTier: resolvedGraphicsTier(),
              screenColumn: Number(view.body.x),
              screenRow: Number(view.body.y),
              screenObscured: overlayLayer.modalOverlayOwnsScreen,
              focused: cellFocused,
            }) ?? view.body.content;
          const content = span.content;
          if (
            content.attachViewportScrollPort &&
            !contentsWithScrollPort.has(content)
          ) {
            content.attachViewportScrollPort(paneScrollPort);
            contentsWithScrollPort.add(content);
          }
          const scrollTop = content.scrollTop;
          const scrollContentRows = content.scrollContentRows;
          const scrollViewportRows = content.scrollViewportRows;
          if (
            typeof scrollTop === 'number' &&
            typeof scrollContentRows === 'number' &&
            typeof scrollViewportRows === 'number' &&
            content.scrollToLine
          ) {
            const geometry = ScrollbarGeometry.Class.scrollbarGeometry(
              'vertical',
              {
                top: Math.max(
                  0,
                  Number(view.body.y) -
                    Number(view.container.y) +
                    (content.scrollbarRowOffset ?? 0) -
                    1,
                ),
                left: Number(view.body.x) - Number(view.container.x),
                width: span.columns,
                height: scrollViewportRows,
              },
              {
                scrollSize: scrollContentRows,
                viewportSize: scrollViewportRows,
                scrollPosition: scrollTop,
              },
            );
            if (geometry) {
              view.verticalScrollBar.visible = true;
              view.verticalScrollBar.slider.backgroundColor = palette.panel;
              view.verticalScrollBar.slider.foregroundColor = palette.dim;
              view.verticalScrollBar.top = geometry.trackTop;
              view.verticalScrollBar.left = geometry.trackLeft;
              view.verticalScrollBar.height = geometry.trackLength;
              view.verticalScrollBar.width = Math.max(
                1,
                Math.round(settings.scrollbarThickness.value),
              );
              view.verticalScrollBarState.applyingGeometry = true;
              try {
                view.verticalScrollBar.scrollSize = scrollContentRows;
                view.verticalScrollBar.viewportSize =
                  geometry.reportedViewportSize;
                view.verticalScrollBar.scrollPosition =
                  geometry.reportedPosition;
              } finally {
                view.verticalScrollBarState.applyingGeometry = false;
              }
              view.verticalScrollBarState.reportedToTrueScale =
                geometry.reportedToTrueScale;
            } else {
              view.verticalScrollBar.visible = false;
            }
          } else {
            view.verticalScrollBar.visible = false;
          }
          view.splitterElement?.updateAppearance(palette);
        });
        for (const content of panelHost.orderedContents) {
          content.onVisibilityChange?.(visibleContents.has(content));
        }
      } else {
        for (const view of panelCellViews) {
          view.verticalScrollBar.visible = false;
        }
        for (const content of panelHost.orderedContents) {
          content.onVisibilityChange?.(false);
        }
      }
      statusBar.update(
        palette,
        editorContentMount.contributedSurface?.focusedPaneTitle ?? null,
      );
      overlayLayer.update(palette);
      hoverCard.update(palette);
      scrollbarSync.syncScrollbars();
      // invariant: Modal focus withdraws host terminal projections (src/modules/ui/ui.invariants.md)
      if (modalOverlayOwnsScreen) {
        renderer.setCursorPosition(0, 0, false);
        return;
      }
      if (rightDockHost.visible.value && rightDockHost.focused.value) {
        const caret = rightDockHost.focusedContent?.caret?.() ?? null;
        if (caret) {
          renderer.setCursorPosition(
            rightDockBody.x + caret.column + 1,
            rightDockBody.y + caret.row + 1,
            true,
          );
        } else {
          renderer.setCursorPosition(0, 0, false);
        }
        return;
      }
      // Native terminal caret in the focused panel: a real block caret at the emulator's cursor cell,
      // anchored to the FOCUSED cell body's laid-out screen cell (+1 for the 1-based ANSI cursor). This
      // wins over the editor caret below because a focused terminal owns the keyboard.
      // invariant: The caret renders at the cursor display column (src/modules/ui/ui.invariants.md)
      if (panelHost.visible.value && panelHost.focused.value) {
        const focusedCellIndex = Math.min(
          Math.max(0, panelHost.focusedIndex.value),
          Math.max(0, panelCellViews.length - 1),
        );
        const focusedBody = panelCellViews[focusedCellIndex]?.body;
        const caret = panelHost.focusedContent?.caret?.() ?? null;
        if (caret && focusedBody) {
          renderer.setCursorPosition(
            focusedBody.x + caret.column + 1,
            focusedBody.y + caret.row + 1,
            true,
          );
        } else {
          renderer.setCursorPosition(0, 0, false);
        }
        return;
      }
      // Native terminal caret at the cursor's DISPLAY column (tab/wide aware). The host decides
      // WHETHER this pane owns the keyboard — focused, the keyboard target, no palette overlay —
      // and the content answers WHERE its caret is, in screen cells, because it owns the renderable
      // the caret sits in. invariant: The caret renders at the cursor display column (src/modules/ui/ui.invariants.md)
      const sourceTextOwnsKeyboard =
        workspaceSet.active.focus.value === 'editor' &&
        workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget &&
        !commands.open.value;
      const caretAnchor = sourceTextOwnsKeyboard
        ? (columnSurface()?.caretAnchor() ?? null)
        : null;
      if (caretAnchor) {
        renderer.setCursorPosition(
          caretAnchor.column + 1,
          caretAnchor.row + 1,
          true,
        );
      } else {
        renderer.setCursorPosition(0, 0, false);
      }
    }
    // Mouse wheel, POSITION-ROUTED: OpenTUI hit-tests the pointer to the pane under it and calls its
    // onMouseScroll (events bubble to the box). Each scrollable pane mutates only its own window
    // (scrollTop / selection), never materializing the whole list — the frame effect observes those
    // signals and repaints. invariant: Cost tracks the actively observed set (project.invariants.md)
    // The editor's vertical scroll coordinate is always a visual-row offset. Wrap contributes extra
    // rows and folding contributes zero-row bodies through the one EditorWrap extent.
    // Is the configured scroll modifier held on this wheel event? 'none' is never held (the control is
    // off, not misleading). Single source: the modifier comes from Settings, never hardcoded.
    const scrollModifierHeld = (
      event: WheelModifiers,
      modifier: ScrollModifier,
    ): boolean => ScrollGesture.Class.modifierHeld(event, modifier);
    // Rows per wheel notch = settings.linesPerNotch (was a hardcoded 3), multiplied by the fast-scroll
    // factor when the fast-scroll modifier is held (settings.fastScrollMultiplier; modifier defaults to
    // 'none' = off). One expression feeds BOTH the wrap-mode direct step and the momentum impulse.
    const wheelStep = (event: WheelModifiers): number =>
      ScrollGesture.Class.wheelStep(event, settings);
    // One shared drag/autoscroll behavior serves this editor and every read-only surface. They differ only in
    // coordinate mapping and scroll storage; pointer lifecycle, edge zones, rate, and re-extension are
    // identical. invariant: One writer per scroll regime per frame (src/modules/ui/ui.invariants.md)
    function tickDragAutoScroll(deltaTimeSeconds: number): boolean {
      // This hook already runs after each Yoga layout. Converge every sidebar pane's live geometry here
      // too; returning true for the one changed frame guarantees a repaint, then quiescence resumes.
      const paneViewportGeometryChanged =
        scrollbarSync.syncPaneViewportGeometry();
      return (
        (columnContent()?.tickScroll?.(deltaTimeSeconds) ?? false) ||
        paneViewportGeometryChanged
      );
    }
    const sidebarController = new Sidebar.Class({
      renderer,
      sidebar,
      contentBody: sidebarBody,
      tooltip,
      settings,
      primaryDockHost,
    });
    void sidebarController;
    // Right-click on a changes FILE row: normalize the selection (an unselected row becomes THE
    // selection; a selected row keeps the whole multi-selection) and open the context menu at the
    // pointer with the COLLECTIVE actions the selection's buckets support.
    // The LSP hover card: a display-only overlay controller that owns its bordered box, content text,
    // and vertical scrollbar. A >0.5s mouse dwell over a symbol shows the language server's type/docs;
    // update() re-syncs it each frame, and the frame loop ticks its dwell.
    const hoverCard = new HoverCard.Class({
      renderer,
      theme,
      settings,
      requestHover: (position) => workspaceSet.active.hoverAt(position),
      diagnosticsAt: (position) => workspaceSet.active.diagnosticsAt(position),
      languageForActive: () => {
        const workspace = workspaceSet.active;
        return workspace.documentSyntax.languageAtLine(
          workspace.editor.document,
          workspace.editor.cursor.line.value,
        );
      },
    });
    // Half-block image preview for the active buffer when it is an image file. Memoises decode + render
    // so the frame effect that reads it pays a map lookup, never a re-decode.
    const imagePreview = new ImagePreview.Class();
    // Pixel-tier image preview (kitty graphics / sixel above the half-block floor). The graphics tier
    // derives from OpenTUI's reported capabilities — held in a ref because the report arrives ASYNC via
    // the `capabilities` event. The event re-runs update() and requests a frame explicitly, so
    // PixelImageMount re-syncs at the richer tier (half-block until then; never flash).
    // invariant: Graphics tier prefers the reported capability and degrades to cells (src/modules/theme/theme.invariants.md)
    const readReportedGraphics = (): ReportedGraphicsCapabilities | null => {
      const capabilities = renderer.capabilities;
      if (!capabilities) return null;
      return {
        kitty_graphics: capabilities.kitty_graphics,
        sixel: capabilities.sixel,
        multiplexer: capabilities.multiplexer,
      };
    };
    const reportedGraphics = shallowRef<ReportedGraphicsCapabilities | null>(
      readReportedGraphics(),
    );
    renderer.on('capabilities', () => {
      reportedGraphics.value = readReportedGraphics();
      update();
      renderer.requestRender();
    });
    const resolvedGraphicsTier = () =>
      TerminalCapabilities.Class.resolveGraphicsTier(
        settings.graphicsTier.value,
        reportedGraphics.value,
      );
    // The emission surface: OpenTUI's writeOut routes through the native zig writer — the SAME queue
    // as frame bytes, so an out-of-band graphics payload serializes between frames, never mid-frame.
    // The method is TypeScript-private (OpenTUI exposes no public raw-write), hence the structural cast.
    const pixelMount = new PixelImageMount.Class({
      writePayload: (data) => {
        (
          renderer as unknown as {
            writeOut(chunk: string): boolean;
          }
        ).writeOut(data);
      },
      afterFramesSettled: () => renderer.idle(),
      cellPixelSize: () => {
        const resolution = renderer.resolution;
        if (!resolution || renderer.width <= 0 || renderer.height <= 0)
          return null;
        return {
          width: resolution.width / renderer.width,
          height: resolution.height / renderer.height,
        };
      },
    });
    app.onDispose(() => pixelMount.dispose());
    // What the code cells must show while the active document is a RASTER (an image file). The
    // tier ladder is kitty → sixel → half-block: a pixel tier renders BLANK cells under the
    // out-of-band graphics (so cell repaints never fight the image) and hands placement to the
    // mount; the half-block floor (and every decode failure) renders through the cells. The ladder
    // is one registry ask — no tier list lives here. Null means "not a raster", and the same call
    // then deletes any lingering placement (a cheap no-op when nothing is placed).
    // invariant: A raster image renders as half-block cells sized to the pane (src/modules/image/image.invariants.md)
    // invariant: An image buffer replaces the code text and leaves other files untouched (src/modules/image/image.invariants.md)
    // invariant: Graphics tier prefers the reported capability and degrades to cells (src/modules/theme/theme.invariants.md)
    const rasterProjection = (
      region: PaneSurfaceRegion,
    ): StyledText | string | null => {
      const workspace = workspaceSet.active;
      if (!workspace.activeFileIsImage) {
        pixelMount.clear();
        return null;
      }
      const palette = readPalette();
      const imagePath = workspace.editor.document.path;
      const graphicsTier = resolvedGraphicsTier();
      const pixelEncoder = ImageRenderers.Class.encoderFor(graphicsTier);
      const decodedImage = pixelEncoder
        ? imagePreview.decodedImage(imagePath)
        : null;
      if (!pixelEncoder || !decodedImage) {
        pixelMount.clear();
        return imagePreview.render(
          imagePath,
          region.columns,
          region.rows,
          palette.panel,
          palette.error,
        );
      }
      // invariant: Modal focus withdraws host terminal projections (src/modules/ui/ui.invariants.md)
      if (overlayLayer.modalOverlayOwnsScreen) {
        pixelMount.clear();
      } else {
        pixelMount.sync({
          tier: graphicsTier,
          encoder: pixelEncoder,
          image: decodedImage,
          path: imagePath,
          region: {
            x: region.column,
            y: region.row,
            columns: region.columns,
            rows: region.rows,
          },
          panelBackground: palette.panel,
        });
      }
      return '';
    };
    // Hand the editor column's slot and the host services that go with it to whichever contribution
    // registered the column's default occupant. The host builds NO content here: it publishes the
    // slot, three named ports, and the extents it owns, then reads back whatever was registered.
    // invariant: The editor column's default occupant is a contribution (src/modules/ui/ui.invariants.md)
    editorColumnDefault.attachHost({
      renderer,
      slot: editorArea,
      workspaceSet,
      settings,
      theme,
      findBar,
      tooltip,
      readPalette,
      viewportRows: editorViewportHeight,
      viewportColumns: editorViewportWidth,
      focusSourceEditor: () =>
        editorContentMount.contributedSurface?.yieldKeyboardToSourceEditor(),
      requestRender: () => renderer.requestRender(),
      hostCapability<Port>(identifier: string): Port | null {
        switch (identifier) {
          case EditorColumnDefault.Class.SYMBOL_HOVER_CAPABILITY:
            return {
              pointAt: (
                position: { line: number; column: number },
                screenX: number,
                screenY: number,
              ) => hoverCard.pointAt(position, screenX, screenY),
              clear: () => hoverCard.clear(),
              pointerOffSymbol: () => hoverCard.pointerOffSymbol(),
            } as Port;
          case EditorColumnDefault.Class.RASTER_PROJECTION_CAPABILITY:
            return rasterProjection as Port;
          case EditorColumnDefault.Class.FRAME_ATTRIBUTION_CAPABILITY:
            return editorFrameAttribution as Port;
          default:
            return null;
        }
      },
    });
    // Every later read of the column content's caret, painted region, title, or paint goes through
    // the registry, so the host holds no editor-specific handle at all — and holds NOTHING when the
    // contribution is uninstalled.
    const columnContent = (): PaneContent | null => editorColumnDefault.content;
    const columnSurface = (): PaneNativeSurfacePort | null =>
      editorColumnDefault.nativeSurface;
    // ScrollbarSync constructs and owns the editor and dock bars. It derives each track from the live
    // layout, maps widget positions back to true scroll positions, and converges pane viewport extents.
    // RootView calls syncScrollbars() during update and syncPaneViewportGeometry() from the frame loop.
    // The overlay layer constructs + drives every modal/floating overlay (palette, find, quick-open,
    // confirm, settings, shortcut sheet, context menu, tooltip). update() calls overlayLayer.update().
    const overlayLayer = new OverlayLayer.Class({
      renderer,
      commands,
      findBar,
      quickOpen,
      goToLinePrompt,
      quitConfirmation,
      contextMenu,
      boundedListPopup,
      settingsPanel,
      shortcutHelp,
      tooltip,
      theme,
      workspaceSet,
      activateQuickOpen,
      revealFindMatch,
    });
    const scrollbarSync = new ScrollbarSync.Class({
      renderer,
      workspaceSet,
      theme,
      editorArea,
      codeSurface: {
        get x(): number {
          return columnSurface()?.surfaceRegion()?.column ?? 0;
        },
        get width(): number {
          return columnSurface()?.surfaceRegion()?.columns ?? 0;
        },
      },
      sidebar,
      rightDockBox,
      primaryDockHost,
      rightDockHost,
      tooltip,
      editorViewportHeight,
      editorViewportWidth,
      scrollbarThicknessCells,
    });
    const panelHeadingGeometry = (): readonly PanelHeadingGeometry[] => {
      if (!panelHost.visible.value || !panelTabBarProjection) return [];
      const row =
        Number(layoutCanvas.y) + layoutSlotGeometry.bottomPanelSplitter.top;
      const contentAnchorRow =
        Number(layoutCanvas.y) + layoutSlotGeometry.bottomPanelTabs.top;
      return [
        {
          contentId: 'panel',
          row,
          hoveredAction: hoveredPanelControlBarAction,
          controls: panelTabBarProjection.controls.map((control) => ({
            action: control.action,
            startColumn:
              Number(layoutCanvas.x) +
              layoutSlotGeometry.bottomPanelSplitter.left +
              control.startColumn,
            endColumnExclusive:
              Number(layoutCanvas.x) +
              layoutSlotGeometry.bottomPanelSplitter.left +
              control.endColumn,
          })),
        },
        ...panelHost.resolvedCells.map((cell) => ({
          contentId: cell.content.id,
          row: contentAnchorRow,
          hoveredAction: null,
          controls: [],
        })),
      ];
    };
    // invariant: Panel chrome follows its interaction layers (src/modules/ui/ui.invariants.md)
    const panelSeparatorGeometry = (): PanelSeparatorGeometry | null => {
      if (!panelHost.visible.value || !panelTabBarProjection) return null;
      const projection = panelTabBarProjection;
      const screenLeft = Number(layoutCanvas.x);
      const row =
        Number(layoutCanvas.y) + layoutSlotGeometry.bottomPanelSplitter.top;
      return {
        row,
        editorActionRow:
          Number(layoutCanvas.y) + Number(editorFrameActionRenderable.top),
        tabRow: Number(layoutCanvas.y) + layoutSlotGeometry.bottomPanelTabs.top,
        tabs: projection.tabs.map((tab) => ({
          spaceIdentifier: tab.identifier,
          startColumn:
            screenLeft + Number(panelTabBarRenderable.left) + tab.startColumn,
          endColumnExclusive:
            screenLeft + Number(panelTabBarRenderable.left) + tab.endColumn,
          closeStartColumn:
            screenLeft +
            Number(panelTabBarRenderable.left) +
            (projection.tabCloses.find(
              (close) => close.identifier === tab.identifier,
            )?.startColumn ?? tab.endColumn),
        })),
        spaceAdd: projection.spaceAdd
          ? {
              startColumn:
                screenLeft +
                Number(panelTabBarRenderable.left) +
                projection.spaceAdd.startColumn,
              endColumnExclusive:
                screenLeft +
                Number(panelTabBarRenderable.left) +
                projection.spaceAdd.endColumn,
            }
          : null,
        instancesToggle: projection.instancesToggle
          ? {
              startColumn:
                screenLeft +
                Number(panelTabBarRenderable.left) +
                projection.instancesToggle.startColumn,
              endColumnExclusive:
                screenLeft +
                Number(panelTabBarRenderable.left) +
                projection.instancesToggle.endColumn,
            }
          : null,
        editorActions: (editorFrameActionProjection?.editorActions ?? []).map(
          (action) => ({
            commandId: action.commandId,
            startColumn:
              screenLeft +
              Number(editorFrameActionRenderable.left) +
              action.startColumn,
            endColumnExclusive:
              screenLeft +
              Number(editorFrameActionRenderable.left) +
              action.endColumn,
          }),
        ),
        drag: {
          left: screenLeft + layoutSlotGeometry.bottomPanelSplitter.left,
          top: row,
          width: panelTabBarProjection.dragWidth,
          height: 1,
          visible: panelSplitter.renderable.visible,
          leadingPaintPadCells: panelTabBarProjection.dragLeadingPaintPadCells,
        },
        controls: panelTabBarProjection.controls.map((control) => ({
          action: control.action,
          startColumn:
            screenLeft +
            layoutSlotGeometry.bottomPanelSplitter.left +
            control.startColumn,
          endColumnExclusive:
            screenLeft +
            layoutSlotGeometry.bottomPanelSplitter.left +
            control.endColumn,
        })),
      };
    };
    const focusedPanelCaretAnchor = (): {
      column: number;
      row: number;
    } | null => {
      if (!panelHost.visible.value || !panelHost.focused.value) return null;
      const focusedIndex = panelHost.focusedIndex.value;
      const body = panelCellViews[focusedIndex]?.body;
      const caret = panelHost.focusedContent?.caret?.() ?? null;
      if (!body || !caret) return null;
      return {
        column: Number(body.x) + caret.column,
        row: Number(body.y) + caret.row,
      };
    };
    update();
    return {
      update,
      beginEditorFrameAttribution: () => editorFrameAttribution.beginFrame(),
      completeEditorFrameAttribution: () =>
        editorFrameAttribution.completeFrame(),
      editorFrameAttribution: () => editorFrameAttribution.snapshot,
      editorViewportHeight,
      editorViewportWidth,
      editorCaretAnchor,
      editorColumnContentIdentifier: () =>
        editorColumnDefault.providerIdentifier,
      tickDragAutoScroll,
      // Frame-loop hook (runs every frame with FRESH layout, unlike the reactive paint): let the
      // mounted contributed surface advance its own momentum glide AND repaint once its container has
      // laid out to full height (root height goes 0 -> real a frame or two after the container swap).
      // Repaint-on-height-change keeps frames live until the layout settles, then stops so
      // idle-quiescence holds.
      tickContributedSurface(dtSeconds: number): boolean {
        return editorContentMount.tickContributedSurface(dtSeconds);
      },
      contributedEditorSurface: () => editorContentMount.contributedSurface,
      findTarget,
      shortcutHelpViewportRows: () => overlayLayer.shortcutHelpViewportRows(),
      scrollShortcutHelpBy: (rowDelta: number) =>
        overlayLayer.scrollShortcutHelpBy(rowDelta),
      tickOverlayScroll: (dtSeconds: number) => overlayLayer.tick(dtSeconds),
      overlayDialogBounds: () => overlayLayer.dialogBounds(),
      overlayScrollPositions: () => overlayLayer.scrollPositions(),
      overlayViewportExtents: () => overlayLayer.viewportExtents(),
      modalOverlayOwnsScreen: () => overlayLayer.modalOverlayOwnsScreen,
      tickHover: (dtSeconds: number) => hoverCard.tick(dtSeconds),
      tickPanelScroll(dtSeconds: number): boolean {
        let moving = false;
        for (const cell of panelHost.resolvedCells) {
          moving = (cell.content.tickScroll?.(dtSeconds) ?? false) || moving;
        }
        return moving;
      },
      dismissHover: () => hoverCard.clear(),
      dismissHoverSoft: () => {
        if (!hoverCard.engaged()) hoverCard.clear();
      },
      hoverHasSelection: () => hoverCard.hasSelection(),
      hoverCopySelection: () => hoverCard.copySelection(),
      settingsCopySelection: () => overlayLayer.copySettingsSelection(),
      observeHoverRepaint: () => {
        void hoverCard.paintRevision.value;
      },
      panelViewportColumns,
      panelViewportRows,
      panelContainsPoint,
      focusedPanelCaretAnchor,
      panelHeadingGeometry,
      panelSeparatorGeometry,
      panelContentsListRegion: () => ({
        left:
          Number(panelBox.x) +
          Number(panelBox.width) -
          (panelContentsList.visible ? panelContentsList.width : 0),
        top: Number(panelBox.y),
        width: panelContentsList.visible ? panelContentsList.width : 0,
        height: panelContentsList.visible
          ? Math.max(0, Number(panelBox.height))
          : 0,
        visible: panelContentsList.visible,
      }),
      rightDockViewportColumns,
      rightDockViewportRows,
      rightDockContainsPoint,
      activityBarContainsPoint,
      layoutGeometry: () => layoutSlotGeometry,
      splitterRegions: () => {
        const regions: Record<
          string,
          {
            left: number;
            top: number;
            width: number;
            height: number;
            visible: boolean;
          }
        > = {
          sidebar: renderableRegion(paneSplitters.sidebar.renderable),
          bottomPanel: renderableRegion(panelSplitter.renderable),
          rightDock: renderableRegion(rightDockSplitter.renderable),
        };
        for (const splitter of primaryDockHost.activeContent?.splitters?.() ??
          []) {
          regions[splitter.id] = renderableRegion(splitter.element.renderable);
        }
        return regions;
      },
      splitterSizes: () => ({
        sidebar: paneSplitters.sidebar.size,
        rightDock: rightDockSplitter.size,
      }),
      activityBarItemIdentifiers: () => activityBar.itemIdentifiers(),
      dispose() {
        try {
          editorColumnDefault.releaseContent();
          editorContentMount.dispose();
          column.destroyRecursively();
        } catch {
          /* ignore */
        }
      },
    };
    function renderableRegion(renderable: BoxRenderable): {
      left: number;
      top: number;
      width: number;
      height: number;
      visible: boolean;
    } {
      return {
        left: Number(renderable.screenX),
        top: Number(renderable.screenY),
        width: Number(renderable.width),
        height: Number(renderable.height),
        visible: renderable.visible,
      };
    }
  }
}

export namespace RootView {
  export const $Class = Static($RootView);
  export let Class = $Class;
}

// roleColor moved to EditorPaneRenderer with the editor render that used it.
export interface RootView {
  update(): void;
  beginEditorFrameAttribution(): void;
  completeEditorFrameAttribution(): void;
  editorFrameAttribution(): EditorFrameAttributionSnapshot;
  editorViewportHeight(): number;
  editorViewportWidth(): number;
  editorCaretAnchor(): { column: number; row: number } | null;
  /** Which contribution occupies the editor column, or null when none does. */
  editorColumnContentIdentifier(): string | null;
  /** Frame-tick hook: advance drag-edge auto-scroll; true while active (keep frames coming). */
  tickDragAutoScroll(dtSeconds: number): boolean;
  /** Frame-tick hook: advance the mounted contributed surface's own animations; true while live. */
  tickContributedSurface(dtSeconds: number): boolean;
  /** The mounted contributed editor surface, else null (for key, find, and clipboard routing). */
  contributedEditorSurface(): EditorSurfaceContent | null;
  /** Frame-tick hook for Markdown preview momentum, drag selection, and async parse landing. */
  findTarget(): FindBarTarget | null;
  /** Rows the shortcut cheat-sheet can show at once (scroll actions clamp against this). */
  shortcutHelpViewportRows(): number;
  /** Route shortcut-sheet keyboard scrolling through the same viewport that owns wheel and thumb drag. */
  scrollShortcutHelpBy(rowDelta: number): void;
  /** Frame-tick hook for every modal overlay's shared scrollbar momentum. */
  tickOverlayScroll(dtSeconds: number): boolean;
  /** Live numeric bounds for semantic resize assertions; null means the dialog is hidden. */
  overlayDialogBounds(): Record<
    string,
    { left: number; top: number; width: number; height: number } | null
  >;
  /** Scroll offsets owned by each overlay's shared viewport. */
  overlayScrollPositions(): Record<string, number>;
  /** Content and visible row counts for each overlay viewport. */
  overlayViewportExtents(): Record<
    string,
    { contentRows: number; viewportRows: number }
  >;
  /** True while a modal overlay owns the screen above host-terminal projections. */
  modalOverlayOwnsScreen(): boolean;
  /** Frame-tick hook: advance the LSP hover-card dwell; true while counting or a request is in flight. */
  tickHover(dtSeconds: number): boolean;
  /** Frame-tick hook: advance the agent transcript's scroll-momentum glide + drag edge-autoscroll; true
   *  while moving (keeps frames coming until the fling decays, then stops so idle-quiescence holds). */
  tickPanelScroll(dtSeconds: number): boolean;
  /** Dismiss the LSP hover card unconditionally (Escape — always closes, even while engaged). */
  dismissHover(): void;
  /** Dismiss the LSP hover card UNLESS it is engaged (pointer over it / dragging a selection): a stray
   *  keypress or a click ON the card must not close it, so Ctrl+C copies and drag-select works. */
  dismissHoverSoft(): void;
  /** True when the engaged hover card holds a non-empty text selection (routes Ctrl+C to it). */
  hoverHasSelection(): boolean;
  /** Copy the hover card's selected text to the clipboard; resolves to the character count copied. */
  hoverCopySelection(): Promise<number>;
  /** Copy the Settings overlay's selected text through the shared clipboard authority. */
  settingsCopySelection(): Promise<number>;
  /** Read the hover card's reactive paint signal inside the frame effect so an ASYNC hover landing
   *  (which no keypress/mouse-move accompanies) still triggers a repaint that projects the card. */
  observeHoverRepaint(): void;
  /** The bottom panel slot's laid-out inner cell columns (0 when hidden) — the terminal's live cols. */
  panelViewportColumns(): number;
  /** The bottom panel slot's laid-out inner cell rows (0 when hidden) — the terminal's live rows. */
  panelViewportRows(): number;
  /** True when the screen cell (x,y) falls inside the visible panel box (focus-follows-click). */
  panelContainsPoint(x: number, y: number): boolean;
  focusedPanelCaretAnchor(): { column: number; row: number } | null;
  panelHeadingGeometry(): readonly PanelHeadingGeometry[];
  panelSeparatorGeometry(): PanelSeparatorGeometry | null;
  panelContentsListRegion(): {
    left: number;
    top: number;
    width: number;
    height: number;
    visible: boolean;
  };
  rightDockViewportColumns(): number;
  rightDockViewportRows(): number;
  rightDockContainsPoint(x: number, y: number): boolean;
  activityBarContainsPoint(x: number, y: number): boolean;
  layoutGeometry(): LayoutSlotGeometry;
  splitterRegions(): Record<
    string,
    {
      left: number;
      top: number;
      width: number;
      height: number;
      visible: boolean;
    }
  >;
  splitterSizes(): { sidebar: number; rightDock: number };
  activityBarItemIdentifiers(): string[];
  dispose(): void;
}

export interface PanelHeadingGeometry {
  readonly contentId: string;
  readonly row: number;
  readonly hoveredAction: PanelTabBarAction | null;
  readonly controls: readonly PanelHeadingControlGeometry[];
}

export interface PanelHeadingControlGeometry {
  readonly action: PanelTabBarAction;
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

export interface PanelSeparatorGeometry {
  readonly row: number;
  readonly editorActionRow: number;
  readonly tabRow: number;
  readonly tabs: readonly PanelTabGeometry[];
  readonly spaceAdd: {
    readonly startColumn: number;
    readonly endColumnExclusive: number;
  } | null;
  readonly instancesToggle: {
    readonly startColumn: number;
    readonly endColumnExclusive: number;
  } | null;
  readonly editorActions: readonly PanelSeparatorActionGeometry[];
  readonly drag: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly visible: boolean;
    /** Cells at the drag strip's left that stay unpainted. Paint only: the strip still grabs there. */
    readonly leadingPaintPadCells: number;
  };
  readonly controls: readonly PanelHeadingControlGeometry[];
}

export interface PanelTabGeometry {
  readonly spaceIdentifier: string;
  readonly startColumn: number;
  readonly endColumnExclusive: number;
  readonly closeStartColumn: number;
}

export interface PanelSeparatorActionGeometry {
  readonly commandId: string;
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}
