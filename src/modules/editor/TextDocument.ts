// A loaded text document: ground truth is a compact line array (non-reactive at rest); a
// revision counter stamps every mutation so async consumers (syntax/LSP/git) can discard
// stale results. M2 is read-only; M3 adds editing on top of this same document.
//
// invariant: Cost tracks the actively observed set (project.invariants.md)
// invariant: Async results are revision-stamped and stale results discarded (project.invariants.md)
// invariant: The dirty marker is derived from content, never asserted (editor.invariants.md)
import { Reactive } from 'ivue';
import { ref } from 'vue';
import { Files } from '../system/Files';
import { EditorCoordinates } from './EditorCoordinates';

class $TextDocument {
  path = '';
  // Compact ground truth — a plain string[], not a reactive-per-line structure.
  protected _lines: string[] = [''];
  // The exact horizontal extent is full-document state. A single champion makes localized edits
  // O(changed lines); only removing it without an equal-or-wider replacement triggers a rescan.
  protected maximumLineWidthValue = 0;
  protected maximumLineWidthLineIndex = -1;
  protected _eol: '\n' | '\r\n' = '\n';
  // The content as it was last SAVED/LOADED (the clean baseline), held as three facts ordered
  // cheapest-first. Line count and total length are O(1) integer comparisons that reject a changed
  // buffer without touching a character; the FNV-1a signature is consulted ONLY when both match, so
  // "clean" is already plausible. A false "clean" would need a hash collision AND a matching line
  // count AND a matching length — negligible, and it only costs a missing dot.
  protected savedLineCount = 0;
  protected savedContentLength = 0;
  protected savedSignature = '';
  // Σ of the lines' UTF-16 lengths, maintained incrementally by every edit (never rescanned per
  // query). This is what makes forward typing free: the length differs from the baseline on the very
  // first inserted character, so the dirty answer is DIRTY without hashing.
  protected contentLengthValue = 0;
  // Memo of the derived answer, keyed on BOTH reactive keys it was computed from: revision (content)
  // and savedBaselineVersion (the baseline). Repeated per-frame reads at an unchanged key pair are
  // two integer comparisons.
  protected dirtyEvaluationRevision = -1;
  protected dirtyEvaluationBaselineVersion = -1;
  protected dirtyEvaluationResult = false;

  constructor() {
    // A never-loaded document is its own baseline: an empty buffer has no unsaved edits.
    this.captureSavedBaseline();
  }

  // Reactive signals: revision (bumped on any content change) and the saved-baseline version.
  get revision() {
    return ref(0);
  }

  /** Bumped when the clean baseline MOVES (load/save) without the content changing. `revision` must
   *  not carry that — it means "the lines changed" to the async stale-drop consumers — so the derived
   *  dirty answer observes (and is keyed on) this second signal as well. */
  get savedBaselineVersion() {
    return ref(0);
  }

  get binary() {
    return ref(false);
  }

  /** DERIVED from the content on every path — typing, deletion, paste, indent, multi-cursor, undo,
   *  redo — never assigned. There is no setter, so no mutator can leave the marker claiming edits a
   *  buffer that is byte-identical to disk does not have. Cost: two integer comparisons when the memo
   *  is warm (the per-frame read), two more when it is cold and the content differs in line count or
   *  length (the typing case), one full signature only at the moment clean becomes plausible. */
  get dirty(): boolean {
    const revision = this.revision.value;
    const baselineVersion = this.savedBaselineVersion.value;
    if (
      this.dirtyEvaluationRevision === revision &&
      this.dirtyEvaluationBaselineVersion === baselineVersion
    ) {
      return this.dirtyEvaluationResult;
    }
    this.dirtyEvaluationResult = !this.matchesSaved();
    this.dirtyEvaluationRevision = revision;
    this.dirtyEvaluationBaselineVersion = baselineVersion;
    return this.dirtyEvaluationResult;
  }

  loadFromFile(path: string): void {
    this.path = path;
    if (Files.Class.looksBinary(path)) {
      this._lines = ['(binary file not shown)'];
      this.rebuildMaximumLineWidth();
      this._eol = '\n';
      this.binary.value = true;
      this.captureSavedBaseline();
      this.revision.value++;
      return;
    }
    const text = Files.Class.read(path);
    this._eol = text.includes('\r\n') ? '\r\n' : '\n';
    this._lines = text.split(/\r?\n/);
    if (this._lines.length === 0) this._lines = [''];
    this.rebuildMaximumLineWidth();
    this.binary.value = false;
    this.captureSavedBaseline();
    this.revision.value++;
  }

  loadFromText(text: string, path = ''): void {
    this.path = path;
    this._eol = text.includes('\r\n') ? '\r\n' : '\n';
    this._lines = text.split(/\r?\n/);
    if (this._lines.length === 0) this._lines = [''];
    this.rebuildMaximumLineWidth();
    this.binary.value = false;
    this.captureSavedBaseline();
    this.revision.value++;
  }

  get lineCount(): number {
    return this._lines.length;
  }

  get maximumLineWidth(): number {
    return this.maximumLineWidthValue;
  }

  line(index: number): string {
    return this._lines[index] ?? '';
  }

  /** A window of lines [start, start+count) — the flyweight read the viewport uses. */
  slice(start: number, count: number): string[] {
    const clampedStart = Math.max(0, start);
    return this._lines.slice(clampedStart, clampedStart + count);
  }

  get lines(): readonly string[] {
    return this._lines;
  }

  get text(): string {
    return this._lines.join(this._eol);
  }

  /** Serialized UTF-16 length without joining the document. */
  get contentLength(): number {
    return (
      this.contentLengthValue +
      Math.max(0, this._lines.length - 1) * this._eol.length
    );
  }

  get eol(): '\n' | '\r\n' {
    return this._eol;
  }

  // --- mutation surface (used from M3) ---
  replaceAll(lines: string[]): void {
    this._lines = lines.length ? lines : [''];
    this.rebuildMaximumLineWidth();
    this.rebuildContentLength();
    this.revision.value++;
  }

  setLine(index: number, text: string): void {
    if (index < 0 || index >= this._lines.length) return;
    this.replaceLineRange(index, 1, [text]);
    this.revision.value++;
  }

  insertLine(index: number, text: string): void {
    this.replaceLineRange(Math.max(0, Math.min(index, this._lines.length)), 0, [
      text,
    ]);
    this.revision.value++;
  }

  removeLine(index: number): void {
    if (this._lines.length <= 1) {
      this._lines = [''];
      this.rebuildMaximumLineWidth();
      this.rebuildContentLength();
    } else if (index >= 0 && index < this._lines.length) {
      this.replaceLineRange(index, 1, []);
    }
    this.revision.value++;
  }

  markSaved(): void {
    this.captureSavedBaseline();
  }

  /** Snapshot the current content as the clean baseline (called on load + save), and resync the
   *  incrementally maintained length from the lines so the baseline facts are exact by construction
   *  and any accumulated drift is healed at every load and save. */
  protected captureSavedBaseline(): void {
    this.rebuildContentLength();
    this.savedLineCount = this._lines.length;
    this.savedContentLength = this.contentLengthValue;
    this.savedSignature = this.contentSignature();
    this.savedBaselineVersion.value++;
  }

  /** True when the current content is byte-identical to the last saved/loaded baseline. Cheapest
   *  facts first: a differing line count or total length settles the answer without hashing, which is
   *  why forward typing never pays for a signature; the hash runs only when both facts match — the
   *  one moment the answer might flip back to clean. */
  matchesSaved(): boolean {
    if (this._lines.length !== this.savedLineCount) return false;
    if (this.contentLengthValue !== this.savedContentLength) return false;
    return this.contentSignature() === this.savedSignature;
  }

  /** `lineCount:hash` over the joined lines (FNV-1a, allocation-free — hashes chars in place with a
   *  newline separator between lines rather than materializing one big joined string). */
  protected contentSignature(): string {
    let hash = 0x811c9dc5;
    for (let lineIndex = 0; lineIndex < this._lines.length; lineIndex += 1) {
      const line = this._lines[lineIndex]!;
      for (let charIndex = 0; charIndex < line.length; charIndex += 1) {
        hash = Math.imul(hash ^ line.charCodeAt(charIndex), 0x01000193);
      }
      hash = Math.imul(hash ^ 0x0a, 0x01000193); // newline separator
    }
    return `${this._lines.length}:${(hash >>> 0).toString(36)}`;
  }

  /** Rescan Σ line lengths. Only wholesale line-array assignments pay this (load, replaceAll, restore,
   *  baseline capture); localized edits adjust the running total inside `replaceLineRange` instead. */
  protected rebuildContentLength(): void {
    let totalLength = 0;
    for (let lineIndex = 0; lineIndex < this._lines.length; lineIndex += 1) {
      totalLength += this._lines[lineIndex]!.length;
    }
    this.contentLengthValue = totalLength;
  }

  // invariant: Geometry aggregates match their consumers (editor.invariants.md)
  protected rebuildMaximumLineWidth(): void {
    this.maximumLineWidthValue = 0;
    this.maximumLineWidthLineIndex = -1;
    if (this._lines.length === 0) return;

    let longestUtf16LineIndex = 0;
    for (let lineIndex = 1; lineIndex < this._lines.length; lineIndex += 1) {
      if (
        (this._lines[lineIndex]?.length ?? 0) >
        (this._lines[longestUtf16LineIndex]?.length ?? 0)
      ) {
        longestUtf16LineIndex = lineIndex;
      }
    }
    this.maximumLineWidthValue = this.measureLineDisplayWidth(
      this._lines[longestUtf16LineIndex] ?? '',
    );
    this.maximumLineWidthLineIndex = longestUtf16LineIndex;

    for (let lineIndex = 0; lineIndex < this._lines.length; lineIndex += 1) {
      if (lineIndex === longestUtf16LineIndex) continue;
      const line = this._lines[lineIndex] ?? '';
      if (this.lineDisplayWidthUpperBound(line) <= this.maximumLineWidthValue)
        continue;
      const lineWidth = this.measureLineDisplayWidth(line);
      if (lineWidth > this.maximumLineWidthValue) {
        this.maximumLineWidthValue = lineWidth;
        this.maximumLineWidthLineIndex = lineIndex;
      }
    }
  }

  protected lineDisplayWidthUpperBound(line: string): number {
    // Every non-tab UTF-16 code unit occupies at most two terminal columns. Tabs can expand to four
    // columns, so they deliberately survive the cheap bound and take the exact path.
    return line.includes('\t') ? Number.POSITIVE_INFINITY : line.length * 2;
  }

  protected measureLineDisplayWidth(line: string): number {
    return EditorCoordinates.Class.lineWidth(line);
  }

  protected replaceLineRange(
    startLineIndex: number,
    deletedLineCount: number,
    replacementLines: readonly string[],
  ): void {
    const previousMaximumLineWidthLineIndex = this.maximumLineWidthLineIndex;
    const previousMaximumLineWidth = this.maximumLineWidthValue;
    const maximumLineWasDeleted =
      deletedLineCount > 0 &&
      previousMaximumLineWidthLineIndex >= startLineIndex &&
      previousMaximumLineWidthLineIndex < startLineIndex + deletedLineCount;
    let replacementMaximumLineWidth = previousMaximumLineWidth;
    let replacementMaximumLineOffset = -1;
    for (
      let replacementLineOffset = 0;
      replacementLineOffset < replacementLines.length;
      replacementLineOffset += 1
    ) {
      const replacementLine = replacementLines[replacementLineOffset] ?? '';
      const replacementMayOwnMaximum = maximumLineWasDeleted
        ? this.lineDisplayWidthUpperBound(replacementLine) >=
          previousMaximumLineWidth
        : this.lineDisplayWidthUpperBound(replacementLine) >
          previousMaximumLineWidth;
      if (!replacementMayOwnMaximum) continue;

      const replacementLineWidth =
        this.measureLineDisplayWidth(replacementLine);
      const replacementOwnsMaximum = maximumLineWasDeleted
        ? replacementLineWidth >= replacementMaximumLineWidth
        : replacementLineWidth > replacementMaximumLineWidth;
      if (!replacementOwnsMaximum) continue;
      replacementMaximumLineWidth = replacementLineWidth;
      replacementMaximumLineOffset = replacementLineOffset;
    }
    // The running content length is adjusted from the lines this edit touches — O(edited lines), the
    // cost this op already pays — so no query ever rescans the document to learn its length.
    let lengthDelta = 0;
    for (
      let deletedLineOffset = 0;
      deletedLineOffset < deletedLineCount;
      deletedLineOffset += 1
    ) {
      lengthDelta -=
        this._lines[startLineIndex + deletedLineOffset]?.length ?? 0;
    }
    for (
      let replacementLineOffset = 0;
      replacementLineOffset < replacementLines.length;
      replacementLineOffset += 1
    ) {
      lengthDelta += replacementLines[replacementLineOffset]?.length ?? 0;
    }
    this.contentLengthValue += lengthDelta;
    this._lines.splice(startLineIndex, deletedLineCount, ...replacementLines);

    if (maximumLineWasDeleted) {
      if (replacementMaximumLineOffset >= 0) {
        this.maximumLineWidthValue = replacementMaximumLineWidth;
        this.maximumLineWidthLineIndex =
          startLineIndex + replacementMaximumLineOffset;
        return;
      }
      this.rebuildMaximumLineWidth();
      return;
    }
    if (startLineIndex <= previousMaximumLineWidthLineIndex) {
      this.maximumLineWidthLineIndex +=
        replacementLines.length - deletedLineCount;
    }
    if (replacementMaximumLineOffset >= 0) {
      this.maximumLineWidthValue = replacementMaximumLineWidth;
      this.maximumLineWidthLineIndex =
        startLineIndex + replacementMaximumLineOffset;
    }
  }

  // --- character-level editing (used from M3) ---

  /** Insert `text` (no newlines) at line/grapheme-col. Returns the new grapheme col. */
  insertInline(line: number, column: number, text: string): number {
    const currentLine = this.line(line);
    const graphemeColumn = EditorCoordinates.Class.clampCol(
      currentLine,
      column,
    );
    const utf16Offset = EditorCoordinates.Class.graphemeToU16(
      currentLine,
      graphemeColumn,
    );
    this.replaceLineRange(line, 1, [
      currentLine.slice(0, utf16Offset) + text + currentLine.slice(utf16Offset),
    ]);
    this.revision.value++;
    return graphemeColumn + EditorCoordinates.Class.graphemeCount(text);
  }

  /** Split a line at grapheme-col into two lines (Enter). Returns new cursor {line, col}. */
  splitLine(line: number, column: number): { line: number; col: number } {
    const currentLine = this.line(line);
    const utf16Offset = EditorCoordinates.Class.graphemeToU16(
      currentLine,
      EditorCoordinates.Class.clampCol(currentLine, column),
    );
    const before = currentLine.slice(0, utf16Offset);
    const after = currentLine.slice(utf16Offset);
    this.replaceLineRange(line, 1, [before, after]);
    this.revision.value++;
    return { line: line + 1, col: 0 };
  }

  /** Delete the grapheme before line/col (Backspace). Returns new cursor. */
  deleteBackward(line: number, column: number): { line: number; col: number } {
    const currentLine = this.line(line);
    if (column > 0) {
      const graphemeColumn = EditorCoordinates.Class.clampCol(
        currentLine,
        column,
      );
      const start = EditorCoordinates.Class.graphemeToU16(
        currentLine,
        graphemeColumn - 1,
      );
      const end = EditorCoordinates.Class.graphemeToU16(
        currentLine,
        graphemeColumn,
      );
      this.replaceLineRange(line, 1, [
        currentLine.slice(0, start) + currentLine.slice(end),
      ]);
      this.revision.value++;
      return { line, col: graphemeColumn - 1 };
    }
    if (line > 0) {
      const previousLine = this.line(line - 1);
      const newColumn = EditorCoordinates.Class.graphemeCount(previousLine);
      this.replaceLineRange(line - 1, 2, [previousLine + currentLine]);
      this.revision.value++;
      return { line: line - 1, col: newColumn };
    }
    return { line, col: column };
  }

  /** Delete the grapheme at line/col (Delete). Returns cursor unchanged. */
  deleteForward(line: number, column: number): { line: number; col: number } {
    const currentLine = this.line(line);
    const graphemeColumn = EditorCoordinates.Class.clampCol(
      currentLine,
      column,
    );
    if (graphemeColumn < EditorCoordinates.Class.graphemeCount(currentLine)) {
      const start = EditorCoordinates.Class.graphemeToU16(
        currentLine,
        graphemeColumn,
      );
      const end = EditorCoordinates.Class.graphemeToU16(
        currentLine,
        graphemeColumn + 1,
      );
      this.replaceLineRange(line, 1, [
        currentLine.slice(0, start) + currentLine.slice(end),
      ]);
      this.revision.value++;
    } else if (line < this._lines.length - 1) {
      this.replaceLineRange(line, 2, [currentLine + this.line(line + 1)]);
      this.revision.value++;
    }
    return { line, col: column };
  }

  // --- multi-line range ops (positions are {line, grapheme-col}; start <= end) ---

  /** Text of the [start, end) range, joined by EOL across lines. */
  sliceRange(
    start: { line: number; col: number },
    end: { line: number; col: number },
  ): string {
    if (start.line === end.line) {
      const currentLine = this.line(start.line);
      return currentLine.slice(
        EditorCoordinates.Class.graphemeToU16(currentLine, start.col),
        EditorCoordinates.Class.graphemeToU16(currentLine, end.col),
      );
    }
    const first = this.line(start.line);
    const last = this.line(end.line);
    const parts: string[] = [
      first.slice(EditorCoordinates.Class.graphemeToU16(first, start.col)),
    ];
    for (let index = start.line + 1; index < end.line; index++)
      parts.push(this.line(index));
    parts.push(
      last.slice(0, EditorCoordinates.Class.graphemeToU16(last, end.col)),
    );
    return parts.join(this._eol);
  }

  /** Delete the [start, end) range. Returns the collapse position (= start). */
  deleteRange(
    start: { line: number; col: number },
    end: { line: number; col: number },
  ): { line: number; col: number } {
    if (start.line === end.line) {
      const currentLine = this.line(start.line);
      this.replaceLineRange(start.line, 1, [
        currentLine.slice(
          0,
          EditorCoordinates.Class.graphemeToU16(currentLine, start.col),
        ) +
          currentLine.slice(
            EditorCoordinates.Class.graphemeToU16(currentLine, end.col),
          ),
      ]);
    } else {
      const head = this.line(start.line).slice(
        0,
        EditorCoordinates.Class.graphemeToU16(this.line(start.line), start.col),
      );
      const tail = this.line(end.line).slice(
        EditorCoordinates.Class.graphemeToU16(this.line(end.line), end.col),
      );
      this.replaceLineRange(start.line, end.line - start.line + 1, [
        head + tail,
      ]);
    }
    this.revision.value++;
    return { line: start.line, col: start.col };
  }

  /** Insert possibly-multiline text at line/grapheme-col. Returns the end position. */
  insertMultiline(
    line: number,
    column: number,
    text: string,
  ): { line: number; col: number } {
    const parts = text.split(/\r?\n/);
    if (parts.length === 1) {
      return { line, col: this.insertInline(line, column, parts[0] ?? '') };
    }
    const currentLine = this.line(line);
    const utf16Offset = EditorCoordinates.Class.graphemeToU16(
      currentLine,
      EditorCoordinates.Class.clampCol(currentLine, column),
    );
    const before = currentLine.slice(0, utf16Offset);
    const after = currentLine.slice(utf16Offset);
    const firstPart = parts[0] ?? '';
    const lastPart = parts[parts.length - 1] ?? '';
    const middle = parts.slice(1, -1);
    this.replaceLineRange(line, 1, [
      before + firstPart,
      ...middle,
      lastPart + after,
    ]);
    this.revision.value++;
    return {
      line: line + parts.length - 1,
      col: EditorCoordinates.Class.graphemeCount(lastPart),
    };
  }

  /** Replace a completion/edit range as one document mutation and return the inserted-text end. */
  replaceRange(
    start: { line: number; col: number },
    end: { line: number; col: number },
    text: string,
  ): { line: number; col: number } {
    const firstLine = this.line(start.line);
    const lastLine = this.line(end.line);
    const head = firstLine.slice(
      0,
      EditorCoordinates.Class.graphemeToU16(firstLine, start.col),
    );
    const tail = lastLine.slice(
      EditorCoordinates.Class.graphemeToU16(lastLine, end.col),
    );
    const replacementParts = text.split(/\r?\n/);
    const firstPart = replacementParts[0] ?? '';
    const lastPart = replacementParts[replacementParts.length - 1] ?? '';
    const replacementLines =
      replacementParts.length === 1
        ? [head + firstPart + tail]
        : [head + firstPart, ...replacementParts.slice(1, -1), lastPart + tail];
    this.replaceLineRange(
      start.line,
      end.line - start.line + 1,
      replacementLines,
    );
    this.revision.value++;
    return replacementParts.length === 1
      ? {
          line: start.line,
          col: start.col + EditorCoordinates.Class.graphemeCount(firstPart),
        }
      : {
          line: start.line + replacementParts.length - 1,
          col: EditorCoordinates.Class.graphemeCount(lastPart),
        };
  }

  /** Snapshot the full line array (for undo). */
  snapshot(): string[] {
    return this._lines.slice();
  }

  /** Restore from a snapshot (undo/redo). Nothing asserts a dirty state here or anywhere else — the
   *  restored content answers for itself against the saved baseline. */
  restore(lines: string[]): void {
    this._lines = lines.length ? lines.slice() : [''];
    this.rebuildMaximumLineWidth();
    this.rebuildContentLength();
    this.revision.value++;
  }
}

export namespace TextDocument {
  export const $Class = $TextDocument;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
