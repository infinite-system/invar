import type {
  ExternalUndoDirection,
  ExternalUndoReference,
} from '../storage/UndoStore';
import type { DocumentHandle } from './DocumentHandle';
import type { ExternalUndoHistory } from './ExternalUndoHistory.interface';

// The workspace coordinator keeps opaque transaction references aligned across live editor
// histories. The provider owns patch data, verification, consent, and mutation. A reopened view
// receives the same still-live references by document path without receiving any patch text.
//
// invariant: Document identity survives document instance replacement (src/modules/workspace/workspace.invariants.md)
class $WorkspaceUndoCoordinator {
  protected readonly providers = new Map<string, WorkspaceUndoProvider>();
  protected readonly transactions: WorkspaceUndoTransactionRecord[] = [];
  protected readonly attachedDocuments = new Map<string, ExternalUndoHistory>();

  registerProvider(
    providerIdentifier: string,
    provider: WorkspaceUndoProvider,
  ): () => void {
    this.providers.set(providerIdentifier, provider);
    return () => {
      if (this.providers.get(providerIdentifier) === provider) {
        this.providers.delete(providerIdentifier);
      }
    };
  }

  registerTransaction(
    providerIdentifier: string,
    transactionIdentifier: string,
    documentIdentifiers: readonly string[],
  ): void {
    if (this.findTransaction(providerIdentifier, transactionIdentifier)) {
      throw new Error(
        `Workspace undo transaction ${providerIdentifier}:${transactionIdentifier} already exists.`,
      );
    }
    const uniqueDocumentIdentifiers = [...new Set(documentIdentifiers)];
    if (uniqueDocumentIdentifiers.length === 0) {
      throw new Error('A workspace undo transaction must name a document.');
    }
    const transaction: WorkspaceUndoTransactionRecord = {
      providerIdentifier,
      transactionIdentifier,
      documentIdentifiers: uniqueDocumentIdentifiers,
      state: 'applied',
      pendingDirection: null,
    };
    this.transactions.push(transaction);
    for (const documentIdentifier of uniqueDocumentIdentifiers) {
      const attached = this.attachedDocuments.get(documentIdentifier);
      attached?.recordExternalUndoReference(
        this.referenceFor(transaction, documentIdentifier),
        'undo',
      );
    }
  }

  attach(
    documentHandle: DocumentHandle.Model,
    history: ExternalUndoHistory,
  ): void {
    const documentIdentifier = documentHandle.path;
    const existing = this.attachedDocuments.get(documentIdentifier);
    if (existing && existing !== history) {
      existing.attachExternalUndoRequestHandler(null);
    }
    this.attachedDocuments.set(documentIdentifier, history);
    history.attachExternalUndoRequestHandler((direction, reference) =>
      this.request(direction, reference),
    );
    const matchingTransactions = this.transactions.filter((transaction) =>
      transaction.documentIdentifiers.includes(documentIdentifier),
    );
    for (const transaction of matchingTransactions) {
      if (transaction.state !== 'applied') continue;
      history.recordExternalUndoReference(
        this.referenceFor(transaction, documentIdentifier),
        'undo',
      );
    }
    for (
      let transactionIndex = matchingTransactions.length - 1;
      transactionIndex >= 0;
      transactionIndex--
    ) {
      const transaction = matchingTransactions[transactionIndex]!;
      if (transaction.state !== 'undone') continue;
      history.recordExternalUndoReference(
        this.referenceFor(transaction, documentIdentifier),
        'redo',
      );
    }
  }

  detach(
    documentHandle: DocumentHandle.Model,
    history: ExternalUndoHistory,
  ): void {
    const attached = this.attachedDocuments.get(documentHandle.path);
    if (attached !== history) return;
    history.attachExternalUndoRequestHandler(null);
    this.attachedDocuments.delete(documentHandle.path);
  }

  request(
    direction: ExternalUndoDirection,
    reference: ExternalUndoReference,
  ): boolean {
    const transaction = this.findTransaction(
      reference.providerIdentifier,
      reference.transactionIdentifier,
    );
    if (
      !transaction ||
      !transaction.documentIdentifiers.includes(reference.documentIdentifier)
    ) {
      return false;
    }
    return this.requestTransaction(direction, transaction);
  }

  requestLatest(
    direction: ExternalUndoDirection,
    providerIdentifier: string,
  ): boolean {
    const requiredState = direction === 'undo' ? 'applied' : 'undone';
    const transaction = [...this.transactions]
      .reverse()
      .find(
        (candidate) =>
          candidate.providerIdentifier === providerIdentifier &&
          candidate.state === requiredState,
      );
    return transaction
      ? this.requestTransaction(direction, transaction)
      : false;
  }

  protected requestTransaction(
    direction: ExternalUndoDirection,
    transaction: WorkspaceUndoTransactionRecord,
  ): boolean {
    if (
      (direction === 'undo' && transaction.state !== 'applied') ||
      (direction === 'redo' && transaction.state !== 'undone') ||
      transaction.pendingDirection !== null
    ) {
      return false;
    }
    const provider = this.providers.get(transaction.providerIdentifier);
    if (!provider) return false;
    transaction.pendingDirection = direction;
    try {
      if (direction === 'undo') {
        provider.requestUndo(transaction.transactionIdentifier);
      } else {
        provider.requestRedo(transaction.transactionIdentifier);
      }
    } catch (error) {
      transaction.pendingDirection = null;
      throw error;
    }
    return true;
  }

  cancelRequest(
    providerIdentifier: string,
    transactionIdentifier: string,
  ): boolean {
    const transaction = this.findTransaction(
      providerIdentifier,
      transactionIdentifier,
    );
    if (!transaction || transaction.pendingDirection === null) return false;
    transaction.pendingDirection = null;
    return true;
  }

  markUndone(
    providerIdentifier: string,
    transactionIdentifier: string,
  ): boolean {
    return this.moveTransaction(
      providerIdentifier,
      transactionIdentifier,
      'undo',
    );
  }

  markRedone(
    providerIdentifier: string,
    transactionIdentifier: string,
  ): boolean {
    return this.moveTransaction(
      providerIdentifier,
      transactionIdentifier,
      'redo',
    );
  }

  removeTransaction(
    providerIdentifier: string,
    transactionIdentifier: string,
  ): boolean {
    const transactionIndex = this.transactions.findIndex(
      (transaction) =>
        transaction.providerIdentifier === providerIdentifier &&
        transaction.transactionIdentifier === transactionIdentifier,
    );
    if (transactionIndex < 0) return false;
    const transaction = this.transactions.splice(transactionIndex, 1)[0]!;
    for (const documentIdentifier of transaction.documentIdentifiers) {
      this.attachedDocuments
        .get(documentIdentifier)
        ?.removeExternalUndoReference(
          this.referenceFor(transaction, documentIdentifier),
        );
    }
    return true;
  }

  protected moveTransaction(
    providerIdentifier: string,
    transactionIdentifier: string,
    direction: ExternalUndoDirection,
  ): boolean {
    const transaction = this.findTransaction(
      providerIdentifier,
      transactionIdentifier,
    );
    if (!transaction) return false;
    const sourceState = direction === 'undo' ? 'applied' : 'undone';
    if (transaction.state !== sourceState) return false;
    transaction.state = direction === 'undo' ? 'undone' : 'applied';
    transaction.pendingDirection = null;
    for (const documentIdentifier of transaction.documentIdentifiers) {
      this.attachedDocuments
        .get(documentIdentifier)
        ?.moveExternalUndoReference(
          this.referenceFor(transaction, documentIdentifier),
          direction,
        );
    }
    return true;
  }

  protected findTransaction(
    providerIdentifier: string,
    transactionIdentifier: string,
  ): WorkspaceUndoTransactionRecord | null {
    return (
      this.transactions.find(
        (transaction) =>
          transaction.providerIdentifier === providerIdentifier &&
          transaction.transactionIdentifier === transactionIdentifier,
      ) ?? null
    );
  }

  protected referenceFor(
    transaction: WorkspaceUndoTransactionRecord,
    documentIdentifier: string,
  ): ExternalUndoReference {
    return {
      providerIdentifier: transaction.providerIdentifier,
      transactionIdentifier: transaction.transactionIdentifier,
      documentIdentifier,
    };
  }
}

export namespace WorkspaceUndoCoordinator {
  export const $Class = $WorkspaceUndoCoordinator;
  export let Class = $Class;
  export type Instance = InstanceType<typeof $WorkspaceUndoCoordinator>;
}

export interface WorkspaceUndoProvider {
  requestUndo(transactionIdentifier: string): void;
  requestRedo(transactionIdentifier: string): void;
}

interface WorkspaceUndoTransactionRecord {
  readonly providerIdentifier: string;
  readonly transactionIdentifier: string;
  readonly documentIdentifiers: readonly string[];
  state: WorkspaceUndoTransactionState;
  pendingDirection: ExternalUndoDirection | null;
}

type WorkspaceUndoTransactionState = 'applied' | 'undone';
