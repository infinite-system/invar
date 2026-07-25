import { StyledText, bg, fg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import type { Palette } from '../theme/ThemePalettes';
import { EditorCoordinates } from '../editor/EditorCoordinates';

// invariant: Panel heading controls share paint and hit geometry (src/modules/ui/ui.invariants.md)
class $PanelHeading {
  static project(options: PanelHeadingOptions): PanelHeadingProjection {
    const width = Math.max(1, Math.floor(options.width));
    const controls: readonly PanelHeadingControlDefinition[] = [
      { action: 'add', text: ' + ' },
      {
        action: 'expand',
        text: options.expanded ? ' RESTORE ' : ' EXPAND ',
      },
      { action: 'close', text: ' X ' },
    ];
    const controlsWidth = controls.reduce(
      (totalWidth, control) =>
        totalWidth + EditorCoordinates.Class.lineWidth(control.text),
      0,
    );
    const titleWidth = Math.max(0, width - controlsWidth);
    const titleText = ` ${options.icon ? `${options.icon} ` : ''}${options.title}`;
    const clippedTitle = EditorCoordinates.Class.displayColumnWindow(
      titleText,
      0,
      titleWidth,
    );
    const paddedTitle = EditorCoordinates.Class.padToDisplayWidth(
      clippedTitle,
      titleWidth,
    );
    const chunks: TextChunk[] = [
      fg(options.focused ? options.palette.accent : options.palette.dim)(
        paddedTitle,
      ),
    ];
    const controlSegments: PanelHeadingControlSegment[] = [];
    let controlColumn = titleWidth;
    for (const control of controls) {
      const controlWidth = EditorCoordinates.Class.lineWidth(control.text);
      const visibleWidth = Math.max(
        0,
        Math.min(controlWidth, width - controlColumn),
      );
      if (visibleWidth <= 0) continue;
      const visibleText = EditorCoordinates.Class.displayColumnWindow(
        control.text,
        0,
        visibleWidth,
      );
      const active = control.action === 'expand' && options.expanded;
      chunks.push(
        active
          ? bg(options.palette.selection)(
              fg(options.palette.accent)(visibleText),
            )
          : fg(
              control.action === 'close'
                ? options.palette.error
                : options.palette.accent,
            )(visibleText),
      );
      controlSegments.push({
        action: control.action,
        startColumn: controlColumn,
        endColumn: controlColumn + visibleWidth,
      });
      controlColumn += visibleWidth;
    }
    return {
      text: new StyledText(chunks),
      controls: controlSegments,
    };
  }

  static controlAtColumn(
    projection: PanelHeadingProjection,
    column: number,
  ): PanelHeadingAction | null {
    return (
      projection.controls.find(
        (control) =>
          column >= control.startColumn && column < control.endColumn,
      )?.action ?? null
    );
  }
}

export namespace PanelHeading {
  export const $Class = $PanelHeading;
  export const Class = Static($Class);
}

export type PanelHeadingAction = 'add' | 'expand' | 'close';

export interface PanelHeadingOptions {
  width: number;
  title: string;
  icon?: string;
  focused: boolean;
  expanded: boolean;
  palette: Palette;
}

export interface PanelHeadingProjection {
  text: StyledText;
  controls: readonly PanelHeadingControlSegment[];
}

export interface PanelHeadingControlSegment {
  action: PanelHeadingAction;
  startColumn: number;
  endColumn: number;
}

export interface PanelHeadingControlDefinition {
  action: PanelHeadingAction;
  text: string;
}
