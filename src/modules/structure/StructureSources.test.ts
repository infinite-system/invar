import { expect, test } from 'bun:test';
import { StructureSources } from './StructureSources';
import type { StructureSource } from './StructureSource.interface';

function makeSource(name: string): StructureSource {
  return {
    supportsDocument: () => true,
    documentSymbols: async () => ({ symbols: [], truncated: false }),
    structureNotice: () => name,
  };
}

test('a source registers per workspace and its disposer withdraws it', () => {
  const workspace = {};
  const source = makeSource('one');
  const revisionBefore = StructureSources.Class.revision.value;
  const dispose = StructureSources.Class.register(workspace, source);
  expect(StructureSources.Class.sourceFor(workspace)).toBe(source);
  expect(StructureSources.Class.revision.value).toBe(revisionBefore + 1);
  dispose();
  expect(StructureSources.Class.sourceFor(workspace)).toBeNull();
  expect(StructureSources.Class.revision.value).toBe(revisionBefore + 2);
  // The disposer is idempotent — a double call withdraws nothing twice.
  dispose();
  expect(StructureSources.Class.revision.value).toBe(revisionBefore + 2);
});

test('resolution is last-wins and workspaces stay isolated', () => {
  const workspaceA = {};
  const workspaceB = {};
  const first = makeSource('first');
  const second = makeSource('second');
  const disposeFirst = StructureSources.Class.register(workspaceA, first);
  const disposeSecond = StructureSources.Class.register(workspaceA, second);
  expect(StructureSources.Class.sourceFor(workspaceA)).toBe(second);
  expect(StructureSources.Class.sourceFor(workspaceB)).toBeNull();
  disposeSecond();
  // Withdrawal of the later source falls back to the earlier one, not to nothing.
  expect(StructureSources.Class.sourceFor(workspaceA)).toBe(first);
  disposeFirst();
  expect(StructureSources.Class.sourceFor(workspaceA)).toBeNull();
});
