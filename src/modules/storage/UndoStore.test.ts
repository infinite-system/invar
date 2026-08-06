import { expect, test } from 'bun:test';
import { UndoStore, type EditKind } from './UndoStore';

function recordEdit(
  store: UndoStore.Instance,
  beforeText: string,
  afterText: string,
  kind: EditKind,
  at: number,
): void {
  store.begin(
    {
      at,
      beforeCursor: { line: 0, col: beforeText.length },
      kind,
    },
    at,
  );
  store.recordChange({
    deletedLines: [beforeText],
    insertedLines: [afterText],
    startLineIndex: 0,
  });
}

test('undo and redo exchange one localized delta group', () => {
  const store = new UndoStore.Class();
  recordEdit(store, '', 'a', 'insert', 0);
  const target = store.undo({ line: 0, col: 1 });
  expect(target?.beforeCursor).toEqual({ line: 0, col: 0 });
  expect(target?.changes).toEqual([
    {
      deletedLines: [''],
      insertedLines: ['a'],
      startLineIndex: 0,
    },
  ]);
  expect(store.redo()).toBe(target);
  expect(target?.afterCursor).toEqual({ line: 0, col: 1 });
});

test('adjacent edits of the same kind coalesce their deltas', () => {
  const store = new UndoStore.Class();
  recordEdit(store, '', 'a', 'insert', 0);
  recordEdit(store, 'a', 'ab', 'insert', 100);
  expect(store.depth).toBe(1);
  expect(store.undo({ line: 0, col: 2 })?.changes).toHaveLength(2);
});

test('a begun no-op does not pollute history', () => {
  const store = new UndoStore.Class();
  store.begin(
    {
      at: 0,
      beforeCursor: { line: 0, col: 0 },
      kind: 'delete',
    },
    0,
  );
  expect(store.depth).toBe(0);
  expect(store.undo({ line: 0, col: 0 })).toBeNull();
});

test('an external reference stays put until its coordinator moves it', () => {
  const store = new UndoStore.Class();
  const reference = {
    providerIdentifier: 'test-provider',
    transactionIdentifier: 'transaction-one',
    documentIdentifier: '/one.txt',
  };
  store.recordExternalReference(reference);
  expect(store.nextUndoExternalReference).toEqual(reference);
  expect(store.undo({ line: 0, col: 0 })).toBeNull();
  expect(store.nextUndoExternalReference).toEqual(reference);

  expect(store.moveExternalReference(reference, 'undo')).toBe(true);
  expect(store.nextUndoExternalReference).toBeNull();
  expect(store.nextRedoExternalReference).toEqual(reference);
  expect(store.moveExternalReference(reference, 'redo')).toBe(true);
  expect(store.nextUndoExternalReference).toEqual(reference);
});

test('local edits above an external reference must undo first', () => {
  const store = new UndoStore.Class();
  const reference = {
    providerIdentifier: 'test-provider',
    transactionIdentifier: 'transaction-one',
    documentIdentifier: '/one.txt',
  };
  store.recordExternalReference(reference);
  recordEdit(store, 'after', 'later', 'other', 1);
  expect(store.nextUndoExternalReference).toBeNull();
  expect(store.undo({ line: 0, col: 5 })?.changes).toHaveLength(1);
  expect(store.nextUndoExternalReference).toEqual(reference);
});

test('external history copies identifiers and cannot retain planted patch text', () => {
  const store = new UndoStore.Class();
  const plantedReference = {
    providerIdentifier: 'test-provider',
    transactionIdentifier: 'transaction-one',
    documentIdentifier: '/one.txt',
    removedText: 'PLANTED WHOLE PATCH TEXT',
  };
  store.recordExternalReference(plantedReference);
  const ledger = store.externalReferences();
  expect(JSON.stringify(ledger)).not.toContain('PLANTED WHOLE PATCH TEXT');
  expect(Object.keys(ledger.undo[0]!).sort()).toEqual([
    'documentIdentifier',
    'providerIdentifier',
    'transactionIdentifier',
  ]);
});
