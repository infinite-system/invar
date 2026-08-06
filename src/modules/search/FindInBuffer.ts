import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import type { TextDocument } from '../text/TextDocument';
import { TextInputModel } from '../text/TextInputModel';
import type { TextEdit } from '../text/TextEdit.interface';
import { TextSearchPattern, type TextSearchMatch } from './TextSearchPattern';

// invariant: Editable text fields share one input model (project.invariants.md)
class $FindInBuffer {
  constructor(public readonly document: TextDocument.Instance) {
    this.queryInputModel = this.createTextInput();
    this.replacementInputModel = this.createTextInput();
  }

  protected textSearchMatches: readonly TextSearchMatch[] = [];
  protected textSearchPattern: TextSearchPattern.Instance | null = null;
  protected readonly queryInputModel: TextInputModel.Model;
  protected readonly replacementInputModel: TextInputModel.Model;

  protected createTextInput(): TextInputModel.Model {
    return new TextInputModel.Class();
  }

  get queryInput(): TextInputModel.Model {
    return this.queryInputModel;
  }
  get replacementInput(): TextInputModel.Model {
    return this.replacementInputModel;
  }
  get query() {
    return this.queryInput.text;
  }

  get replacement() {
    return this.replacementInput.text;
  }

  get caseSensitive() {
    return ref(false);
  }

  get wholeWord() {
    return ref(false);
  }

  get useRegex() {
    return ref(false);
  }

  get matches() {
    return shallowRef<readonly FindInBufferMatch[]>([]);
  }

  get currentMatchIndex() {
    return ref(-1);
  }

  get matchCount(): number {
    return this.matches.value.length;
  }

  /** The range a caller may reveal; scrolling remains the caller's responsibility. */
  get currentMatch(): FindInBufferMatch | null {
    return this.matches.value[this.currentMatchIndex.value] ?? null;
  }

  get currentMatchRange(): FindInBufferMatch | null {
    return this.currentMatch;
  }

  findAll(): readonly FindInBufferMatch[] {
    const textSearchPattern = this.createTextSearchPattern();
    if (!textSearchPattern.valid) {
      this.clearMatches();
      return this.matches.value;
    }
    this.textSearchPattern = textSearchPattern;
    this.textSearchMatches = textSearchPattern.matchesInDocument(this.document);
    this.matches.value = this.textSearchMatches.map((match) => ({
      line: match.line,
      startColumn: match.startColumn,
      endColumn: match.endColumn,
    }));
    this.currentMatchIndex.value = this.matches.value.length > 0 ? 0 : -1;
    return this.matches.value;
  }

  next(): FindInBufferMatch | null {
    if (this.matchCount === 0) {
      this.currentMatchIndex.value = -1;
      return null;
    }
    this.currentMatchIndex.value =
      (this.currentMatchIndex.value + 1 + this.matchCount) % this.matchCount;
    return this.currentMatch;
  }

  previous(): FindInBufferMatch | null {
    if (this.matchCount === 0) {
      this.currentMatchIndex.value = -1;
      return null;
    }
    this.currentMatchIndex.value =
      (this.currentMatchIndex.value - 1 + this.matchCount) % this.matchCount;
    return this.currentMatch;
  }

  replaceCurrent(): TextEdit | null {
    const textSearchMatch =
      this.textSearchMatches[this.currentMatchIndex.value];
    const currentMatch = this.currentMatch;
    if (currentMatch === null || textSearchMatch === undefined) return null;
    return this.textEdit(currentMatch, textSearchMatch);
  }

  replaceAll(): readonly TextEdit[] {
    this.findAll();
    return this.matches.value.flatMap((match, matchIndex) => {
      const textSearchMatch = this.textSearchMatches[matchIndex];
      return textSearchMatch ? [this.textEdit(match, textSearchMatch)] : [];
    });
  }

  protected textEdit(
    match: FindInBufferMatch,
    textSearchMatch: TextSearchMatch,
  ): TextEdit {
    const textSearchPattern = this.textSearchPattern;
    if (textSearchPattern === null) {
      throw new Error('A replacement requires a completed text search.');
    }
    return {
      start: { line: match.line, column: match.startColumn },
      end: { line: match.line, column: match.endColumn },
      expectedText: textSearchMatch.matchedText,
      replacementText: textSearchPattern.expandReplacement(
        this.replacement.value,
        textSearchMatch,
      ),
    };
  }

  protected createTextSearchPattern(): TextSearchPattern.Instance {
    return new TextSearchPattern.Class({
      text: this.query.value,
      caseSensitive: this.caseSensitive.value,
      wholeWord: this.wholeWord.value,
      useRegex: this.useRegex.value,
    });
  }

  protected clearMatches(): void {
    this.matches.value = [];
    this.textSearchMatches = [];
    this.textSearchPattern = null;
    this.currentMatchIndex.value = -1;
  }
}

export namespace FindInBuffer {
  export const $Class = $FindInBuffer;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface FindInBufferMatch {
  line: number;
  startColumn: number;
  endColumn: number;
}
