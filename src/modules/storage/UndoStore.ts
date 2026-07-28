// Undo/redo as a bounded stack of localized line replacements. A typing run
// coalesces by appending its small deltas to one state; no edit snapshots or
// copies the document-sized line array.
//
// invariant: Cost tracks the actively observed set (project.invariants.md)
// invariant: Undo records deltas not whole-document snapshots (src/modules/editor/editor.invariants.md)
import { Static } from 'ivue/extras';

class $UndoStore {
  protected static get MAXIMUM_DEPTH(): number {
    return 500;
  }

  protected static get COALESCE_MILLISECONDS(): number {
    return 400;
  }

  protected undoStack: UndoState[] = [];
  protected redoStack: UndoState[] = [];
  protected activeState: UndoState | null = null;
  protected activeStateIsPending = false;

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.activeState = null;
    this.activeStateIsPending = false;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  get depth(): number {
    return this.undoStack.length;
  }

  /**
   * Begin the state BEFORE an edit. The state is not retained until the
   * document publishes its first localized change, so a no-op never pollutes
   * history or clears redo.
   */
  begin(state: UndoStateStart, now: number): void {
    this.activeState = null;
    this.activeStateIsPending = false;
    const previous = this.undoStack[this.undoStack.length - 1];
    if (
      previous &&
      previous.kind === state.kind &&
      (state.kind === 'insert' || state.kind === 'delete') &&
      now - previous.at <
        (this.constructor as typeof $UndoStore).COALESCE_MILLISECONDS
    ) {
      previous.at = now;
      this.activeState = previous;
      return;
    }
    this.activeState = {
      at: state.at,
      beforeCursor: state.beforeCursor,
      changes: [],
      kind: state.kind,
    };
    this.activeStateIsPending = true;
  }

  /** Append the localized replacement emitted by the document's one write
   *  path. Multiple replacements inside one command remain one undo step. */
  recordChange(change: UndoChange): void {
    const activeState = this.activeState;
    if (activeState === null) return;
    if (this.activeStateIsPending) {
      this.redoStack = [];
      this.undoStack.push(activeState);
      this.activeStateIsPending = false;
      if (
        this.undoStack.length >
        (this.constructor as typeof $UndoStore).MAXIMUM_DEPTH
      ) {
        this.undoStack.shift();
      }
    }
    activeState.changes.push({
      deletedLines: [...change.deletedLines],
      insertedLines: [...change.insertedLines],
      startLineIndex: change.startLineIndex,
    });
  }

  /** Move the newest delta group to redo and remember its post-edit cursor. */
  undo(currentCursor: UndoCursor): UndoState | null {
    this.endActiveState();
    const target = this.undoStack.pop();
    if (!target) return null;
    target.afterCursor = { ...currentCursor };
    this.redoStack.push(target);
    return target;
  }

  /** Move the newest redo delta group back to undo. */
  redo(): UndoState | null {
    this.endActiveState();
    const target = this.redoStack.pop();
    if (!target) return null;
    this.undoStack.push(target);
    return target;
  }

  protected endActiveState(): void {
    this.activeState = null;
    this.activeStateIsPending = false;
  }
}

export namespace UndoStore {
  export const $Class = Static($UndoStore);
  export let Class = $Class;
  export type Instance = InstanceType<typeof $UndoStore>;
}

export type EditKind = 'insert' | 'delete' | 'newline' | 'paste' | 'other';

export interface UndoCursor {
  readonly line: number;
  readonly col: number;
}

export interface UndoChange {
  readonly deletedLines: readonly string[];
  readonly insertedLines: readonly string[];
  readonly startLineIndex: number;
}

export interface UndoStateStart {
  readonly beforeCursor: UndoCursor;
  readonly kind: EditKind;
  readonly at: number;
}

export interface UndoState {
  at: number;
  readonly beforeCursor: UndoCursor;
  readonly changes: UndoChange[];
  readonly kind: EditKind;
  afterCursor?: UndoCursor;
}
