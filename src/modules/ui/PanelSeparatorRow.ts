import { StyledText, bg, fg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import type { Palette } from '../theme/ThemePalettes';
import type { InterfaceGlyphVocabulary } from '../theme/ThemeIcons';
import {
  PanelHeading,
  type PanelHeadingAction,
  type PanelHeadingProjection,
} from './PanelHeading';

// invariant: Panel controls share paint and hit geometry (src/modules/ui/ui.invariants.md)
class $PanelSeparatorRow {
  static project(options: PanelSeparatorRowOptions): PanelSeparatorProjection {
    const width = Math.max(0, Math.floor(options.width));
    const preferredControlWidth = 10;
    const minimumDragWidth = Math.min(1, width);
    const controlWidth = Math.min(
      preferredControlWidth,
      Math.max(0, width - minimumDragWidth),
    );
    const availableActionWidth = Math.max(
      0,
      width - controlWidth - minimumDragWidth,
    );
    const actionCellWidth = 3;
    const visibleActionCount = Math.min(
      options.editorActions.length,
      Math.floor(availableActionWidth / actionCellWidth),
    );
    const visibleActions = options.editorActions.slice(0, visibleActionCount);
    const actionWidth = visibleActions.length * actionCellWidth;
    const dragWidth = Math.max(0, width - actionWidth - controlWidth);
    const actionChunks: TextChunk[] = [];
    const actionSegments: PanelSeparatorActionSegment[] = [];
    let actionColumn = 0;
    for (const action of visibleActions) {
      const text = `\u00a0${action.icon}\u00a0`;
      const hovered = action.commandId === options.hoveredCommandId;
      const actionText = fg(
        action.toggled || hovered ? options.palette.accent : options.palette.fg,
      )(text);
      actionChunks.push(
        action.toggled
          ? bg(options.palette.selection)(actionText)
          : hovered
            ? bg(options.palette.cursorLine)(actionText)
            : actionText,
      );
      actionSegments.push({
        commandId: action.commandId,
        title: action.title,
        startColumn: actionColumn,
        endColumn: actionColumn + actionCellWidth,
      });
      actionColumn += actionCellWidth;
    }
    const controlProjection =
      controlWidth > 0
        ? PanelHeading.Class.project({
            width: controlWidth,
            title: '',
            focused: options.panelFocused,
            expanded: options.panelExpanded,
            hoveredAction: options.hoveredPanelAction,
            actions: ['add', 'expand', 'close'],
            trailingPaddingWidth:
              controlWidth === preferredControlWidth ? 1 : 0,
            glyphVocabulary: options.glyphVocabulary,
            palette: options.palette,
          })
        : null;
    return {
      actionText: new StyledText(actionChunks),
      actionSegments,
      actionWidth,
      dragStartColumn: actionWidth,
      dragWidth,
      controlStartColumn: actionWidth + dragWidth,
      controlWidth,
      controlProjection,
    };
  }

  static actionSegmentAtColumn(
    projection: PanelSeparatorProjection,
    column: number,
  ): PanelSeparatorActionSegment | null {
    return (
      projection.actionSegments.find(
        (action) => column >= action.startColumn && column < action.endColumn,
      ) ?? null
    );
  }
}

export namespace PanelSeparatorRow {
  export const $Class = Static($PanelSeparatorRow);
  export let Class = $Class;
}

export interface PanelSeparatorEditorAction {
  readonly commandId: string;
  readonly title: string;
  readonly icon: string;
  readonly toggled: boolean;
}

export interface PanelSeparatorRowOptions {
  readonly width: number;
  readonly editorActions: readonly PanelSeparatorEditorAction[];
  readonly hoveredCommandId: string | null;
  readonly hoveredPanelAction: PanelHeadingAction | null;
  readonly panelFocused: boolean;
  readonly panelExpanded: boolean;
  readonly glyphVocabulary: InterfaceGlyphVocabulary;
  readonly palette: Palette;
}

export interface PanelSeparatorProjection {
  readonly actionText: StyledText;
  readonly actionSegments: readonly PanelSeparatorActionSegment[];
  readonly actionWidth: number;
  readonly dragStartColumn: number;
  readonly dragWidth: number;
  readonly controlStartColumn: number;
  readonly controlWidth: number;
  readonly controlProjection: PanelHeadingProjection | null;
}

export interface PanelSeparatorActionSegment {
  readonly commandId: string;
  readonly title: string;
  readonly startColumn: number;
  readonly endColumn: number;
}
