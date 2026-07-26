import { Static } from 'ivue/extras';

// Indentation as PURE text arithmetic: what one indent unit is for a given document, and what
// indenting or outdenting one line does to it. The Editor owns the document mutation, the undo
// capture, and the cursor; this seam owns only the string decisions, so they are testable without a
// document and reusable by any future re-indent command.
//
// The indent UNIT is DETECTED from the file rather than configured, because that is the only reading
// that respects a file the user did not write: a file already indented with tabs keeps tabs, a file
// indented with two spaces keeps two. There is no indent setting to consult (Settings has none), and
// inventing one would let the editor fight the file.
// invariant: Focus owns the keystroke (src/modules/keybindings/keybindings.invariants.md)
class $EditorIndent {
  /** Fallback when a document shows no indentation at all (empty or single-level file). */
  protected static get defaultSpaceWidth(): number {
    return 2;
  }

  /** How many lines to sample when detecting the unit — enough to be representative, bounded so a
   *  huge file costs nothing. Public because the Editor slices exactly this many lines to hand over,
   *  and a second copy of the number in the Editor would be free to drift. */
  static get detectionLineLimit(): number {
    return 200;
  }

  /**
   * The indent unit this document uses: a literal tab when any sampled line starts with one, else a
   * run of spaces whose width is the SMALLEST positive leading-space count observed (the step
   * between levels), else the default.
   */
  static detectIndentUnit(lines: readonly string[]): string {
    const sampledLineCount = Math.min(lines.length, this.detectionLineLimit);
    let smallestSpaceIndentWidth = 0;
    for (let lineIndex = 0; lineIndex < sampledLineCount; lineIndex += 1) {
      const lineText = lines[lineIndex] ?? '';
      if (lineText.startsWith('\t')) return '\t';
      const leadingSpaceMatch = /^ +/.exec(lineText);
      if (!leadingSpaceMatch) continue;
      if (lineText.length === leadingSpaceMatch[0].length) continue; // blank-but-spaced line
      const leadingSpaceWidth = leadingSpaceMatch[0].length;
      if (
        smallestSpaceIndentWidth === 0 ||
        leadingSpaceWidth < smallestSpaceIndentWidth
      ) {
        smallestSpaceIndentWidth = leadingSpaceWidth;
      }
    }
    const spaceWidth =
      smallestSpaceIndentWidth > 0
        ? smallestSpaceIndentWidth
        : this.defaultSpaceWidth;
    return ' '.repeat(spaceWidth);
  }

  /** `lineText` with one indent unit added at column 0. */
  static indentLine(lineText: string, indentUnit: string): string {
    return `${indentUnit}${lineText}`;
  }

  /**
   * `lineText` with AT MOST one indent unit removed from its leading whitespace. A tab unit removes
   * one leading tab, or up to that many leading spaces when the line was indented with spaces
   * instead; a space unit removes up to that many leading spaces, or one leading tab. Mixed
   * indentation therefore always shrinks by at most one level and never eats a non-whitespace
   * character.
   */
  static outdentLine(lineText: string, indentUnit: string): string {
    if (lineText.startsWith('\t')) return lineText.slice(1);
    const unitWidth = indentUnit === '\t' ? 4 : indentUnit.length;
    let removedSpaceCount = 0;
    while (
      removedSpaceCount < unitWidth &&
      lineText[removedSpaceCount] === ' '
    ) {
      removedSpaceCount += 1;
    }
    return lineText.slice(removedSpaceCount);
  }
}

export namespace EditorIndent {
  export const $Class = $EditorIndent;
  export const Class = Static($EditorIndent);
}
