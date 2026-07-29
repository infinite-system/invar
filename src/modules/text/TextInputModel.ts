import { Reactive } from 'ivue';
import { ref } from 'vue';
import { Clipboard } from '../system/Clipboard';
import { TextCoordinates } from './TextCoordinates';
import { TextEditing } from './TextEditing';

// invariant: Editable text fields share one input model (project.invariants.md)
class $TextInputModel {
  constructor(initialValue = '') {
    this.setValue(initialValue);
  }

  get text() {
    return ref('');
  }
  get caret() {
    return ref(0);
  }
  get selectionAnchor() {
    return ref<number | null>(null);
  }

  get value(): string {
    return this.text.value;
  }
  get isEmpty(): boolean {
    return this.text.value.length === 0;
  }
  get graphemeCount(): number {
    return TextCoordinates.Class.graphemeCount(this.text.value);
  }
  get isAtEnd(): boolean {
    return this.clampedCaret === this.graphemeCount;
  }
  get valueBeforeCaret(): string {
    return this.text.value.slice(0, this.caretUtf16Offset);
  }
  get valueAfterCaret(): string {
    return this.text.value.slice(this.caretUtf16Offset);
  }
  get hasSelection(): boolean {
    return this.selectionRange() !== null;
  }

  protected get clampedCaret(): number {
    return Math.max(0, Math.min(this.caret.value, this.graphemeCount));
  }
  protected get caretUtf16Offset(): number {
    return TextCoordinates.Class.graphemeToU16(
      this.text.value,
      this.clampedCaret,
    );
  }

  selectionRange(): TextInputSelectionRange | null {
    const storedAnchor = this.selectionAnchor.value;
    const caret = this.clampedCaret;
    if (storedAnchor === null) return null;
    const anchor = Math.max(0, Math.min(storedAnchor, this.graphemeCount));
    if (anchor === caret) return null;
    return anchor < caret
      ? { start: anchor, end: caret }
      : { start: caret, end: anchor };
  }

  selectedText(): string {
    const selection = this.selectionRange();
    if (!selection) return '';
    const startUtf16Offset = TextCoordinates.Class.graphemeToU16(
      this.text.value,
      selection.start,
    );
    const endUtf16Offset = TextCoordinates.Class.graphemeToU16(
      this.text.value,
      selection.end,
    );
    return this.text.value.slice(startUtf16Offset, endUtf16Offset);
  }

  async copySelection(): Promise<number> {
    const selectedText = this.selectedText();
    if (selectedText.length === 0) return 0;
    await Clipboard.Class.copy(selectedText);
    return selectedText.length;
  }

  protected flatten(value: string): string {
    return value.replace(/\r\n?|\n/g, ' ');
  }

  protected replaceRange(
    start: number,
    end: number,
    replacement: string,
  ): boolean {
    const clampedStart = Math.max(0, Math.min(start, this.graphemeCount));
    const clampedEnd = Math.max(
      clampedStart,
      Math.min(end, this.graphemeCount),
    );
    const flattenedReplacement = this.flatten(replacement);
    if (clampedStart === clampedEnd && flattenedReplacement.length === 0) {
      return false;
    }
    const startUtf16Offset = TextCoordinates.Class.graphemeToU16(
      this.text.value,
      clampedStart,
    );
    const endUtf16Offset = TextCoordinates.Class.graphemeToU16(
      this.text.value,
      clampedEnd,
    );
    this.text.value =
      this.text.value.slice(0, startUtf16Offset) +
      flattenedReplacement +
      this.text.value.slice(endUtf16Offset);
    this.caret.value =
      clampedStart + TextCoordinates.Class.graphemeCount(flattenedReplacement);
    this.selectionAnchor.value = null;
    return true;
  }

  setValue(value: string, caret?: number): void {
    this.text.value = this.flatten(value);
    this.caret.value =
      caret === undefined
        ? TextCoordinates.Class.graphemeCount(this.text.value)
        : Math.max(0, Math.min(caret, this.graphemeCount));
    this.selectionAnchor.value = null;
  }

  apply(action: TextInputAction): boolean {
    switch (action) {
      case 'moveLeft':
        return this.moveLeft();
      case 'moveRight':
        return this.moveRight();
      case 'moveWordLeft':
        return this.moveWordLeft();
      case 'moveWordRight':
        return this.moveWordRight();
      case 'moveHome':
        return this.moveHome();
      case 'moveEnd':
        return this.moveEnd();
      case 'selectLeft':
        return this.moveLeft(true);
      case 'selectRight':
        return this.moveRight(true);
      case 'selectWordLeft':
        return this.moveWordLeft(true);
      case 'selectWordRight':
        return this.moveWordRight(true);
      case 'selectHome':
        return this.moveHome(true);
      case 'selectEnd':
        return this.moveEnd(true);
      case 'selectAll':
        return this.selectAll();
      case 'backspace':
        return this.backspace();
      case 'deleteForward':
        return this.deleteForward();
      case 'deletePreviousWord':
        return this.deletePreviousWord();
      case 'deleteNextWord':
        return this.deleteNextWord();
      case 'deleteLine':
        return this.deleteLine();
    }
  }

  insert(value: string): boolean {
    const selection = this.selectionRange();
    return this.replaceRange(
      selection?.start ?? this.clampedCaret,
      selection?.end ?? this.clampedCaret,
      value,
    );
  }

  backspace(): boolean {
    const selection = this.selectionRange();
    if (selection) return this.replaceRange(selection.start, selection.end, '');
    const caret = this.clampedCaret;
    return caret > 0 && this.replaceRange(caret - 1, caret, '');
  }

  deleteForward(): boolean {
    const selection = this.selectionRange();
    if (selection) return this.replaceRange(selection.start, selection.end, '');
    const caret = this.clampedCaret;
    return (
      caret < this.graphemeCount && this.replaceRange(caret, caret + 1, '')
    );
  }

  deletePreviousWord(): boolean {
    const selection = this.selectionRange();
    if (selection) return this.replaceRange(selection.start, selection.end, '');
    const caret = this.clampedCaret;
    if (caret === 0) return false;
    const deletion = TextEditing.Class.deletePreviousWord(
      this.text.value,
      caret,
    );
    this.text.value = deletion.text;
    this.caret.value = deletion.start;
    this.selectionAnchor.value = null;
    return deletion.start !== deletion.end;
  }

  deleteNextWord(): boolean {
    const selection = this.selectionRange();
    if (selection) return this.replaceRange(selection.start, selection.end, '');
    const caret = this.clampedCaret;
    if (caret === this.graphemeCount) return false;
    const deletion = TextEditing.Class.deleteNextWord(this.text.value, caret);
    this.text.value = deletion.text;
    this.caret.value = deletion.start;
    this.selectionAnchor.value = null;
    return deletion.start !== deletion.end;
  }

  deleteLine(): boolean {
    if (this.text.value.length === 0) return false;
    this.clear();
    return true;
  }

  clear(): void {
    this.text.value = '';
    this.caret.value = 0;
    this.selectionAnchor.value = null;
  }

  protected beginMove(extendSelection: boolean): boolean {
    if (extendSelection) {
      if (this.selectionAnchor.value === null) {
        this.selectionAnchor.value = this.clampedCaret;
        return true;
      }
      return false;
    }
    const selectionWasActive = this.selectionAnchor.value !== null;
    this.selectionAnchor.value = null;
    return selectionWasActive;
  }

  moveLeft(extendSelection = false): boolean {
    const selectionChanged = this.beginMove(extendSelection);
    const originalCaret = this.clampedCaret;
    this.caret.value = Math.max(0, originalCaret - 1);
    return this.caret.value !== originalCaret || selectionChanged;
  }

  moveRight(extendSelection = false): boolean {
    const selectionChanged = this.beginMove(extendSelection);
    const originalCaret = this.clampedCaret;
    this.caret.value = Math.min(this.graphemeCount, originalCaret + 1);
    return this.caret.value !== originalCaret || selectionChanged;
  }

  moveWordLeft(extendSelection = false): boolean {
    const selectionChanged = this.beginMove(extendSelection);
    const originalCaret = this.clampedCaret;
    this.caret.value = TextEditing.Class.wordLeft(
      this.text.value,
      originalCaret,
    );
    return this.caret.value !== originalCaret || selectionChanged;
  }

  moveWordRight(extendSelection = false): boolean {
    const selectionChanged = this.beginMove(extendSelection);
    const originalCaret = this.clampedCaret;
    this.caret.value = TextEditing.Class.wordRight(
      this.text.value,
      originalCaret,
    );
    return this.caret.value !== originalCaret || selectionChanged;
  }

  moveHome(extendSelection = false): boolean {
    const selectionChanged = this.beginMove(extendSelection);
    const moved = this.clampedCaret !== 0;
    this.caret.value = 0;
    return moved || selectionChanged;
  }

  moveEnd(extendSelection = false): boolean {
    const selectionChanged = this.beginMove(extendSelection);
    const end = this.graphemeCount;
    const moved = this.clampedCaret !== end;
    this.caret.value = end;
    return moved || selectionChanged;
  }

  selectAll(): boolean {
    const originalCaret = this.clampedCaret;
    const originalAnchor = this.selectionAnchor.value;
    this.selectionAnchor.value = 0;
    this.caret.value = this.graphemeCount;
    return originalCaret !== this.caret.value || originalAnchor !== 0;
  }

  beginSelection(caret: number): void {
    const clampedCaret = Math.max(0, Math.min(caret, this.graphemeCount));
    this.caret.value = clampedCaret;
    this.selectionAnchor.value = clampedCaret;
  }

  extendSelection(caret: number): void {
    if (this.selectionAnchor.value === null) {
      this.selectionAnchor.value = this.clampedCaret;
    }
    this.caret.value = Math.max(0, Math.min(caret, this.graphemeCount));
  }

  finishSelection(): void {
    if (!this.hasSelection) this.selectionAnchor.value = null;
  }

  clearSelection(): boolean {
    if (this.selectionAnchor.value === null) return false;
    this.selectionAnchor.value = null;
    return true;
  }
}

export namespace TextInputModel {
  export const $Class = $TextInputModel;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

export type TextInputAction =
  | 'moveLeft'
  | 'moveRight'
  | 'moveWordLeft'
  | 'moveWordRight'
  | 'moveHome'
  | 'moveEnd'
  | 'selectLeft'
  | 'selectRight'
  | 'selectWordLeft'
  | 'selectWordRight'
  | 'selectHome'
  | 'selectEnd'
  | 'selectAll'
  | 'backspace'
  | 'deleteForward'
  | 'deletePreviousWord'
  | 'deleteNextWord'
  | 'deleteLine';

export interface TextInputSelectionRange {
  readonly start: number;
  readonly end: number;
}
