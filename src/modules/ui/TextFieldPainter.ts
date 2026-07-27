// The one painter for a single-line text field: its visible text window, its caret cell, and its
// idle/focused/hovered tone. Before this seam existed the editing MODEL was shared (TextInputModel)
// while every field painted itself: the bounded popup's search row drew two tones and dropped the
// caret entirely, and the palette, Quick Open, and Find bar each INSERTED a bar glyph that shifted
// the text after it. The caret here is background inversion of the cell the caret sits on, so it
// costs no column and needs no glyph (the same reduction the scrollbar thumb made).
//
// invariant: One painter draws every single-line text field (src/modules/ui/ui.invariants.md)
// invariant: Editable text fields share one input model (project.invariants.md)
// invariant: Appearance comes only from theme data (src/modules/theme/theme.invariants.md)
// invariant: Seams are drawn at the shared generator (project.invariants.md)
import { bg, fg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import type { TextInputModel } from '../editor/TextInputModel';
import type { Palette } from '../theme/ThemePalettes';

class $TextFieldPainter {
  /** Hover is the transient pointer affordance, so it wins over focus when both hold. */
  static stateFor(input: TextFieldStateInput): TextFieldState {
    if (input.hovered) return 'hovered';
    return input.focused ? 'focused' : 'idle';
  }

  /** The three tones. Focus is deliberately QUIETER than hover: `cursorLine` sits one step above
   *  `panel` while `accent` is the theme's vivid active colour, and the focus signal is carried by
   *  text brightness (`dim` -> `fg`) the way the palette's own design note carries hierarchy. */
  static toneFor(palette: Palette, state: TextFieldState): TextFieldTone {
    if (state === 'hovered') {
      return { background: palette.accent, foreground: palette.panel };
    }
    if (state === 'focused') {
      return { background: palette.cursorLine, foreground: palette.fg };
    }
    return { background: palette.border, foreground: palette.dim };
  }

  /**
   * Paint one field. The caret cell is always emitted — only its colours depend on
   * `caretVisible` — so a field's painted width and text window are identical in every state.
   * The caret sits on the grapheme at `input.caret` (a space when the caret is at the end), and
   * every column here is measured through `EditorCoordinates`, never through string length.
   */
  static paint(context: TextFieldPaintContext): TextFieldPaintResult {
    const editorCoordinates = EditorCoordinates.Class;
    const leadText = context.prefix + context.input.valueBeforeCaret;
    const afterCaretText = context.input.valueAfterCaret;
    const caretGraphemeEnd = editorCoordinates.graphemeToU16(afterCaretText, 1);
    const caretText = afterCaretText.slice(0, caretGraphemeEnd) || ' ';
    const trailText = afterCaretText.slice(caretGraphemeEnd);
    const fieldWidth =
      context.width === null ? null : Math.max(1, Math.floor(context.width));
    const measuredCaretWidth = editorCoordinates.lineWidth(caretText);
    // A field one column wide cannot hold a wide caret glyph; it holds a one-cell caret instead.
    const caretFits = fieldWidth === null || measuredCaretWidth <= fieldWidth;
    const paintedCaretText = caretFits ? caretText : ' ';
    const caretWidth = caretFits ? measuredCaretWidth : 1;
    const visibleLead =
      fieldWidth === null
        ? leadText
        : this.trailingColumnWindow(leadText, fieldWidth - caretWidth);
    const caretColumn = editorCoordinates.lineWidth(visibleLead);
    const trailBudget =
      fieldWidth === null ? null : fieldWidth - caretColumn - caretWidth;
    const visibleTrail =
      trailBudget === null
        ? trailText
        : trailBudget <= 0
          ? ''
          : editorCoordinates.displayColumnWindow(trailText, 0, trailBudget);
    const contentWidth =
      caretColumn + caretWidth + editorCoordinates.lineWidth(visibleTrail);
    const padding =
      fieldWidth === null
        ? ''
        : ' '.repeat(Math.max(0, fieldWidth - contentWidth));
    const chunks: TextChunk[] = [];
    this.pushToned(chunks, visibleLead, context.tone);
    chunks.push(
      context.caretVisible
        ? bg(context.tone.foreground)(
            fg(context.tone.background ?? context.surfaceBackground)(
              paintedCaretText,
            ),
          )
        : this.toned(paintedCaretText, context.tone),
    );
    this.pushToned(chunks, visibleTrail, context.tone);
    this.pushToned(chunks, padding, context.tone);
    return {
      chunks,
      caretColumn,
      caretWidth,
      paintedWidth: contentWidth + padding.length,
    };
  }

  protected static toned(text: string, tone: TextFieldTone): TextChunk {
    return tone.background === null
      ? fg(tone.foreground)(text)
      : bg(tone.background)(fg(tone.foreground)(text));
  }

  protected static pushToned(
    chunks: TextChunk[],
    text: string,
    tone: TextFieldTone,
  ): void {
    if (text.length === 0) return;
    chunks.push(this.toned(text, tone));
  }

  /** Keep the LAST `budget` display columns of `text` (a caret past the field's right edge pulls
   *  its own window). Returns whole graphemes only, so no wide glyph is cut in half. */
  protected static trailingColumnWindow(text: string, budget: number): string {
    if (budget <= 0) return '';
    const totalWidth = EditorCoordinates.Class.lineWidth(text);
    if (totalWidth <= budget) return text;
    return EditorCoordinates.Class.displayColumnWindow(
      text,
      totalWidth - budget,
      budget,
    );
  }
}

export namespace TextFieldPainter {
  export const $Class = Static($TextFieldPainter);
  export let Class = $Class;
}

export type TextFieldState = 'idle' | 'focused' | 'hovered';

export interface TextFieldStateInput {
  focused: boolean;
  hovered: boolean;
}

/** A field's colour pair. `background: null` paints a field with no well (a modal dialog line). */
export interface TextFieldTone {
  background: string | null;
  foreground: string;
}

export interface TextFieldPaintContext {
  /** Leading glyphs painted in the field tone (a search icon, `> `, a mode marker). */
  prefix: string;
  /** The caret authority. The painted caret position is read from this model, never re-derived. */
  input: TextInputModel.Model;
  tone: TextFieldTone;
  /** The background the field is drawn on — the caret's own glyph colour when the field has no well. */
  surfaceBackground: string;
  caretVisible: boolean;
  /** Fixed field width in display columns, or null for a field that flows inside a longer line. */
  width: number | null;
}

export interface TextFieldPaintResult {
  chunks: TextChunk[];
  /** Field-local display column of the caret cell (0 = the first prefix cell). */
  caretColumn: number;
  /** Display cells the caret cell covers — 2 over a wide glyph. */
  caretWidth: number;
  paintedWidth: number;
}
