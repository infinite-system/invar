import { Static } from "ivue/extras";
import { EditorCoordinates } from "./EditorCoordinates";

// The shared text-editing seam: pure word-boundary edits reused by the editor, find bar, quick-open,
// the command palette, AND the agent composer — one generator, every text input wires in here instead
// of re-implementing word deletion. The canonical instance of the shared-generator rule.
// invariant: Seams are drawn at the shared generator (project.invariants.md)
class $TextEditing {
  protected static get EditorCoordinates() {
    return EditorCoordinates.Class;
  }

  protected static clusterKind(cluster: string): TextClusterKind {
    if (/^(?:\r\n|\r|\n)$/u.test(cluster)) return "lineBreak";
    if (/^\s+$/u.test(cluster)) return "whitespace";
    if (/[\p{L}\p{N}_]/u.test(cluster)) return "word";
    return "punctuation";
  }

  /**
   * Return the grapheme position at the previous word-delete boundary.
   *
   * Whitespace immediately left of the cursor is skipped first, then one homogeneous run of word
   * or punctuation clusters is crossed. A newline is a hard, single-cluster boundary: from the
   * beginning of a line the previous position is the preceding line end, so deletion joins lines
   * without also removing text from the preceding line.
   */
  // invariant: Word deletion uses the navigation boundary (src/modules/editor/editor.invariants.md)
  static wordLeft(text: string, cursor: number): number {
    const clusters = this.EditorCoordinates.graphemes(text);
    let position = Math.max(0, Math.min(cursor, clusters.length));
    if (position === 0) return 0;

    if (this.clusterKind(clusters[position - 1] ?? "") === "lineBreak") {
      return position - 1;
    }

    while (
      position > 0 &&
      this.clusterKind(clusters[position - 1] ?? "") === "whitespace"
    ) {
      position -= 1;
    }
    if (
      position === 0 ||
      this.clusterKind(clusters[position - 1] ?? "") === "lineBreak"
    ) {
      return position;
    }

    const runKind = this.clusterKind(clusters[position - 1] ?? "");
    while (
      position > 0 &&
      this.clusterKind(clusters[position - 1] ?? "") === runKind
    ) {
      position -= 1;
    }
    return position;
  }

  /**
   * Return the grapheme position at the next word boundary to the RIGHT (the mirror of wordLeft,
   * matching the editor's Ctrl/Alt+Right): cross the current word run, then skip the following
   * separators — landing at the START of the next word (or the end of the text).
   */
  static wordRight(text: string, cursor: number): number {
    const clusters = this.EditorCoordinates.graphemes(text);
    let position = Math.max(0, Math.min(cursor, clusters.length));
    const isWord = (cluster: string): boolean =>
      this.clusterKind(cluster) === "word" ||
      this.clusterKind(cluster) === "punctuation";
    if (position < clusters.length && isWord(clusters[position] ?? "")) {
      const runKind = this.clusterKind(clusters[position] ?? "");
      while (
        position < clusters.length &&
        this.clusterKind(clusters[position] ?? "") === runKind
      ) {
        position += 1;
      }
    }
    while (
      position < clusters.length &&
      this.clusterKind(clusters[position] ?? "") === "whitespace"
    ) {
      position += 1;
    }
    return position;
  }

  static deletePreviousWord(
    text: string,
    cursor = this.EditorCoordinates.graphemeCount(text),
  ): PreviousWordDeletion {
    const end = Math.max(
      0,
      Math.min(cursor, this.EditorCoordinates.graphemeCount(text)),
    );
    const start = this.wordLeft(text, end);
    const startUtf16Offset = this.EditorCoordinates.graphemeToU16(text, start);
    const endUtf16Offset = this.EditorCoordinates.graphemeToU16(text, end);
    return {
      text: text.slice(0, startUtf16Offset) + text.slice(endUtf16Offset),
      start,
      end,
    };
  }
}

export namespace TextEditing {
  export const $Class = $TextEditing;
  export const Class = Static($TextEditing);
}

export interface PreviousWordDeletion {
  text: string;
  start: number;
  end: number;
}

export type TextClusterKind =
  "lineBreak" | "whitespace" | "word" | "punctuation";
