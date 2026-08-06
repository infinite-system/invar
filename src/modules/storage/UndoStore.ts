// Undo/redo as a bounded stack of localized line replacements. A typing run
// coalesces by appending its small deltas to one state; no edit snapshots or
// copies the document-sized line array.
//
// invariant: Cost tracks the actively observed set (project.invariants.md)
// invariant: Undo records deltas not whole-document snapshots (src/modules/editor/editor.invariants.md)
import { Static } from 'ivue/extras';
import type { TextEditBatchMetadata } from '../text/TextEdit.interface';

class $UndoStore {
  protected static get MAXIMUM_DEPTH(): number {
    return 500;
  }

  protected static get COALESCE_MILLISECONDS(): number {
    return 400;
  }

  protected undoStack: UndoEntry[] = [];
  protected redoStack: UndoEntry[] = [];
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
  get nextUndoMetadata(): TextEditBatchMetadata | null {
    const entry = this.undoStack[this.undoStack.length - 1];
    return entry && 'changes' in entry ? (entry.metadata ?? null) : null;
  }
  get nextRedoMetadata(): TextEditBatchMetadata | null {
    const entry = this.redoStack[this.redoStack.length - 1];
    return entry && 'changes' in entry ? (entry.metadata ?? null) : null;
  }
  get nextUndoExternalReference(): ExternalUndoReference | null {
    const entry = this.undoStack[this.undoStack.length - 1];
    return entry && 'externalReference' in entry
      ? entry.externalReference
      : null;
  }
  get nextRedoExternalReference(): ExternalUndoReference | null {
    const entry = this.redoStack[this.redoStack.length - 1];
    return entry && 'externalReference' in entry
      ? entry.externalReference
      : null;
  }

  /**
   * Begin the state BEFORE an edit. The state is not retained until the
   * document publishes its first localized change, so a no-op never pollutes
   * history or clears redo.
   */
  begin(state: UndoStateStart, now: number): void {
    this.activeState = null;
    this.activeStateIsPending = false;
    const previousEntry = this.undoStack[this.undoStack.length - 1];
    const previous =
      previousEntry && 'changes' in previousEntry ? previousEntry : null;
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
      metadata: state.metadata,
    };
    this.activeStateIsPending = true;
  }

  /** Add one opaque workspace reference. The editor history retains no patch text. */
  recordExternalReference(
    reference: ExternalUndoReference,
    direction: ExternalUndoDirection = 'undo',
  ): void {
    this.endActiveState();
    this.removeExternalReference(reference);
    const entry: ExternalUndoEntry = {
      externalReference: {
        providerIdentifier: reference.providerIdentifier,
        transactionIdentifier: reference.transactionIdentifier,
        documentIdentifier: reference.documentIdentifier,
      },
    };
    if (direction === 'undo') {
      this.redoStack = [];
      this.undoStack.push(entry);
      this.trimUndoStack();
      return;
    }
    this.redoStack.push(entry);
  }

  /** Move a matching opaque reference after its workspace transaction completes. */
  moveExternalReference(
    reference: ExternalUndoReference,
    direction: ExternalUndoDirection,
  ): boolean {
    this.endActiveState();
    const sourceStack = direction === 'undo' ? this.undoStack : this.redoStack;
    const destinationStack =
      direction === 'undo' ? this.redoStack : this.undoStack;
    const entryIndex = sourceStack.findIndex(
      (entry) =>
        'externalReference' in entry &&
        this.referencesEqual(entry.externalReference, reference),
    );
    if (entryIndex < 0) return false;
    const entry = sourceStack.splice(entryIndex, 1)[0]!;
    destinationStack.push(entry);
    if (direction === 'redo') this.trimUndoStack();
    return true;
  }

  removeExternalReference(reference: ExternalUndoReference): boolean {
    const undoCountBefore = this.undoStack.length;
    const redoCountBefore = this.redoStack.length;
    this.undoStack = this.undoStack.filter(
      (entry) =>
        !(
          'externalReference' in entry &&
          this.referencesEqual(entry.externalReference, reference)
        ),
    );
    this.redoStack = this.redoStack.filter(
      (entry) =>
        !(
          'externalReference' in entry &&
          this.referencesEqual(entry.externalReference, reference)
        ),
    );
    return (
      undoCountBefore !== this.undoStack.length ||
      redoCountBefore !== this.redoStack.length
    );
  }

  externalReferences(): ExternalUndoReferenceLedger {
    return {
      undo: this.undoStack.flatMap((entry) =>
        'externalReference' in entry ? [entry.externalReference] : [],
      ),
      redo: this.redoStack.flatMap((entry) =>
        'externalReference' in entry ? [entry.externalReference] : [],
      ),
    };
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
    const target = this.undoStack[this.undoStack.length - 1];
    if (!target || 'externalReference' in target) return null;
    this.undoStack.pop();
    target.afterCursor = { ...currentCursor };
    this.redoStack.push(target);
    return target;
  }

  /** Move the newest redo delta group back to undo. */
  redo(): UndoState | null {
    this.endActiveState();
    const target = this.redoStack[this.redoStack.length - 1];
    if (!target || 'externalReference' in target) return null;
    this.redoStack.pop();
    this.undoStack.push(target);
    return target;
  }

  protected endActiveState(): void {
    this.activeState = null;
    this.activeStateIsPending = false;
  }

  protected trimUndoStack(): void {
    while (
      this.undoStack.length >
      (this.constructor as typeof $UndoStore).MAXIMUM_DEPTH
    ) {
      this.undoStack.shift();
    }
  }

  protected referencesEqual(
    first: ExternalUndoReference,
    second: ExternalUndoReference,
  ): boolean {
    return (
      first.providerIdentifier === second.providerIdentifier &&
      first.transactionIdentifier === second.transactionIdentifier &&
      first.documentIdentifier === second.documentIdentifier
    );
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
  readonly metadata?: TextEditBatchMetadata;
}

export interface UndoState {
  at: number;
  readonly beforeCursor: UndoCursor;
  readonly changes: UndoChange[];
  readonly kind: EditKind;
  readonly metadata?: TextEditBatchMetadata;
  afterCursor?: UndoCursor;
}

export interface ExternalUndoReference {
  readonly providerIdentifier: string;
  readonly transactionIdentifier: string;
  readonly documentIdentifier: string;
}

export type ExternalUndoDirection = 'undo' | 'redo';

export interface ExternalUndoReferenceLedger {
  readonly undo: readonly ExternalUndoReference[];
  readonly redo: readonly ExternalUndoReference[];
}

interface ExternalUndoEntry {
  readonly externalReference: ExternalUndoReference;
}

type UndoEntry = UndoState | ExternalUndoEntry;
