import { StyledText, bg, fg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import type { Palette } from '../theme/ThemePalettes';
import type { GlyphSlot, InterfaceGlyphVocabulary } from '../theme/ThemeIcons';
import { EditorCoordinates } from '../editor/EditorCoordinates';

// invariant: Panel heading controls share paint and hit geometry (src/modules/ui/ui.invariants.md)
class $PanelHeading {
  static project(options: PanelHeadingOptions): PanelHeadingProjection {
    const width = Math.max(1, Math.floor(options.width));
    const controlSlots: readonly Omit<PanelHeadingControlDefinition, 'text'>[] =
      [
        { action: 'add', glyphSlot: 'panelAdd', tooltip: 'Add panel' },
        {
          action: 'expand',
          glyphSlot: options.expanded ? 'panelRestore' : 'panelExpand',
          tooltip: options.expanded ? 'Restore panel' : 'Expand panel',
        },
        { action: 'close', glyphSlot: 'panelClose', tooltip: 'Close panel' },
      ];
    const controls: readonly PanelHeadingControlDefinition[] = controlSlots.map(
      (control) => ({
        ...control,
        text: ` ${options.glyphVocabulary[control.glyphSlot]} `,
      }),
    );
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
      const hovered = control.action === options.hoveredAction;
      const controlText = fg(
        control.action === 'close'
          ? options.palette.fg
          : options.palette.accent,
      )(visibleText);
      chunks.push(
        hovered
          ? bg(options.palette.cursorLine)(
              fg(options.palette.accent)(visibleText),
            )
          : active
            ? bg(options.palette.selection)(
                fg(options.palette.accent)(visibleText),
              )
            : controlText,
      );
      controlSegments.push({
        action: control.action,
        tooltip: control.tooltip,
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

  static controlSegmentAtColumn(
    projection: PanelHeadingProjection,
    column: number,
  ): PanelHeadingControlSegment | null {
    return (
      projection.controls.find(
        (control) =>
          column >= control.startColumn && column < control.endColumn,
      ) ?? null
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
  hoveredAction: PanelHeadingAction | null;
  glyphVocabulary: InterfaceGlyphVocabulary;
  palette: Palette;
}

export interface PanelHeadingProjection {
  text: StyledText;
  controls: readonly PanelHeadingControlSegment[];
}

export interface PanelHeadingControlSegment {
  action: PanelHeadingAction;
  tooltip: string;
  startColumn: number;
  endColumn: number;
}

export interface PanelHeadingControlDefinition {
  action: PanelHeadingAction;
  glyphSlot: Extract<
    GlyphSlot,
    'panelAdd' | 'panelExpand' | 'panelRestore' | 'panelClose'
  >;
  tooltip: string;
  text: string;
}
