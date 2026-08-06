import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextSearchPattern } from './TextSearchPattern';
import { WorkspaceSearchBackend } from './WorkspaceSearchBackend';
import type { WorkspaceSearchResult } from './WorkspaceSearchBackend';
import { WorkspaceReplacementHistory } from './WorkspaceReplacementHistory';
import { WorkspaceSearchWorkspace } from './WorkspaceSearchWorkspace';

class InspectableWorkspaceSearch extends WorkspaceSearchWorkspace.$Class {
  seedResults(
    results: readonly WorkspaceSearchResult[],
    replacementText: string,
  ): void {
    this.replacementInput.setValue(replacementText);
    this.resultStorage.push(...results);
    for (const result of results) {
      this.resultFilePaths.add(result.relativePath);
    }
    this.publishResultMutation();
  }

  historySnapshot() {
    return this.replacementHistory.entries();
  }
}

class TinyWorkspaceReplacementHistory
  extends WorkspaceReplacementHistory.$Class
{
  protected static override get maximumArenaByteLength(): number {
    return 2 * 2;
  }
}

class TinyHistoryWorkspaceSearch extends InspectableWorkspaceSearch {
  protected override createReplacementHistory(): WorkspaceReplacementHistory.Instance {
    return new TinyWorkspaceReplacementHistory();
  }
}

function replacementResult(
  path: string,
  sourceText: string,
  matchedText = 'needle',
  replacementText = 'changed',
): WorkspaceSearchResult {
  const pattern = new TextSearchPattern.Class({
    text: matchedText,
    caseSensitive: true,
    wholeWord: false,
    useRegex: false,
  });
  const match = pattern.matchesInText(sourceText)[0];
  if (!match) throw new Error(`Test source does not contain ${matchedText}.`);
  return WorkspaceSearchBackend.Class.resultForMatch(
    path.split('/').pop()!,
    path,
    match,
    replacementText,
    sourceText,
  );
}

describe('WorkspaceSearchWorkspace', () => {
  test('one workspace owns four independent input models and an empty-query lifecycle', async () => {
    const workspaceSearch = new WorkspaceSearchWorkspace.Class({
      workspaceRoot: () => '/workspace',
      openDocumentHandles: () => [],
    });
    workspaceSearch.queryInput.setValue('query');
    workspaceSearch.replacementInput.setValue('replacement');
    workspaceSearch.includeInput.setValue('src/**');
    workspaceSearch.excludeInput.setValue('src/generated/**');

    expect(workspaceSearch.queryInput.value).toBe('query');
    expect(workspaceSearch.replacementInput.value).toBe('replacement');
    expect(workspaceSearch.includeInput.value).toBe('src/**');
    expect(workspaceSearch.excludeInput.value).toBe('src/generated/**');

    workspaceSearch.queryInput.clear();
    expect(await workspaceSearch.search()).toEqual([]);
    expect(workspaceSearch.flowState.value).toBe('ready');
    expect(workspaceSearch.resultCount).toBe(0);
    expect(workspaceSearch.fileCount.value).toBe(0);
    workspaceSearch.dispose();
  });

  test('search without an open workspace fails visibly', async () => {
    const workspaceSearch = new WorkspaceSearchWorkspace.Class({
      workspaceRoot: () => '',
      openDocumentHandles: () => [],
    });
    workspaceSearch.queryInput.setValue('query');

    expect(await workspaceSearch.search()).toEqual([]);
    expect(workspaceSearch.flowState.value).toBe('failed');
    expect(workspaceSearch.errorMessage.value).toContain('open workspace');
    workspaceSearch.dispose();
  });

  test('missing ripgrep stays distinct from search failure and names the remedy', async () => {
    const workspaceSearch = new WorkspaceSearchWorkspace.Class({
      workspaceRoot: () => '/workspace',
      openDocumentHandles: () => [],
      backend: new WorkspaceSearchBackend.Class({
        resolveRipgrepPath: () => null,
      }),
    });
    workspaceSearch.queryInput.setValue('query');

    expect(await workspaceSearch.search()).toEqual([]);
    expect(workspaceSearch.flowState.value).toBe('unavailable');
    expect(workspaceSearch.errorMessage.value).toContain('Install ripgrep');
    workspaceSearch.dispose();
  });

  test('partial disk failure records only successful files and keeps undo and redo exact', async () => {
    const workspaceRoot = mkdtempSync(
      join(tmpdir(), 'invar-workspace-replace-partial-'),
    );
    const firstPath = join(workspaceRoot, 'first.txt');
    const secondPath = join(workspaceRoot, 'second.txt');
    const readOnlyPath = join(workspaceRoot, 'read-only.txt');
    const firstSource = 'first needle value\n';
    const secondSource = 'second needle value\n';
    const readOnlySource = 'third needle value\n';
    await Bun.write(firstPath, firstSource);
    await Bun.write(secondPath, secondSource);
    await Bun.write(readOnlyPath, readOnlySource);
    chmodSync(readOnlyPath, 0o444);
    const workspaceSearch = new InspectableWorkspaceSearch({
      workspaceRoot: () => workspaceRoot,
      openDocumentHandles: () => [],
    });

    try {
      workspaceSearch.seedResults(
        [
          replacementResult(firstPath, firstSource),
          replacementResult(secondPath, secondSource),
          replacementResult(readOnlyPath, readOnlySource),
        ],
        'changed',
      );
      const preparedReplacement = workspaceSearch.prepareReplace();
      expect(preparedReplacement.safeEntries).toHaveLength(2);
      expect(preparedReplacement.failedEntries).toHaveLength(1);
      const replacementOutcome =
        workspaceSearch.applyPreparedAction(preparedReplacement);

      expect(replacementOutcome.appliedEntries).toHaveLength(2);
      expect(replacementOutcome.failedEntries).toHaveLength(0);
      expect(workspaceSearch.failedCount.value).toBe(1);
      expect(workspaceSearch.resultCount).toBe(1);
      expect(workspaceSearch.errorMessage.value).toContain('read-only.txt:1');
      expect(readFileSync(firstPath, 'utf8')).toBe('first changed value\n');
      expect(readFileSync(secondPath, 'utf8')).toBe('second changed value\n');
      expect(readFileSync(readOnlyPath, 'utf8')).toBe(readOnlySource);
      const transaction = workspaceSearch.historySnapshot()[0]!;
      expect(transaction.patches).toHaveLength(2);
      expect(
        transaction.locations.map((location) => location.absolutePath),
      ).toEqual([firstPath, secondPath]);
      expect(
        transaction.patches.every((patch) => patch.arena === transaction.arena),
      ).toBe(true);

      const undo = workspaceSearch.prepareUndo();
      expect(undo?.safeEntries).toHaveLength(2);
      workspaceSearch.applyPreparedAction(undo!);
      expect(readFileSync(firstPath, 'utf8')).toBe(firstSource);
      expect(readFileSync(secondPath, 'utf8')).toBe(secondSource);

      const redo = workspaceSearch.prepareRedo();
      expect(redo?.safeEntries).toHaveLength(2);
      workspaceSearch.applyPreparedAction(redo!);
      expect(readFileSync(firstPath, 'utf8')).toBe('first changed value\n');
      expect(readFileSync(secondPath, 'utf8')).toBe('second changed value\n');
    } finally {
      workspaceSearch.dispose();
      chmodSync(readOnlyPath, 0o644);
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('acting-boundary drift skips only the changed item in both directions', async () => {
    const workspaceRoot = mkdtempSync(
      join(tmpdir(), 'invar-workspace-replace-drift-'),
    );
    const firstPath = join(workspaceRoot, 'first.txt');
    const secondPath = join(workspaceRoot, 'second.txt');
    const firstSource = 'first needle value\n';
    const secondSource = 'second needle value\n';
    await Bun.write(firstPath, firstSource);
    await Bun.write(secondPath, secondSource);
    const workspaceSearch = new InspectableWorkspaceSearch({
      workspaceRoot: () => workspaceRoot,
      openDocumentHandles: () => [],
    });

    try {
      workspaceSearch.seedResults(
        [
          replacementResult(firstPath, firstSource),
          replacementResult(secondPath, secondSource),
        ],
        'changed',
      );
      const preparedReplacement = workspaceSearch.prepareReplace();
      await Bun.write(firstPath, 'first drifted value\n');
      const replacementOutcome =
        workspaceSearch.applyPreparedAction(preparedReplacement);
      expect(replacementOutcome.appliedEntries).toHaveLength(1);
      expect(replacementOutcome.driftedEntries).toHaveLength(1);
      expect(readFileSync(firstPath, 'utf8')).toBe('first drifted value\n');
      expect(readFileSync(secondPath, 'utf8')).toBe('second changed value\n');

      await Bun.write(secondPath, 'second changed and edited value\n');
      const preparedUndo = workspaceSearch.prepareUndo();
      expect(preparedUndo?.safeEntries).toHaveLength(0);
      expect(preparedUndo?.driftedEntries).toHaveLength(1);
      workspaceSearch.applyPreparedAction(preparedUndo!);
      expect(readFileSync(secondPath, 'utf8')).toBe(
        'second changed and edited value\n',
      );
    } finally {
      workspaceSearch.dispose();
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('retained history memory follows bounded patch text instead of source file bytes', async () => {
    const workspaceRoot = mkdtempSync(
      join(tmpdir(), 'invar-workspace-replace-memory-'),
    );
    const filePath = join(workspaceRoot, 'large.txt');
    const source = `${'a'.repeat(512 * 1024)}needle${'b'.repeat(512 * 1024)}`;
    await Bun.write(filePath, source);
    const workspaceSearch = new InspectableWorkspaceSearch({
      workspaceRoot: () => workspaceRoot,
      openDocumentHandles: () => [],
    });

    try {
      workspaceSearch.seedResults(
        [replacementResult(filePath, source)],
        'changed',
      );
      const preparedReplacement = workspaceSearch.prepareReplace();
      workspaceSearch.applyPreparedAction(preparedReplacement);
      const transaction = workspaceSearch.historySnapshot()[0]!;

      expect(transaction.arena.byteLength).toBe(141);
      expect(transaction.arena.byteLength).toBeLessThan(
        new TextEncoder().encode(source).byteLength,
      );
    } finally {
      workspaceSearch.dispose();
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('an oversized undo record is rejected before mutation', async () => {
    const workspaceRoot = mkdtempSync(
      join(tmpdir(), 'invar-workspace-replace-large-'),
    );
    const filePath = join(workspaceRoot, 'large.txt');
    const source = 'needle\n';
    await Bun.write(filePath, source);
    const workspaceSearch = new TinyHistoryWorkspaceSearch({
      workspaceRoot: () => workspaceRoot,
      openDocumentHandles: () => [],
    });

    try {
      workspaceSearch.seedResults(
        [replacementResult(filePath, source)],
        'changed',
      );
      const prepared = workspaceSearch.prepareReplace();
      expect(prepared.tooLarge).toBe(true);
      expect(
        workspaceSearch.applyPreparedAction(prepared).appliedEntries,
      ).toHaveLength(0);
      expect(readFileSync(filePath, 'utf8')).toBe(source);
      expect(workspaceSearch.historySnapshot()).toHaveLength(0);
    } finally {
      workspaceSearch.dispose();
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
