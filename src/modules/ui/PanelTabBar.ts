import { StyledText, bg, fg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import type { InterfaceGlyphVocabulary } from '../theme/ThemeIcons';
import { ThemeIcons } from '../theme/ThemeIcons';
import type { GlyphLevel } from '../theme/TerminalCapabilities';
import type { Palette } from '../theme/ThemePalettes';
import { TextCoordinates } from '../text/TextCoordinates';
import type { PanelSpace } from './PanelHost';
import { WrapText } from './WrapText';

// invariant: Tab bars share paint and hit geometry (src/modules/ui/ui.invariants.md)
// invariant: Panel controls share paint and hit geometry (src/modules/ui/ui.invariants.md)
class $PanelTabBar {
  protected static readonly ACTION_CELL_WIDTH = 3;
  protected static readonly EDITOR_FRAME_LEFT_PADDING_CELLS = 2;
  protected static readonly MINIMUM_TAB_WIDTH = 4;

  static project(options: PanelTabBarOptions): PanelTabBarProjection {
    const width = Math.max(0, Math.floor(options.width));
    const splitterControls = this.projectSplitterControls(options, width);
    const tabRow = this.projectTabRow(options, width);
    return {
      splitterLeadingText: new StyledText([]),
      splitterControlText: splitterControls.text,
      tabText: tabRow.text,
      tabControlText: tabRow.controlText,
      tabsWidth: tabRow.tabsWidth,
      actionWidth: 0,
      splitterLeadingWidth: 0,
      leadingWidth: 0,
      dragWidth: Math.max(0, width - splitterControls.width),
      dragLeadingPaintPadCells: 1,
      splitterControlWidth: splitterControls.width,
      controlWidth: splitterControls.width,
      tabControlWidth: tabRow.controlWidth,
      tabs: tabRow.tabs,
      tabCloses: tabRow.closes,
      editorActions: [],
      controls: splitterControls.segments,
      spaceAdd: tabRow.spaceAdd,
      instancesToggle: tabRow.instancesToggle,
    };
  }

  protected static projectSplitterControls(
    options: PanelTabBarOptions,
    width: number,
  ): {
    text: StyledText;
    width: number;
    segments: readonly PanelTabBarControlSegment[];
  } {
    const definitions: readonly PanelTabBarControlDefinition[] = [
      {
        action: 'expand',
        text: ` ${
          options.expanded
            ? options.glyphVocabulary.panelRestore
            : options.glyphVocabulary.panelExpand
        } `,
        tooltip: options.expanded ? 'Restore panel' : 'Expand panel',
      },
      {
        action: 'close',
        text: ` ${options.glyphVocabulary.panelClose} `,
        tooltip: 'Close panel',
      },
    ];
    const preferredWidth = definitions.reduce(
      (sum, definition) =>
        sum + TextCoordinates.Class.lineWidth(definition.text),
      0,
    );
    const controlWidth = Math.min(
      preferredWidth,
      Math.max(0, width - Math.min(1, width)),
    );
    let column = width - controlWidth;
    const chunks: TextChunk[] = [];
    const segments: PanelTabBarControlSegment[] = [];
    for (const definition of definitions) {
      const visibleText = TextCoordinates.Class.displayColumnWindow(
        definition.text,
        0,
        Math.max(0, width - column),
      );
      const visibleWidth = TextCoordinates.Class.lineWidth(visibleText);
      if (visibleWidth <= 0) break;
      const hovered = definition.action === options.hoveredAction;
      const active = false;
      const colored = fg(
        hovered || active ? options.palette.accent : options.palette.fg,
      )(visibleText);
      chunks.push(
        hovered
          ? bg(options.palette.cursorLine)(colored)
          : active
            ? bg(options.palette.selection)(colored)
            : colored,
      );
      segments.push({
        action: definition.action,
        tooltip: definition.tooltip,
        startColumn: column,
        endColumn: column + visibleWidth,
      });
      column += visibleWidth;
    }
    return {
      text: new StyledText(chunks),
      width: controlWidth,
      segments,
    };
  }

  static projectEditorFrameActions(
    options: PanelTabBarEditorFrameOptions,
  ): PanelTabBarEditorFrameProjection {
    const availableWidth = Math.max(0, Math.floor(options.width));
    const visibleActionCount = Math.min(
      options.editorActions.length,
      Math.floor(
        Math.max(0, availableWidth - this.EDITOR_FRAME_LEFT_PADDING_CELLS) /
          this.ACTION_CELL_WIDTH,
      ),
    );
    const chunks: TextChunk[] = [
      bg(options.palette.bg)(
        fg(options.frameBorderColor)(
          '─'.repeat(this.EDITOR_FRAME_LEFT_PADDING_CELLS),
        ),
      ),
    ];
    const editorActions: PanelTabBarEditorActionSegment[] = [];
    let column = this.EDITOR_FRAME_LEFT_PADDING_CELLS;
    for (const action of options.editorActions.slice(0, visibleActionCount)) {
      const text = `\u00a0${action.icon}\u00a0`;
      const hovered = action.commandId === options.hoveredCommandIdentifier;
      const colored = fg(
        action.toggled || hovered ? options.palette.accent : options.palette.fg,
      )(text);
      chunks.push(
        action.toggled
          ? bg(options.palette.selection)(colored)
          : hovered
            ? bg(options.palette.cursorLine)(colored)
            : bg(options.palette.bg)(colored),
      );
      editorActions.push({
        commandId: action.commandId,
        title: action.title,
        startColumn: column,
        endColumn: column + this.ACTION_CELL_WIDTH,
      });
      column += this.ACTION_CELL_WIDTH;
    }
    return {
      text: new StyledText(chunks),
      width: column,
      editorActions,
    };
  }

  protected static projectTabRow(
    options: PanelTabBarOptions,
    width: number,
  ): {
    text: StyledText;
    controlText: StyledText;
    tabsWidth: number;
    controlWidth: number;
    tabs: readonly PanelTabBarTabSegment[];
    closes: readonly PanelTabBarCloseSegment[];
    spaceAdd: PanelTabBarSpaceAddSegment | null;
    instancesToggle: PanelTabBarInstancesToggleSegment | null;
  } {
    const countText =
      options.paneCount > 1
        ? ` ${ThemeIcons.Class.smallDigitCountFor(
            options.glyphLevel,
            options.paneCount,
            'iconBadge',
          )}`
        : '';
    const addText = ` ${options.glyphVocabulary.panelAdd} Plugin `;
    const instancesText = ` ${options.glyphVocabulary.panelStack}${countText} `;
    const trailingPaddingText = ' ';
    const preferredControlText = `${addText}${instancesText}${trailingPaddingText}`;
    const controlWidth = Math.min(
      TextCoordinates.Class.lineWidth(preferredControlText),
      width,
    );
    const availableTabWidth = Math.max(0, width - controlWidth);
    const chunks: TextChunk[] = [];
    const tabs: PanelTabBarTabSegment[] = [];
    const closes: PanelTabBarCloseSegment[] = [];
    let column = 0;
    for (
      let spaceIndex = 0;
      spaceIndex < options.spaces.length;
      spaceIndex += 1
    ) {
      const space = options.spaces[spaceIndex];
      if (!space) continue;
      const remainingWidth = availableTabWidth - column;
      const remainingTabs = options.spaces.length - spaceIndex;
      if (remainingWidth < this.MINIMUM_TAB_WIDTH) break;
      const preferredWidth = TextCoordinates.Class.lineWidth(space.label) + 4;
      const allottedWidth = Math.min(
        preferredWidth,
        Math.max(
          this.MINIMUM_TAB_WIDTH,
          Math.floor(remainingWidth / remainingTabs),
        ),
      );
      const labelWidth = Math.max(1, allottedWidth - 4);
      const label = WrapText.Class.clipToWidth(space.label, labelWidth, '…');
      const labelPadding = ' '.repeat(
        Math.max(0, labelWidth - TextCoordinates.Class.lineWidth(label)),
      );
      const text = ` ${label}${labelPadding} ${options.glyphVocabulary.panelClose} `;
      const active = space.identifier === options.activeSpaceId;
      const hovered = space.identifier === options.hoveredTabIdentifier;
      const colored = fg(
        active && options.focused
          ? options.palette.accent
          : active
            ? options.palette.fg
            : options.palette.dim,
      )(text);
      chunks.push(
        active
          ? bg(options.palette.selection)(colored)
          : hovered
            ? bg(options.palette.cursorLine)(fg(options.palette.accent)(text))
            : colored,
      );
      const endColumn = column + allottedWidth;
      tabs.push({
        identifier: space.identifier,
        startColumn: column,
        endColumn,
      });
      closes.push({
        identifier: space.identifier,
        startColumn: endColumn - 2,
        endColumn: endColumn - 1,
      });
      column = endColumn;
    }
    const addWidth = Math.min(
      TextCoordinates.Class.lineWidth(addText),
      controlWidth,
    );
    const trailingPaddingWidth = Math.min(
      TextCoordinates.Class.lineWidth(trailingPaddingText),
      Math.max(0, controlWidth - addWidth),
    );
    const instancesWidth = Math.max(
      0,
      controlWidth - addWidth - trailingPaddingWidth,
    );
    const addVisibleText = TextCoordinates.Class.displayColumnWindow(
      addText,
      0,
      addWidth,
    );
    const instancesVisibleText = TextCoordinates.Class.displayColumnWindow(
      instancesText,
      Math.max(
        0,
        TextCoordinates.Class.lineWidth(instancesText) - instancesWidth,
      ),
      instancesWidth,
    );
    const addHovered = options.hoveredAction === 'pane-add';
    const instancesHovered = options.hoveredAction === 'pane-list';
    const addStartColumn = width - controlWidth;
    const instancesStartColumn = addStartColumn + addWidth;
    return {
      text: new StyledText(chunks),
      controlText: new StyledText([
        addHovered
          ? bg(options.palette.cursorLine)(
              fg(options.palette.accent)(addVisibleText),
            )
          : bg(options.palette.bg)(fg(options.palette.fg)(addVisibleText)),
        options.paneListExpanded
          ? bg(options.palette.selection)(
              fg(options.palette.accent)(instancesVisibleText),
            )
          : instancesHovered
            ? bg(options.palette.cursorLine)(
                fg(options.palette.accent)(instancesVisibleText),
              )
            : bg(options.palette.bg)(
                fg(options.palette.fg)(instancesVisibleText),
              ),
        bg(options.palette.bg)(trailingPaddingText),
      ]),
      tabsWidth: column,
      controlWidth,
      tabs,
      closes,
      spaceAdd:
        addWidth > 0
          ? {
              startColumn: addStartColumn,
              endColumn: instancesStartColumn,
              tooltip: 'Add Plugin',
            }
          : null,
      instancesToggle:
        instancesWidth > 0
          ? {
              startColumn: instancesStartColumn,
              endColumn: width - trailingPaddingWidth,
              tooltip: options.paneListExpanded
                ? 'Hide Instances'
                : 'Show Instances',
            }
          : null,
    };
  }

  static tabAtColumn(
    projection: PanelTabBarProjection,
    column: number,
  ): PanelTabBarTabSegment | null {
    return (
      projection.tabs.find(
        (tab) => column >= tab.startColumn && column < tab.endColumn,
      ) ?? null
    );
  }

  static tabCloseAtColumn(
    projection: PanelTabBarProjection,
    column: number,
  ): PanelTabBarCloseSegment | null {
    return (
      projection.tabCloses.find(
        (close) => column >= close.startColumn && column < close.endColumn,
      ) ?? null
    );
  }

  static spaceAddAtColumn(
    projection: PanelTabBarProjection,
    column: number,
  ): PanelTabBarSpaceAddSegment | null {
    const add = projection.spaceAdd;
    return add && column >= add.startColumn && column < add.endColumn
      ? add
      : null;
  }

  static instancesToggleAtColumn(
    projection: PanelTabBarProjection,
    column: number,
  ): PanelTabBarInstancesToggleSegment | null {
    const toggle = projection.instancesToggle;
    return toggle && column >= toggle.startColumn && column < toggle.endColumn
      ? toggle
      : null;
  }

  static controlAtColumn(
    projection: PanelTabBarProjection,
    column: number,
  ): PanelTabBarControlSegment | null {
    return (
      projection.controls.find(
        (control) =>
          column >= control.startColumn && column < control.endColumn,
      ) ?? null
    );
  }

  static editorActionAtColumn(
    projection: PanelTabBarEditorFrameProjection,
    column: number,
  ): PanelTabBarEditorActionSegment | null {
    return (
      projection.editorActions.find(
        (action) => column >= action.startColumn && column < action.endColumn,
      ) ?? null
    );
  }
}

export namespace PanelTabBar {
  export const $Class = Static($PanelTabBar);
  export let Class = $Class;
}

export type PanelTabBarAction = 'pane-list' | 'pane-add' | 'expand' | 'close';

export interface PanelTabBarOptions {
  readonly width: number;
  readonly spaces: readonly PanelSpace[];
  readonly activeSpaceId: string | null;
  readonly activeSpaceKind?: string | null;
  readonly paneCount: number;
  readonly paneListExpanded: boolean;
  readonly expanded: boolean;
  readonly focused: boolean;
  readonly hoveredTabIdentifier: string | null;
  readonly editorActions?: readonly PanelTabBarEditorAction[];
  readonly hoveredCommandIdentifier?: string | null;
  readonly hoveredAction: PanelTabBarAction | null;
  readonly glyphVocabulary: InterfaceGlyphVocabulary;
  readonly glyphLevel: GlyphLevel;
  readonly palette: Palette;
}

export interface PanelTabBarProjection {
  readonly splitterLeadingText: StyledText;
  readonly splitterControlText: StyledText;
  readonly tabText: StyledText;
  readonly tabControlText: StyledText;
  readonly tabsWidth: number;
  readonly actionWidth: number;
  readonly splitterLeadingWidth: number;
  readonly leadingWidth: number;
  readonly dragWidth: number;
  readonly dragLeadingPaintPadCells: number;
  readonly splitterControlWidth: number;
  /** Compatibility name for the splitter row's control width. */
  readonly controlWidth: number;
  readonly tabControlWidth: number;
  readonly tabs: readonly PanelTabBarTabSegment[];
  readonly tabCloses: readonly PanelTabBarCloseSegment[];
  readonly editorActions: readonly PanelTabBarEditorActionSegment[];
  readonly controls: readonly PanelTabBarControlSegment[];
  readonly spaceAdd: PanelTabBarSpaceAddSegment | null;
  readonly instancesToggle: PanelTabBarInstancesToggleSegment | null;
}

export interface PanelTabBarEditorFrameOptions {
  readonly width: number;
  readonly editorActions: readonly PanelTabBarEditorAction[];
  readonly hoveredCommandIdentifier: string | null;
  readonly palette: Palette;
  readonly frameBorderColor: string;
}

export interface PanelTabBarEditorFrameProjection {
  readonly text: StyledText;
  readonly width: number;
  readonly editorActions: readonly PanelTabBarEditorActionSegment[];
}

export interface PanelTabBarTabSegment {
  readonly identifier: string;
  readonly startColumn: number;
  readonly endColumn: number;
}

export interface PanelTabBarCloseSegment {
  readonly identifier: string;
  readonly startColumn: number;
  readonly endColumn: number;
}

export interface PanelTabBarSpaceAddSegment {
  readonly startColumn: number;
  readonly endColumn: number;
  readonly tooltip: string;
}

export interface PanelTabBarInstancesToggleSegment {
  readonly startColumn: number;
  readonly endColumn: number;
  readonly tooltip: string;
}

export interface PanelTabBarEditorAction {
  readonly commandId: string;
  readonly title: string;
  readonly icon: string;
  readonly toggled: boolean;
}

export interface PanelTabBarEditorActionSegment {
  readonly commandId: string;
  readonly title: string;
  readonly startColumn: number;
  readonly endColumn: number;
}

interface PanelTabBarControlDefinition {
  readonly action: PanelTabBarAction;
  readonly text: string;
  readonly tooltip: string;
}

export interface PanelTabBarControlSegment {
  readonly action: PanelTabBarAction;
  readonly tooltip: string;
  readonly startColumn: number;
  readonly endColumn: number;
}
