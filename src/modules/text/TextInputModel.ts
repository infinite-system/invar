import { Reactive } from 'ivue';
import { ref } from 'vue';
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

  protected get clampedCaret(): number {
    return Math.max(0, Math.min(this.caret.value, this.graphemeCount));
  }
  protected get caretUtf16Offset(): number {
    return TextCoordinates.Class.graphemeToU16(
      this.text.value,
      this.clampedCaret,
    );
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
    return true;
  }

  setValue(value: string, caret?: number): void {
    this.text.value = this.flatten(value);
    this.caret.value =
      caret === undefined
        ? TextCoordinates.Class.graphemeCount(this.text.value)
        : Math.max(0, Math.min(caret, this.graphemeCount));
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
    return this.replaceRange(this.clampedCaret, this.clampedCaret, value);
  }

  backspace(): boolean {
    const caret = this.clampedCaret;
    return caret > 0 && this.replaceRange(caret - 1, caret, '');
  }

  deleteForward(): boolean {
    const caret = this.clampedCaret;
    return (
      caret < this.graphemeCount && this.replaceRange(caret, caret + 1, '')
    );
  }

  deletePreviousWord(): boolean {
    const caret = this.clampedCaret;
    if (caret === 0) return false;
    const deletion = TextEditing.Class.deletePreviousWord(
      this.text.value,
      caret,
    );
    this.text.value = deletion.text;
    this.caret.value = deletion.start;
    return deletion.start !== deletion.end;
  }

  deleteNextWord(): boolean {
    const caret = this.clampedCaret;
    if (caret === this.graphemeCount) return false;
    const deletion = TextEditing.Class.deleteNextWord(this.text.value, caret);
    this.text.value = deletion.text;
    this.caret.value = deletion.start;
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
  }

  moveLeft(): boolean {
    const originalCaret = this.clampedCaret;
    this.caret.value = Math.max(0, originalCaret - 1);
    return this.caret.value !== originalCaret;
  }

  moveRight(): boolean {
    const originalCaret = this.clampedCaret;
    this.caret.value = Math.min(this.graphemeCount, originalCaret + 1);
    return this.caret.value !== originalCaret;
  }

  moveWordLeft(): boolean {
    const originalCaret = this.clampedCaret;
    this.caret.value = TextEditing.Class.wordLeft(
      this.text.value,
      originalCaret,
    );
    return this.caret.value !== originalCaret;
  }

  moveWordRight(): boolean {
    const originalCaret = this.clampedCaret;
    this.caret.value = TextEditing.Class.wordRight(
      this.text.value,
      originalCaret,
    );
    return this.caret.value !== originalCaret;
  }

  moveHome(): boolean {
    const moved = this.clampedCaret !== 0;
    this.caret.value = 0;
    return moved;
  }

  moveEnd(): boolean {
    const end = this.graphemeCount;
    const moved = this.clampedCaret !== end;
    this.caret.value = end;
    return moved;
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
  | 'backspace'
  | 'deleteForward'
  | 'deletePreviousWord'
  | 'deleteNextWord'
  | 'deleteLine';
