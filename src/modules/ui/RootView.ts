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
import { ScrollableTextViewport } from './ScrollableTextViewport';
import {
  AgentPaneContent,
  type AgentScrollPort,
} from '../agent/AgentPaneContent';
import { Static } from 'ivue/extras';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type { App } from '../app/App';
import type { Theme } from '../theme/Theme';
import type { CommandRegistry } from '../commands/CommandRegistry';
import type { Palette } from '../theme/ThemePalettes';
import { Files } from '../system/Files';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import { CommandBar } from './CommandBar';
import { GitPaneRenderer } from './GitPaneRenderer';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';
import { TabBarRenderer } from './TabBarRenderer';
import { ScrollGesture, type WheelModifiers } from './ScrollGesture';
import { Sidebar } from './Sidebar';
import { ActivityBar } from './ActivityBar';
import { EditorPane } from './EditorPane';
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
import { LanguageRegistry } from '../syntax/LanguageRegistry';
import { EditorWrap } from '../editor/EditorWrap';
import { DiffView } from '../diff/DiffView';
import { MarkdownSplitView } from '../markdown/MarkdownSplitView';
import { SelectableText } from './SelectableText';
import { GitRows, type ChangeRow, type FileRow } from '../git/GitRows';
import { ScrollbarGeometry } from './ScrollbarGeometry';
import { SolidThumbScrollBar } from './SolidThumbScrollBar';
import type { PaneContent, PaneScrollPort } from './PaneContent.interface';
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
import { PaneSplitters } from './PaneSplitters';
import { SplitterElement } from './SplitterElement';
import { Logging } from '../system/Logging';
import { Momentum } from '../system/Momentum';
import type { TabStrip } from './TabStrip';
import type { PanelHost } from './PanelHost';
import { PanelContentsList } from './PanelContentsList';
import { PanelHeading, type PanelHeadingProjection } from './PanelHeading';
import {
  LayoutModel,
  type LayoutPreset,
  type LayoutSlotGeometry,
} from '../layout/LayoutModel';
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
    shortcutHelp: ShortcutHelp.Instance,
    overlayCoordinator: OverlayCoordinator.Instance,
    panelHost: PanelHost.Instance,
    primaryDockHost: PanelHost.Instance,
    rightDockHost: PanelHost.Instance,
    toggleTerminal: () => void,
    toggleAgent: () => void,
    openPanelAddPopup: (anchor: { column: number; row: number }) => void,
    toggleRightDock: () => void,
    activateQuickOpen: () => void,
    revealFindMatch: () => void,
  ): RootView {
    const root = renderer.root;
    const readPalette = () => theme.palette;
    const settings = settingsPanel.settings;
    // OpenTUI captures a drag target only on the FIRST drag event, resolved at the pointer's CURRENT
    // cell — so a thin (1-cell) grab strip is abandoned the instant the pointer moves off it and
    // onMouseDrag never fires. Grabbing the capture explicitly on mousedown (via the same `_ctx` mouse
    // context the tooltip masks addToHitGrid through) routes EVERY subsequent drag to that renderable
    // regardless of where the pointer travels — the robust pattern for any thin divider/thumb. OpenTUI
    // releases the capture itself on the up event (firing drag-end), so no manual clear is needed.
    // Sidebar↔editor width divider: a vertical SplitterModel in CELLS whose size IS the sidebar width,
    // bound to settings.sidebarWidth so a drag persists + live-applies. onSizeChange writes the setting.
    // settings.sidebarWidth is the SINGLE source of truth: the settings panel AND the drag both write
    // it, and the layout reads it here — so changing it in Ctrl+, resizes live, and dragging persists.
    const sidebarWidth = (): number => Math.round(settings.sidebarWidth.value);
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
    // The editor column stacks a 1-row TAB BAR above the bordered editor area. Wrapping (rather than
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
    // The path breadcrumb row (VS Code parity): sits directly UNDER the buffer-tab strip and shows the
    // active file's `project › dir › file` path. Always 1 row (blank when no file is open) so the editor
    // never jumps as files open/close.
    const breadcrumbBar = new TextRenderable(renderer, {
      id: 'editor-breadcrumb-bar',
      content: '',
      height: 1,
      width: '100%',
    });
    // History nav buttons (‹ ›) live at the START of the breadcrumb bar (VS Code's Go Back / Go
    // Forward). A click walks the navigation trail; the column geometry comes from TabBarRenderer
    // (shared with the render), so the click lands on the glyph it points at. Guarded to the same
    // condition the buttons render under — a file is open and no diff is showing — so a click on the
    // blank bar does nothing.
    const breadcrumbButtonsShown = (): boolean =>
      workspaceSet.active.editor.hasDocument.value &&
      !workspaceSet.active.showingDiff.value;
    breadcrumbBar.onMouseDown = (event) => {
      if (!breadcrumbButtonsShown()) return;
      const button = TabBarRenderer.Class.breadcrumbNavButtonAt(
        event.x - (breadcrumbBar.x as number),
      );
      if (button === 'back') workspaceSet.active.navigateBack();
      else if (button === 'forward') workspaceSet.active.navigateForward();
    };
    breadcrumbBar.onMouseMove = (event) => {
      if (!breadcrumbButtonsShown()) return;
      const button = TabBarRenderer.Class.breadcrumbNavButtonAt(
        event.x - (breadcrumbBar.x as number),
      );
      if (button === 'back') {
        const hint = keybindings.bindingHint('navigation.back', 'editor');
        tooltip.point(`Go Back${hint ? ` (${hint})` : ''}`, event.x, event.y);
      } else if (button === 'forward') {
        const hint = keybindings.bindingHint('navigation.forward', 'editor');
        tooltip.point(
          `Go Forward${hint ? ` (${hint})` : ''}`,
          event.x,
          event.y,
        );
      } else {
        tooltip.clear();
      }
    };
    breadcrumbBar.onMouseOut = () => tooltip.clear();
    const editorArea = new BoxRenderable(renderer, {
      id: 'editor-area',
      flexGrow: 1,
      width: '100%',
      border: true,
      borderStyle: 'rounded',
      flexDirection: 'row',
      title: 'Editor',
    });
    // Gutter (line numbers + current-line marker) and code are SEPARATE renderables so the code
    // buffer holds only code — OpenTUI's native selection then never shades the gutter on a
    // multi-line span, and code-local selection coords are pure display columns.
    const gutterBody = new TextRenderable(renderer, {
      id: 'editor-gutter',
      content: '',
    });
    const codeBody = new SelectableText.Class(renderer, {
      id: 'editor-code',
      content: '',
      // selectable:false — OpenTUI's OWN mouse-drag selection is a second writer of selection state
      // that the model never sees: its highlight appeared on drag, then the next paint's
      // applySelection() (reading the EMPTY model selection) wiped it — the human-QA
      // "selection appears then disappears" bug. The model is the one writer; mouse events below
      // drive cursor+anchor, and the native selection is only ever set programmatically from them.
      selectable: false,
      flexGrow: 1,
      // The RENDERABLE never soft-wraps — the renderable wrapping text itself would desync the
      // gutter and every row-based mapping (caret Y, selection rows, click hit-testing). Word wrap
      // is a MODE handled ABOVE this layer: wrap-OFF renders one file line per visual row (long
      // lines clip; horizontal scroll covers the rest); wrap-ON feeds pre-wrapped SEGMENT rows from
      // the pure mapping layer (EditorWrap.ts), so this stays 'none' in both modes.
      // invariant: One file line is one visual row when word wrap is off (ui.invariants.md)
      wrapMode: 'none',
    });
    editorArea.add(gutterBody);
    editorArea.add(codeBody);
    editorColumn.add(tabBar);
    editorColumn.add(breadcrumbBar);
    editorColumn.add(editorArea);
    // A definite-size host for the rich DiffView, swapped IN PLACE of editorArea (add/remove, not runtime
    // flex toggling — OpenTUI doesn't re-lay-out on a runtime flexGrow/height change). flexGrow:1 mirrors
    // editorArea, so the DiffView (height:100%) inside gets a real box. Not added until a diff opens.
    const diffContainer = new BoxRenderable(renderer, {
      id: 'diff-container',
      flexGrow: 1,
      width: '100%',
      flexDirection: 'column',
    });
    const markdownContainer = new BoxRenderable(renderer, {
      id: 'markdown-container',
      flexGrow: 1,
      width: '100%',
      flexDirection: 'column',
    });
    // Draggable sidebar↔editor divider (1-cell bar). onMouseDrag fires globally while the button is
    // held (even off the bar), so a drag resizes smoothly; the model clamps to [min,max] + persists.
    const paneSplitters = new PaneSplitters.Class({
      renderer,
      settings,
      workspaceSet,
      sidebar,
    });
    const sidebarDivider = paneSplitters.sidebar.renderable;
    const rightDockSplitter = new SplitterElement.Class({
      renderer,
      identifier: 'right-dock-divider',
      orientation: 'vertical',
      reportUnit: 'cells',
      initialSize: settings.rightDockWidth.value,
      minimumSize: 16,
      maximumSize: 70,
      pointerDirection: -1,
      currentSize: () => settings.rightDockWidth.value,
      onDragStart: () => {
        rightDockHost.focus();
        panelHost.blur();
      },
      onSizeChange: (width) => {
        settings.rightDockWidth.value = Math.round(width);
      },
      onDragEnd: () => settings.save(),
    });
    // OpenTUI fires BOTH drag-end AND up on release, so guard the persist with an active-drag flag —
    // otherwise the release saves twice (still a per-drag write, but the invariant is exactly one).
    // SHARED-FILE CHANGE (activity bar, Task 7): the VS-Code activity bar is a self-contained pane
    // controller. RootView constructs it, mounts its 4-col `bar` at the FAR LEFT of the main row (before
    // the sidebar), and calls activityBar.update() each frame. It owns no active-view state — clicks +
    // its keybindings switch the per-workspace Workspace.sidebarView through Workspace.showSidebarView.
    const activityBar = new ActivityBar.Class({
      renderer,
      workspaceSet,
      theme,
      tooltip,
      keybindings,
    });
    layoutCanvas.add(activityBar.bar);
    layoutCanvas.add(sidebar);
    layoutCanvas.add(sidebarDivider);
    layoutCanvas.add(editorColumn);
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
      panelHost.blur();
      rightDockHost.focus();
      renderer.requestRender();
    };
    rightDockBody.onMouseDown = (event: MouseEvent) => {
      panelHost.blur();
      rightDockHost.focus();
      rightDockHost.activeContent?.onPointerDown?.(
        Number(event.x) - Number(rightDockBody.x),
        Number(event.y) - Number(rightDockBody.y),
      );
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
      toggleTerminal,
      toggleAgent,
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
    const initialLayoutRows = Math.max(
      1,
      renderer.height -
        1 -
        1 -
        (settings.workspaceTabPosition.value === 'top' ? 2 : 0),
    );
    let panelHeightRows =
      LayoutModel.Class.defaultBottomPanelRows(initialLayoutRows);
    let currentLayoutRows = initialLayoutRows;
    const panelBox = new BoxRenderable(renderer, {
      id: 'panel-box',
      position: 'absolute',
      height: panelHeightRows,
      flexShrink: 0,
      border: true,
      borderStyle: 'rounded',
      flexDirection: 'row', // visible split cells lay out left-to-right; one cell = the degenerate case
      title: '',
      backgroundColor: readPalette().panel,
    });
    const panelContentsList = new PanelContentsList.Class(panelHost);
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
      );
      renderer.requestRender();
    };
    panelContentsListRenderable.onMouseDrag = (event) => {
      panelContentsList.pointerDrag(
        Number(event.y) - Number(panelContentsListRenderable.y),
      );
      renderer.requestRender();
    };
    const finishPanelContentsListDrag = (): void => {
      panelContentsList.pointerUp();
    };
    panelContentsListRenderable.onMouseUp = finishPanelContentsListDrag;
    panelContentsListRenderable.onMouseDragEnd = finishPanelContentsListDrag;
    let panelMounted = false;
    // --- Agent transcript scroll engine ------------------------------------------------------------
    // The agent pane reuses the ONE shared scroll surface (momentum + smooth glide + a vertical scrollbar)
    // in WRAP mode (disableHorizontal: no h-wheel, no h-bar) with tail-anchor (followBottom: stay pinned to
    // the newest turn until the user scrolls up). The pane stays a pure model — it reads scrollTop through
    // the injected port and never touches a renderable. RootView owns the renderable side: it mounts the
    // bar into panelBox, positions it over whichever visible cell shows the agent, and feeds the drag its
    // screen↔content mapping (the pane owns the selection MODEL).
    const agentContent = (): AgentPaneContent.Model | null => {
      const content = panelHost.resolvedCells.find(
        (cell) => cell.content instanceof AgentPaneContent.Class,
      )?.content;
      return content instanceof AgentPaneContent.Class ? content : null;
    };
    // Live geometry of the cell currently showing the agent (null when the agent is not a visible cell).
    let agentCellGeometry: {
      bodyX: number;
      bodyY: number;
      width: number;
      bodyRows: number;
    } | null = null;
    const agentScrollViewport = new ScrollableTextViewport.Class({
      renderer,
      settings,
      parent: panelBox,
      id: 'panel-agent',
      disableHorizontal: true,
      followBottom: true,
      scrollbarZIndex: 50, // the panel adds its cell bodies AFTER this viewport; keep the bar on top
      extent: () => {
        const agent = agentContent();
        return {
          contentRows: agent?.contentLineCount ?? 0,
          contentColumns: 0,
          viewportRows: Math.max(1, agent?.viewportRows ?? 1),
          viewportColumns: 1,
        };
      },
      colors: () => ({ track: readPalette().panel, thumb: readPalette().dim }),
      // A scroll change moves the viewport's (non-reactive) scrollTop; bump the pane's reactive paint
      // signal so the frame effect re-projects the window (else wheel/momentum/keys wouldn't repaint).
      onScroll: () => {
        agentContent()?.notifyScrolled();
        renderer.requestRender();
      },
      selection: {
        positionAtCell: (screenColumn, screenRow) => {
          const agent = agentContent();
          const geometry = agentCellGeometry;
          if (!agent || !geometry) return null;
          return agent.transcriptPointAt(
            screenColumn - geometry.bodyX,
            screenRow - geometry.bodyY,
          );
        },
        begin: (position) => agentContent()?.beginTranscriptSelection(position),
        extend: (position) =>
          agentContent()?.extendTranscriptSelection(position),
        finish: () => agentContent()?.finishTranscriptSelection(),
        viewportRectangle: () => {
          const geometry = agentCellGeometry;
          if (!geometry)
            return { leftColumn: 0, rightColumn: 0, topRow: 0, bottomRow: 0 };
          return {
            leftColumn: geometry.bodyX,
            rightColumn: geometry.bodyX + geometry.width - 1,
            topRow: geometry.bodyY,
            bottomRow: geometry.bodyY + geometry.bodyRows - 1,
          };
        },
        lineGraphemeCount: (lineIndex) =>
          agentContent()?.transcriptLineGraphemeCount(lineIndex) ?? 0,
      },
    });
    const agentScrollPort: AgentScrollPort = {
      get scrollTop() {
        return agentScrollViewport.scrollTop;
      },
      get stuckToBottom() {
        return agentScrollViewport.stuckToBottom;
      },
      scrollRowsBy: (delta) => {
        agentScrollViewport.scrollRowsBy(delta);
        renderer.requestRender();
      },
      scrollToBottom: () => {
        agentScrollViewport.scrollToBottom();
        renderer.requestRender();
      },
    };
    const agentsWithScrollPort = new WeakSet<AgentPaneContent.Model>();
    // Pane contents may publish an external scroll extent (the terminal keeps its position in xterm).
    // This host supplies the same settings-derived physics and SolidThumbScrollBar projection to every
    // such content without learning its kind.
    const paneScrollPort: PaneScrollPort = {
      momentumOptions: () => ({
        impulse: settings.scrollAccelGain.value,
        max: settings.verticalFlingCeiling.value,
        decayPerSec: settings.scrollFriction.value,
        stopVelocity: Momentum.Class.verticalOptions.stopVelocity,
      }),
      requestRender: () => renderer.requestRender(),
    };
    const contentsWithScrollPort = new WeakSet<PaneContent>();
    // A small manual drag for the COMPOSER selection (it needs no momentum/edge-autoscroll, so it does NOT
    // go through the viewport): true while a composer drag is in flight. `transcriptDragging` marks a
    // transcript drag routed through the viewport (so a click on inert chrome rows starts neither).
    let composerDragging = false;
    let transcriptDragging = false;
    // Split-aware panel body: a reconciling POOL of cell views. Each visible cell is one TextRenderable
    // body; adjacent cells are separated by a 1-column divider whose drag re-flows the two it sits
    // between (a vertical ratio SplitterModel over the panel's inner width). ONE visible cell means no
    // divider and a full-width body — pixel-identical to the pre-split single-pane panel. The pool is
    // grown on demand and re-attached in order only when the visible-cell COUNT changes (rare), so steady
    // frames just update widths and content.
    interface PanelCellView {
      readonly container: BoxRenderable;
      readonly heading: TextRenderable;
      readonly body: TextRenderable;
      readonly verticalScrollBar: SolidThumbScrollBar.Model;
      readonly verticalScrollBarState: {
        applyingGeometry: boolean;
        reportedToTrueScale: number;
      };
      readonly splitterElement: SplitterElement.Model | null;
      headingProjection: PanelHeadingProjection | null;
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
      const heading = new TextRenderable(renderer, {
        id: `panel-cell-heading-${index}`,
        content: '',
        width: '100%',
        height: 1,
        wrapMode: 'none',
        selectable: false,
      });
      const body = new TextRenderable(renderer, {
        id: `panel-cell-${index}`,
        content: '',
        wrapMode: 'none',
        flexGrow: 1,
        minHeight: 0,
        width: '100%',
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
      container.add(heading);
      container.add(body);
      container.add(verticalScrollBar);
      // The cell at this pool index whose content is the agent, else null (for scroll/selection routing).
      const agentAtCell = (): AgentPaneContent.Model | null => {
        const content = panelHost.resolvedCells[index]?.content;
        return content instanceof AgentPaneContent.Class ? content : null;
      };
      // Focus-follows-click at the CELL grain: clicking a cell body focuses the panel and that cell. For the
      // AGENT it also begins a drag-selection (transcript via the shared viewport engine, composer via a
      // small manual drag), grabbing pointer capture so the drag routes here wherever it travels; a BARE
      // click (no drag) toggles a collapsed tool row on mouse-up. Other panes keep the click hit-test.
      heading.onMouseDown = (event) => {
        panelHost.focus();
        panelHost.focusCell(index);
        const view = panelCellViews[index];
        const action = view?.headingProjection
          ? PanelHeading.Class.controlAtColumn(
              view.headingProjection,
              Number(event.x) - Number(heading.x),
            )
          : null;
        const content = panelHost.resolvedCells[index]?.content;
        if (action === 'add') {
          openPanelAddPopup({
            column: Number(event.x),
            row: Number(event.y),
          });
        } else if (action === 'expand') {
          panelHost.toggleExpanded();
        } else if (action === 'close' && content) {
          panelHost.removeContent(content.id);
        }
        renderer.requestRender();
      };
      body.onMouseDown = (event: MouseEvent) => {
        panelHost.focus();
        panelHost.focusCell(index);
        const agent = agentAtCell();
        const localColumn = (event.x as number) - (body.x as number);
        const localRow = (event.y as number) - (body.y as number);
        if (agent) {
          const region = agent.regionAtRow(localRow);
          if (region.kind === 'composer') {
            composerDragging = true;
            transcriptDragging = false;
            agent.beginComposerSelection(
              agent.composerPointAt(localColumn, region.visibleRow),
            );
          } else if (region.kind === 'transcript') {
            composerDragging = false;
            transcriptDragging = true;
            agentScrollViewport.beginDrag(event.x as number, event.y as number);
          } else {
            composerDragging = false; // 'other' rows (spinner/rule/mode line) start no selection
            transcriptDragging = false;
            agent.onPointerDown(localColumn, localRow); // reach the mode-line engine segment (click to cycle)
          }
        } else {
          const content = panelHost.resolvedCells[index]?.content;
          content?.onPointerDown?.(localColumn, localRow);
        }
        renderer.requestRender();
      };
      body.onMouseDrag = (event: MouseEvent) => {
        const agent = agentAtCell();
        if (!agent) {
          const content = panelHost.resolvedCells[index]?.content;
          content?.onPointerDrag?.(
            (event.x as number) - (body.x as number),
            (event.y as number) - (body.y as number),
          );
          renderer.requestRender();
          return;
        }
        if (composerDragging) {
          const region = agent.regionAtRow(
            (event.y as number) - (body.y as number),
          );
          const visibleRow =
            region.kind === 'composer' ? region.visibleRow : agent.viewportRows; // clamp below
          agent.extendComposerSelection(
            agent.composerPointAt(
              (event.x as number) - (body.x as number),
              visibleRow,
            ),
          );
        } else if (transcriptDragging) {
          agentScrollViewport.dragTo(event.x as number, event.y as number);
        } else {
          return;
        }
        renderer.requestRender();
      };
      const endAgentDrag = (event: MouseEvent): void => {
        const agent = agentAtCell();
        if (!agent) {
          const content = panelHost.resolvedCells[index]?.content;
          content?.onPointerUp?.(
            (event.x as number) - (body.x as number),
            (event.y as number) - (body.y as number),
          );
          renderer.requestRender();
          return;
        }
        if (composerDragging) {
          composerDragging = false;
          agent.finishComposerSelection();
        } else if (transcriptDragging) {
          transcriptDragging = false;
          agentScrollViewport.endDrag();
          // A bare click (no selection was made) in the transcript toggles a collapsed tool row.
          if (!agent.hasSelection()) {
            agent.onPointerDown(
              (event.x as number) - (body.x as number),
              (event.y as number) - (body.y as number),
            );
          }
        }
        renderer.requestRender();
      };
      body.onMouseUp = endAgentDrag;
      body.onMouseDragEnd = endAgentDrag;
      // Vertical wheel over a cell scrolls its content. The agent transcript flings through the shared
      // momentum engine (wrap mode: no horizontal); other panes route through their optional onWheel.
      body.onMouseScroll = (event) => {
        if (agentAtCell()) {
          agentScrollViewport.handleWheel(event);
          renderer.requestRender();
          return;
        }
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
        heading,
        body,
        verticalScrollBar,
        verticalScrollBarState,
        splitterElement,
        headingProjection: null,
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
      for (let index = 0; index < count; index += 1) {
        const view = ensurePanelCellView(index);
        if (view.splitterElement) panelBox.add(view.splitterElement.renderable);
        panelBox.add(view.container);
      }
      if (panelContentsList.visible) panelBox.add(panelContentsListRenderable);
      mountedPanelCellCount = count;
      mountedPanelContentsListVisible = panelContentsList.visible;
    };
    // Draggable panel height: a HORIZONTAL SplitterModel in cells. The grab strip sits ABOVE the panel,
    // so dragging UP must GROW the panel — the pointer Y is negated before it reaches the model (up =
    // smaller Y = larger negated position = larger height). Reuses the shared splitter (min 3 rows).
    const panelSplitter = new SplitterElement.Class({
      renderer,
      identifier: 'panel-divider',
      orientation: 'horizontal',
      reportUnit: 'cells',
      initialSize: panelHeightRows,
      minimumSize: 3,
      maximumSize: () =>
        LayoutModel.Class.maximumUnexpandedBottomPanelRows(currentLayoutRows),
      pointerDirection: -1,
      currentSize: () => panelHeightRows,
      onDragStart: () => panelHost.focus(),
      onSizeChange: (height) => {
        panelHeightRows = Math.round(height);
        renderer.requestRender();
      },
    });
    const panelDividerRenderable = panelSplitter.renderable;
    // Clicking the panel focuses it (focus-follows-click). Blur-on-outside is handled in Bootstrap's
    // global mouse handler via panelContainsPoint.
    panelBox.onMouseDown = () => {
      rightDockHost.blur();
      panelHost.focus();
      renderer.requestRender();
    };
    // invariant: Visible panel contents own separate headed regions (src/modules/ui/ui.invariants.md)
    function synchronizePanelMount(): void {
      const visible = panelHost.visible.value;
      if (visible === panelMounted) return;
      if (visible) {
        layoutCanvas.add(panelDividerRenderable);
        layoutCanvas.add(panelBox);
      } else {
        layoutCanvas.remove(panelDividerRenderable);
        layoutCanvas.remove(panelBox);
      }
      panelMounted = visible;
    }
    // Resolved inner cell region of the panel slot (border-inset). Read the current LayoutModel result,
    // not the renderable's previous Yoga box: absolute slot geometry is applied during this paint, so
    // layout read-back would be one frame stale when a quiet pane first opens.
    const panelViewportColumns = (): number =>
      panelHost.visible.value
        ? Math.max(
            1,
            layoutSlotGeometry.bottomPanel.width -
              2 -
              (panelContentsList.visible ? panelContentsList.width : 0),
          )
        : 0;
    const panelViewportRows = (): number =>
      panelHost.visible.value
        ? Math.max(1, layoutSlotGeometry.bottomPanel.height - 3)
        : 0;
    const panelContainsPoint = (x: number, y: number): boolean => {
      if (!panelHost.visible.value) return false;
      const boxX = panelBox.x as number;
      const boxY = panelBox.y as number;
      const boxWidth = panelBox.width as number;
      const boxHeight = panelBox.height as number;
      // Include the resize divider (the row directly above the box) as panel chrome — grabbing it to
      // resize must NOT blur the terminal (else the resize deselects the shell you were driving).
      return (
        statusBar.panelControlContainsPoint(x, y) ||
        (x >= boxX &&
          x < boxX + boxWidth &&
          y >= boxY - 1 &&
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
    let layoutSlotGeometry: LayoutSlotGeometry = LayoutModel.Class.resolve({
      totalColumns: 1,
      totalRows: 1,
      primaryDockVisible: primaryDockHost.visible.value,
      activityBarVisible: settings.showActivityBar.value,
      activityBarColumns: 4,
      sidebarColumns: sidebarWidth(),
      sidebarPosition: settings.sidebarPosition.value,
      rightDockVisible: rightDockHost.visible.value,
      rightDockColumns: settings.rightDockWidth.value,
      bottomPanelVisible: panelHost.visible.value,
      bottomPanelExpanded: panelHost.expanded.value,
      bottomPanelRows: panelHeightRows,
      panelAlignment: settings.panelAlignment.value,
      leftDockVerticalSpan: settings.leftDockVerticalSpan.value,
      rightDockVerticalSpan: settings.rightDockVerticalSpan.value,
    });
    const synchronizeLayoutGeometry = (): void => {
      const fallbackColumns = Math.max(
        1,
        renderer.width -
          (settings.workspaceTabPosition.value === 'left' ? 22 : 0),
      );
      const fallbackRows = Math.max(
        1,
        renderer.height -
          1 -
          1 -
          (settings.workspaceTabPosition.value === 'top' ? 2 : 0),
      );
      const totalColumns =
        Number(layoutCanvas.width) > 0
          ? Number(layoutCanvas.width)
          : fallbackColumns;
      const totalRows =
        Number(layoutCanvas.height) > 0
          ? Number(layoutCanvas.height)
          : fallbackRows;
      currentLayoutRows = totalRows;
      layoutSlotGeometry = LayoutModel.Class.resolve({
        totalColumns,
        totalRows,
        primaryDockVisible: primaryDockHost.visible.value,
        activityBarVisible: settings.showActivityBar.value,
        activityBarColumns: 4,
        sidebarColumns: sidebarWidth(),
        sidebarPosition: settings.sidebarPosition.value,
        rightDockVisible: rightDockHost.visible.value,
        rightDockColumns: settings.rightDockWidth.value,
        bottomPanelVisible: panelHost.visible.value,
        bottomPanelExpanded: panelHost.expanded.value,
        bottomPanelRows: panelHeightRows,
        panelAlignment: settings.panelAlignment.value,
        leftDockVerticalSpan: settings.leftDockVerticalSpan.value,
        rightDockVerticalSpan: settings.rightDockVerticalSpan.value,
      });
      activityBar.bar.position = 'absolute';
      activityBar.bar.left = layoutSlotGeometry.activityBar.left;
      activityBar.bar.top = layoutSlotGeometry.activityBar.top;
      activityBar.bar.width = layoutSlotGeometry.activityBar.width;
      activityBar.bar.height = layoutSlotGeometry.activityBar.height;
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
        panelSplitter.setGeometry({
          left: layoutSlotGeometry.bottomPanelSplitter.left,
          top: layoutSlotGeometry.bottomPanelSplitter.top,
          length: layoutSlotGeometry.bottomPanelSplitter.width,
          visible: !panelHost.expanded.value,
        });
        panelBox.left = layoutSlotGeometry.bottomPanel.left;
        panelBox.top = layoutSlotGeometry.bottomPanel.top;
        panelBox.width = layoutSlotGeometry.bottomPanel.width;
        panelBox.height = layoutSlotGeometry.bottomPanel.height;
      }
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
    // ONE configured thickness for every pane and axis. Vertical bars use that many columns; horizontal
    // bars use that many rows painted with half-height glyphs, compensating for the terminal cell's
    // roughly 2:1 height:width aspect ratio. The setting therefore changes visual thickness uniformly.
    const scrollbarThicknessCells = (): number =>
      Math.max(1, Math.round(settings.scrollbarThickness.value));
    // True while applyBarGeometry is ASSIGNING scrollPosition: the widget fires onChange for
    // programmatic writes too, and treating those as user thumb-drags halted the momentum glide on
    // every paint (the 'wheel not smooth since scrollbars' regression). onChange handlers must act
    // only on USER-initiated changes — a real thumb drag then halts momentum and adopts authority.
    // Draggable git changes↔log divider: a 1-row grab strip over the divider glyph row (git view only).
    // Dragging sets settings.gitSplitRatio LIVE via workspaceSet.active.setGitSplit — the SAME persisted value the
    // settings panel writes (single source). Capture-on-mousedown (captureDragTarget) so this thin strip
    // survives the drag exactly like the sidebar divider; the ratio is the pointer's row within the
    // sidebar body, so it tracks the cursor directly.
    const gitSplitDivider = paneSplitters.git;
    sidebar.add(gitSplitDivider.renderable);
    // Interior height of a bordered box = box height - 2 (top+bottom border).
    // invariant: A scrollable pane height is an input not an output (ui.invariants.md)
    const editorViewportHeight = () =>
      Math.max(1, (editorArea.height as number) - 2);
    // Layout-anchored (never hand-derived): the code renderable's own laid-out width, minus the one
    // column the overlay vertical scrollbar occupies — so the final column of a line is always
    // reachable and visible at max scrollLeft.
    const editorViewportWidth = () => {
      const laidOut = codeBody.width as number;
      if (laidOut && laidOut > 1) return Math.max(1, laidOut - 1);
      return Math.max(1, (editorArea.width as number) - 2 - 6);
    };
    const editorCaretAnchor = (): { column: number; row: number } | null => {
      const editor = workspaceSet.active.editor;
      if (!editor.hasDocument.value || workspaceSet.active.activeFileIsImage)
        return null;
      if (editor.wordWrap.value) {
        const position = editorController.wrapVisualPosition(
          editor.cursor.line.value,
          editor.cursor.col.value,
        );
        return position && typeof position === 'object'
          ? {
              column: codeBody.x + position.column,
              row: codeBody.y + position.rowIndex,
            }
          : null;
      }
      const cursorDisplayColumn = EditorCoordinates.Class.displayColumn(
        editor.document.line(editor.cursor.line.value),
        editor.cursor.col.value,
      );
      return {
        column:
          codeBody.x + cursorDisplayColumn - editor.viewport.scrollLeft.value,
        row:
          codeBody.y +
          editor.cursor.line.value -
          editor.viewport.scrollTop.value,
      };
    };
    /** Grapheme-safe window over display columns; never splits a wide glyph at either edge. */
    // displayColumnWindow / padToDisplayWidth now live on EditorCoordinates (the display-column-math
    // capability) so every pane renderer shares one horizontal-windowing primitive. Local aliases keep
    // the call sites terse.
    const displayColumnWindow = EditorCoordinates.Class.displayColumnWindow;
    const padToDisplayWidth = EditorCoordinates.Class.padToDisplayWidth;
    // The git row formatters (changeRowText/commitLogRowText) and content-width helpers now live on
    // GitPaneRenderer with the git-pane render itself; RootView calls the width helpers for scrollbar
    // geometry (below) and delegates the render (renderGitPanel).
    const gitActionAreaWidth = 9;
    /**
     * Converge layout-derived pane inputs AFTER Yoga has laid out the frame. This is deliberately
     * outside update(): render stays model -> view only, while each pane model owns its live extent.
     */
    const EMPTY_STATE = [
      '',
      '   Invar — a terminal code workspace',
      '',
      '   ↑/↓  navigate files      Enter  open / expand',
      '   Tab  switch pane         Ctrl+P command palette',
      '   Ctrl+Q or F10  quit   (VS Code: Ctrl+X then Ctrl+C)',
      '',
    ].join('\n');
    // The Extensions activity view is a placeholder for now (the pane switches, the content is a
    // coming-soon note). The bar item + its Ctrl+Shift+X chord are live; the marketplace is future work.
    const EXTENSIONS_PLACEHOLDER = [
      '',
      '   Extensions',
      '',
      '   Coming soon.',
      '',
    ].join('\n');
    // Gutter width in cells for the current document: "NN " (line number + space) + 1 marker cell.
    const gutterWidth = () =>
      String(workspaceSet.active.editor.document.lineCount).length + 1 + 2;
    // Wrap-mode view geometry of the last-rendered frame: the visual rows the window showed, written
    // by renderEditor and read by the caret block, applySelection, and the mouse hit-test — so all
    // consumers agree on what is where (same pattern as gitPanelGeometry). Presentation state only.
    // Empty when wrap is off.
    // wrapVisualPosition / documentPositionAtCell / applySelection / the selection drag now live in the
    // EditorPane controller (below) with the wrap window they read.
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
    // invariant: The selected range renders with a background (ui.invariants.md)
    // The git sidebar: a changes region (staged/unstaged/untracked + branch header) over a
    // VIRTUALIZED commit log (only the visible window is materialized, via CommitLog.rows). Split by
    // gitPanel.splitRatio. Keyboard-driven for now; mouse + drill-down + drag layer on next.
    // invariant: Cost tracks the actively observed set (project.invariants.md)
    // Layout geometry of the last-rendered git panel, for mouse hit-testing — the renderer writes
    // it, the click/hover/wheel handlers read it, so both always agree on what is where.
    let gitPanelGeometry = {
      changesTop: 0, // first screen row (sidebar-relative, border-inclusive) of the changes list
      changesRows: 0, // visible change rows
      dividerRow: 0,
      logHeaderRow: -1, // branch-selector header row of the log region (-1 = none rendered)
      logTop: 0,
      logRows: 0,
    };
    function renderGitPanel(): StyledText {
      // The git-pane render lives in GitPaneRenderer; RootView supplies palette + geometry + the theme
      // icon sets and the active workspace, then applies the geometry the renderer returns (it is the
      // hit-testers' source of truth). Behaviour identical.
      const innerWidth = sidebarWidth() - 2;
      const result = GitPaneRenderer.Class.render({
        workspace: workspaceSet.active,
        palette: readPalette(),
        innerWidth,
        bodyHeight: Math.max(1, (sidebar.height as number) - 2),
        scrollbarThickness: scrollbarThicknessCells(),
        gitActionAreaWidth,
        actionIcons: theme.actionIcons,
        checkboxIcons: theme.checkboxIcons,
      });
      gitPanelGeometry = result.geometry;
      return result.text;
    }
    // renderStatus moved into the StatusBar controller (it composes the same parts from workspace/app
    // state + the markdown-preview-focused flag RootView passes to statusBar.update).
    // The editor content-area MOUNT controller owns what occupies the editor column (plain editor /
    // side-by-side DiffView / Markdown split) and the diff+markdown instance lifecycle. update() calls
    // sync() each paint; the frame loop calls tickDiff()/tickMarkdown(); readers (caret, status, find
    // target, editor pane) reach the active instances through its getters.
    const editorContentMount = new EditorContentMount.Class({
      renderer,
      theme,
      settings,
      findBar,
      workspaceSet,
      keybindings,
      tooltip,
      editorColumn,
      editorArea,
      diffContainer,
      markdownContainer,
    });
    function findTarget(): FindBarTarget | null {
      // invariant: Markdown panes keep independent find state (src/modules/markdown/markdown.invariants.md)
      // invariant: Diff panes keep independent find state (src/modules/diff/diff.invariants.md)
      const diffView = editorContentMount.diffView;
      if (workspaceSet.active.showingDiff.value && diffView) {
        return diffView.findTarget();
      }
      const markdownSplitView = editorContentMount.markdownSplitView;
      if (markdownSplitView?.previewFocused) {
        return markdownSplitView.findTarget();
      }
      const editor = workspaceSet.active.editor;
      if (!editor.hasDocument.value) return null;
      return {
        identifier: `source:${editor.document.path}`,
        document: editor.document,
        replaceAllowed: !editor.readOnly.value,
        revealMatch: (match) => {
          editorContentMount.markdownSplitView?.focusSource();
          editor.placeCursor(match.line, match.endColumn);
          editor.cursor.anchor.value = {
            line: match.line,
            col: match.startColumn,
          };
          editor.revealCursor();
        },
      };
    }
    function update(): void {
      const palette = readPalette();
      synchronizeWorkspaceTabMount();
      synchronizePanelMount();
      editorContentMount.sync();
      column.backgroundColor = palette.bg;
      const sidebarViewValue = workspaceSet.active.sidebarView.value;
      const gitView = sidebarViewValue === 'git';
      const extensionsView = sidebarViewValue === 'extensions';
      // The activity bar reflects sidebarView (active-item accent) + the git badge each frame.
      activityBar.setVisible(
        primaryDockHost.visible.value && settings.showActivityBar.value,
      );
      synchronizeLayoutGeometry();
      commandBar.update();
      activityBar.update(palette);
      sidebar.backgroundColor = palette.panel;
      // Files/git are focusable panels (bright border when their focus owns them); extensions is a
      // display-only placeholder, so it stays dim.
      const sidebarViewFocused =
        workspaceSet.active.focus.value === 'files' || gitView;
      sidebar.borderColor = sidebarViewFocused
        ? palette.borderActive
        : palette.border;
      // Divider: brighten while hovered or dragging so it reads as a grab handle.
      paneSplitters.updateAppearance(palette);
      panelSplitter.updateAppearance(palette);
      rightDockSplitter.updateAppearance(palette);
      sidebar.titleColor = sidebarViewFocused ? palette.accent : palette.dim;
      sidebar.title = gitView ? 'Git' : extensionsView ? 'Extensions' : 'Files';
      editorArea.backgroundColor = palette.bg;
      const sourcePaneFocused =
        workspaceSet.active.focus.value === 'editor' &&
        !(editorContentMount.markdownSplitView?.previewFocused ?? false);
      editorArea.borderColor = sourcePaneFocused
        ? palette.borderActive
        : palette.border;
      // No filename legend on the editor-pane border: the path now lives in the buffer-tab breadcrumb
      // (project › dir › file). Keep the border BOX (codeBody coords stay stable) but drop the redundant
      // '╭─README.md' legend. Safe: the app's find/paste source identity is the document PATH, never this
      // display title — the only thing that ever keyed off the legend text was a test probe (now fixed).
      editorArea.title = '';
      editorArea.titleColor = sourcePaneFocused ? palette.accent : palette.dim;
      // The diff view has no editor buffer tabs — blank the buffer tab strip while a diff is showing
      // (keep its row so the diff panes don't jump when toggling in/out of a diff).
      const diffShowing = workspaceSet.active.showingDiff.value;
      tabBar.content = diffShowing ? '' : tabBarController.renderBuffer();
      // Breadcrumb row: the active file's path, blank during a diff or when no file is open.
      breadcrumbBar.content =
        diffShowing || !workspaceSet.active.editor.hasDocument.value
          ? ''
          : tabBarController.renderBreadcrumb();
      workspaceTabBar.content = tabBarController.renderWorkspace();
      workspaceTabBar.fg = palette.fg;
      const primaryDockContent = primaryDockHost.activeContent;
      sidebarBody.content = gitView
        ? renderGitPanel()
        : extensionsView
          ? EXTENSIONS_PLACEHOLDER
          : primaryDockContent
            ? primaryDockContent.render({
                width: Math.max(1, sidebarWidth() - 2),
                height: Math.max(1, Number(sidebar.height) - 2),
                palette,
                glyphLevel: theme.glyphLevel.value,
                colorDepth: theme.colorDepth.value,
                focused: workspaceSet.active.focus.value === 'files',
              })
            : '';
      sidebarBody.fg = palette.fg;
      // When the active buffer is an image, the code body shows the half-block preview (no gutter, no
      // syntax text). Non-image files are untouched — the editor render path below is unchanged.
      // invariant: A raster image renders as half-block cells sized to the pane (src/modules/image/image.invariants.md)
      // invariant: An image buffer replaces the code text and leaves other files untouched (src/modules/image/image.invariants.md)
      const activeFileIsImage = workspaceSet.active.activeFileIsImage;
      const rendered = activeFileIsImage
        ? null
        : editorController.renderEditor();
      // Any non-image frame deletes a lingering pixel placement (cheap no-op when nothing is placed).
      if (!activeFileIsImage) pixelMount.clear();
      if (activeFileIsImage) {
        gutterBody.width = 0;
        gutterBody.content = '';
        const imagePath = workspaceSet.active.editor.document.path;
        const previewColumns = Math.max(1, editorViewportWidth());
        const previewRows = Math.max(1, editorViewportHeight());
        // The tier ladder: kitty → sixel → half-block. A pixel tier renders BLANK cells under the
        // out-of-band graphics (so cell repaints never fight the image) and hands placement to the
        // mount; the half-block floor (and every decode failure) renders through the cells exactly
        // as before. The ladder is one registry ask — no tier list lives here.
        // invariant: Graphics tier prefers the reported capability and degrades to cells (src/modules/theme/theme.invariants.md)
        const graphicsTier = TerminalCapabilities.Class.detectGraphicsTier(
          reportedGraphics.value,
        );
        const pixelEncoder = ImageRenderers.Class.encoderFor(graphicsTier);
        const decodedImage = pixelEncoder
          ? imagePreview.decodedImage(imagePath)
          : null;
        if (pixelEncoder && decodedImage) {
          codeBody.content = '';
          pixelMount.sync({
            tier: graphicsTier,
            encoder: pixelEncoder,
            image: decodedImage,
            path: imagePath,
            region: {
              x: codeBody.x,
              y: codeBody.y,
              columns: previewColumns,
              rows: previewRows,
            },
            panelBackground: palette.panel,
          });
        } else {
          pixelMount.clear();
          codeBody.content = imagePreview.render(
            imagePath,
            previewColumns,
            previewRows,
            palette.panel,
            palette.error,
          );
        }
      } else if (rendered) {
        gutterBody.width = gutterWidth();
        gutterBody.content = rendered.gutter;
        codeBody.content = rendered.code;
      } else {
        gutterBody.width = 0;
        gutterBody.content = '';
        codeBody.content = EMPTY_STATE;
      }
      codeBody.fg = palette.fg;
      codeBody.selectionBg = palette.selection;
      editorController.applySelection(); // after content is set, so selection maps onto the current buffer
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
          ? rightDockContent.render({
              width: rightDockViewportColumns(),
              height: rightDockViewportRows(),
              palette,
              glyphLevel: theme.glyphLevel.value,
              colorDepth: theme.colorDepth.value,
              focused: rightDockFocused,
            })
          : ' Right dock\n\n No content';
      }
      // Bottom panel slot: pull EACH visible cell's PaneContent into its own body (one body = the
      // terminal for tier S; two = agent | terminal side by side). The host is content-agnostic — RootView
      // never names the terminal here; it iterates the host's converged cell spans and paints each.
      // invariant: The panel renders exactly the visible pane content cells each frame (src/modules/terminal/terminal.invariants.md)
      // invariant: A split panel renders every visible cell into its own sub-region (src/modules/terminal/terminal.invariants.md)
      if (panelHost.visible.value) {
        const panelFocused = panelHost.focused.value;
        const focusedIndex = panelHost.focusedIndex.value;
        const spans = panelHost.cellSpans(panelViewportColumns());
        syncPanelCellMount(spans.length);
        panelBox.title = '';
        panelBox.backgroundColor = palette.panel;
        panelBox.borderColor = panelFocused
          ? palette.borderActive
          : palette.border;
        panelBox.titleColor = panelFocused ? palette.accent : palette.dim;
        panelContentsListRenderable.visible = panelContentsList.visible;
        panelContentsListRenderable.width = panelContentsList.visible
          ? panelContentsList.width
          : 0;
        panelContentsListRenderable.content = panelContentsList.render(palette);
        const cellRows = panelViewportRows();
        const panelContentTop = (panelBox.y as number) + 1; // inside the rounded border
        const panelContentLeft = (panelBox.x as number) + 1;
        let agentVisible = false;
        spans.forEach((span, index) => {
          const view = panelCellViews[index];
          if (!view) return;
          const cellFocused = panelFocused && index === focusedIndex;
          view.container.width = span.columns;
          view.headingProjection = PanelHeading.Class.project({
            width: span.columns,
            title: span.content.title,
            icon: span.content.icon,
            focused: cellFocused,
            expanded: panelHost.expanded.value,
            palette,
          });
          view.heading.content = view.headingProjection.text;
          view.body.fg = palette.fg;
          const agent =
            span.content instanceof AgentPaneContent.Class
              ? span.content
              : null;
          if (agent) {
            view.verticalScrollBar.visible = false;
            if (!agentsWithScrollPort.has(agent)) {
              agent.attachScrollPort(agentScrollPort);
              agentsWithScrollPort.add(agent);
            }
            agentScrollViewport.followContentTail(); // tail-anchor before reading scrollTop for the window
            // Reserve the cell's trailing column for the vertical bar when the transcript overflows.
            const overflow = agent.contentLineCount > agent.viewportRows;
            const renderWidth = overflow
              ? Math.max(1, span.columns - 1)
              : span.columns;
            view.body.content = agent.render({
              width: renderWidth,
              height: cellRows,
              palette,
              glyphLevel: theme.glyphLevel.value,
              colorDepth: theme.colorDepth.value,
              focused: cellFocused,
            });
            // Re-sync the tail-anchor AFTER the render refreshed the pane's line count: a synchronous
            // whole-turn append (echo/permission flows) grows the content in ONE paint, and the pre-render
            // follow saw the stale extent. The pane already windowed at the fresh maximum while stuck; this
            // converges the ENGINE's scrollTop to the same place (scrollbar geometry + future wheel deltas).
            agentScrollViewport.followContentTail();
            agentCellGeometry = {
              bodyX: view.body.x as number,
              bodyY: view.body.y as number,
              width: renderWidth,
              bodyRows: agent.viewportRows,
            };
            agentVisible = true;
            agent.setPaneVisible(true);
            // Position the vertical scrollbar in the cell's trailing column, spanning the transcript rows
            // (region is in panelBox CONTENT-local coordinates; width includes the reserved bar column).
            agentScrollViewport.updateScrollbars({
              top: (view.body.y as number) - panelContentTop,
              left: (view.body.x as number) - panelContentLeft,
              width: span.columns,
              height: agent.viewportRows,
            });
          } else {
            view.body.content = span.content.render({
              width: span.columns,
              height: cellRows,
              palette,
              glyphLevel: theme.glyphLevel.value,
              colorDepth: theme.colorDepth.value,
              focused: cellFocused,
            });
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
          }
          view.splitterElement?.updateAppearance(palette);
        });
        if (!agentVisible) {
          agentScrollViewport.hideBars();
          agentCellGeometry = null;
        }
        for (const content of panelHost.orderedContents) {
          if (
            content instanceof AgentPaneContent.Class &&
            content !== agentContent()
          ) {
            content.setPaneVisible(false);
          }
        }
      } else {
        agentScrollViewport.hideBars();
        for (const view of panelCellViews) {
          view.verticalScrollBar.visible = false;
        }
        agentCellGeometry = null;
        for (const content of panelHost.orderedContents) {
          if (content instanceof AgentPaneContent.Class) {
            content.setPaneVisible(false);
          }
        }
      }
      statusBar.update(
        palette,
        editorContentMount.markdownSplitView?.previewFocused ?? false,
      );
      overlayLayer.update(palette);
      hoverCard.update(palette);
      scrollbarSync.syncScrollbars();
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
      // invariant: The caret renders at the cursor display column (ui.invariants.md)
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
      // Native terminal caret at the cursor's DISPLAY column (tab/wide aware). Shown only when the
      // editor is focused, has a document, no palette overlay, and the cursor line is on screen.
      // invariant: The caret renders at the cursor display column (ui.invariants.md)
      const editor = workspaceSet.active.editor;
      const scrollTop = editor.viewport.scrollTop.value;
      const viewportHeight = editorViewportHeight();
      const cursorLine = editor.cursor.line.value;
      if (editor.wordWrap.value) {
        // Wrap mode: the caret cell comes from the SAME logical↔visual mapping the render used —
        // no scrollLeft subtraction (horizontal scroll is inert); the visual-row offset replaces
        // the logical-row offset. Same 1-based ANSI +1 as the wrap-off path; still verified against
        // tmux's own #{cursor_x},#{cursor_y}.
        // invariant: The caret renders at the cursor display column (ui.invariants.md)
        const caretPosition =
          editor.hasDocument.value &&
          !activeFileIsImage &&
          workspaceSet.active.focus.value === 'editor' &&
          !editorContentMount.markdownSplitView?.previewFocused &&
          !commands.open.value
            ? editorController.wrapVisualPosition(
                cursorLine,
                editor.cursor.col.value,
              )
            : null;
        if (caretPosition && typeof caretPosition === 'object') {
          const caretCellX = codeBody.x + caretPosition.column;
          const caretCellY = codeBody.y + caretPosition.rowIndex;
          renderer.setCursorPosition(caretCellX + 1, caretCellY + 1, true);
        } else {
          renderer.setCursorPosition(0, 0, false);
        }
        return;
      }
      const caretVisibleHorizontally =
        EditorCoordinates.Class.displayColumn(
          editor.document.line(
            Math.min(cursorLine, editor.document.lineCount - 1),
          ),
          editor.cursor.col.value,
        ) >= editor.viewport.scrollLeft.value &&
        EditorCoordinates.Class.displayColumn(
          editor.document.line(
            Math.min(cursorLine, editor.document.lineCount - 1),
          ),
          editor.cursor.col.value,
        ) <
          editor.viewport.scrollLeft.value + editorViewportWidth();
      if (
        editor.hasDocument.value &&
        !activeFileIsImage &&
        workspaceSet.active.focus.value === 'editor' &&
        !editorContentMount.markdownSplitView?.previewFocused &&
        !commands.open.value &&
        cursorLine >= scrollTop &&
        cursorLine < scrollTop + viewportHeight &&
        caretVisibleHorizontally
      ) {
        const cursorDisplayColumn = EditorCoordinates.Class.displayColumn(
          editor.document.line(cursorLine),
          editor.cursor.col.value,
        );
        // Anchor the caret to the code renderable's ACTUAL laid-out screen cell (codeBody.x/y from
        // yoga), not hand-derived layout constants — the constants drifted from the real layout (the
        // human-QA off-by-one) and would break again when the sidebar becomes draggable.
        const caretScrollLeft = editor.viewport.scrollLeft.value;
        const caretCellX = codeBody.x + (cursorDisplayColumn - caretScrollLeft);
        const caretCellY = codeBody.y + (cursorLine - scrollTop);
        // The native terminal cursor is 1-BASED (ANSI CUP): +1 on both axes — OpenTUI's own
        // renderCursor does `screenX + visualCol + 1`.
        renderer.setCursorPosition(caretCellX + 1, caretCellY + 1, true);
      } else {
        renderer.setCursorPosition(0, 0, false);
      }
    }
    // Mouse wheel, POSITION-ROUTED: OpenTUI hit-tests the pointer to the pane under it and calls its
    // onMouseScroll (events bubble to the box). Each scrollable pane mutates only its own window
    // (scrollTop / selection), never materializing the whole list — the frame effect observes those
    // signals and repaints. invariant: Cost tracks the actively observed set (project.invariants.md)
    // Vertical scroll of the editor window. Wrap mode: scrollTop stays a LOGICAL line index, but
    // tall (wrapped) lines mean the logical clamp `lineCount - height` could strand tail rows below
    // the fold — so the clamp relaxes to let the LAST line reach the top of the window.
    // Wrap-mode vertical wheel + drag-edge auto-scroll step directly (rows), NOT through the momentum
    // regime: wrap mode's scroll bound is lineCount-1 (a wrapped line occupies many visual rows), which
    // the momentum regime's scrollBy clamp (lineCount - height) does not model. Non-wrap wheel goes
    // through momentum (impulse) below.
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
    // Mouse selection drives the MODEL (cursor + anchor) — the single writer; the native highlight
    // is then applied FROM the model by applySelection() each paint, so it persists across repaints
    // and Ctrl+C copies exactly what is highlighted.
    // invariant: The selected range renders with a background (ui.invariants.md)
    // One shared drag/autoscroll behavior serves this editor and DiffView. The hosts differ only in
    // coordinate mapping and scroll storage; pointer lifecycle, edge zones, rate, and re-extension are
    // identical. invariant: One writer per scroll regime per frame (src/modules/ui/ui.invariants.md)
    function tickDragAutoScroll(deltaTimeSeconds: number): boolean {
      // This hook already runs after each Yoga layout. Converge every sidebar pane's live geometry here
      // too; returning true for the one changed frame guarantees a repaint, then quiescence resumes.
      const paneViewportGeometryChanged =
        scrollbarSync.syncPaneViewportGeometry();
      return (
        editorController.tickDrag(deltaTimeSeconds) ||
        paneViewportGeometryChanged
      );
    }
    // Sidebar clicks: focus follows the click (files or git view), and a click on a tree row SELECTS
    // it — clicking the already-selected row ACTIVATES it (open file / toggle folder). Keyboard
    // parity holds: everything here is also reachable via arrows/Enter.
    // Hover highlight (enhancement only — selection/activation stay on click/keys). The hovered row
    // is model view-state so the frame effect repaints when it changes; cost is one marker cell.
    // Map a sidebar-relative screen row to a git-panel target using the SAME geometry the renderer
    // wrote (changes row / divider / log row).
    const gitChangeRowsNow = () => {
      const git = workspaceSet.active.git.value;
      return git
        ? GitRows.Class.buildChangeRows(
            git.staged.value,
            git.unstaged.value,
            git.untracked.value,
          )
        : [];
    };
    // The sidebar input CONTROLLER owns the tree+git mouse behaviour (wheel/move/out/down + git
    // hit-testers). RootView keeps rendering the sidebar and owns the geometry the hit-tests read, so
    // it passes those in as accessors — the controller reads the SAME geometry the renderer wrote.
    const sidebarController = new Sidebar.Class({
      renderer,
      sidebar,
      workspaceSet,
      tooltip,
      overlayCoordinator,
      contextMenu,
      boundedListPopup,
      settings,
      gitPanelGeometry: () => gitPanelGeometry,
      treeContent: () => primaryDockHost.activeContent,
      gitChangeRowsNow,
      sidebarWidth,
      scrollbarThicknessCells,
      gitActionAreaWidth,
    });
    void sidebarController;
    // Right-click on a changes FILE row: normalize the selection (an unselected row becomes THE
    // selection; a selected row keeps the whole multi-selection) and open the context menu at the
    // pointer with the COLLECTIVE actions the selection's buckets support.
    // The editor pane CONTROLLER owns the code body's behaviour: the wrap window, coordinate mapping,
    // model→native selection sync, the selection-drag behaviour, Ctrl/Cmd+click go-to-definition, and
    // wheel scroll. RootView keeps the renderables + viewport geometry (public interface) and the
    // markdown mount; update() calls renderEditor()/applySelection()/wrapVisualPosition() through it.
    // The LSP hover card: a display-only overlay controller that owns its bordered box, content text,
    // and vertical scrollbar. A >0.5s mouse dwell over a symbol shows the language server's type/docs;
    // update() re-syncs it each frame, and the frame loop ticks its dwell.
    const hoverCard = new HoverCard.Class({
      renderer,
      theme,
      settings,
      requestHover: (position) => workspaceSet.active.hoverAt(position),
      diagnosticsAt: (position) => workspaceSet.active.diagnosticsAt(position),
      languageForActive: () =>
        LanguageRegistry.Class.forPath(
          workspaceSet.active.editor.document.path,
        ),
    });
    // Half-block image preview for the active buffer when it is an image file. Memoises decode + render
    // so the frame effect that reads it pays a map lookup, never a re-decode.
    const imagePreview = new ImagePreview.Class();
    // Pixel-tier image preview (kitty graphics / sixel above the half-block floor). The graphics tier
    // derives from OpenTUI's reported capabilities — held in a ref because the report arrives ASYNC via
    // the `capabilities` event, and update() reading the ref inside the frame effect is what upgrades
    // the tier the moment the terminal answers (half-block floor until then; degrade-up, never flash).
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
    });
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
    const editorController = new EditorPane.Class({
      renderer,
      editorArea,
      codeBody,
      workspaceSet,
      findBar,
      settings,
      theme,
      readPalette,
      editorViewportHeight,
      editorViewportWidth,
      focusMarkdownSource: () =>
        editorContentMount.markdownSplitView?.focusSource(),
      hover: {
        pointAt: (position, screenX, screenY) =>
          hoverCard.pointAt(position, screenX, screenY),
        clear: () => hoverCard.clear(),
        pointerOffSymbol: () => hoverCard.pointerOffSymbol(),
      },
    });
    // The scrollbar geometry controller derives every bar's track from the live layout each frame and
    // converges the panes' viewport extents. RootView constructs the bars (their onChange handlers call
    // scrollbarSync.trueScrollPosition + read applyingGeometry); update() calls syncScrollbars() and the
    // frame loop calls syncPaneViewportGeometry().
    // The overlay layer constructs + drives every modal/floating overlay (palette, find, quick-open,
    // confirm, settings, shortcut sheet, context menu, tooltip). update() calls overlayLayer.update().
    const overlayLayer = new OverlayLayer.Class({
      renderer,
      commands,
      findBar,
      quickOpen,
      contextMenu,
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
      codeBody,
      sidebar,
      gitSplitDivider,
      tooltip,
      editorViewportHeight,
      editorViewportWidth,
      sidebarWidth,
      scrollbarThicknessCells,
      gitPanelGeometry: () => gitPanelGeometry,
      gitChangeRowsNow,
    });
    update();
    return {
      update,
      editorViewportHeight,
      editorViewportWidth,
      editorCaretAnchor,
      tickDragAutoScroll,
      // Frame-loop hook (runs every frame with FRESH layout, unlike the reactive paint): advance the diff's
      // momentum glide AND repaint the diff once its container has laid out to full height (root height goes
      // 0 -> real a frame or two after the container swap). Repaint-on-height-change keeps frames live until
      // the layout settles, then stops (returns momentum-moving) so idle-quiescence holds.
      tickDiffMomentum(dtSeconds: number): boolean {
        return editorContentMount.tickDiff(dtSeconds);
      },
      tickMarkdownPreview(dtSeconds: number): boolean {
        return editorContentMount.tickMarkdown(dtSeconds);
      },
      activeDiffView: () => editorContentMount.diffView,
      activeMarkdownSplitView: () => editorContentMount.markdownSplitView,
      findTarget,
      shortcutHelpViewportRows: () => overlayLayer.shortcutHelpViewportRows(),
      scrollShortcutHelpBy: (rowDelta: number) =>
        overlayLayer.scrollShortcutHelpBy(rowDelta),
      tickOverlayScroll: (dtSeconds: number) => overlayLayer.tick(dtSeconds),
      overlayDialogBounds: () => overlayLayer.dialogBounds(),
      overlayScrollPositions: () => overlayLayer.scrollPositions(),
      tickHover: (dtSeconds: number) => hoverCard.tick(dtSeconds),
      tickPanelScroll(dtSeconds: number): boolean {
        let moving = agentScrollViewport.tick(dtSeconds);
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
      observeHoverRepaint: () => {
        void hoverCard.paintRevision.value;
      },
      panelViewportColumns,
      panelViewportRows,
      panelContainsPoint,
      panelContentsListRegion: () => ({
        left:
          Number(panelBox.x) +
          Number(panelBox.width) -
          1 -
          (panelContentsList.visible ? panelContentsList.width : 0),
        top: Number(panelBox.y) + 1,
        width: panelContentsList.visible ? panelContentsList.width : 0,
        height: panelContentsList.visible
          ? Math.max(0, Number(panelBox.height) - 2)
          : 0,
        visible: panelContentsList.visible,
      }),
      rightDockViewportColumns,
      rightDockViewportRows,
      rightDockContainsPoint,
      layoutGeometry: () => layoutSlotGeometry,
      splitterRegions: () => ({
        sidebar: renderableRegion(paneSplitters.sidebar.renderable),
        git: renderableRegion(paneSplitters.git.renderable),
        bottomPanel: renderableRegion(panelSplitter.renderable),
        rightDock: renderableRegion(rightDockSplitter.renderable),
      }),
      dispose() {
        try {
          editorContentMount.dispose();
          root.remove(column);
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
  export const $Class = $RootView;
  export const Class = Static($RootView);
}
// roleColor moved to EditorPaneRenderer with the editor render that used it.
export interface RootView {
  update(): void;
  editorViewportHeight(): number;
  editorViewportWidth(): number;
  editorCaretAnchor(): { column: number; row: number } | null;
  /** Frame-tick hook: advance drag-edge auto-scroll; true while active (keep frames coming). */
  tickDragAutoScroll(dtSeconds: number): boolean;
  /** Frame-tick hook: advance the open diff's scroll-momentum glide; true while moving. */
  tickDiffMomentum(dtSeconds: number): boolean;
  /** The live DiffView instance when a diff is open, else null (for keyboard routing). */
  activeDiffView(): DiffView.Instance | null;
  /** Frame-tick hook for Markdown preview momentum, drag selection, and async parse landing. */
  tickMarkdownPreview(dtSeconds: number): boolean;
  activeMarkdownSplitView(): MarkdownSplitView.Instance | null;
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
  /** Read the hover card's reactive paint signal inside the frame effect so an ASYNC hover landing
   *  (which no keypress/mouse-move accompanies) still triggers a repaint that projects the card. */
  observeHoverRepaint(): void;
  /** The bottom panel slot's laid-out inner cell columns (0 when hidden) — the terminal's live cols. */
  panelViewportColumns(): number;
  /** The bottom panel slot's laid-out inner cell rows (0 when hidden) — the terminal's live rows. */
  panelViewportRows(): number;
  /** True when the screen cell (x,y) falls inside the visible panel box (focus-follows-click). */
  panelContainsPoint(x: number, y: number): boolean;
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
  layoutGeometry(): LayoutSlotGeometry;
  splitterRegions(): Record<
    'sidebar' | 'git' | 'bottomPanel' | 'rightDock',
    {
      left: number;
      top: number;
      width: number;
      height: number;
      visible: boolean;
    }
  >;
  dispose(): void;
}
