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
import { TextCoordinates } from '../text/TextCoordinates';
import type { TextInputModel } from '../text/TextInputModel';
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

  static selectionToneFor(palette: Palette): TextFieldTone {
    return {
      background: palette.selection,
      foreground: palette.accent,
    };
  }

  /**
   * Paint one field. The caret cell is always emitted — only its colours depend on
   * `caretVisible` — so a field's painted width and text window are identical in every state.
   * The caret sits on the grapheme at `input.caret` (a space when the caret is at the end), and
   * every column here is measured through `TextCoordinates`, never through string length.
   */
  static paint(context: TextFieldPaintContext): TextFieldPaintResult {
    const editorCoordinates = TextCoordinates.Class;
    const inputGraphemes = editorCoordinates.graphemes(context.input.value);
    const caret = Math.max(
      0,
      Math.min(context.input.caret.value, inputGraphemes.length),
    );
    const selection = context.input.selectionRange();
    const leadSegments: TextFieldPaintSegment[] = [];
    this.pushSegment(leadSegments, context.prefix, context.tone);
    for (let graphemeIndex = 0; graphemeIndex < caret; graphemeIndex += 1) {
      this.pushSegment(
        leadSegments,
        inputGraphemes[graphemeIndex] ?? '',
        this.toneForGrapheme(context, selection, graphemeIndex),
      );
    }
    const trailSegments: TextFieldPaintSegment[] = [];
    for (
      let graphemeIndex = caret + 1;
      graphemeIndex < inputGraphemes.length;
      graphemeIndex += 1
    ) {
      this.pushSegment(
        trailSegments,
        inputGraphemes[graphemeIndex] ?? '',
        this.toneForGrapheme(context, selection, graphemeIndex),
      );
    }
    const caretText = inputGraphemes[caret] ?? ' ';
    const caretTone = this.toneForGrapheme(context, selection, caret);
    const fieldWidth =
      context.width === null ? null : Math.max(1, Math.floor(context.width));
    const measuredCaretWidth = editorCoordinates.lineWidth(caretText);
    // A field one column wide cannot hold a wide caret glyph; it holds a one-cell caret instead.
    const caretFits = fieldWidth === null || measuredCaretWidth <= fieldWidth;
    const paintedCaretText = caretFits ? caretText : ' ';
    const caretWidth = caretFits ? measuredCaretWidth : 1;
    const visibleLeadSegments =
      fieldWidth === null
        ? leadSegments
        : this.segmentWindowFromEnd(leadSegments, fieldWidth - caretWidth);
    const caretColumn = this.segmentWidth(visibleLeadSegments);
    const trailBudget =
      fieldWidth === null ? null : fieldWidth - caretColumn - caretWidth;
    const visibleTrailSegments =
      trailBudget === null
        ? trailSegments
        : trailBudget <= 0
          ? []
          : this.segmentWindow(trailSegments, 0, trailBudget);
    const contentWidth =
      caretColumn + caretWidth + this.segmentWidth(visibleTrailSegments);
    const padding =
      fieldWidth === null
        ? ''
        : ' '.repeat(Math.max(0, fieldWidth - contentWidth));
    const chunks: TextChunk[] = [];
    this.paintSegments(chunks, visibleLeadSegments);
    chunks.push(
      context.caretVisible
        ? bg(caretTone.foreground)(
            fg(caretTone.background ?? context.surfaceBackground)(
              paintedCaretText,
            ),
          )
        : this.toned(paintedCaretText, caretTone),
    );
    this.paintSegments(chunks, visibleTrailSegments);
    this.pushToned(chunks, padding, context.tone);
    return {
      chunks,
      caretColumn,
      caretWidth,
      paintedWidth: contentWidth + padding.length,
    };
  }

  protected static toneForGrapheme(
    context: TextFieldPaintContext,
    selection: { start: number; end: number } | null,
    graphemeIndex: number,
  ): TextFieldTone {
    return selection &&
      graphemeIndex >= selection.start &&
      graphemeIndex < selection.end
      ? context.selectionTone
      : context.tone;
  }

  protected static pushSegment(
    segments: TextFieldPaintSegment[],
    text: string,
    tone: TextFieldTone,
  ): void {
    if (text.length === 0) return;
    const lastSegment = segments[segments.length - 1];
    if (
      lastSegment &&
      lastSegment.tone.background === tone.background &&
      lastSegment.tone.foreground === tone.foreground
    ) {
      lastSegment.text += text;
      return;
    }
    segments.push({ text, tone });
  }

  protected static paintSegments(
    chunks: TextChunk[],
    segments: readonly TextFieldPaintSegment[],
  ): void {
    for (const segment of segments) {
      chunks.push(this.toned(segment.text, segment.tone));
    }
  }

  protected static segmentWidth(
    segments: readonly TextFieldPaintSegment[],
  ): number {
    return segments.reduce(
      (width, segment) => width + TextCoordinates.Class.lineWidth(segment.text),
      0,
    );
  }

  protected static segmentWindowFromEnd(
    segments: readonly TextFieldPaintSegment[],
    width: number,
  ): TextFieldPaintSegment[] {
    const totalWidth = this.segmentWidth(segments);
    return this.segmentWindow(
      segments,
      Math.max(0, totalWidth - Math.max(0, width)),
      width,
    );
  }

  protected static segmentWindow(
    segments: readonly TextFieldPaintSegment[],
    startColumn: number,
    width: number,
  ): TextFieldPaintSegment[] {
    if (width <= 0) return [];
    const windowEndColumn = startColumn + width;
    const visibleSegments: TextFieldPaintSegment[] = [];
    let segmentStartColumn = 0;
    for (const segment of segments) {
      const segmentWidth = TextCoordinates.Class.lineWidth(segment.text);
      const segmentEndColumn = segmentStartColumn + segmentWidth;
      const visibleStartColumn = Math.max(startColumn, segmentStartColumn);
      const visibleEndColumn = Math.min(windowEndColumn, segmentEndColumn);
      if (visibleStartColumn < visibleEndColumn) {
        this.pushSegment(
          visibleSegments,
          TextCoordinates.Class.displayColumnWindow(
            segment.text,
            visibleStartColumn - segmentStartColumn,
            visibleEndColumn - visibleStartColumn,
          ),
          segment.tone,
        );
      }
      segmentStartColumn = segmentEndColumn;
      if (segmentStartColumn >= windowEndColumn) break;
    }
    return visibleSegments;
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
  /** The shared active-selection tone. Only selected input graphemes receive it; prefixes do not. */
  selectionTone: TextFieldTone;
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

interface TextFieldPaintSegment {
  text: string;
  readonly tone: TextFieldTone;
}
