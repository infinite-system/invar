import { StyledText, bg, fg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import type { InterfaceGlyphVocabulary } from '../theme/ThemeIcons';
import type { Palette } from '../theme/ThemePalettes';
import { TextCoordinates } from '../text/TextCoordinates';
import type { PanelSpace } from './PanelHost';
import { WrapText } from './WrapText';

// invariant: Tab bars share paint and hit geometry (src/modules/ui/ui.invariants.md)
// invariant: Panel controls share paint and hit geometry (src/modules/ui/ui.invariants.md)
class $PanelTabBar {
  static readonly DRAG_LEADING_PAINT_PAD_CELLS = 1;
  protected static readonly ACTION_CELL_WIDTH = 3;
  protected static readonly SPACE_ADD_WIDTH = 3;
  protected static readonly MINIMUM_TAB_WIDTH = 4;

  static project(options: PanelTabBarOptions): PanelTabBarProjection {
    const width = Math.max(0, Math.floor(options.width));
    const splitterControls = this.projectSplitterControls(options, width);
    const splitter = this.projectSplitterLeading(
      options,
      width - splitterControls.width,
    );
    const tabRow = this.projectTabRow(options, width);
    return {
      splitterLeadingText: splitter.text,
      splitterControlText: splitterControls.text,
      tabText: tabRow.text,
      tabControlText: tabRow.controlText,
      tabsWidth: tabRow.tabsWidth,
      actionWidth: splitter.actionWidth,
      splitterLeadingWidth: splitter.leadingWidth,
      leadingWidth: splitter.leadingWidth,
      dragWidth: splitter.dragWidth,
      dragLeadingPaintPadCells: Math.min(
        this.DRAG_LEADING_PAINT_PAD_CELLS,
        Math.max(0, splitter.dragWidth - 1),
      ),
      splitterControlWidth: splitterControls.width,
      controlWidth: splitterControls.width,
      tabControlWidth: tabRow.controlWidth,
      tabs: tabRow.tabs,
      tabCloses: tabRow.closes,
      editorActions: splitter.editorActions,
      controls: splitterControls.segments,
      spaceAdd: tabRow.spaceAdd,
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
      ...(options.paneCount > 1
        ? [
            {
              action: 'pane-list' as const,
              text: ` ${options.glyphVocabulary.panelStack} ${options.paneCount} `,
              tooltip: options.paneListExpanded
                ? 'Hide pane list'
                : 'Show pane list',
            },
          ]
        : []),
      ...((options.activeSpaceKind ??
        options.spaces.find(
          (space) => space.identifier === options.activeSpaceId,
        )?.kind) === 'terminal'
        ? [
            {
              action: 'pane-add' as const,
              text: ` ${options.glyphVocabulary.panelAdd} `,
              tooltip: 'Add window',
            },
          ]
        : []),
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
      const active =
        definition.action === 'pane-list' && options.paneListExpanded;
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

  protected static projectSplitterLeading(
    options: PanelTabBarOptions,
    availableWidth: number,
  ): {
    text: StyledText;
    actionWidth: number;
    leadingWidth: number;
    dragWidth: number;
    editorActions: readonly PanelTabBarEditorActionSegment[];
  } {
    const minimumDragWidth = Math.min(1, availableWidth);
    const visibleActionCount = Math.min(
      options.editorActions.length,
      Math.floor(
        Math.max(0, availableWidth - minimumDragWidth) / this.ACTION_CELL_WIDTH,
      ),
    );
    const chunks: TextChunk[] = [];
    const editorActions: PanelTabBarEditorActionSegment[] = [];
    let column = 0;
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
            : colored,
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
      actionWidth: column,
      leadingWidth: column,
      dragWidth: Math.max(0, availableWidth - column),
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
  } {
    const controlWidth = Math.min(this.SPACE_ADD_WIDTH, width);
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
      const preferredWidth = TextCoordinates.Class.lineWidth(space.label) + 3;
      const allottedWidth = Math.min(
        preferredWidth,
        Math.max(
          this.MINIMUM_TAB_WIDTH,
          Math.floor(remainingWidth / remainingTabs),
        ),
      );
      const labelWidth = Math.max(1, allottedWidth - 3);
      const label = WrapText.Class.clipToWidth(space.label, labelWidth, '…');
      const labelPadding = ' '.repeat(
        Math.max(0, labelWidth - TextCoordinates.Class.lineWidth(label)),
      );
      const text = ` ${label}${labelPadding} ${options.glyphVocabulary.panelClose}`;
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
        startColumn: endColumn - 1,
        endColumn,
      });
      column = endColumn;
    }
    const addStartColumn = width - controlWidth;
    const addText = TextCoordinates.Class.displayColumnWindow(
      ` ${options.glyphVocabulary.panelAdd} `,
      0,
      controlWidth,
    );
    return {
      text: new StyledText(chunks),
      controlText: new StyledText([fg(options.palette.fg)(addText)]),
      tabsWidth: column,
      controlWidth,
      tabs,
      closes,
      spaceAdd:
        controlWidth > 0
          ? {
              startColumn: addStartColumn,
              endColumn: width,
              tooltip: 'Add content container',
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
    projection: PanelTabBarProjection,
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
  readonly editorActions: readonly PanelTabBarEditorAction[];
  readonly hoveredCommandIdentifier: string | null;
  readonly hoveredAction: PanelTabBarAction | null;
  readonly glyphVocabulary: InterfaceGlyphVocabulary;
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
  /** Compatibility name for the splitter row's leading width. */
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
