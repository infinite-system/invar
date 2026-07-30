import { Static } from 'ivue/extras';
import { StyledText, bg, fg, type TextChunk } from '@opentui/core';
import { Reactive } from 'ivue';
import type { InterfaceGlyphVocabulary } from '../theme/ThemeIcons';
import type { Palette } from '../theme/ThemePalettes';
import type { PanelHost } from './PanelHost';
import { WrapText } from './WrapText';

// invariant: Panel content order is one persisted sequence (src/modules/ui/ui.invariants.md)
// invariant: The panel contents list mirrors open content (src/modules/ui/ui.invariants.md)
class $PanelContentsList {
  protected static readonly MINIMUM_WIDTH = 10;
  protected static readonly MAXIMUM_WIDTH = 40;
  protected draggingRow: PanelContentsListRow | null = null;

  constructor(
    protected readonly panelHost: PanelHost.Instance,
    protected readonly requestSplit: (
      targetIdentifier: string,
      anchor: { column: number; row: number },
    ) => void = () => {},
  ) {}

  get visible(): boolean {
    return this.panelHost.panelListVisible;
  }

  get rows(): PanelContentsListRow[] {
    const focusedIdentifier = this.panelHost.focusedContent?.id;
    return this.panelHost.panelGroups().flatMap((group, groupIndex) =>
      group.contentIds.flatMap((identifier, memberIndex) => {
        const content = this.panelHost.content(identifier);
        return content
          ? [
              {
                identifier,
                groupIdentifier: group.identifier,
                groupIndex,
                memberIndex,
                memberCount: group.contentIds.length,
                icon: content.icon ?? ' ',
                title: content.instanceLabel ?? content.title,
                visible: this.panelHost.isContentVisible(identifier),
                active: identifier === focusedIdentifier,
              },
            ]
          : [];
      }),
    );
  }

  get width(): number {
    return Math.max(
      $PanelContentsList.MINIMUM_WIDTH,
      Math.min(
        $PanelContentsList.MAXIMUM_WIDTH,
        Math.round(this.panelHost.panelListWidth.value),
      ),
    );
  }

  setWidth(width: number): void {
    this.panelHost.panelListWidth.value = Math.max(
      $PanelContentsList.MINIMUM_WIDTH,
      Math.min($PanelContentsList.MAXIMUM_WIDTH, Math.round(width)),
    );
  }

  render(
    palette: Palette,
    glyphVocabulary: InterfaceGlyphVocabulary,
  ): StyledText {
    const chunks: TextChunk[] = [];
    const rows = this.rows;
    rows.forEach((row, rowIndex) => {
      const asciiOnly = glyphVocabulary.panelStack === '#';
      const groupMark =
        row.memberCount === 1
          ? ' '
          : row.memberIndex === row.memberCount - 1
            ? asciiOnly
              ? '\\'
              : '└'
            : asciiOnly
              ? '+'
              : '├';
      const prefix = `│${groupMark}${row.icon} `;
      const suffix = ` ${glyphVocabulary.panelStack} ${glyphVocabulary.panelClose}`;
      const titleColumns = Math.max(
        1,
        this.width -
          WrapText.Class.displayWidth(prefix) -
          WrapText.Class.displayWidth(suffix),
      );
      const clippedTitle = WrapText.Class.clipToWidth(
        row.title,
        titleColumns,
        '…',
      );
      const padding = ' '.repeat(
        Math.max(0, titleColumns - WrapText.Class.displayWidth(clippedTitle)),
      );
      const rowText = `${prefix}${clippedTitle}${padding}${suffix}`;
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

  pointerDown(
    localColumn: number,
    localRow: number,
    screenColumn = localColumn,
    screenRow = localRow,
  ): boolean {
    const row = this.rows[localRow];
    if (!row) return false;
    this.draggingRow = row;
    if (localColumn >= this.width - 1) {
      this.panelHost.closeOpenContent(row.identifier);
      this.draggingRow = null;
      return true;
    }
    if (localColumn >= this.width - 3) {
      this.requestSplit(row.identifier, {
        column: screenColumn,
        row: screenRow,
      });
      this.draggingRow = null;
      return true;
    }
    this.panelHost.activateOpenContent(row.identifier);
    return true;
  }

  pointerDrag(localColumn: number, localRow?: number): boolean {
    const resolvedRow = localRow ?? localColumn;
    const resolvedColumn = localRow === undefined ? this.width : localColumn;
    const source = this.draggingRow;
    const target =
      this.rows[Math.max(0, Math.min(resolvedRow, this.rows.length - 1))];
    if (!source || !target) return false;
    if (source.memberCount > 1 && resolvedColumn <= 2) {
      return this.panelHost.detachGroupMember(
        source.identifier,
        target.groupIndex,
      );
    }
    if (source.groupIdentifier === target.groupIdentifier) {
      return this.panelHost.moveGroupMember(
        source.identifier,
        target.memberIndex,
      );
    }
    return this.panelHost.moveGroup(source.groupIdentifier, target.groupIndex);
  }

  pointerUp(): void {
    this.draggingRow = null;
  }
}

export namespace PanelContentsList {
  export const $Class = Static($PanelContentsList);
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface PanelContentsListRow {
  readonly identifier: string;
  readonly groupIdentifier: string;
  readonly groupIndex: number;
  readonly memberIndex: number;
  readonly memberCount: number;
  readonly icon: string;
  readonly title: string;
  readonly visible: boolean;
  readonly active: boolean;
}
