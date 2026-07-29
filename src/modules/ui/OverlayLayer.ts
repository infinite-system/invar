// The overlay layer: constructs and drives every modal/floating overlay that renders above the panes —
// the command palette, the find/replace bar, quick-open, the discard/close confirmation, the settings
// panel, the shortcut cheat-sheet (+ its modal backdrop), the context menu (+ its backdrop), and the
// tooltip. Each is a top-level absolute renderable projected from its own model every paint; RootView
// calls update(palette) once per frame and mount() at construction.
//
// invariant: Input overlays share one modal slot (src/modules/ui/ui.invariants.md)
// invariant: Overlay dialogs stay inside the terminal (src/modules/ui/ui.invariants.md)
// invariant: Overlay keyboard actions have visible mouse paths (src/modules/ui/ui.invariants.md)
// invariant: A context menu is modal and single-consumer (src/modules/ui/ui.invariants.md)
// invariant: The shortcut sheet lists the effective bindings (src/modules/ui/ui.invariants.md)
// invariant: A tooltip never intercepts input (src/modules/ui/ui.invariants.md)
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
import { Reactive } from 'ivue';
import { ref } from 'vue';
import { HitTransparentText } from './HitTransparentText';
import { TextCoordinates } from '../text/TextCoordinates';
import { Files } from '../system/Files';
import { QuickOpenRenderer } from './QuickOpenRenderer';
import {
  FindBarRenderer,
  type FindBarButtonZone,
  type FindBarButtonAction,
} from './FindBarRenderer';
import {
  OverlayDialogGeometry,
  type OverlayDialogGeometryResult,
} from './OverlayDialogGeometry';
import { OverlayCloseButton } from './OverlayCloseButton';
import { ModalOverlayDismissal } from './ModalOverlayDismissal';
import { TextFieldPainter } from './TextFieldPainter';
import {
  ScrollableTextViewport,
  type ScrollableTextViewportDeps,
  type ViewportExtent,
} from './ScrollableTextViewport';
import { SelectableText } from './SelectableText';
import { TextSelectionModel } from './TextSelectionModel';
import { WrapText } from './WrapText';
import { Clipboard } from '../system/Clipboard';
import type { Palette } from '../theme/ThemePalettes';
import type { CommandRegistry } from '../commands/CommandRegistry';
import type { FindBar } from '../search/FindBar';
import type { QuickOpen } from '../search/QuickOpen';
import type { ContextMenu } from './ContextMenu';
import type { BoundedListPopup } from './BoundedListPopup';
import type {
  SettingsPanel,
  SettingsPanelRow,
} from '../settings/SettingsPanel';
import type { ShortcutHelp } from './ShortcutHelp';
import type { Tooltip } from './Tooltip';
import type { Theme } from '../theme/Theme';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';

class $OverlayLayer {
  get paintRevision() {
    return ref(0);
  }
  // invariant: Modal focus withdraws host terminal projections (src/modules/ui/ui.invariants.md)
  get modalOverlayOwnsScreen(): boolean {
    return (
      this.dependencies.commands.open.value ||
      this.dependencies.findBar.open.value ||
      this.dependencies.quickOpen.open.value ||
      this.dependencies.contextMenu.open.value ||
      this.dependencies.boundedListPopup.open.value ||
      this.dependencies.settingsPanel.open.value ||
      this.dependencies.shortcutHelp.open.value ||
      this.dependencies.workspaceSet.active.pendingCloseTabIndex.value >= 0
    );
  }
  protected readonly commandPalette: BoxRenderable;
  protected readonly commandPaletteInput: TextRenderable;
  protected readonly commandPaletteList: TextRenderable;
  protected readonly commandPaletteDismissal: ModalOverlayDismissal.Model;
  protected readonly findBarBox: BoxRenderable;
  protected readonly findBarText: TextRenderable;
  protected readonly findBarCloseButton: OverlayCloseButton.Model;
  protected readonly quickOpenBox: BoxRenderable;
  protected readonly quickOpenInput: TextRenderable;
  protected readonly quickOpenList: TextRenderable;
  protected readonly quickOpenDismissal: ModalOverlayDismissal.Model;
  protected readonly confirmBox: BoxRenderable;
  protected readonly confirmText: TextRenderable;
  protected readonly confirmationDismissal: ModalOverlayDismissal.Model;
  protected readonly settingsBox: BoxRenderable;
  protected readonly settingsText: SelectableText.Model;
  protected readonly settingsDismissal: ModalOverlayDismissal.Model;
  protected readonly shortcutHelpBox: BoxRenderable;
  protected readonly shortcutHelpText: TextRenderable;
  protected readonly shortcutHelpDismissal: ModalOverlayDismissal.Model;
  protected readonly contextMenuBox: BoxRenderable;
  protected readonly contextMenuList: TextRenderable;
  protected readonly contextMenuDismissal: ModalOverlayDismissal.Model;
  protected readonly tooltipText: HitTransparentText.Model;
  protected readonly commandPaletteViewport: ScrollableTextViewport.Instance;
  protected readonly quickOpenViewport: ScrollableTextViewport.Instance;
  protected readonly settingsViewport: ScrollableTextViewport.Instance;
  protected readonly shortcutHelpViewport: ScrollableTextViewport.Instance;
  protected readonly contextMenuViewport: ScrollableTextViewport.Instance;
  protected commandPaletteContentRows = 0;
  protected commandPaletteViewportRows = 1;
  protected quickOpenContentRows = 0;
  protected quickOpenViewportRows = 1;
  protected settingsContentRows = 0;
  protected settingsViewportRows = 1;
  protected settingsViewportColumns = 1;
  protected shortcutHelpContentRows = 0;
  protected shortcutHelpVisibleRows = 1;
  protected contextMenuContentRows = 0;
  protected contextMenuViewportRows = 1;
  protected previousCommandPaletteOpen = false;
  protected previousCommandPaletteSelectedIndex = -1;
  protected previousQuickOpenOpen = false;
  protected previousQuickOpenSelectedIndex = -1;
  protected previousSettingsOpen = false;
  protected previousSettingsSelectedIndex = -1;
  protected previousShortcutHelpOpen = false;
  protected previousContextMenuOpen = false;
  protected previousContextMenuSelectedIndex = -1;
  // invariant: A scrollable text surface is drag-selectable with edge auto-scroll (src/modules/ui/ui.invariants.md)
  // invariant: Seams are drawn at the shared generator (project.invariants.md)
  protected readonly settingsSelection = new TextSelectionModel.Class();
  protected settingsRenderedLines: readonly SettingsRenderedLine[] = [];
  protected readonly dialogBoundsByName = new Map<
    OverlayDialogName,
    OverlayDialogBounds
  >();
  // Hit geometry the renderers drew this frame, read by the pointer handlers so a drawn cell and its
  // hit-rect never disagree (the one-geometry-source rule). Written in update(), read on mouse events.
  protected findBarButtonZones: FindBarButtonZone[] = [];
  // Clickable widget zones the settings renderer drew this frame (one-geometry-source): each maps a
  // (row, column-range) to a descriptor index + an action, so a mouse click edits the setting like a UI
  // app — steppers for numbers, a toggle for booleans, arrows for enums.
  protected settingsWidgetZones: SettingsWidgetZone[] = [];
  protected commandPaletteRowCount = 0;
  protected commandPaletteFirstVisible = 0;
  protected quickOpenRowCount = 0;
  // The model index of the first row the quick-open list currently draws (its scroll window's top), so a
  // pointer hit-test maps a visible row back to the match it draws. 0 whenever the list is unscrolled.
  protected quickOpenFirstVisible = 0;
  constructor(protected readonly dependencies: OverlayLayerDependencies) {
    const { renderer, shortcutHelp, contextMenu, quickOpen } = dependencies;
    const root = renderer.root;
    // Command palette — added last so it renders on top; shown only when open.
    this.commandPalette = new BoxRenderable(renderer, {
      id: 'palette',
      position: 'absolute',
      left: '20%',
      top: 2,
      width: '60%',
      border: true,
      borderStyle: 'rounded',
      title: 'Command Palette',
      flexDirection: 'column',
      visible: false,
      zIndex: 100,
    });
    this.commandPaletteInput = new TextRenderable(renderer, {
      id: 'palette-input',
      content: '',
    });
    this.commandPaletteList = new TextRenderable(renderer, {
      id: 'palette-list',
      content: '',
    });
    this.commandPalette.add(this.commandPaletteInput);
    this.commandPalette.add(this.commandPaletteList);
    root.add(this.commandPalette);
    this.commandPaletteDismissal = this.createModalDismissal(
      'palette',
      99,
      101,
      () => dependencies.commands.closePalette(),
    );
    this.commandPaletteViewport = this.createOverlayViewport(
      'palette',
      this.commandPalette,
      () => ({
        contentRows: this.commandPaletteContentRows,
        contentColumns: 1,
        viewportRows: this.commandPaletteViewportRows,
        viewportColumns: 1,
      }),
      () => {
        this.requestPaint();
      },
    );
    // In-editor find/replace bar (Ctrl+F / Ctrl+H) — top-right overlay.
    this.findBarBox = new BoxRenderable(renderer, {
      id: 'find-bar',
      position: 'absolute',
      top: 1,
      left: '45%',
      width: '54%',
      border: true,
      borderStyle: 'rounded',
      title: 'Find',
      flexDirection: 'column',
      visible: false,
      zIndex: 100,
    });
    this.findBarText = new TextRenderable(renderer, {
      id: 'find-bar-text',
      content: '',
    });
    this.findBarBox.add(this.findBarText);
    root.add(this.findBarBox);
    this.findBarCloseButton = this.createCloseButton(
      'find-bar-close',
      101,
      () => dependencies.findBar.close(),
    );
    // Quick-open (Ctrl+P): centered modal — query input + fuzzy-ranked project-file list.
    this.quickOpenBox = new BoxRenderable(renderer, {
      id: 'quick-open',
      position: 'absolute',
      left: '20%',
      top: 2,
      width: '60%',
      border: true,
      borderStyle: 'rounded',
      title: 'Go to File',
      flexDirection: 'column',
      visible: false,
      zIndex: 100,
    });
    this.quickOpenInput = new TextRenderable(renderer, {
      id: 'quick-open-input',
      content: '',
    });
    this.quickOpenList = new TextRenderable(renderer, {
      id: 'quick-open-list',
      content: '',
    });
    this.quickOpenBox.add(this.quickOpenInput);
    this.quickOpenBox.add(this.quickOpenList);
    root.add(this.quickOpenBox);
    this.quickOpenDismissal = this.createModalDismissal(
      'quick-open',
      99,
      101,
      () => dependencies.quickOpen.close(),
    );
    this.quickOpenViewport = this.createOverlayViewport(
      'quick-open',
      this.quickOpenBox,
      () => ({
        contentRows: this.quickOpenContentRows,
        contentColumns: 1,
        viewportRows: this.quickOpenViewportRows,
        viewportColumns: 1,
      }),
      () => {
        this.requestPaint();
      },
    );
    // Destructive-action confirmation (discard / close-dirty-tab) — a small modal strip.
    this.confirmBox = new BoxRenderable(renderer, {
      id: 'confirm-discard',
      position: 'absolute',
      left: '20%',
      top: 4,
      width: '60%',
      border: true,
      borderStyle: 'rounded',
      title: 'Confirm',
      visible: false,
      zIndex: 120,
    });
    this.confirmText = new TextRenderable(renderer, {
      id: 'confirm-discard-text',
      content: '',
    });
    this.confirmBox.add(this.confirmText);
    root.add(this.confirmBox);
    this.confirmationDismissal = this.createModalDismissal(
      'confirm-discard',
      119,
      121,
      () => this.cancelConfirmation(),
    );
    // Settings panel (Ctrl+,) — overlay over the reactive settings store.
    this.settingsBox = new BoxRenderable(renderer, {
      id: 'settings-panel',
      position: 'absolute',
      left: '15%',
      top: 2,
      width: '70%',
      border: true,
      borderStyle: 'rounded',
      title: 'Settings',
      visible: false,
      zIndex: 122,
    });
    // invariant: Settings selection stays inside its viewport (src/modules/ui/ui.invariants.md)
    this.settingsText = new SelectableText.Class(renderer, {
      id: 'settings-panel-text',
      content: '',
      wrapMode: 'none',
      truncate: true,
      selectable: false,
    });
    this.settingsBox.add(this.settingsText);
    root.add(this.settingsBox);
    this.settingsDismissal = this.createModalDismissal(
      'settings-panel',
      121,
      123,
      () => dependencies.settingsPanel.close(),
    );
    this.settingsViewport = this.createOverlayViewport(
      'settings-panel',
      this.settingsBox,
      () => ({
        contentRows: this.settingsContentRows,
        contentColumns: 1,
        viewportRows: this.settingsViewportRows,
        viewportColumns: 1,
      }),
      () => {
        this.requestPaint();
      },
      {
        positionAtCell: (screenColumn, screenRow) =>
          this.settingsPositionAtCell(screenColumn, screenRow),
        begin: (position) => {
          this.settingsSelection.begin(position);
          this.requestPaint();
        },
        extend: (position) => {
          this.settingsSelection.extend(position);
          this.requestPaint();
        },
        finish: () => {
          this.settingsSelection.finish();
          this.requestPaint();
        },
        viewportRectangle: () => ({
          leftColumn: Number(this.settingsText.x),
          rightColumn:
            Number(this.settingsText.x) + this.settingsViewportColumns - 1,
          topRow: Number(this.settingsText.y),
          bottomRow:
            Number(this.settingsText.y) + this.settingsViewportRows - 1,
        }),
        lineGraphemeCount: (lineIndex) =>
          WrapText.Class.displayWidth(this.settingsLineText(lineIndex)),
      },
    );
    // Shortcut cheat-sheet (Ctrl+Shift+H / status-bar `?`) + modal dismissal projection.
    this.shortcutHelpBox = new BoxRenderable(renderer, {
      id: 'shortcut-help',
      position: 'absolute',
      left: '15%',
      top: 1,
      width: '70%',
      border: true,
      borderStyle: 'rounded',
      title: 'Keyboard Shortcuts',
      flexDirection: 'column',
      visible: false,
      zIndex: 120,
    });
    this.shortcutHelpText = new TextRenderable(renderer, {
      id: 'shortcut-help-text',
      content: '',
      selectable: false,
    });
    this.shortcutHelpBox.add(this.shortcutHelpText);
    root.add(this.shortcutHelpBox);
    this.shortcutHelpDismissal = this.createModalDismissal(
      'shortcut-help',
      118,
      121,
      () => dependencies.shortcutHelp.close(),
    );
    this.shortcutHelpViewport = this.createOverlayViewport(
      'shortcut-help',
      this.shortcutHelpBox,
      () => ({
        contentRows: this.shortcutHelpContentRows,
        contentColumns: 1,
        viewportRows: this.shortcutHelpVisibleRows,
        viewportColumns: 1,
      }),
      () => {
        this.dependencies.shortcutHelp.scrollTop.value =
          this.shortcutHelpViewport.scrollTop;
        this.requestPaint();
      },
    );
    // Context-menu modal layer (menu box + shared dismissal projection beneath it).
    this.contextMenuBox = new BoxRenderable(renderer, {
      id: 'context-menu',
      position: 'absolute',
      border: true,
      borderStyle: 'rounded',
      visible: false,
      zIndex: 130,
    });
    this.contextMenuList = new TextRenderable(renderer, {
      id: 'context-menu-list',
      content: '',
      selectable: false,
    });
    this.contextMenuBox.add(this.contextMenuList);
    root.add(this.contextMenuBox);
    this.contextMenuDismissal = this.createModalDismissal(
      'context-menu',
      125,
      131,
      () => dependencies.contextMenu.close(),
    );
    this.contextMenuViewport = this.createOverlayViewport(
      'context-menu',
      this.contextMenuBox,
      () => ({
        contentRows: this.contextMenuContentRows,
        contentColumns: 1,
        viewportRows: this.contextMenuViewportRows,
        viewportColumns: 1,
      }),
      () => {
        this.requestPaint();
      },
    );
    const contextMenuItemAt = (screenY: number): number =>
      this.contextMenuViewport.scrollTop + screenY - this.contextMenuList.y;
    this.contextMenuBox.onMouseMove = (event) =>
      contextMenu.hover(contextMenuItemAt(event.y));
    this.contextMenuBox.onMouseOut = () => contextMenu.hover(-1);
    this.contextMenuBox.onMouseDown = (event) =>
      contextMenu.runAt(contextMenuItemAt(event.y));
    // Quick-open results: hover highlights a row, click selects+opens it. The list scrolls a window over
    // the matches, so a pointer row is the offset from the list's own top PLUS the window's first-visible
    // model index — mapping the visible row back to the match it actually draws.
    // invariant: Search results are click-set and highlight-shown (src/modules/search/search.invariants.md)
    // invariant: The selected quick-open row is always visible (src/modules/search/search.invariants.md)
    const quickOpenRowAt = (screenY: number): number =>
      screenY - this.quickOpenList.y;
    const quickOpenMatchAt = (row: number): number =>
      this.quickOpenFirstVisible + row;
    this.quickOpenList.onMouseMove = (event) => {
      const row = quickOpenRowAt(event.y);
      quickOpen.setHoveredIndex(
        row >= 0 && row < this.quickOpenRowCount ? quickOpenMatchAt(row) : -1,
      );
    };
    this.quickOpenList.onMouseOut = () => quickOpen.setHoveredIndex(-1);
    this.quickOpenList.onMouseDown = (event) => {
      const row = quickOpenRowAt(event.y);
      if (row < 0 || row >= this.quickOpenRowCount) return;
      quickOpen.setSelectedIndex(quickOpenMatchAt(row));
      // Files mode: a click opens the file. Path-navigator mode: a click DRILLS INTO the folder
      // (completes the path + re-lists); Enter opens the current path (activateQuickOpen).
      if (quickOpen.mode.value === 'workspacePath')
        quickOpen.navigateIntoSelected();
      else this.dependencies.activateQuickOpen();
    };
    this.commandPaletteList.onMouseDown = (event) => {
      const visibleRow = event.y - this.commandPaletteList.y;
      if (visibleRow < 0 || visibleRow >= this.commandPaletteRowCount) return;
      const commandIndex = this.commandPaletteFirstVisible + visibleRow;
      this.dependencies.commands.moveSelection(
        commandIndex - this.dependencies.commands.selectedIndex.value,
      );
      this.dependencies.commands.runSelected();
    };
    // Find bar action buttons: hit-test the pointer against the zones the renderer drew this frame.
    // invariant: Find bar controls are mouse-clickable buttons (src/modules/search/search.invariants.md)
    this.findBarText.onMouseDown = (event) => {
      const localRow = event.y - this.findBarText.y;
      const localColumn = event.x - this.findBarText.x;
      const button = this.findBarButtonZones.find(
        (zone) =>
          zone.row === localRow &&
          localColumn >= zone.startColumn &&
          localColumn < zone.endColumn,
      );
      if (button) this.runFindButton(button.action);
    };
    // Settings are editable by MOUSE, not just keyboard: click a row's label to select it, its [−]/[+]
    // steppers to change a number, its arrows to cycle an enum, or its toggle to flip a boolean. Hit-test
    // the pointer against the widget zones the renderer drew THIS frame (one geometry source).
    // invariant: Settings are editable by mouse per widget kind (src/modules/ui/ui.invariants.md)
    this.settingsText.onMouseDown = (event) => {
      this.settingsViewport.beginDrag(event.x, event.y);
      const localRow = event.y - this.settingsText.y;
      const localColumn = event.x - this.settingsText.x;
      const zone = this.settingsWidgetZones.find(
        (candidate) =>
          candidate.row === localRow &&
          localColumn >= candidate.startColumn &&
          localColumn < candidate.endColumn,
      );
      if (!zone) return;
      this.dependencies.settingsPanel.select(zone.index);
      if (zone.action === 'dec') this.dependencies.settingsPanel.adjust(-1);
      else if (zone.action === 'inc') this.dependencies.settingsPanel.adjust(1);
      this.dependencies.renderer.requestRender();
    };
    this.settingsText.onMouseDrag = (event: MouseEvent) =>
      this.settingsViewport.dragTo(event.x, event.y);
    this.settingsText.onMouseUp = () => this.settingsViewport.endDrag();
    this.settingsText.onMouseDragEnd = () => this.settingsViewport.endDrag();
    this.commandPalette.onMouseScroll = (event: MouseEvent) =>
      this.commandPaletteViewport.handleWheel(event);
    this.commandPaletteInput.onMouseScroll = (event: MouseEvent) =>
      this.commandPaletteViewport.handleWheel(event);
    this.commandPaletteList.onMouseScroll = (event: MouseEvent) =>
      this.commandPaletteViewport.handleWheel(event);
    this.quickOpenBox.onMouseScroll = (event: MouseEvent) =>
      this.quickOpenViewport.handleWheel(event);
    this.quickOpenInput.onMouseScroll = (event: MouseEvent) =>
      this.quickOpenViewport.handleWheel(event);
    this.quickOpenList.onMouseScroll = (event: MouseEvent) =>
      this.quickOpenViewport.handleWheel(event);
    this.settingsBox.onMouseScroll = (event: MouseEvent) =>
      this.settingsViewport.handleWheel(event);
    this.settingsText.onMouseScroll = (event: MouseEvent) =>
      this.settingsViewport.handleWheel(event);
    this.shortcutHelpBox.onMouseScroll = (event: MouseEvent) =>
      this.shortcutHelpViewport.handleWheel(event);
    this.shortcutHelpText.onMouseScroll = (event: MouseEvent) =>
      this.shortcutHelpViewport.handleWheel(event);
    this.contextMenuBox.onMouseScroll = (event: MouseEvent) =>
      this.contextMenuViewport.handleWheel(event);
    this.contextMenuList.onMouseScroll = (event: MouseEvent) =>
      this.contextMenuViewport.handleWheel(event);
    // Tooltip — display-only + hit-transparent.
    this.tooltipText = new HitTransparentText.Class(renderer, {
      id: 'tooltip',
      content: '',
      position: 'absolute',
      visible: false,
      zIndex: 140,
      selectable: false,
    });
    root.add(this.tooltipText);
  }
  protected createCloseButton(
    identifier: string,
    zIndex: number,
    close: () => void,
  ): OverlayCloseButton.Model {
    return new OverlayCloseButton.Class({
      renderer: this.dependencies.renderer,
      identifier,
      zIndex,
      close,
    });
  }
  protected createModalDismissal(
    identifier: string,
    backdropZIndex: number,
    closeButtonZIndex: number,
    dismiss: () => void,
  ): ModalOverlayDismissal.Model {
    return new ModalOverlayDismissal.Class({
      renderer: this.dependencies.renderer,
      identifier,
      backdropZIndex,
      closeButtonZIndex,
      dismiss,
    });
  }
  protected requestPaint(): void {
    this.paintRevision.value += 1;
  }
  protected createOverlayViewport(
    identifier: string,
    parent: BoxRenderable,
    extent: () => ViewportExtent,
    onScroll: () => void,
    selection?: ScrollableTextViewportDeps['selection'],
  ): ScrollableTextViewport.Instance {
    return new ScrollableTextViewport.Class({
      renderer: this.dependencies.renderer,
      settings: this.dependencies.settingsPanel.settings,
      parent,
      id: identifier,
      disableHorizontal: true,
      scrollbarZIndex: 2,
      extent,
      colors: () => ({
        track: this.dependencies.theme.palette.panel,
        thumb: this.dependencies.theme.palette.dim,
      }),
      onScroll,
      selection: selection ?? this.inactiveOverlaySelection(),
    });
  }
  protected inactiveOverlaySelection(): ScrollableTextViewportDeps['selection'] {
    return {
      positionAtCell: () => null,
      begin: () => {},
      extend: () => {},
      finish: () => {},
      viewportRectangle: () => ({
        leftColumn: 0,
        rightColumn: 0,
        topRow: 0,
        bottomRow: 0,
      }),
    };
  }
  protected updateOverlayDialog(
    box: BoxRenderable,
    dismissalControl: OverlayDialogDismissalControl,
    palette: Palette,
    input: OverlayDialogLayoutInput,
  ): OverlayDialogGeometryResult {
    const geometry = OverlayDialogGeometry.Class.layout({
      screenWidth: this.dependencies.renderer.width,
      screenHeight: this.dependencies.renderer.height,
      desiredLeft: input.desiredLeft,
      desiredTop: input.desiredTop,
      desiredWidth: input.desiredWidth,
      desiredHeight: input.desiredHeight,
    });
    this.dialogBoundsByName.set(input.dialogName, geometry);
    box.visible = true;
    box.left = geometry.left;
    box.top = geometry.top;
    box.width = geometry.width;
    box.height = geometry.height;
    box.title = input.title;
    box.backgroundColor = palette.panel;
    box.borderColor = input.borderColor ?? palette.borderActive;
    box.titleColor = input.titleColor ?? palette.accent;
    dismissalControl.show({
      left: geometry.left,
      top: geometry.top,
      width: geometry.width,
      backgroundColor: palette.panel,
      foregroundColor: input.titleColor ?? palette.accent,
    });
    return geometry;
  }
  protected hideOverlayDialog(
    dialogName: OverlayDialogName,
    box: BoxRenderable,
    dismissalControl: OverlayDialogDismissalControl,
    viewport?: ScrollableTextViewport.Instance,
  ): void {
    this.dialogBoundsByName.delete(dialogName);
    box.visible = false;
    dismissalControl.hide();
    viewport?.hideBars();
  }
  protected cancelConfirmation(): void {
    if (this.dependencies.workspaceSet.active.pendingCloseTabIndex.value >= 0)
      this.dependencies.workspaceSet.active.cancelCloseTab();
  }
  protected revealViewportRow(
    viewport: ScrollableTextViewport.Instance,
    contentRow: number,
    viewportRows: number,
  ): void {
    if (contentRow < viewport.scrollTop) {
      viewport.scrollRowsBy(contentRow - viewport.scrollTop);
    } else if (contentRow >= viewport.scrollTop + viewportRows) {
      viewport.scrollRowsBy(
        contentRow - (viewport.scrollTop + viewportRows) + 1,
      );
    }
  }
  protected settingsLines(
    palette: Palette,
    rows: readonly SettingsPanelRow[],
  ): SettingsRenderedLine[] {
    const lines: SettingsRenderedLine[] = [
      {
        chunks: [
          fg(palette.dim)(
            '  up/down select · wheel/drag scroll · click widgets · Esc close (saved live)',
          ),
        ],
        zones: [],
      },
    ];
    const labelWidth = rows.reduce(
      (widestWidth, row) => Math.max(widestWidth, row.label.length),
      0,
    );
    let previousSection = '';
    for (const row of rows) {
      if (row.section !== previousSection) {
        lines.push({ chunks: [fg(palette.dim)('')], zones: [] });
        lines.push({
          chunks: [bold(fg(palette.accent)(`  ${row.section}`))],
          zones: [],
        });
        previousSection = row.section;
      }
      const chunks: TextChunk[] = [];
      const zones: SettingsLineZone[] = [];
      let column = 0;
      const appendChunk = (
        text: string,
        color: string,
        action?: SettingsWidgetZone['action'],
      ): void => {
        chunks.push(
          row.selected
            ? bg(palette.selection)(fg(color)(text))
            : fg(color)(text),
        );
        if (action) {
          zones.push({
            startColumn: column,
            endColumn: column + text.length,
            index: row.index,
            action,
          });
        }
        column += text.length;
      };
      const selectionMarker = row.selected ? '›' : ' ';
      appendChunk(
        ` ${selectionMarker} ${row.label.padEnd(labelWidth, ' ')}   `,
        palette.fg,
        'select',
      );
      if (row.kind === 'number') {
        appendChunk('[-]', palette.accent, 'dec');
        appendChunk(` ${row.valueText} `, palette.accent);
        appendChunk('[+]', palette.accent, 'inc');
      } else if (row.kind === 'boolean') {
        appendChunk(`[ ${row.valueText} ]`, palette.accent, 'inc');
      } else {
        appendChunk('<', palette.accent, 'dec');
        appendChunk(` ${row.valueText} `, palette.accent);
        appendChunk('>', palette.accent, 'inc');
      }
      lines.push({ chunks, zones, settingIndex: row.index });
    }
    return lines;
  }
  protected settingsLineText(lineIndex: number): string {
    return (
      this.settingsRenderedLines[lineIndex]?.chunks
        .map((chunk) => chunk.text)
        .join('') ?? ''
    );
  }
  protected settingsPositionAtCell(
    screenColumn: number,
    screenRow: number,
  ): { line: number; column: number } | null {
    const localRow = screenRow - Number(this.settingsText.y);
    const line = this.settingsViewport.scrollTop + localRow;
    if (
      localRow < 0 ||
      localRow >= this.settingsViewportRows ||
      line < 0 ||
      line >= this.settingsRenderedLines.length
    ) {
      return null;
    }
    return {
      line,
      column: Math.max(0, screenColumn - Number(this.settingsText.x)),
    };
  }
  protected paintSettingsSelection(): void {
    const span = this.settingsSelection.normalized();
    if (!span || !this.dependencies.settingsPanel.open.value) {
      this.settingsText.clearSelectionRange();
      return;
    }
    const [start, end] = span;
    const windowStart = this.settingsViewport.scrollTop;
    const windowEnd = windowStart + this.settingsViewportRows - 1;
    if (end.line < windowStart || start.line > windowEnd) {
      this.settingsText.clearSelectionRange();
      return;
    }
    const anchorY = Math.max(
      0,
      Math.min(start.line - windowStart, this.settingsViewportRows - 1),
    );
    const anchorX =
      start.line >= windowStart
        ? Math.max(0, Math.min(start.column, this.settingsViewportColumns))
        : 0;
    const focusY = Math.max(
      0,
      Math.min(end.line - windowStart, this.settingsViewportRows - 1),
    );
    const focusX =
      end.line <= windowEnd
        ? Math.max(0, Math.min(end.column, this.settingsViewportColumns))
        : this.settingsViewportColumns;
    this.settingsText.setSelectionRange(anchorX, anchorY, focusX, focusY);
  }
  settingsHasSelection(): boolean {
    return (
      this.dependencies.settingsPanel.open.value &&
      this.settingsSelection.hasSelection()
    );
  }
  // invariant: Copy reaches the host terminal (src/modules/system/system.invariants.md)
  async copySettingsSelection(): Promise<number> {
    if (!this.settingsHasSelection()) return 0;
    const text = this.settingsSelection.selectedText(
      (line, startCell, endCell) =>
        WrapText.Class.sliceByDisplayCells(
          this.settingsLineText(line),
          startCell,
          endCell ?? Number.MAX_SAFE_INTEGER,
        ),
      '\n',
    );
    if (!text) return 0;
    await Clipboard.Class.copy(text);
    return text.length;
  }
  protected styledWindow(
    lines: readonly SettingsRenderedLine[],
    firstVisible: number,
    visibleRows: number,
  ): { text: StyledText; zones: SettingsWidgetZone[] } {
    const visibleLines = lines.slice(firstVisible, firstVisible + visibleRows);
    const chunks: TextChunk[] = [];
    const zones: SettingsWidgetZone[] = [];
    visibleLines.forEach((line, visibleRowIndex) => {
      chunks.push(...line.chunks);
      zones.push(
        ...line.zones.map((zone) => ({
          ...zone,
          row: visibleRowIndex,
        })),
      );
      if (visibleRowIndex < visibleLines.length - 1)
        chunks.push(fg(this.dependencies.theme.palette.fg)('\n'));
    });
    return { text: new StyledText(chunks), zones };
  }
  /** Dispatch a find-bar button click to the same FindBar action its keyboard chord runs. */
  protected runFindButton(action: FindBarButtonAction): void {
    const { findBar, revealFindMatch } = this.dependencies;
    switch (action) {
      case 'previous':
        findBar.previous();
        revealFindMatch();
        break;
      case 'next':
        findBar.next();
        revealFindMatch();
        break;
      case 'toggleCase':
        findBar.toggleCaseSensitive();
        revealFindMatch();
        break;
      case 'replace':
        findBar.replaceCurrent();
        revealFindMatch();
        break;
      case 'replaceAll':
        findBar.replaceAll();
        revealFindMatch();
        break;
      case 'toggleMode':
        findBar.switchMode();
        break;
    }
  }
  protected shortcutHelpBoxHeight(): number {
    return Math.max(6, this.dependencies.renderer.height - 3);
  }
  /** Visible binding rows in the cheat-sheet (interior minus its fixed instruction line). */
  shortcutHelpViewportRows(): number {
    const geometry = OverlayDialogGeometry.Class.layout({
      screenWidth: this.dependencies.renderer.width,
      screenHeight: this.dependencies.renderer.height,
      desiredWidth: Math.max(
        1,
        Math.floor(this.dependencies.renderer.width * 0.7),
      ),
      desiredHeight: this.shortcutHelpBoxHeight(),
      desiredTop: 1,
    });
    return Math.max(1, geometry.interiorHeight - 1);
  }
  scrollShortcutHelpBy(rowDelta: number): void {
    this.shortcutHelpViewport.scrollRowsBy(rowDelta);
    this.dependencies.shortcutHelp.scrollTop.value =
      this.shortcutHelpViewport.scrollTop;
  }
  dialogBounds(): Record<string, OverlayDialogBounds | null> {
    return {
      commandPalette: this.dialogBoundsByName.get('commandPalette') ?? null,
      findBar: this.dialogBoundsByName.get('findBar') ?? null,
      quickOpen: this.dialogBoundsByName.get('quickOpen') ?? null,
      confirmation: this.dialogBoundsByName.get('confirmation') ?? null,
      settingsPanel: this.dialogBoundsByName.get('settingsPanel') ?? null,
      shortcutHelp: this.dialogBoundsByName.get('shortcutHelp') ?? null,
      contextMenu: this.dialogBoundsByName.get('contextMenu') ?? null,
    };
  }
  scrollPositions(): Record<string, number> {
    return {
      commandPalette: this.commandPaletteViewport.scrollTop,
      quickOpen: this.quickOpenViewport.scrollTop,
      settingsPanel: this.settingsViewport.scrollTop,
      shortcutHelp: this.shortcutHelpViewport.scrollTop,
      contextMenu: this.contextMenuViewport.scrollTop,
    };
  }
  viewportExtents(): Record<
    string,
    { contentRows: number; viewportRows: number }
  > {
    return {
      commandPalette: {
        contentRows: this.commandPaletteContentRows,
        viewportRows: this.commandPaletteViewportRows,
      },
      quickOpen: {
        contentRows: this.quickOpenContentRows,
        viewportRows: this.quickOpenViewportRows,
      },
      settingsPanel: {
        contentRows: this.settingsContentRows,
        viewportRows: this.settingsViewportRows,
      },
      shortcutHelp: {
        contentRows: this.shortcutHelpContentRows,
        viewportRows: this.shortcutHelpVisibleRows,
      },
      contextMenu: {
        contentRows: this.contextMenuContentRows,
        viewportRows: this.contextMenuViewportRows,
      },
    };
  }
  tick(deltaSeconds: number): boolean {
    let animating = false;
    if (this.dependencies.commands.open.value)
      animating = this.commandPaletteViewport.tick(deltaSeconds) || animating;
    if (this.dependencies.quickOpen.open.value)
      animating = this.quickOpenViewport.tick(deltaSeconds) || animating;
    if (this.dependencies.settingsPanel.open.value)
      animating = this.settingsViewport.tick(deltaSeconds) || animating;
    if (this.dependencies.shortcutHelp.open.value)
      animating = this.shortcutHelpViewport.tick(deltaSeconds) || animating;
    if (this.dependencies.contextMenu.open.value)
      animating = this.contextMenuViewport.tick(deltaSeconds) || animating;
    return animating;
  }
  update(palette: Palette): void {
    void this.paintRevision.value;
    const {
      commands,
      findBar,
      quickOpen,
      workspaceSet,
      settingsPanel,
      shortcutHelp,
      contextMenu,
      tooltip,
      theme,
      renderer,
    } = this.dependencies;
    // Palette overlay.
    const open = commands.open.value;
    if (open) {
      const filteredCommands = commands.filtered;
      this.commandPaletteContentRows = Math.max(1, filteredCommands.length);
      const commandPaletteGeometry = this.updateOverlayDialog(
        this.commandPalette,
        this.commandPaletteDismissal,
        palette,
        {
          dialogName: 'commandPalette',
          title: 'Command Palette',
          desiredTop: 2,
          desiredWidth: Math.max(1, Math.floor(renderer.width * 0.6)),
          desiredHeight: Math.min(15, this.commandPaletteContentRows + 3),
        },
      );
      this.commandPaletteViewportRows = Math.max(
        1,
        commandPaletteGeometry.interiorHeight - 1,
      );
      if (!this.previousCommandPaletteOpen) this.commandPaletteViewport.reset();
      this.commandPaletteViewport.reconcileExtent();
      const selectedIndex = commands.selectedIndex.value;
      if (
        selectedIndex !== this.previousCommandPaletteSelectedIndex &&
        filteredCommands.length > 0
      ) {
        this.revealViewportRow(
          this.commandPaletteViewport,
          selectedIndex,
          this.commandPaletteViewportRows,
        );
      }
      // A modal dialog input is always the focused field and is never a pointer-hover target, so it
      // takes the focused tone and the shared caret; the popup search row is the field that also has
      // idle and hovered states.
      // invariant: One painter draws every single-line text field (src/modules/ui/ui.invariants.md)
      this.commandPaletteInput.content = new StyledText(
        TextFieldPainter.Class.paint({
          prefix: '> ',
          input: commands.queryInput,
          tone: TextFieldPainter.Class.toneFor(palette, 'focused'),
          surfaceBackground: palette.panel,
          caretVisible: true,
          width: null,
        }).chunks,
      );
      this.commandPaletteInput.fg = palette.fg;
      const commandPaletteFirstVisible = this.commandPaletteViewport.scrollTop;
      this.commandPaletteFirstVisible = commandPaletteFirstVisible;
      const items = filteredCommands.slice(
        commandPaletteFirstVisible,
        commandPaletteFirstVisible + this.commandPaletteViewportRows,
      );
      this.commandPaletteList.content = items.length
        ? items
            .map((command, visibleIndex) => {
              const commandIndex = commandPaletteFirstVisible + visibleIndex;
              return `${commandIndex === selectedIndex ? '›' : ' '} ${command.title}`;
            })
            .join('\n')
        : '  (no matching commands)';
      this.commandPaletteList.fg = palette.dim;
      this.commandPaletteRowCount = items.length;
      this.commandPaletteViewport.updateScrollbars({
        top: 1,
        left: 0,
        width: commandPaletteGeometry.interiorWidth,
        height: this.commandPaletteViewportRows,
      });
      this.previousCommandPaletteSelectedIndex = selectedIndex;
    } else {
      this.hideOverlayDialog(
        'commandPalette',
        this.commandPalette,
        this.commandPaletteDismissal,
        this.commandPaletteViewport,
      );
      this.previousCommandPaletteSelectedIndex = -1;
      this.commandPaletteFirstVisible = 0;
      this.commandPaletteRowCount = 0;
    }
    this.previousCommandPaletteOpen = open;
    // Find/replace bar overlay. The renderer draws the query/replacement lines plus the clickable
    // button row and hands back the button hit-zones the pointer handler reads.
    if (findBar.open.value) {
      const replaceMode = findBar.mode.value === 'replace';
      this.updateOverlayDialog(
        this.findBarBox,
        this.findBarCloseButton,
        palette,
        {
          dialogName: 'findBar',
          title: replaceMode ? 'Find / Replace' : 'Find',
          desiredLeft: Math.floor(renderer.width * 0.45),
          desiredTop: 1,
          desiredWidth: Math.max(1, Math.floor(renderer.width * 0.54)),
          desiredHeight: replaceMode ? 6 : 5,
        },
      );
      const findResult = FindBarRenderer.Class.render({
        findBar,
        palette,
        findIcons: theme.findIcons,
      });
      this.findBarText.content = findResult.text;
      this.findBarButtonZones = findResult.buttons;
    } else {
      this.hideOverlayDialog(
        'findBar',
        this.findBarBox,
        this.findBarCloseButton,
      );
      this.findBarButtonZones = [];
    }
    // Quick-open (Ctrl+P) overlay.
    if (quickOpen.open.value) {
      const openingWorkspace = quickOpen.mode.value === 'workspacePath';
      this.quickOpenContentRows =
        QuickOpenRenderer.Class.contentRowCount(quickOpen);
      const quickOpenGeometry = this.updateOverlayDialog(
        this.quickOpenBox,
        this.quickOpenDismissal,
        palette,
        {
          dialogName: 'quickOpen',
          title: openingWorkspace ? 'Open Project Folder' : 'Go to File',
          desiredTop: 2,
          desiredWidth: Math.max(1, Math.floor(renderer.width * 0.6)),
          desiredHeight: Math.min(17, this.quickOpenContentRows + 3),
        },
      );
      this.quickOpenViewportRows = Math.max(
        1,
        quickOpenGeometry.interiorHeight - 1,
      );
      if (!this.previousQuickOpenOpen) this.quickOpenViewport.reset();
      this.quickOpenViewport.reconcileExtent();
      const quickOpenSelectedIndex = quickOpen.selectedIndex.value;
      if (
        quickOpenSelectedIndex !== this.previousQuickOpenSelectedIndex &&
        quickOpenSelectedIndex >= 0
      ) {
        this.revealViewportRow(
          this.quickOpenViewport,
          quickOpenSelectedIndex,
          this.quickOpenViewportRows,
        );
      }
      // In the path navigator, flag an un-openable current path with a live warning glyph (⚠ ladder,
      // theme warning colour) — a valid/openable path shows none.
      // invariant: An un-openable open-project path is flagged live (src/modules/search/search.invariants.md)
      const showPathAlert =
        openingWorkspace && !quickOpen.workspacePathOpenable.value;
      // invariant: File enumeration failures stay visible (src/modules/search/search.invariants.md)
      const showFileEnumerationNotice =
        !openingWorkspace &&
        (quickOpen.fileEnumerationState.value === 'degraded' ||
          quickOpen.fileEnumerationState.value === 'failed');
      // invariant: One painter draws every single-line text field (src/modules/ui/ui.invariants.md)
      const inputChunks: TextChunk[] = TextFieldPainter.Class.paint({
        prefix: `${openingWorkspace ? '+' : theme.actionIcons.open} `,
        input: quickOpen.queryInput,
        tone: TextFieldPainter.Class.toneFor(palette, 'focused'),
        surfaceBackground: palette.panel,
        caretVisible: true,
        width: null,
      }).chunks;
      if (showPathAlert)
        inputChunks.push(fg(palette.warning)(`  ${theme.alertIcon}`));
      if (showFileEnumerationNotice) {
        const noticeColour =
          quickOpen.fileEnumerationState.value === 'failed'
            ? palette.error
            : palette.warning;
        inputChunks.push(
          fg(noticeColour)(
            `  ${theme.alertIcon} ${quickOpen.fileEnumerationMessage.value}`,
          ),
        );
      }
      this.quickOpenInput.content = new StyledText(inputChunks);
      // The result list renders through the renderer: row-background selection/hover (no arrow marker),
      // and it reports the hit-testable row count for the pointer handler.
      const quickOpenResult = QuickOpenRenderer.Class.render({
        quickOpen,
        palette,
        innerWidth: quickOpenGeometry.interiorWidth,
        maxRows: this.quickOpenViewportRows,
        firstVisible: this.quickOpenViewport.scrollTop,
      });
      this.quickOpenList.content = quickOpenResult.text;
      this.quickOpenRowCount = quickOpenResult.rowCount;
      this.quickOpenFirstVisible = quickOpenResult.firstVisible;
      this.quickOpenViewport.updateScrollbars({
        top: 1,
        left: 0,
        width: quickOpenGeometry.interiorWidth,
        height: this.quickOpenViewportRows,
      });
      this.previousQuickOpenSelectedIndex = quickOpenSelectedIndex;
    } else {
      this.hideOverlayDialog(
        'quickOpen',
        this.quickOpenBox,
        this.quickOpenDismissal,
        this.quickOpenViewport,
      );
      this.quickOpenRowCount = 0;
      this.quickOpenFirstVisible = 0;
      this.previousQuickOpenSelectedIndex = -1;
    }
    this.previousQuickOpenOpen = quickOpen.open.value;
    // Confirmation overlay for closing a dirty tab.
    const pendingCloseTabIndex = workspaceSet.active.pendingCloseTabIndex.value;
    if (pendingCloseTabIndex >= 0) {
      const tabPath =
        workspaceSet.active.buffers.tabs()[pendingCloseTabIndex]?.path ?? '';
      this.updateOverlayDialog(
        this.confirmBox,
        this.confirmationDismissal,
        palette,
        {
          dialogName: 'confirmation',
          title: 'Confirm',
          desiredTop: 4,
          desiredWidth: Math.max(1, Math.floor(renderer.width * 0.6)),
          desiredHeight: 3,
          borderColor: palette.warning,
          titleColor: palette.warning,
        },
      );
      this.confirmText.content = ` Close ${Files.Class.basename(tabPath)} with unsaved changes?  [y/N]`;
      this.confirmText.fg = palette.fg;
    } else {
      this.hideOverlayDialog(
        'confirmation',
        this.confirmBox,
        this.confirmationDismissal,
      );
    }
    // Settings panel overlay — sectioned, with a clickable widget per row (steppers / toggle / arrows).
    if (settingsPanel.open.value) {
      const settingsRows = settingsPanel.rows();
      const settingsLines = this.settingsLines(palette, settingsRows);
      this.settingsRenderedLines = settingsLines;
      this.settingsContentRows = settingsLines.length;
      const settingsGeometry = this.updateOverlayDialog(
        this.settingsBox,
        this.settingsDismissal,
        palette,
        {
          dialogName: 'settingsPanel',
          title: 'Settings',
          desiredTop: 2,
          desiredWidth: Math.max(1, Math.floor(renderer.width * 0.9)),
          desiredHeight: this.settingsContentRows + 2,
        },
      );
      this.settingsViewportRows = Math.max(
        1,
        settingsGeometry.interiorHeight - 1,
      );
      this.settingsViewportColumns = Math.max(
        1,
        settingsGeometry.interiorWidth,
      );
      if (!this.previousSettingsOpen) {
        this.settingsViewport.reset();
        this.settingsSelection.clear();
      }
      this.settingsViewport.reconcileExtent();
      const selectedSettingsIndex = settingsPanel.selectedIndex.value;
      if (selectedSettingsIndex !== this.previousSettingsSelectedIndex) {
        const selectedContentRow = settingsLines.findIndex(
          (line) => line.settingIndex === selectedSettingsIndex,
        );
        if (selectedContentRow >= 0) {
          this.revealViewportRow(
            this.settingsViewport,
            selectedContentRow,
            this.settingsViewportRows,
          );
        }
      }
      const settingsWindow = this.styledWindow(
        settingsLines,
        this.settingsViewport.scrollTop,
        this.settingsViewportRows,
      );
      this.settingsText.content = settingsWindow.text;
      this.settingsText.selectionBg = palette.selection;
      this.paintSettingsSelection();
      this.settingsWidgetZones = settingsWindow.zones;
      this.settingsViewport.updateScrollbars({
        top: 0,
        left: 0,
        width: settingsGeometry.interiorWidth,
        height: this.settingsViewportRows,
      });
      this.previousSettingsSelectedIndex = selectedSettingsIndex;
    } else {
      this.hideOverlayDialog(
        'settingsPanel',
        this.settingsBox,
        this.settingsDismissal,
        this.settingsViewport,
      );
      this.settingsText.clearSelectionRange();
      this.settingsSelection.clear();
      this.settingsRenderedLines = [];
      this.settingsWidgetZones = [];
      this.previousSettingsSelectedIndex = -1;
    }
    this.previousSettingsOpen = settingsPanel.open.value;
    // Shortcut cheat-sheet overlay.
    if (shortcutHelp.open.value) {
      const sheetRows = shortcutHelp.rows();
      this.shortcutHelpContentRows = sheetRows.length;
      const shortcutHelpGeometry = this.updateOverlayDialog(
        this.shortcutHelpBox,
        this.shortcutHelpDismissal,
        palette,
        {
          dialogName: 'shortcutHelp',
          title: 'Keyboard Shortcuts',
          desiredTop: 1,
          desiredWidth: Math.max(1, Math.floor(renderer.width * 0.7)),
          desiredHeight: this.shortcutHelpBoxHeight(),
        },
      );
      this.shortcutHelpVisibleRows = Math.max(
        1,
        shortcutHelpGeometry.interiorHeight - 1,
      );
      if (!this.previousShortcutHelpOpen) this.shortcutHelpViewport.reset();
      this.shortcutHelpViewport.reconcileExtent();
      shortcutHelp.scrollTop.value = this.shortcutHelpViewport.scrollTop;
      const sheetScrollTop = this.shortcutHelpViewport.scrollTop;
      const sheetVisibleRows = sheetRows.slice(
        sheetScrollTop,
        sheetScrollTop + this.shortcutHelpVisibleRows,
      );
      const chordColumnWidth = sheetRows.reduce(
        (widestWidth, sheetRow) =>
          Math.max(widestWidth, sheetRow.chordLabel.length),
        0,
      );
      const sheetScrollHint =
        sheetRows.length > this.shortcutHelpVisibleRows
          ? `   ${sheetScrollTop + 1}-${Math.min(sheetScrollTop + this.shortcutHelpVisibleRows, sheetRows.length)} of ${sheetRows.length}`
          : '';
      const sheetChunks: TextChunk[] = [];
      sheetChunks.push(
        fg(palette.dim)(
          `  ↑/↓, wheel, or thumb scroll · Esc close${sheetScrollHint}\n`,
        ),
      );
      sheetVisibleRows.forEach((sheetRow, sheetRowIndex) => {
        const lineBreak =
          sheetRowIndex < sheetVisibleRows.length - 1 ? '\n' : '';
        if (sheetRow.kind === 'category') {
          sheetChunks.push(
            bold(fg(palette.accent)(` ${sheetRow.label}${lineBreak}`)),
          );
        } else {
          sheetChunks.push(
            fg(palette.accent)(
              `   ${sheetRow.chordLabel.padEnd(chordColumnWidth, ' ')}`,
            ),
          );
          sheetChunks.push(fg(palette.fg)(`  ${sheetRow.label}${lineBreak}`));
        }
      });
      this.shortcutHelpText.content = new StyledText(sheetChunks);
      this.shortcutHelpViewport.updateScrollbars({
        top: 1,
        left: 0,
        width: shortcutHelpGeometry.interiorWidth,
        height: this.shortcutHelpVisibleRows,
      });
    } else {
      this.hideOverlayDialog(
        'shortcutHelp',
        this.shortcutHelpBox,
        this.shortcutHelpDismissal,
        this.shortcutHelpViewport,
      );
    }
    this.previousShortcutHelpOpen = shortcutHelp.open.value;
    // Context menu overlay (+ modal backdrop).
    const menuOpen = contextMenu.open.value;
    if (menuOpen) {
      this.contextMenuContentRows = Math.max(1, contextMenu.items.value.length);
      const contextMenuGeometry = this.updateOverlayDialog(
        this.contextMenuBox,
        this.contextMenuDismissal,
        palette,
        {
          dialogName: 'contextMenu',
          title: 'Menu',
          desiredLeft: contextMenu.anchorX.value,
          desiredTop: contextMenu.anchorY.value,
          desiredWidth: contextMenu.width,
          desiredHeight: contextMenu.height,
        },
      );
      this.contextMenuViewportRows = contextMenuGeometry.interiorHeight;
      if (!this.previousContextMenuOpen) this.contextMenuViewport.reset();
      this.contextMenuViewport.reconcileExtent();
      const contextMenuSelectedIndex = contextMenu.selectedIndex.value;
      if (contextMenuSelectedIndex !== this.previousContextMenuSelectedIndex) {
        this.revealViewportRow(
          this.contextMenuViewport,
          contextMenuSelectedIndex,
          this.contextMenuViewportRows,
        );
      }
      const firstVisibleContextMenuIndex = this.contextMenuViewport.scrollTop;
      const visibleContextMenuItems = contextMenu.items.value.slice(
        firstVisibleContextMenuIndex,
        firstVisibleContextMenuIndex + this.contextMenuViewportRows,
      );
      const rowWidth = contextMenuGeometry.interiorWidth;
      const menuChunks: TextChunk[] = [];
      visibleContextMenuItems.forEach((item, visibleIndex) => {
        const index = firstVisibleContextMenuIndex + visibleIndex;
        const label = ` ${item.label}`.padEnd(rowWidth, ' ').slice(0, rowWidth);
        const rowBackground =
          index === contextMenu.selectedIndex.value
            ? palette.selection
            : index === contextMenu.hoveredIndex.value
              ? palette.cursorLine
              : null;
        const styled = fg(item.enabled ? palette.fg : palette.dim)(label);
        menuChunks.push(rowBackground ? bg(rowBackground)(styled) : styled);
        if (visibleIndex < visibleContextMenuItems.length - 1)
          menuChunks.push(fg(palette.fg)('\n'));
      });
      this.contextMenuList.content = new StyledText(menuChunks);
      this.contextMenuViewport.updateScrollbars({
        top: 0,
        left: 0,
        width: contextMenuGeometry.interiorWidth,
        height: this.contextMenuViewportRows,
      });
      this.previousContextMenuSelectedIndex = contextMenuSelectedIndex;
    } else {
      this.hideOverlayDialog(
        'contextMenu',
        this.contextMenuBox,
        this.contextMenuDismissal,
        this.contextMenuViewport,
      );
      this.previousContextMenuSelectedIndex = -1;
    }
    this.previousContextMenuOpen = menuOpen;
    // Tooltip overlay — display-only; clamped so it stays on screen.
    this.tooltipText.visible = tooltip.visible.value;
    if (tooltip.visible.value) {
      const tooltipLabel = ` ${tooltip.text.value} `;
      const tooltipWidth = TextCoordinates.Class.lineWidth(tooltipLabel);
      const centeredLeft = tooltip.anchorX.value - Math.floor(tooltipWidth / 2);
      this.tooltipText.left = Math.max(
        0,
        Math.min(centeredLeft, renderer.width - tooltipWidth),
      );
      const anchorY = tooltip.anchorY.value;
      const roomAbove = anchorY - 1 >= 0;
      const placeAbove =
        tooltip.placement.value === 'above' ||
        (tooltip.placement.value === 'auto' && roomAbove);
      const desiredTop = placeAbove ? anchorY - 1 : anchorY + 1;
      this.tooltipText.top = Math.max(
        0,
        Math.min(desiredTop, renderer.height - 1),
      );
      this.tooltipText.content = new StyledText([
        bg(palette.selection)(fg(palette.fg)(tooltipLabel)),
      ]);
    }
  }
}

export namespace OverlayLayer {
  export const $Class = $OverlayLayer;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

/** A clickable settings widget: the text row + column range it occupies, the descriptor it edits, and
 *  what a click does. `select` just selects the row; `dec`/`inc` select then step/cycle/toggle it. */
interface SettingsWidgetZone {
  row: number;
  startColumn: number;
  endColumn: number;
  index: number;
  action: 'select' | 'dec' | 'inc';
}

interface SettingsLineZone {
  startColumn: number;
  endColumn: number;
  index: number;
  action: SettingsWidgetZone['action'];
}

interface SettingsRenderedLine {
  chunks: TextChunk[];
  zones: SettingsLineZone[];
  settingIndex?: number;
}

interface OverlayDialogLayoutInput {
  dialogName: OverlayDialogName;
  title: string;
  desiredWidth: number;
  desiredHeight: number;
  desiredLeft?: number;
  desiredTop?: number;
  borderColor?: string;
  titleColor?: string;
}

interface OverlayDialogDismissalControl {
  show(geometry: {
    left: number;
    top: number;
    width: number;
    backgroundColor: string;
    foregroundColor: string;
  }): void;
  hide(): void;
}

type OverlayDialogName =
  | 'commandPalette'
  | 'findBar'
  | 'quickOpen'
  | 'confirmation'
  | 'settingsPanel'
  | 'shortcutHelp'
  | 'contextMenu';

export interface OverlayDialogBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OverlayLayerDependencies {
  renderer: CliRenderer;
  commands: CommandRegistry.Instance;
  findBar: FindBar.Instance;
  quickOpen: QuickOpen.Instance;
  contextMenu: ContextMenu.Instance;
  boundedListPopup: BoundedListPopup.Instance;
  settingsPanel: SettingsPanel.Instance;
  shortcutHelp: ShortcutHelp.Instance;
  tooltip: Tooltip.Instance;
  theme: Theme.Instance;
  workspaceSet: WorkspaceSet.Instance;
  /** Activate the current quick-open selection (open the file / project folder + close the modal) — the
   *  SAME path the Enter key runs, so a click and Enter never diverge. */
  activateQuickOpen: () => void;
  /** Reveal the find bar's current match through the bound pane (the sole scroll/selection writer). */
  revealFindMatch: () => void;
}
