import { StyledText, bg, fg, type TextChunk } from '@opentui/core';
import { Reactive } from 'ivue';
import type { InterfaceGlyphVocabulary } from '../theme/ThemeIcons';
import type { Palette } from '../theme/ThemePalettes';
import type { PanelHost } from './PanelHost';
import { WrapText } from './WrapText';

// invariant: Panel content order is one persisted sequence (src/modules/ui/ui.invariants.md)
// invariant: The panel contents list mirrors open content (src/modules/ui/ui.invariants.md)
class $PanelContentsList {
  protected readonly minimumWidth = 10;
  protected readonly maximumWidth = 40;
  protected draggingRow: PanelContentsListRow | null = null;
  protected hoveredRowIndex = -1;
  protected hoveredAction: 'split' | 'close' | null = null;

  constructor(
    protected readonly panelHost: PanelHost.Instance,
    protected readonly requestSplit: (
      targetIdentifier: string,
      anchor: { column: number; row: number },
    ) => void = () => {},
    protected readonly requestAdd: (anchor: {
      column: number;
      row: number;
    }) => void = () => {},
  ) {}

  protected get headerLabel(): string {
    return this.panelHost.activeSpace?.kind === 'database'
      ? 'Database'
      : 'Terminal';
  }

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
      this.minimumWidth,
      Math.min(
        this.maximumWidth,
        Math.round(this.panelHost.panelListWidth.value),
      ),
    );
  }

  setWidth(width: number): void {
    this.panelHost.panelListWidth.value = Math.max(
      this.minimumWidth,
      Math.min(this.maximumWidth, Math.round(width)),
    );
  }

  render(
    palette: Palette,
    glyphVocabulary: InterfaceGlyphVocabulary,
  ): StyledText {
    const rows = this.rows;
    // invariant: The add control keeps one button appearance (src/modules/ui/ui.invariants.md)
    // ONE control in ONE form, whether or not the list has rows. An emptied list
    // used to swap this button for the bare words "Add Terminal", which reads as a
    // label: the user could not tell the only way back was clickable.
    const headerText = `+ ${this.headerLabel} ▾`;
    const headerBody = WrapText.Class.clipToWidth(headerText, this.width, '…');
    const headerPadding = ' '.repeat(
      Math.max(0, this.width - WrapText.Class.displayWidth(headerBody)),
    );
    const chunks: TextChunk[] = [
      // A full-width bar in the accent tone on the selection ground: it reads as
      // a control rather than as text that happens to start with a plus. The bar
      // starts at the list's own first column, so every row control below it
      // keeps its column arithmetic — a leading pad here shifts the whole list.
      bg(palette.selection)(
        fg(palette.accent)(`${headerBody}${headerPadding}`),
      ),
      fg(palette.fg)('\n\n'),
    ];
    rows.forEach((row, rowIndex) => {
      const groupMark =
        row.memberCount === 1
          ? ' '
          : row.memberIndex === 0
            ? glyphVocabulary.panelConnectorFirst
            : row.memberIndex === row.memberCount - 1
              ? glyphVocabulary.panelConnectorLast
              : glyphVocabulary.panelConnectorMiddle;
      const prefix = row.memberCount === 1 ? ' ' : `${groupMark} `;
      const controlsVisible = rowIndex === this.hoveredRowIndex;
      const controlsWidth = 6;
      const titleColumns = Math.max(
        1,
        this.width - WrapText.Class.displayWidth(prefix) - controlsWidth,
      );
      const clippedTitle = WrapText.Class.clipToWidth(
        row.title,
        titleColumns,
        '…',
      );
      const padding = ' '.repeat(
        Math.max(0, titleColumns - WrapText.Class.displayWidth(clippedTitle)),
      );
      const rowText = `${prefix}${clippedTitle}${padding}`;
      const color = row.active
        ? palette.accent
        : row.visible
          ? palette.fg
          : palette.dim;
      const rowChunk = row.active
        ? bg(palette.selection)(fg(color)(rowText))
        : fg(color)(rowText);
      chunks.push(rowChunk);
      if (controlsVisible) {
        const splitText = ` ${glyphVocabulary.panelSplit} `;
        const closeText = ` ${glyphVocabulary.panelClose} `;
        chunks.push(
          this.hoveredAction === 'split'
            ? bg(palette.cursorLine)(fg(palette.accent)(splitText))
            : fg(color)(splitText),
          this.hoveredAction === 'close'
            ? bg(palette.cursorLine)(fg(palette.accent)(closeText))
            : fg(color)(closeText),
        );
      } else {
        chunks.push(fg(color)(' '.repeat(controlsWidth)));
      }
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
    if (localRow === 0) {
      this.requestAdd({ column: screenColumn, row: screenRow });
      return true;
    }
    const row = this.rows[localRow - 2];
    if (!row) return false;
    this.draggingRow = row;
    if (localColumn >= this.width - 3) {
      this.panelHost.closeOpenContent(row.identifier);
      this.draggingRow = null;
      return true;
    }
    if (localColumn >= this.width - 6) {
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

  pointerMove(localColumn: number, localRow: number): boolean {
    const nextRowIndex = this.rows[localRow - 2] ? localRow - 2 : -1;
    const nextAction =
      nextRowIndex < 0
        ? null
        : localColumn >= this.width - 3
          ? 'close'
          : localColumn >= this.width - 6
            ? 'split'
            : null;
    const changed =
      nextRowIndex !== this.hoveredRowIndex ||
      nextAction !== this.hoveredAction;
    this.hoveredRowIndex = nextRowIndex;
    this.hoveredAction = nextAction;
    return changed;
  }

  pointerOut(): void {
    this.hoveredRowIndex = -1;
    this.hoveredAction = null;
  }

  tooltipAt(localColumn: number, localRow: number): string | null {
    if (localRow === 0) return `Add ${this.headerLabel} instance`;
    if (!this.rows[localRow - 2]) return null;
    return localColumn >= this.width - 3
      ? 'Close instance'
      : localColumn >= this.width - 6
        ? 'Split instance'
        : null;
  }

  pointerDrag(localColumn: number, localRow?: number): boolean {
    const resolvedRow = localRow ?? localColumn;
    const resolvedColumn = localRow === undefined ? this.width : localColumn;
    const source = this.draggingRow;
    const target =
      this.rows[Math.max(0, Math.min(resolvedRow - 2, this.rows.length - 1))];
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
  export const $Class = $PanelContentsList;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface PanelContentsListRow {
  readonly identifier: string;
  readonly groupIdentifier: string;
  readonly groupIndex: number;
  readonly memberIndex: number;
  readonly memberCount: number;
  readonly title: string;
  readonly visible: boolean;
  readonly active: boolean;
}
