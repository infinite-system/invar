import { Static } from 'ivue/extras';
import type { TextArena } from '../workspace/TextArena';
import type { TextPatch } from '../workspace/TextPatch';

// Workspace replacement history is bounded by both transaction count and owned arena text. It
// evicts the oldest complete action first and rejects one action that cannot fit by itself.
//
// invariant: Cost tracks the actively observed set (project.invariants.md)
class $WorkspaceReplacementHistory {
  protected static get MAXIMUM_TRANSACTION_COUNT(): number {
    return 20;
  }

  protected static get maximumArenaByteLength(): number {
    return 64 * 1024 * 1024;
  }

  protected transactions: WorkspaceReplacementTransaction[] = [];
  protected retainedArenaByteLength = 0;

  get count(): number {
    return this.transactions.length;
  }

  get arenaByteLength(): number {
    return this.retainedArenaByteLength;
  }

  entries(): readonly WorkspaceReplacementTransaction[] {
    return this.transactions;
  }

  add(transaction: WorkspaceReplacementTransaction): HistoryAddResult {
    const historyClass = this
      .constructor as typeof $WorkspaceReplacementHistory;
    if (
      transaction.patches.some((patch) => patch.arena !== transaction.arena)
    ) {
      throw new Error(
        'One workspace replacement transaction must use one text arena.',
      );
    }
    if (transaction.arena.byteLength > historyClass.maximumArenaByteLength) {
      return { accepted: false, evictedTransactionIdentifiers: [] };
    }
    const evictionCandidates = this.transactions
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => candidate.complete);
    const evictedIndexes = new Set<number>();
    const evictedTransactionIdentifiers: string[] = [];
    let retainedCount = this.transactions.length;
    let retainedByteLength = this.retainedArenaByteLength;
    let evictionCandidateIndex = 0;
    while (
      retainedCount >= historyClass.MAXIMUM_TRANSACTION_COUNT ||
      retainedByteLength + transaction.arena.byteLength >
        historyClass.maximumArenaByteLength
    ) {
      const evictionCandidate = evictionCandidates[evictionCandidateIndex++];
      if (!evictionCandidate) {
        return { accepted: false, evictedTransactionIdentifiers: [] };
      }
      evictedIndexes.add(evictionCandidate.index);
      retainedCount--;
      retainedByteLength -= evictionCandidate.candidate.arena.byteLength;
      evictedTransactionIdentifiers.push(
        evictionCandidate.candidate.identifier,
      );
    }
    this.transactions = this.transactions.filter(
      (_, index) => !evictedIndexes.has(index),
    );
    this.retainedArenaByteLength = retainedByteLength;
    this.transactions.push(transaction);
    this.retainedArenaByteLength += transaction.arena.byteLength;
    return { accepted: true, evictedTransactionIdentifiers };
  }
}

export namespace WorkspaceReplacementHistory {
  export const $Class = Static($WorkspaceReplacementHistory);
  export let Class = $Class;
  export type Instance = InstanceType<typeof $WorkspaceReplacementHistory>;
}

export interface WorkspaceReplacementTransaction {
  readonly identifier: string;
  readonly arena: TextArena.Instance;
  readonly patches: readonly TextPatch.Instance[];
  readonly complete: boolean;
}

export interface HistoryAddResult {
  readonly accepted: boolean;
  readonly evictedTransactionIdentifiers: readonly string[];
}
