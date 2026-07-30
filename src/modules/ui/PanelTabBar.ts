import { StyledText, bg, fg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import type { InterfaceGlyphVocabulary } from '../theme/ThemeIcons';
import type { Palette } from '../theme/ThemePalettes';
import { TextCoordinates } from '../text/TextCoordinates';
import type { PanelSpace } from './PanelHost';

// invariant: Tab bars share paint and hit geometry (src/modules/ui/ui.invariants.md)
class $PanelTabBar {
  /**
   * One blank cell stands between the leading run (tabs then action icons) and the drag line's
   * first painted cell. It is a PAINT pad, never a layout quantity: `leadingWidth` and
   * `dragWidth` do not move, so the drag strip still grabs at the pad cell and across its whole
   * extent. The row order stays tabs, actions, pad, drag, controls.
   */
  static readonly DRAG_LEADING_PAINT_PAD_CELLS = 1;

  static project(options: PanelTabBarOptions): PanelTabBarProjection {
    const width = Math.max(0, Math.floor(options.width));
    const controlDefinitions: readonly PanelTabBarControlDefinition[] = [
      ...(options.paneCount > 2
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
      {
        action: 'add',
        text: ` ${options.glyphVocabulary.panelAdd} `,
        tooltip: 'Add content space',
      },
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
    const preferredControlWidth = controlDefinitions.reduce(
      (sum, control) => sum + TextCoordinates.Class.lineWidth(control.text),
      0,
    );
    const minimumDragWidth = Math.min(1, width);
    const controlWidth = Math.min(
      preferredControlWidth,
      Math.max(0, width - minimumDragWidth),
    );
    const availableLeadingWidth = Math.max(
      0,
      width - controlWidth - minimumDragWidth,
    );
    const leadingChunks: TextChunk[] = [];
    const tabs: PanelTabBarTabSegment[] = [];
    let column = 0;
    for (const space of options.spaces) {
      const remainingTabWidth = Math.max(0, availableLeadingWidth - column);
      if (remainingTabWidth === 0) break;
      const text = ` ${space.label} `;
      const visibleText = TextCoordinates.Class.displayColumnWindow(
        text,
        0,
        remainingTabWidth,
      );
      const visibleWidth = TextCoordinates.Class.lineWidth(visibleText);
      if (visibleWidth <= 0) break;
      const active = space.identifier === options.activeSpaceId;
      const hovered = space.identifier === options.hoveredTabIdentifier;
      const styled = fg(
        active && options.focused
          ? options.palette.accent
          : active
            ? options.palette.fg
            : options.palette.dim,
      )(visibleText);
      leadingChunks.push(
        active
          ? bg(options.palette.selection)(styled)
          : hovered
            ? bg(options.palette.cursorLine)(
                fg(options.palette.accent)(visibleText),
              )
            : styled,
      );
      tabs.push({
        identifier: space.identifier,
        startColumn: column,
        endColumn: column + visibleWidth,
      });
      column += visibleWidth;
    }
    const tabsWidth = column;
    const actionCellWidth = 3;
    const visibleActionCount = Math.min(
      options.editorActions.length,
      Math.floor(
        Math.max(0, availableLeadingWidth - tabsWidth) / actionCellWidth,
      ),
    );
    const editorActions: PanelTabBarEditorActionSegment[] = [];
    for (const action of options.editorActions.slice(0, visibleActionCount)) {
      const text = `\u00a0${action.icon}\u00a0`;
      const hovered = action.commandId === options.hoveredCommandIdentifier;
      const actionText = fg(
        action.toggled || hovered ? options.palette.accent : options.palette.fg,
      )(text);
      leadingChunks.push(
        action.toggled
          ? bg(options.palette.selection)(actionText)
          : hovered
            ? bg(options.palette.cursorLine)(actionText)
            : actionText,
      );
      editorActions.push({
        commandId: action.commandId,
        title: action.title,
        startColumn: column,
        endColumn: column + actionCellWidth,
      });
      column += actionCellWidth;
    }
    const actionWidth = editorActions.length * actionCellWidth;
    const leadingWidth = tabsWidth + actionWidth;
    const dragWidth = Math.max(0, width - leadingWidth - controlWidth);
    column = width - controlWidth;
    const controlChunks: TextChunk[] = [];
    const controls: PanelTabBarControlSegment[] = [];
    for (const control of controlDefinitions) {
      const remainingControlWidth = Math.max(0, width - column);
      if (remainingControlWidth === 0) break;
      const visibleText = TextCoordinates.Class.displayColumnWindow(
        control.text,
        0,
        remainingControlWidth,
      );
      const visibleWidth = TextCoordinates.Class.lineWidth(visibleText);
      if (visibleWidth <= 0) break;
      const hovered = control.action === options.hoveredAction;
      const active = control.action === 'pane-list' && options.paneListExpanded;
      controlChunks.push(
        hovered
          ? bg(options.palette.cursorLine)(
              fg(options.palette.accent)(visibleText),
            )
          : active
            ? bg(options.palette.selection)(
                fg(options.palette.accent)(visibleText),
              )
            : fg(options.palette.fg)(visibleText),
      );
      controls.push({
        action: control.action,
        tooltip: control.tooltip,
        startColumn: column,
        endColumn: column + visibleWidth,
      });
      column += visibleWidth;
    }
    return {
      leadingText: new StyledText(leadingChunks),
      controlText: new StyledText(controlChunks),
      tabsWidth,
      actionWidth,
      leadingWidth,
      dragWidth,
      dragLeadingPaintPadCells: Math.min(
        this.DRAG_LEADING_PAINT_PAD_CELLS,
        Math.max(0, dragWidth - 1),
      ),
      controlWidth,
      tabs,
      editorActions,
      controls,
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

export type PanelTabBarAction = 'pane-list' | 'add' | 'expand' | 'close';

export interface PanelTabBarOptions {
  readonly width: number;
  readonly spaces: readonly PanelSpace[];
  readonly activeSpaceId: string | null;
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
  readonly leadingText: StyledText;
  readonly controlText: StyledText;
  readonly tabsWidth: number;
  readonly actionWidth: number;
  readonly leadingWidth: number;
  readonly dragWidth: number;
  readonly dragLeadingPaintPadCells: number;
  readonly controlWidth: number;
  readonly tabs: readonly PanelTabBarTabSegment[];
  readonly editorActions: readonly PanelTabBarEditorActionSegment[];
  readonly controls: readonly PanelTabBarControlSegment[];
}

export interface PanelTabBarTabSegment {
  readonly identifier: string;
  readonly startColumn: number;
  readonly endColumn: number;
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

export interface PanelTabBarControlSegment {
  readonly action: PanelTabBarAction;
  readonly tooltip: string;
  readonly startColumn: number;
  readonly endColumn: number;
}

export interface PanelTabBarControlDefinition {
  readonly action: PanelTabBarAction;
  readonly text: string;
  readonly tooltip: string;
}
