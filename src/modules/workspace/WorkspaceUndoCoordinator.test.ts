import { expect, test } from 'bun:test';
import {
  mkdtempSync as makeTemporaryDirectorySync,
  rmSync as removeSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir as temporaryDirectory } from 'node:os';
import { join } from 'node:path';
import { Editor } from '../editor/Editor';
import { EditorSourceTextViewProviderFactory } from '../editor/EditorSourceTextViewProviderFactory';
import { UndoStore } from '../storage/UndoStore';
import { DocumentHandle } from './DocumentHandle';
import { Workspace } from './Workspace';
import { WorkspaceUndoCoordinator } from './WorkspaceUndoCoordinator';
import type {
  ExternalUndoHistory,
  ExternalUndoRequestHandler,
} from './ExternalUndoHistory.interface';

class RecordingExternalHistory implements ExternalUndoHistory {
  readonly store = new UndoStore.Class();
  handler: ExternalUndoRequestHandler | null = null;

  attachExternalUndoRequestHandler(
    handler: ExternalUndoRequestHandler | null,
  ): void {
    this.handler = handler;
  }

  recordExternalUndoReference(
    reference: Parameters<UndoStore.Instance['recordExternalReference']>[0],
    direction: Parameters<UndoStore.Instance['recordExternalReference']>[1],
  ): void {
    this.store.recordExternalReference(reference, direction);
  }

  moveExternalUndoReference(
    reference: Parameters<UndoStore.Instance['moveExternalReference']>[0],
    direction: Parameters<UndoStore.Instance['moveExternalReference']>[1],
  ): boolean {
    return this.store.moveExternalReference(reference, direction);
  }

  removeExternalUndoReference(
    reference: Parameters<UndoStore.Instance['removeExternalReference']>[0],
  ): boolean {
    return this.store.removeExternalReference(reference);
  }
}

test('open editor undo requests the opaque workspace transaction and does not move it', () => {
  const coordinator = new WorkspaceUndoCoordinator.Class();
  const editor = new Editor.Class();
  const documentHandle = new DocumentHandle.Class(Symbol('one'), '/one.txt');
  const requests: string[] = [];
  coordinator.registerProvider('test-provider', {
    requestUndo: (identifier) => requests.push(`undo:${identifier}`),
    requestRedo: (identifier) => requests.push(`redo:${identifier}`),
  });
  coordinator.attach(documentHandle, editor);
  coordinator.registerTransaction('test-provider', 'transaction-one', [
    '/one.txt',
  ]);

  editor.performUndo();
  editor.performUndo();
  expect(requests).toEqual(['undo:transaction-one']);
  expect(coordinator.cancelRequest('test-provider', 'transaction-one')).toBe(
    true,
  );
  editor.performUndo();
  expect(requests).toEqual(['undo:transaction-one', 'undo:transaction-one']);
  expect(coordinator.markUndone('test-provider', 'transaction-one')).toBe(true);
  editor.performRedo();
  expect(requests).toEqual([
    'undo:transaction-one',
    'undo:transaction-one',
    'redo:transaction-one',
  ]);
});

test('closed, detached, and reopened documents receive the correct live reference', () => {
  const coordinator = new WorkspaceUndoCoordinator.Class();
  const firstHandle = new DocumentHandle.Class(Symbol('first'), '/one.txt');
  const firstHistory = new RecordingExternalHistory();
  const requests: string[] = [];
  coordinator.registerProvider('test-provider', {
    requestUndo: (identifier) => requests.push(`undo:${identifier}`),
    requestRedo: (identifier) => requests.push(`redo:${identifier}`),
  });

  // Closed: the transaction exists without a live document history.
  coordinator.registerTransaction('test-provider', 'transaction-one', [
    '/one.txt',
  ]);
  expect(firstHistory.store.externalReferences()).toEqual({
    undo: [],
    redo: [],
  });

  // Open: attaching the document inserts the still-applied reference.
  coordinator.attach(firstHandle, firstHistory);
  expect(firstHistory.store.externalReferences().undo).toHaveLength(1);

  // Detached: state can move while no document history is live.
  coordinator.detach(firstHandle, firstHistory);
  expect(firstHistory.handler).toBeNull();
  expect(coordinator.markUndone('test-provider', 'transaction-one')).toBe(true);

  // Reopened: a new handle for the same path receives the redo reference.
  const reopenedHandle = new DocumentHandle.Class(
    Symbol('reopened'),
    '/one.txt',
  );
  const reopenedHistory = new RecordingExternalHistory();
  coordinator.attach(reopenedHandle, reopenedHistory);
  expect(reopenedHistory.store.externalReferences()).toEqual({
    undo: [],
    redo: [
      {
        providerIdentifier: 'test-provider',
        transactionIdentifier: 'transaction-one',
        documentIdentifier: '/one.txt',
      },
    ],
  });
  reopenedHistory.handler?.(
    'redo',
    reopenedHistory.store.nextRedoExternalReference!,
  );
  expect(requests).toEqual(['redo:transaction-one']);
});

test('many documents move one transaction reference without copying text', () => {
  const coordinator = new WorkspaceUndoCoordinator.Class();
  const histories = ['/one.txt', '/two.txt', '/three.txt'].map((path) => {
    const history = new RecordingExternalHistory();
    coordinator.attach(new DocumentHandle.Class(Symbol(path), path), history);
    return history;
  });
  coordinator.registerTransaction('test-provider', 'transaction-one', [
    '/one.txt',
    '/two.txt',
    '/three.txt',
  ]);
  for (const history of histories) {
    expect(history.store.externalReferences().undo).toHaveLength(1);
  }
  coordinator.markUndone('test-provider', 'transaction-one');
  for (const history of histories) {
    expect(history.store.externalReferences().redo).toHaveLength(1);
  }
});

test('a reopened history preserves transaction chronology in both directions', () => {
  const coordinator = new WorkspaceUndoCoordinator.Class();
  coordinator.registerTransaction('test-provider', 'transaction-one', [
    '/one.txt',
  ]);
  coordinator.registerTransaction('test-provider', 'transaction-two', [
    '/one.txt',
  ]);
  const appliedHistory = new RecordingExternalHistory();
  const appliedHandle = new DocumentHandle.Class(Symbol('applied'), '/one.txt');
  coordinator.attach(appliedHandle, appliedHistory);
  expect(
    appliedHistory.store
      .externalReferences()
      .undo.map((reference) => reference.transactionIdentifier),
  ).toEqual(['transaction-one', 'transaction-two']);
  coordinator.detach(appliedHandle, appliedHistory);

  coordinator.markUndone('test-provider', 'transaction-two');
  coordinator.markUndone('test-provider', 'transaction-one');
  const undoneHistory = new RecordingExternalHistory();
  coordinator.attach(
    new DocumentHandle.Class(Symbol('undone'), '/one.txt'),
    undoneHistory,
  );
  expect(
    undoneHistory.store
      .externalReferences()
      .redo.map((reference) => reference.transactionIdentifier),
  ).toEqual(['transaction-two', 'transaction-one']);
  expect(
    undoneHistory.store.nextRedoExternalReference?.transactionIdentifier,
  ).toBe('transaction-one');
});

test('removing the last transaction returns to empty and permits clean re-entry', () => {
  const coordinator = new WorkspaceUndoCoordinator.Class();
  const history = new RecordingExternalHistory();
  coordinator.attach(
    new DocumentHandle.Class(Symbol('one'), '/one.txt'),
    history,
  );
  coordinator.registerTransaction('test-provider', 'transaction-one', [
    '/one.txt',
  ]);
  expect(history.store.externalReferences().undo).toHaveLength(1);
  expect(
    coordinator.removeTransaction('test-provider', 'transaction-one'),
  ).toBe(true);
  expect(history.store.externalReferences()).toEqual({ undo: [], redo: [] });

  coordinator.registerTransaction('test-provider', 'transaction-one', [
    '/one.txt',
  ]);
  expect(history.store.externalReferences().undo).toHaveLength(1);
});

test('the real workspace rewires external undo across detach, close, and reopen', () => {
  const workspaceDirectory = makeTemporaryDirectorySync(
    join(temporaryDirectory(), 'workspace-undo-lifecycle-'),
  );
  try {
    const paths = ['one.txt', 'two.txt', 'three.txt'].map((name) =>
      join(workspaceDirectory, name),
    );
    for (const path of paths) writeFileSync(path, `${path}\n`);
    const workspace = new Workspace.Class({
      createSourceTextViews: () =>
        EditorSourceTextViewProviderFactory.Class.create(),
    });
    const requests: string[] = [];
    workspace.workspaceUndoCoordinator.registerProvider('test-provider', {
      requestUndo: (identifier) => requests.push(`undo:${identifier}`),
      requestRedo: (identifier) => requests.push(`redo:${identifier}`),
    });

    workspace.openFileInTab(paths[0]!);
    workspace.workspaceUndoCoordinator.registerTransaction(
      'test-provider',
      'transaction-one',
      [paths[0]!],
    );
    workspace.openFileInTab(paths[1]!);
    workspace.openFileInTab(paths[2]!);
    expect(workspace.buffers.liveCount).toBe(2);

    workspace.activateTab(0);
    workspace.editor.performUndo();
    expect(requests).toEqual(['undo:transaction-one']);
    workspace.workspaceUndoCoordinator.cancelRequest(
      'test-provider',
      'transaction-one',
    );

    workspace.closeTab(0);
    workspace.workspaceUndoCoordinator.markUndone(
      'test-provider',
      'transaction-one',
    );
    workspace.openFileInTab(paths[0]!);
    workspace.editor.performRedo();
    expect(requests).toEqual(['undo:transaction-one', 'redo:transaction-one']);
    workspace.dispose();
  } finally {
    removeSync(workspaceDirectory, { recursive: true, force: true });
  }
});

test('zero-document transactions cannot create unreachable history', () => {
  const coordinator = new WorkspaceUndoCoordinator.Class();
  expect(() =>
    coordinator.registerTransaction('test-provider', 'empty-transaction', []),
  ).toThrow('A workspace undo transaction must name a document.');
});
