import { StyledText, bg, fg, type TextChunk } from '@opentui/core';
import { Reactive } from 'ivue';
import type { Palette } from '../theme/ThemePalettes';
import { ContentOrderDrag } from './ContentOrderDrag';
import type { PanelHost } from './PanelHost';
import { WrapText } from './WrapText';

// invariant: Panel content order is one persisted sequence (src/modules/ui/ui.invariants.md)
// invariant: The panel contents list mirrors open content (src/modules/ui/ui.invariants.md)
class $PanelContentsList {
  protected static get MINIMUM_WIDTH(): number {
    return 16;
  }

  protected static get MAXIMUM_WIDTH(): number {
    return 24;
  }

  protected readonly contentOrderDrag: ContentOrderDrag.Model;

  constructor(protected readonly panelHost: PanelHost.Instance) {
    this.contentOrderDrag = new ContentOrderDrag.Class(panelHost);
  }

  get visible(): boolean {
    return this.panelHost.panelListVisible;
  }

  get rows(): PanelContentsListRow[] {
    const focusedIdentifier = this.panelHost.focusedContent?.id;
    return this.panelHost.orderedContents.map((content) => ({
      identifier: content.id,
      icon: content.icon ?? ' ',
      title: content.instanceLabel ?? content.title,
      visible: this.panelHost.isContentVisible(content.id),
      active: content.id === focusedIdentifier,
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
      $PanelContentsList.MINIMUM_WIDTH,
      Math.min($PanelContentsList.MAXIMUM_WIDTH, longestLabel),
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
      const color = row.active
        ? palette.accent
        : row.visible
          ? palette.fg
          : palette.dim;
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
    this.contentOrderDrag.pointerDown(row.identifier);
    if (localColumn >= this.width - 2) {
      this.panelHost.closeOpenContent(row.identifier);
      this.contentOrderDrag.pointerUp();
      return true;
    }
    this.panelHost.activateOpenContent(row.identifier);
    return true;
  }

  pointerDrag(localRow: number): boolean {
    const targetIndex = Math.max(0, Math.min(localRow, this.rows.length - 1));
    return this.contentOrderDrag.pointerDrag(targetIndex);
  }

  pointerUp(): void {
    this.contentOrderDrag.pointerUp();
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
  readonly visible: boolean;
  readonly active: boolean;
}
