import type {
  ExternalUndoDirection,
  ExternalUndoReference,
} from '../storage/UndoStore';

/** One view-history boundary for opaque workspace undo references. */
export interface ExternalUndoHistory {
  attachExternalUndoRequestHandler(
    handler: ExternalUndoRequestHandler | null,
  ): void;
  recordExternalUndoReference(
    reference: ExternalUndoReference,
    direction?: ExternalUndoDirection,
  ): void;
  moveExternalUndoReference(
    reference: ExternalUndoReference,
    direction: ExternalUndoDirection,
  ): boolean;
  removeExternalUndoReference(reference: ExternalUndoReference): boolean;
}

export type ExternalUndoRequestHandler = (
  direction: ExternalUndoDirection,
  reference: ExternalUndoReference,
) => void;
