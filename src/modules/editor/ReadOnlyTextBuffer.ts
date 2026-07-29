import type { FindBarTarget } from '../search/FindBar';
import type { FindInBufferMatch } from '../search/FindInBuffer';
import { Clipboard } from '../system/Clipboard';
import { Cursor } from './Cursor';
import { TextCoordinates } from '../text/TextCoordinates';
import { TextDocument } from '../text/TextDocument';

// The shared model for text surfaces whose generator is document reading, cursor selection,
// clipboard copy, and find-target exposure. Editing, undo, persistence, and viewport behavior live
// above this seam in Editor.
//
// invariant: Seams are drawn at the shared generator (project.invariants.md)
// invariant: Read-only text behavior excludes editing (src/modules/editor/editor.invariants.md)
// invariant: Selection is an anchor plus the cursor and edits replace it (src/modules/editor/editor.invariants.md)
class $ReadOnlyTextBuffer {
  // invariant: Construction goes through overridable seams (project.invariants.md)
  readonly document = this.createDocument();
  readonly cursor = this.createCursor();

  protected createDocument(): TextDocument.Instance {
    return new TextDocument.Class();
  }

  protected createCursor(): Cursor.Model {
    return new Cursor.Class();
  }

  openText(displayPath: string, text: string): void {
    this.document.loadFromText(text, displayPath);
    this.placeCursor(0, 0);
    this.cursor.clearSelection();
  }

  replaceText(text: string): void {
    this.document.replaceAll(text.split('\n'));
    this.cursor.clearSelection();
  }

  protected get selectionAvailable(): boolean {
    return true;
  }

  get hasSelection(): boolean {
    return this.cursor.hasSelection;
  }

  selectionText(): string {
    const selectionRange = this.cursor.selectionRange();
    return selectionRange
      ? this.document.sliceRange(selectionRange.start, selectionRange.end)
      : '';
  }

  selectAll(): void {
    if (!this.selectionAvailable) return;
    const lastLineIndex = this.document.lineCount - 1;
    this.placeCursor(0, 0);
    this.cursor.setAnchorHere();
    this.placeCursor(
      lastLineIndex,
      TextCoordinates.Class.graphemeCount(this.document.line(lastLineIndex)),
    );
  }

  /** Select the word at a document position. */
  selectWord(lineIndex: number, graphemeColumn: number): void {
    if (!this.selectionAvailable) return;
    const wordBounds = TextCoordinates.Class.wordBounds(
      this.document.line(lineIndex),
      graphemeColumn,
    );
    this.placeCursor(lineIndex, wordBounds.start);
    this.cursor.setAnchorHere();
    this.placeCursor(lineIndex, wordBounds.end);
  }

  /** Select the entire line from its start through its end. */
  selectLine(lineIndex: number): void {
    if (!this.selectionAvailable) return;
    this.placeCursor(lineIndex, 0);
    this.cursor.setAnchorHere();
    this.placeCursor(
      lineIndex,
      TextCoordinates.Class.graphemeCount(this.document.line(lineIndex)),
    );
  }

  /**
   * Place the cursor at a grapheme column. Editor overrides this to add viewport reveal while the
   * read-only seam keeps only the coordinate-correct cursor model.
   */
  placeCursor(lineIndex: number, graphemeColumn: number): void {
    this.cursor.set(
      lineIndex,
      graphemeColumn,
      TextCoordinates.Class.displayColumn(
        this.document.line(lineIndex),
        graphemeColumn,
      ),
    );
  }

  /** Copy the selected text; returns its UTF-16 character count, preserving the existing status API. */
  async copySelection(): Promise<number> {
    const selectedText = this.selectionText();
    if (selectedText) await Clipboard.Class.copy(selectedText);
    return selectedText.length;
  }

  findTarget(
    identifier: string,
    revealMatch: (match: FindInBufferMatch) => void,
  ): FindBarTarget {
    return {
      identifier,
      document: this.document,
      replaceAllowed: false,
      revealMatch,
    };
  }

  dispose(): void {
    this.document.loadFromText('', '');
    this.cursor.set(0, 0);
    this.cursor.clearSelection();
  }
}

export namespace ReadOnlyTextBuffer {
  export const $Class = $ReadOnlyTextBuffer;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
