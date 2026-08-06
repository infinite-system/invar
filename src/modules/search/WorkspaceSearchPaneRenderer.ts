import { StyledText, bg, dim, fg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import { TextCoordinates } from '../text/TextCoordinates';
import type { TextInputModel } from '../text/TextInputModel';
import type { Palette } from '../theme/ThemePalettes';
import { TextFieldPainter } from '../ui/TextFieldPainter';
import type { SelectionSpanRange } from '../ui/TextSelectionModel';
import type { WorkspaceSearchWorkspace } from './WorkspaceSearchWorkspace';
import {
  WorkspaceSearchResultTree,
  type WorkspaceSearchTreeRow,
} from './WorkspaceSearchResultTree';

// invariant: One painter draws every single-line text field (src/modules/ui/ui.invariants.md)
// invariant: Appearance comes only from theme data (src/modules/theme/theme.invariants.md)
class $WorkspaceSearchPaneRenderer {
  static render(
    context: WorkspaceSearchPaneRenderContext,
  ): WorkspaceSearchPaneRenderResult {
    const chunks: TextChunk[] = [];
    const fields: WorkspaceSearchFieldZone[] = [];
    const buttons: WorkspaceSearchButtonZone[] = [];
    const fieldDefinitions: readonly WorkspaceSearchFieldDefinition[] = [
      {
        field: 'query',
        input: context.workspace.queryInput,
        placeholder: 'Search',
        button: 'toggleCase',
        buttonLabel: 'Aa',
        buttonActive: context.workspace.caseSensitive.value,
      },
      {
        field: 'replacement',
        input: context.workspace.replacementInput,
        placeholder: 'Replace',
        button: 'toggleRegex',
        buttonLabel: '.*',
        buttonActive: context.workspace.useRegex.value,
      },
      {
        field: 'include',
        input: context.workspace.includeInput,
        placeholder: 'Files to include',
        button: 'toggleWholeWord',
        buttonLabel: 'ab',
        buttonActive: context.workspace.wholeWord.value,
      },
      {
        field: 'exclude',
        input: context.workspace.excludeInput,
        placeholder: 'Files to exclude',
      },
    ];
    let caret: { column: number; row: number } | null = null;
    fieldDefinitions.forEach((definition, row) => {
      const buttonWidth = definition.button ? 5 : 0;
      const fieldWidth = Math.max(1, context.width - buttonWidth);
      const fieldStartColumn = 0;
      fields.push({
        field: definition.field,
        row,
        startColumn: fieldStartColumn,
        endColumn: fieldStartColumn + fieldWidth,
      });
      const fieldFocused =
        context.focused && context.activeFocus === definition.field;
      if (definition.input.isEmpty) {
        if (fieldFocused) {
          const paintedCaret = TextFieldPainter.Class.paint({
            prefix: '',
            input: definition.input,
            tone: TextFieldPainter.Class.toneFor(context.palette, 'focused'),
            selectionTone: TextFieldPainter.Class.selectionToneFor(
              context.palette,
            ),
            surfaceBackground: context.palette.panel,
            caretVisible: true,
            width: 1,
          });
          chunks.push(...paintedCaret.chunks);
          chunks.push(
            fg(context.palette.dim)(
              TextCoordinates.Class.padToDisplayWidth(
                definition.placeholder,
                Math.max(0, fieldWidth - 1),
              ),
            ),
          );
          caret = { column: paintedCaret.caretColumn, row };
        } else {
          const placeholder = TextCoordinates.Class.padToDisplayWidth(
            ` ${definition.placeholder}`,
            fieldWidth,
          );
          chunks.push(fg(context.palette.dim)(placeholder));
        }
      } else {
        const painted = TextFieldPainter.Class.paint({
          prefix: ' ',
          input: definition.input,
          tone: TextFieldPainter.Class.toneFor(
            context.palette,
            fieldFocused
              ? 'focused'
              : context.hoveredField === definition.field
                ? 'hovered'
                : 'idle',
          ),
          selectionTone: TextFieldPainter.Class.selectionToneFor(
            context.palette,
          ),
          surfaceBackground: context.palette.panel,
          caretVisible: fieldFocused,
          width: fieldWidth,
        });
        chunks.push(...painted.chunks);
        if (fieldFocused) caret = { column: painted.caretColumn, row };
      }
      if (definition.button) {
        const button = this.button(
          definition.button,
          definition.buttonLabel ?? '',
          row,
          fieldWidth,
          context,
          definition.buttonActive ?? false,
        );
        chunks.push(...button.chunks);
        buttons.push(button.zone);
      }
      chunks.push(fg(context.palette.fg)('\n'));
    });

    const ignoreButton = this.button(
      'toggleIgnoreFiles',
      `Use ignores: ${context.workspace.useIgnoreFiles.value ? 'on' : 'off'}`,
      4,
      0,
      context,
      context.workspace.useIgnoreFiles.value,
      context.width,
    );
    chunks.push(...ignoreButton.chunks);
    buttons.push(ignoreButton.zone);
    chunks.push(fg(context.palette.fg)('\n'));

    const summary =
      context.workspace.flowState.value === 'searching'
        ? 'Searching…'
        : context.workspace.flowState.value === 'queued'
          ? 'Search queued…'
          : `${context.workspace.resultCount} results in ${context.workspace.fileCount.value} files`;
    chunks.push(
      fg(context.palette.dim)(
        TextCoordinates.Class.padToDisplayWidth(` ${summary}`, context.width),
      ),
      fg(context.palette.fg)('\n'),
    );

    const resultStartRow = 6;
    const availableResultRows = Math.max(0, context.height - resultStartRow);
    const errorMessage = context.workspace.errorMessage.value;
    if (errorMessage) {
      const messageLines = this.wrap(
        errorMessage,
        Math.max(1, context.width - 2),
      );
      messageLines.slice(0, availableResultRows).forEach((line, index) => {
        chunks.push(
          fg(context.palette.warning)(
            TextCoordinates.Class.padToDisplayWidth(` ${line}`, context.width),
          ),
        );
        if (index < Math.min(messageLines.length, availableResultRows) - 1) {
          chunks.push(fg(context.palette.fg)('\n'));
        }
      });
      return { text: new StyledText(chunks), fields, buttons, caret };
    }

    const rows = context.workspace.resultTree.rows;
    const firstVisible = context.workspace.resultTree.scrollTop.value;
    const visibleRows = rows.slice(
      firstVisible,
      firstVisible + availableResultRows,
    );
    visibleRows.forEach((row, visibleIndex) => {
      const rowIndex = firstVisible + visibleIndex;
      const screenRow = resultStartRow + visibleIndex;
      const selected =
        rowIndex === context.workspace.resultTree.selectedIndex.value;
      const hovered =
        rowIndex === context.workspace.resultTree.hoveredIndex.value;
      const background = selected
        ? context.focused
          ? context.palette.selection
          : context.palette.cursorLine
        : hovered
          ? context.palette.cursorLine
          : null;
      const dismissed = context.workspace.resultTree.rowIsDismissed(row);
      const rowText = this.textForRow(row, context, dismissed);
      const selectionRange = context.selectionRanges[rowIndex] ?? null;
      const rowChunks = this.paintSelectedRow(
        rowText,
        selectionRange,
        context.palette,
        dismissed,
      );
      for (const rowChunk of rowChunks) {
        chunks.push(background ? bg(background)(rowChunk) : rowChunk);
      }
      if (row.kind === 'match' && row.result) {
        buttons.push({
          action: 'dismissMatch',
          row: screenRow,
          startColumn: Math.max(0, context.width - 3),
          endColumn: context.width,
          result: row.result,
        });
      }
      if (visibleIndex < visibleRows.length - 1) {
        chunks.push(fg(context.palette.fg)('\n'));
      }
    });
    return { text: new StyledText(chunks), fields, buttons, caret };
  }

  static textForRow(
    row: WorkspaceSearchTreeRow,
    context: WorkspaceSearchPaneRenderContext,
    dismissed: boolean,
  ): string {
    if (row.kind === 'limitNotice') {
      return TextCoordinates.Class.padToDisplayWidth(
        ` ${row.noticeText ?? WorkspaceSearchResultTree.Class.LIMIT_NOTICE_TEXT}`,
        context.width,
      );
    }
    if (row.kind === 'file') {
      const mark = row.collapsed
        ? context.foldClosedGlyph
        : context.foldOpenGlyph;
      const count = String(row.matchCount);
      const availablePathWidth = Math.max(1, context.width - count.length - 5);
      const path = this.truncateFromLeft(
        row.relativePath,
        availablePathWidth,
        context.ellipsisCell,
      );
      return TextCoordinates.Class.padToDisplayWidth(
        ` ${mark} ${path} ${count}`,
        context.width,
      );
    }
    if (row.kind === 'replacementPreview') {
      return this.fitText(
        `     → ${row.result?.replacementText ?? ''}`,
        context.width,
      );
    }
    const lineNumber = String((row.result?.line ?? 0) + 1).padStart(4, ' ');
    const dismiss = ` ${context.closeGlyph} `;
    const previewWidth = Math.max(
      0,
      context.width - lineNumber.length - dismiss.length - 2,
    );
    const preview = TextCoordinates.Class.displayColumnWindow(
      row.result?.lineText ?? '',
      0,
      previewWidth,
    );
    return TextCoordinates.Class.padToDisplayWidth(
      ` ${lineNumber} ${preview}${dismiss}`,
      context.width,
    );
  }

  protected static paintSelectedRow(
    text: string,
    selectionRange: SelectionSpanRange | null,
    palette: Palette,
    dismissed: boolean,
  ): TextChunk[] {
    const normal = (value: string): TextChunk => {
      const chunk = fg(dismissed ? palette.dim : palette.fg)(value);
      return dismissed ? dim(chunk) : chunk;
    };
    if (!selectionRange) return [normal(text)];
    return [
      normal(
        TextCoordinates.Class.displayColumnWindow(
          text,
          0,
          selectionRange.start,
        ),
      ),
      bg(palette.selection)(
        fg(palette.accent)(
          TextCoordinates.Class.displayColumnWindow(
            text,
            selectionRange.start,
            selectionRange.end - selectionRange.start,
          ),
        ),
      ),
      normal(
        TextCoordinates.Class.displayColumnWindow(
          text,
          selectionRange.end,
          Number.MAX_SAFE_INTEGER,
        ),
      ),
    ];
  }

  protected static button(
    action: WorkspaceSearchButtonAction,
    label: string,
    row: number,
    startColumn: number,
    context: WorkspaceSearchPaneRenderContext,
    active: boolean,
    forcedWidth?: number,
  ): { chunks: TextChunk[]; zone: WorkspaceSearchButtonZone } {
    const width = forcedWidth ?? TextCoordinates.Class.lineWidth(` ${label} `);
    const text = TextCoordinates.Class.padToDisplayWidth(` ${label} `, width);
    const hovered = context.hoveredButton === action;
    const pressed = context.pressedButton === action;
    const background = pressed
      ? context.palette.accent
      : active
        ? context.palette.selection
        : hovered
          ? context.palette.cursorLine
          : context.palette.panel;
    return {
      chunks: [
        bg(background)(
          fg(active || pressed ? context.palette.accent : context.palette.fg)(
            text,
          ),
        ),
      ],
      zone: {
        action,
        row,
        startColumn,
        endColumn: startColumn + width,
        result: null,
      },
    };
  }

  protected static truncateFromLeft(
    text: string,
    width: number,
    ellipsisCell: string,
  ): string {
    if (TextCoordinates.Class.lineWidth(text) <= width) return text;
    if (width <= 1) return ellipsisCell;
    const totalWidth = TextCoordinates.Class.lineWidth(text);
    return (
      ellipsisCell +
      TextCoordinates.Class.displayColumnWindow(
        text,
        totalWidth - width + 1,
        width - 1,
      )
    );
  }

  protected static wrap(text: string, width: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && TextCoordinates.Class.lineWidth(candidate) > width) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  protected static fitText(text: string, width: number): string {
    return TextCoordinates.Class.padToDisplayWidth(
      TextCoordinates.Class.displayColumnWindow(text, 0, width),
      width,
    );
  }
}

export namespace WorkspaceSearchPaneRenderer {
  export const $Class = Static($WorkspaceSearchPaneRenderer);
  export let Class = $Class;
}

export type WorkspaceSearchField =
  'query' | 'replacement' | 'include' | 'exclude';

export type WorkspaceSearchFocus = WorkspaceSearchField | 'results';

export type WorkspaceSearchButtonAction =
  | 'toggleCase'
  | 'toggleWholeWord'
  | 'toggleRegex'
  | 'toggleIgnoreFiles'
  | 'dismissMatch';

export interface WorkspaceSearchFieldZone {
  readonly field: WorkspaceSearchField;
  readonly row: number;
  readonly startColumn: number;
  readonly endColumn: number;
}

export interface WorkspaceSearchButtonZone {
  readonly action: WorkspaceSearchButtonAction;
  readonly row: number;
  readonly startColumn: number;
  readonly endColumn: number;
  readonly result:
    import('./WorkspaceSearchBackend').WorkspaceSearchResult | null;
}

export interface WorkspaceSearchPaneRenderContext {
  readonly workspace: WorkspaceSearchWorkspace.Model;
  readonly palette: Palette;
  readonly width: number;
  readonly height: number;
  readonly focused: boolean;
  readonly activeFocus: WorkspaceSearchFocus;
  readonly hoveredField: WorkspaceSearchField | null;
  readonly hoveredButton: WorkspaceSearchButtonAction | null;
  readonly pressedButton: WorkspaceSearchButtonAction | null;
  readonly foldOpenGlyph: string;
  readonly foldClosedGlyph: string;
  readonly closeGlyph: string;
  readonly ellipsisCell: string;
  readonly selectionRanges: readonly (SelectionSpanRange | null)[];
}

export interface WorkspaceSearchPaneRenderResult {
  readonly text: StyledText;
  readonly fields: readonly WorkspaceSearchFieldZone[];
  readonly buttons: readonly WorkspaceSearchButtonZone[];
  readonly caret: { column: number; row: number } | null;
}

interface WorkspaceSearchFieldDefinition {
  readonly field: WorkspaceSearchField;
  readonly input: TextInputModel.Model;
  readonly placeholder: string;
  readonly button?: WorkspaceSearchButtonAction;
  readonly buttonLabel?: string;
  readonly buttonActive?: boolean;
}
