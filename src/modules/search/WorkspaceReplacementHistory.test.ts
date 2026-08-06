import { expect, test } from 'bun:test';
import { TextArena } from '../workspace/TextArena';
import { TextPatch } from '../workspace/TextPatch';
import {
  WorkspaceReplacementHistory,
  type WorkspaceReplacementTransaction,
} from './WorkspaceReplacementHistory';

class TwoEntryHistory extends WorkspaceReplacementHistory.$Class {
  protected static override get MAXIMUM_TRANSACTION_COUNT(): number {
    return 2;
  }

  protected static override get maximumArenaByteLength(): number {
    return 5 * 2;
  }
}

const transaction = (
  identifier: string,
  byteLength: number,
  complete = true,
): WorkspaceReplacementTransaction => {
  const arena = new TextArena.Class();
  arena.store(new Uint8Array(byteLength));
  return {
    identifier,
    arena,
    patches: [],
    locations: [],
    complete,
    state: 'applied',
  };
};

test('history evicts the oldest complete transaction at count and byte bounds', () => {
  const history = new TwoEntryHistory();
  expect(history.add(transaction('one', 4)).accepted).toBe(true);
  expect(history.add(transaction('two', 4)).accepted).toBe(true);
  expect(history.add(transaction('three', 4))).toEqual({
    accepted: true,
    evictedTransactionIdentifiers: ['one'],
  });
  expect(history.entries().map((entry) => entry.identifier)).toEqual([
    'two',
    'three',
  ]);
  expect(history.arenaByteLength).toBe(8);

  expect(history.add(transaction('four', 7))).toEqual({
    accepted: true,
    evictedTransactionIdentifiers: ['two', 'three'],
  });
  expect(history.entries().map((entry) => entry.identifier)).toEqual(['four']);
});

test('history rejects one oversized transaction before retaining it', () => {
  const history = new TwoEntryHistory();
  expect(history.add(transaction('oversized', 11))).toEqual({
    accepted: false,
    evictedTransactionIdentifiers: [],
  });
  expect(history.count).toBe(0);
  expect(history.arenaByteLength).toBe(0);
});

test('the one-arena check rejects a planted second patch-text owner', () => {
  const source = new TextEncoder().encode('OLD');
  const transactionArena = new TextArena.Class();
  const plantedSecondArena = new TextArena.Class();
  const patch = TextPatch.Class.create(plantedSecondArena, source, {
    path: '/one.txt',
    searchGeneration: 1,
    baselineByteOffset: 0,
    removedBytes: source,
    insertedBytes: new TextEncoder().encode('NEW'),
  });
  const history = new TwoEntryHistory();
  expect(() =>
    history.add({
      identifier: 'planted-second-arena',
      arena: transactionArena,
      patches: [patch],
      locations: [
        { absolutePath: '/one.txt', relativePath: 'one.txt', line: 0 },
      ],
      complete: true,
      state: 'applied',
    }),
  ).toThrow('One workspace replacement transaction must use one text arena.');
});

test('history skips an incomplete entry when it needs an eviction', () => {
  const history = new TwoEntryHistory();
  history.add(transaction('in-flight', 4, false));
  history.add(transaction('complete', 4));
  expect(history.add(transaction('new', 4))).toEqual({
    accepted: true,
    evictedTransactionIdentifiers: ['complete'],
  });
  expect(history.entries().map((entry) => entry.identifier)).toEqual([
    'in-flight',
    'new',
  ]);
});

test('a rejected add does not evict anything before it knows the new action fits', () => {
  const history = new TwoEntryHistory();
  history.add(transaction('in-flight', 9, false));
  history.add(transaction('complete', 1));
  expect(history.add(transaction('cannot-fit', 10))).toEqual({
    accepted: false,
    evictedTransactionIdentifiers: [],
  });
  expect(history.entries().map((entry) => entry.identifier)).toEqual([
    'in-flight',
    'complete',
  ]);
  expect(history.arenaByteLength).toBe(10);
});
