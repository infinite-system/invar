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
// invariant: Destructive working-tree operations require confirmation (src/modules/git/git.invariants.md)
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
import { EditorCoordinates } from '../editor/EditorCoordinates';
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
import {
  ScrollableTextViewport,
  type ViewportExtent,
} from './ScrollableTextViewport';
import type { Palette } from '../theme/ThemePalettes';
import type { CommandRegistry } from '../commands/CommandRegistry';
import type { FindBar } from '../search/FindBar';
import type { QuickOpen } from '../search/QuickOpen';
import type { ContextMenu } from './ContextMenu';
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
  protected readonly commandPalette: BoxRenderable;
  protected readonly commandPaletteInput: TextRenderable;
  protected readonly commandPaletteList: TextRenderable;
  protected readonly commandPaletteCloseButton: OverlayCloseButton.Model;
  protected readonly findBarBox: BoxRenderable;
  protected readonly findBarText: TextRenderable;
  protected readonly findBarCloseButton: OverlayCloseButton.Model;
  protected readonly quickOpenBox: BoxRenderable;
  protected readonly quickOpenInput: TextRenderable;
  protected readonly quickOpenList: TextRenderable;
  protected readonly quickOpenCloseButton: OverlayCloseButton.Model;
  protected readonly confirmBox: BoxRenderable;
  protected readonly confirmText: TextRenderable;
  protected readonly confirmCloseButton: OverlayCloseButton.Model;
  protected readonly settingsBox: BoxRenderable;
  protected readonly settingsText: TextRenderable;
  protected readonly settingsCloseButton: OverlayCloseButton.Model;
  protected readonly shortcutHelpBackdrop: BoxRenderable;
  protected readonly shortcutHelpBox: BoxRenderable;
  protected readonly shortcutHelpText: TextRenderable;
  protected readonly shortcutHelpCloseButton: OverlayCloseButton.Model;
  protected readonly contextMenuBackdrop: BoxRenderable;
  protected readonly contextMenuBox: BoxRenderable;
  protected readonly contextMenuList: TextRenderable;
  protected readonly contextMenuCloseButton: OverlayCloseButton.Model;
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
  constructor(protected readonly deps: OverlayLayerDeps) {
    const { renderer, shortcutHelp, contextMenu, quickOpen } = deps;
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
    this.commandPaletteCloseButton = this.createCloseButton(
      'palette-close',
      101,
      () => deps.commands.closePalette(),
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
      () => deps.findBar.close(),
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
    this.quickOpenCloseButton = this.createCloseButton(
      'quick-open-close',
      101,
      () => deps.quickOpen.close(),
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
    this.confirmCloseButton = this.createCloseButton(
      'confirm-discard-close',
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
    this.settingsText = new TextRenderable(renderer, {
      id: 'settings-panel-text',
      content: '',
    });
    this.settingsBox.add(this.settingsText);
    root.add(this.settingsBox);
    this.settingsCloseButton = this.createCloseButton(
      'settings-panel-close',
      123,
      () => deps.settingsPanel.close(),
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
    );
    // Shortcut cheat-sheet (Shift+F1 / status-bar `?`) + invisible modal backdrop.
    this.shortcutHelpBackdrop = new BoxRenderable(renderer, {
      id: 'shortcut-help-backdrop',
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      visible: false,
      zIndex: 118,
    });
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
    root.add(this.shortcutHelpBackdrop);
    root.add(this.shortcutHelpBox);
    this.shortcutHelpBackdrop.onMouseDown = () => shortcutHelp.close();
    this.shortcutHelpCloseButton = this.createCloseButton(
      'shortcut-help-close',
      121,
      () => deps.shortcutHelp.close(),
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
        this.deps.shortcutHelp.scrollTop.value =
          this.shortcutHelpViewport.scrollTop;
        this.requestPaint();
      },
    );
    // Context-menu modal layer (menu box + invisible full-screen backdrop beneath it).
    this.contextMenuBackdrop = new BoxRenderable(renderer, {
      id: 'context-menu-backdrop',
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      visible: false,
      zIndex: 125,
    });
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
    root.add(this.contextMenuBackdrop);
    root.add(this.contextMenuBox);
    this.contextMenuBackdrop.onMouseDown = () => contextMenu.close();
    this.contextMenuCloseButton = this.createCloseButton(
      'context-menu-close',
      131,
      () => deps.contextMenu.close(),
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
      else this.deps.activateQuickOpen();
    };
    this.commandPaletteList.onMouseDown = (event) => {
      const visibleRow = event.y - this.commandPaletteList.y;
      if (visibleRow < 0 || visibleRow >= this.commandPaletteRowCount) return;
      const commandIndex = this.commandPaletteFirstVisible + visibleRow;
      this.deps.commands.moveSelection(
        commandIndex - this.deps.commands.selectedIndex.value,
      );
      this.deps.commands.runSelected();
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
      const localRow = event.y - this.settingsText.y;
      const localColumn = event.x - this.settingsText.x;
      const zone = this.settingsWidgetZones.find(
        (candidate) =>
          candidate.row === localRow &&
          localColumn >= candidate.startColumn &&
          localColumn < candidate.endColumn,
      );
      if (!zone) return;
      this.deps.settingsPanel.select(zone.index);
      if (zone.action === 'dec') this.deps.settingsPanel.adjust(-1);
      else if (zone.action === 'inc') this.deps.settingsPanel.adjust(1);
      this.deps.renderer.requestRender();
    };
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
      renderer: this.deps.renderer,
      identifier,
      zIndex,
      close,
    });
  }
  protected requestPaint(): void {
    this.paintRevision.value += 1;
    this.deps.renderer.requestRender();
  }
  protected createOverlayViewport(
    identifier: string,
    parent: BoxRenderable,
    extent: () => ViewportExtent,
    onScroll: () => void,
  ): ScrollableTextViewport.Instance {
    return new ScrollableTextViewport.Class({
      renderer: this.deps.renderer,
      settings: this.deps.settingsPanel.settings,
      parent,
      id: identifier,
      disableHorizontal: true,
      scrollbarZIndex: 2,
      extent,
      colors: () => ({
        track: this.deps.theme.palette.panel,
        thumb: this.deps.theme.palette.dim,
      }),
      onScroll,
      selection: {
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
      },
    });
  }
  protected updateOverlayDialog(
    box: BoxRenderable,
    closeButton: OverlayCloseButton.Model,
    palette: Palette,
    input: OverlayDialogLayoutInput,
  ): OverlayDialogGeometryResult {
    const geometry = OverlayDialogGeometry.Class.layout({
      screenWidth: this.deps.renderer.width,
      screenHeight: this.deps.renderer.height,
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
    closeButton.show({
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
    closeButton: OverlayCloseButton.Model,
    viewport?: ScrollableTextViewport.Instance,
  ): void {
    this.dialogBoundsByName.delete(dialogName);
    box.visible = false;
    closeButton.hide();
    viewport?.hideBars();
  }
  protected cancelConfirmation(): void {
    if (this.deps.workspaceSet.active.gitPanel.confirmDiscard.value)
      this.deps.workspaceSet.active.cancelDiscard();
    if (this.deps.workspaceSet.active.pendingCloseTabIndex.value >= 0)
      this.deps.workspaceSet.active.cancelCloseTab();
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
        chunks.push(fg(this.deps.theme.palette.fg)('\n'));
    });
    return { text: new StyledText(chunks), zones };
  }
  /** Dispatch a find-bar button click to the same FindBar action its keyboard chord runs. */
  protected runFindButton(action: FindBarButtonAction): void {
    const { findBar, revealFindMatch } = this.deps;
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
    return Math.max(6, this.deps.renderer.height - 3);
  }
  /** Visible binding rows in the cheat-sheet (interior minus its fixed instruction line). */
  shortcutHelpViewportRows(): number {
    const geometry = OverlayDialogGeometry.Class.layout({
      screenWidth: this.deps.renderer.width,
      screenHeight: this.deps.renderer.height,
      desiredWidth: Math.max(1, Math.floor(this.deps.renderer.width * 0.7)),
      desiredHeight: this.shortcutHelpBoxHeight(),
      desiredTop: 1,
    });
    return Math.max(1, geometry.interiorHeight - 1);
  }
  scrollShortcutHelpBy(rowDelta: number): void {
    this.shortcutHelpViewport.scrollRowsBy(rowDelta);
    this.deps.shortcutHelp.scrollTop.value =
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
  tick(deltaSeconds: number): boolean {
    let animating = false;
    if (this.deps.commands.open.value)
      animating = this.commandPaletteViewport.tick(deltaSeconds) || animating;
    if (this.deps.quickOpen.open.value)
      animating = this.quickOpenViewport.tick(deltaSeconds) || animating;
    if (this.deps.settingsPanel.open.value)
      animating = this.settingsViewport.tick(deltaSeconds) || animating;
    if (this.deps.shortcutHelp.open.value)
      animating = this.shortcutHelpViewport.tick(deltaSeconds) || animating;
    if (this.deps.contextMenu.open.value)
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
    } = this.deps;
    // Palette overlay.
    const open = commands.open.value;
    if (open) {
      const filteredCommands = commands.filtered;
      this.commandPaletteContentRows = Math.max(1, filteredCommands.length);
      const commandPaletteGeometry = this.updateOverlayDialog(
        this.commandPalette,
        this.commandPaletteCloseButton,
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
      this.commandPaletteInput.content = `> ${commands.query.value}▏`;
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
        this.commandPaletteCloseButton,
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
        this.quickOpenCloseButton,
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
      const inputPrefix = `${openingWorkspace ? '+' : theme.actionIcons.open} ${quickOpen.query.value}▏`;
      const inputChunks: TextChunk[] = [fg(palette.fg)(inputPrefix)];
      if (showPathAlert)
        inputChunks.push(fg(palette.warning)(`  ${theme.alertIcon}`));
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
        this.quickOpenCloseButton,
        this.quickOpenViewport,
      );
      this.quickOpenRowCount = 0;
      this.quickOpenFirstVisible = 0;
      this.previousQuickOpenSelectedIndex = -1;
    }
    this.previousQuickOpenOpen = quickOpen.open.value;
    // Confirmation overlay (discard changes / close a dirty tab).
    const pendingDiscard = workspaceSet.active.gitPanel.confirmDiscard.value;
    const pendingCloseTabIndex = workspaceSet.active.pendingCloseTabIndex.value;
    if (pendingDiscard) {
      this.updateOverlayDialog(
        this.confirmBox,
        this.confirmCloseButton,
        palette,
        {
          dialogName: 'confirmation',
          title: 'Confirm',
          desiredTop: 4,
          desiredWidth: Math.max(1, Math.floor(renderer.width * 0.6)),
          desiredHeight: 3,
          borderColor: palette.deleted,
          titleColor: palette.deleted,
        },
      );
      this.confirmText.content =
        pendingDiscard.paths.length === 1
          ? ` Discard changes to ${pendingDiscard.paths[0]}?  [y/N]`
          : ` Discard changes to ${pendingDiscard.paths.length} files (${pendingDiscard.paths.join(', ').slice(0, 60)}…)?  [y/N]`;
      this.confirmText.fg = palette.fg;
    } else if (pendingCloseTabIndex >= 0) {
      const tabPath =
        workspaceSet.active.buffers.tabs()[pendingCloseTabIndex]?.path ?? '';
      this.updateOverlayDialog(
        this.confirmBox,
        this.confirmCloseButton,
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
        this.confirmCloseButton,
      );
    }
    // Settings panel overlay — sectioned, with a clickable widget per row (steppers / toggle / arrows).
    if (settingsPanel.open.value) {
      const settingsRows = settingsPanel.rows();
      const settingsLines = this.settingsLines(palette, settingsRows);
      this.settingsContentRows = settingsLines.length;
      const settingsGeometry = this.updateOverlayDialog(
        this.settingsBox,
        this.settingsCloseButton,
        palette,
        {
          dialogName: 'settingsPanel',
          title: 'Settings',
          desiredTop: 2,
          desiredWidth: Math.max(1, Math.floor(renderer.width * 0.7)),
          desiredHeight: this.settingsContentRows + 2,
        },
      );
      this.settingsViewportRows = settingsGeometry.interiorHeight;
      if (!this.previousSettingsOpen) this.settingsViewport.reset();
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
        this.settingsCloseButton,
        this.settingsViewport,
      );
      this.settingsWidgetZones = [];
      this.previousSettingsSelectedIndex = -1;
    }
    this.previousSettingsOpen = settingsPanel.open.value;
    // Shortcut cheat-sheet overlay.
    this.shortcutHelpBackdrop.visible = shortcutHelp.open.value;
    if (shortcutHelp.open.value) {
      const sheetRows = shortcutHelp.rows();
      this.shortcutHelpContentRows = sheetRows.length;
      const shortcutHelpGeometry = this.updateOverlayDialog(
        this.shortcutHelpBox,
        this.shortcutHelpCloseButton,
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
        this.shortcutHelpCloseButton,
        this.shortcutHelpViewport,
      );
    }
    this.previousShortcutHelpOpen = shortcutHelp.open.value;
    // Context menu overlay (+ modal backdrop).
    const menuOpen = contextMenu.open.value;
    this.contextMenuBackdrop.visible = menuOpen;
    if (menuOpen) {
      this.contextMenuContentRows = Math.max(1, contextMenu.items.value.length);
      const contextMenuGeometry = this.updateOverlayDialog(
        this.contextMenuBox,
        this.contextMenuCloseButton,
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
        this.contextMenuCloseButton,
        this.contextMenuViewport,
      );
      this.previousContextMenuSelectedIndex = -1;
    }
    this.previousContextMenuOpen = menuOpen;
    // Tooltip overlay — display-only; clamped so it stays on screen.
    this.tooltipText.visible = tooltip.visible.value;
    if (tooltip.visible.value) {
      const tooltipLabel = ` ${tooltip.text.value} `;
      const tooltipWidth = EditorCoordinates.Class.lineWidth(tooltipLabel);
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
export interface OverlayLayerDeps {
  renderer: CliRenderer;
  commands: CommandRegistry.Instance;
  findBar: FindBar.Instance;
  quickOpen: QuickOpen.Instance;
  contextMenu: ContextMenu.Instance;
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
