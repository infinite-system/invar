import { StyledText, bg, fg, type TextChunk } from '@opentui/core';
import { Reactive } from 'ivue';
import type { InterfaceGlyphVocabulary } from '../theme/ThemeIcons';
import type { Palette } from '../theme/ThemePalettes';
import type { PanelHost } from './PanelHost';
import { WrapText } from './WrapText';

// invariant: Panel content order is one persisted sequence (src/modules/ui/ui.invariants.md)
// invariant: The panel contents list mirrors open content (src/modules/ui/ui.invariants.md)
class $PanelContentsList {
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
    protected readonly requestOpenTask: (identifier: string) => void = () => {},
  ) {}

  protected readonly minimumWidth = 10;
  protected readonly maximumWidth = 40;
  protected draggingRow: PanelContentsListRow | null = null;
  protected hoveredRowIndex = -1;
  protected hoveredAction: PanelContentsListAction | null = null;
  protected headerHovered = false;
  protected headerPressed = false;

  protected get headerLabel(): string {
    const activeSpace = this.panelHost.activeSpace;
    return activeSpace ? this.panelHost.spaceLabel(activeSpace.kind) : 'Panel';
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
                hasTaskSource:
                  content.task?.sourcePath !== null &&
                  content.task !== undefined,
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
    taskRecordGlyph: string,
  ): StyledText {
    const rows = this.rows;
    // invariant: The add control keeps one button appearance (src/modules/ui/ui.invariants.md)
    // ONE control in ONE form, whether or not the list has rows. An emptied list
    // used to swap this button for the bare words "Add Terminal", which reads as a
    // label: the user could not tell the only way back was clickable.
    const headerText = ` + ${this.headerLabel} ▾`;
    const headerBody = WrapText.Class.clipToWidth(headerText, this.width, '…');
    const headerPadding = ' '.repeat(
      Math.max(0, this.width - WrapText.Class.displayWidth(headerBody)),
    );
    const headerColor =
      this.headerHovered || this.headerPressed ? palette.accent : palette.fg;
    const headerChunk = fg(headerColor)(`${headerBody}${headerPadding}`);
    const chunks: TextChunk[] = [
      this.headerPressed
        ? bg(palette.selection)(headerChunk)
        : this.headerHovered
          ? bg(palette.cursorLine)(headerChunk)
          : bg(palette.panel)(headerChunk),
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
      const overlay = this.rowControlOverlay(row);
      const rowTextEndColumn = controlsVisible
        ? overlay.startColumn
        : this.width;
      const titleColumns = Math.max(
        0,
        rowTextEndColumn - WrapText.Class.displayWidth(prefix),
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
      const rowBackground = row.active ? palette.selection : palette.panel;
      const rowChunk = bg(rowBackground)(fg(color)(rowText));
      chunks.push(rowChunk);
      if (controlsVisible) {
        for (const control of overlay.controls) {
          const glyph =
            control.action === 'task'
              ? taskRecordGlyph
              : control.action === 'split'
                ? glyphVocabulary.panelSplit
                : glyphVocabulary.panelClose;
          const text = ` ${glyph} `;
          chunks.push(
            this.hoveredAction === control.action
              ? bg(palette.cursorLine)(fg(palette.accent)(text))
              : bg(rowBackground)(fg(color)(text)),
          );
        }
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
      this.headerPressed = true;
      this.requestAdd({ column: screenColumn, row: screenRow });
      return true;
    }
    const row = this.rows[localRow - 2];
    if (!row) return false;
    this.draggingRow = row;
    const control = this.controlAt(row, localColumn);
    if (control) {
      if (control.action === 'close') {
        this.panelHost.closeOpenContent(row.identifier);
      } else if (control.action === 'split') {
        this.requestSplit(row.identifier, {
          column: screenColumn,
          row: screenRow,
        });
      } else {
        this.requestOpenTask(row.identifier);
      }
      this.draggingRow = null;
      return true;
    }
    this.panelHost.activateOpenContent(row.identifier);
    return true;
  }

  pointerMove(localColumn: number, localRow: number): boolean {
    const nextHeaderHovered = localRow === 0;
    const nextRowIndex = this.rows[localRow - 2] ? localRow - 2 : -1;
    const row = nextRowIndex < 0 ? undefined : this.rows[nextRowIndex];
    const nextAction = row
      ? (this.controlAt(row, localColumn)?.action ?? null)
      : null;
    const changed =
      nextHeaderHovered !== this.headerHovered ||
      nextRowIndex !== this.hoveredRowIndex ||
      nextAction !== this.hoveredAction;
    this.headerHovered = nextHeaderHovered;
    this.hoveredRowIndex = nextRowIndex;
    this.hoveredAction = nextAction;
    return changed;
  }

  pointerOut(): void {
    this.headerHovered = false;
    this.headerPressed = false;
    this.hoveredRowIndex = -1;
    this.hoveredAction = null;
  }

  tooltipAt(localColumn: number, localRow: number): string | null {
    if (localRow === 0) return `Add ${this.headerLabel} instance`;
    const row = this.rows[localRow - 2];
    const action = row ? this.controlAt(row, localColumn)?.action : null;
    return action === 'task'
      ? 'Open tasks.json'
      : action === 'split'
        ? 'Split instance'
        : action === 'close'
          ? 'Close instance'
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
    this.headerPressed = false;
  }

  protected rowControlOverlay(
    row: PanelContentsListRow,
  ): PanelContentsListControlOverlay {
    const actions: readonly PanelContentsListAction[] = row.hasTaskSource
      ? ['task', 'split', 'close']
      : ['split', 'close'];
    const startColumn = Math.max(0, this.width - actions.length * 3);
    return {
      startColumn,
      controls: actions.map((action, index) => ({
        action,
        startColumn: startColumn + index * 3,
        endColumnExclusive: startColumn + (index + 1) * 3,
      })),
    };
  }

  protected controlAt(
    row: PanelContentsListRow,
    column: number,
  ): PanelContentsListControlSegment | null {
    return (
      this.rowControlOverlay(row).controls.find(
        (control) =>
          column >= control.startColumn && column < control.endColumnExclusive,
      ) ?? null
    );
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
  readonly hasTaskSource: boolean;
}

export type PanelContentsListAction = 'task' | 'split' | 'close';

export interface PanelContentsListControlSegment {
  readonly action: PanelContentsListAction;
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

export interface PanelContentsListControlOverlay {
  readonly startColumn: number;
  readonly controls: readonly PanelContentsListControlSegment[];
}
