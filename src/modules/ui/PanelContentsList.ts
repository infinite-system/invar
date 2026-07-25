import { StyledText, bg, fg, type TextChunk } from '@opentui/core';
import { Reactive } from 'ivue';
import type { Palette } from '../theme/ThemePalettes';
import type { PanelHost } from './PanelHost';
import { WrapText } from './WrapText';

// invariant: Panel content order is one persisted sequence (src/modules/ui/ui.invariants.md)
// invariant: The panel contents list mirrors open content (src/modules/ui/ui.invariants.md)
class $PanelContentsList {
  protected static get minimumWidth(): number {
    return 16;
  }

  protected static get maximumWidth(): number {
    return 24;
  }

  protected draggingIdentifier: string | null = null;

  constructor(protected readonly panelHost: PanelHost.Instance) {}

  get visible(): boolean {
    return this.panelHost.panelListVisible;
  }

  get rows(): PanelContentsListRow[] {
    const focusedIdentifier = this.panelHost.focusedContent?.id;
    return this.panelHost.resolvedCells.map((cell) => ({
      identifier: cell.content.id,
      icon: cell.content.icon ?? ' ',
      title: cell.content.title,
      active: cell.content.id === focusedIdentifier,
    }));
  }

  get width(): number {
    const longestLabel = this.rows.reduce(
      (length, row) =>
        Math.max(
          length,
          WrapText.Class.displayWidth(`│ ${row.icon} ${row.title} x`),
        ),
      0,
    );
    return Math.max(
      $PanelContentsList.minimumWidth,
      Math.min($PanelContentsList.maximumWidth, longestLabel),
    );
  }

  render(palette: Palette): StyledText {
    const chunks: TextChunk[] = [];
    const rows = this.rows;
    rows.forEach((row, rowIndex) => {
      const prefix = `│ ${row.icon} `;
      const titleColumns = Math.max(
        1,
        this.width - WrapText.Class.displayWidth(prefix) - 2,
      );
      const clippedTitle = WrapText.Class.clipToWidth(
        row.title,
        titleColumns,
        '',
      );
      const padding = ' '.repeat(
        Math.max(0, titleColumns - WrapText.Class.displayWidth(clippedTitle)),
      );
      const rowText = `${prefix}${clippedTitle}${padding} x`;
      const color = row.active ? palette.accent : palette.fg;
      chunks.push(
        row.active
          ? bg(palette.selection)(fg(color)(rowText))
          : fg(color)(rowText),
      );
      if (rowIndex < rows.length - 1) chunks.push(fg(palette.fg)('\n'));
    });
    return new StyledText(chunks);
  }

  pointerDown(localColumn: number, localRow: number): boolean {
    const row = this.rows[localRow];
    if (!row) return false;
    this.draggingIdentifier = row.identifier;
    if (localColumn >= this.width - 2) {
      this.panelHost.closeOpenContent(row.identifier);
      this.draggingIdentifier = null;
      return true;
    }
    this.panelHost.activateOpenContent(row.identifier);
    return true;
  }

  pointerDrag(localRow: number): boolean {
    if (this.draggingIdentifier === null) return false;
    const targetIndex = Math.max(0, Math.min(localRow, this.rows.length - 1));
    this.panelHost.moveOpenContentTo(this.draggingIdentifier, targetIndex);
    return true;
  }

  pointerUp(): void {
    this.draggingIdentifier = null;
  }
}

export namespace PanelContentsList {
  export const $Class = $PanelContentsList;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface PanelContentsListRow {
  readonly identifier: string;
  readonly icon: string;
  readonly title: string;
  readonly active: boolean;
}
