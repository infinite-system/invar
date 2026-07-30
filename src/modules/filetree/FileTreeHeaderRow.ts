import { StyledText, bg, fg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import { TextCoordinates } from '../text/TextCoordinates';
import type { Palette } from '../theme/ThemePalettes';

class $FileTreeHeaderRow {
  static project(options: FileTreeHeaderRowOptions): FileTreeHeaderProjection {
    const width = Math.max(1, Math.floor(options.width));
    const visibleButtons: FileTreeHeaderButtonSegment[] = [];
    let leadingWidth = width;
    for (
      let buttonIndex = options.buttons.length - 1;
      buttonIndex >= 0;
      buttonIndex--
    ) {
      const button = options.buttons[buttonIndex];
      if (!button) continue;
      const text = `\u00a0${button.glyph}\u00a0`;
      const buttonWidth = TextCoordinates.Class.lineWidth(text);
      if (buttonWidth > leadingWidth) continue;
      leadingWidth -= buttonWidth;
      visibleButtons.unshift({
        action: button.action,
        glyph: button.glyph,
        tooltip: button.tooltip,
        text,
        startColumn: leadingWidth,
        endColumn: leadingWidth + buttonWidth,
      });
    }

    const chunks: TextChunk[] = [
      fg(options.palette.dim)(' '.repeat(leadingWidth)),
    ];
    for (const button of visibleButtons) {
      const buttonText = fg(options.palette.accent)(button.text);
      chunks.push(
        button.action === options.hoveredAction
          ? bg(options.palette.cursorLine)(buttonText)
          : buttonText,
      );
    }
    return {
      text: new StyledText(chunks),
      buttons: visibleButtons,
    };
  }

  static buttonAtColumn(
    projection: FileTreeHeaderProjection,
    column: number,
  ): FileTreeHeaderButtonSegment | null {
    return (
      projection.buttons.find(
        (button) => column >= button.startColumn && column < button.endColumn,
      ) ?? null
    );
  }
}

export namespace FileTreeHeaderRow {
  export const $Class = Static($FileTreeHeaderRow);
  export let Class = $Class;
}

export interface FileTreeHeaderRowOptions {
  width: number;
  buttons: readonly FileTreeHeaderButton[];
  hoveredAction: string | null;
  palette: Palette;
}

export interface FileTreeHeaderButton {
  action: string;
  glyph: string;
  tooltip: string;
}

export interface FileTreeHeaderProjection {
  text: StyledText;
  buttons: readonly FileTreeHeaderButtonSegment[];
}

export interface FileTreeHeaderButtonSegment extends FileTreeHeaderButton {
  text: string;
  startColumn: number;
  endColumn: number;
}
