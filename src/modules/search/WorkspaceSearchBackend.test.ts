import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { HarnessSmoke } from '../../../scripts/harness/HarnessSmoke';
import { TextDocument } from '../text/TextDocument';
import { DocumentHandle } from '../workspace/DocumentHandle';
import {
  WorkspaceSearchBackend,
  type WorkspaceSearchProcess,
  type WorkspaceSearchRequest,
} from './WorkspaceSearchBackend';
import { WorkspaceSearchWorkspace } from './WorkspaceSearchWorkspace';
import { TextSearchPattern } from './TextSearchPattern';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const temporaryDirectory = temporaryDirectories.pop();
    if (temporaryDirectory) {
      await HarnessSmoke.Class.removeTemporaryDirectory(temporaryDirectory);
    }
  }
});

function createTemporaryWorkspace(prefix: string): string {
  const workspaceRoot = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(workspaceRoot);
  return workspaceRoot;
}

function request(
  workspaceRoot: string,
  overrides: Partial<WorkspaceSearchRequest> = {},
): WorkspaceSearchRequest {
  return {
    workspaceRoot,
    query: {
      text: 'TARGET',
      caseSensitive: true,
      wholeWord: false,
      useRegex: false,
    },
    replacementText: 'replacement',
    includeGlobs: [],
    excludeGlobs: [],
    useIgnoreFiles: true,
    skippedAbsolutePaths: [],
    ...overrides,
  };
}

function ripgrepMatchLine(relativePath: string): string {
  return `${JSON.stringify({
    type: 'match',
    data: { path: { text: relativePath } },
  })}\n`;
}

function completedCandidateProcess(
  relativePaths: readonly string[],
): WorkspaceSearchProcess {
  return {
    stdout: new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            relativePaths.map(ripgrepMatchLine).join(''),
          ),
        );
        controller.close();
      },
    }),
    exited: Promise.resolve(0),
    kill: () => {},
  };
}

function backendWithCandidates(
  relativePaths: readonly string[],
): WorkspaceSearchBackend.Instance {
  return new WorkspaceSearchBackend.Class({
    resolveRipgrepPath: () => '/resolved-tools/rg',
    spawnProcess: () => completedCandidateProcess(relativePaths),
  });
}

describe('WorkspaceSearchBackend resolved ripgrep integration', () => {
  test('one source context preserves UTF-8 offsets and CRLF context bytes', () => {
    const sourceText = 'α\r\nbefore needle after';
    const pattern = new TextSearchPattern.Class({
      text: 'needle',
      caseSensitive: true,
      wholeWord: false,
      useRegex: false,
    });
    const match = pattern.matchesInText(sourceText)[0]!;
    const result = WorkspaceSearchBackend.Class.resultForMatchInSource(
      'source.txt',
      '/workspace/source.txt',
      match,
      'changed',
      WorkspaceSearchBackend.Class.sourceContext(sourceText),
    );

    expect(result.baselineByteOffset).toBe(
      new TextEncoder().encode('α\r\nbefore ').byteLength,
    );
    expect(new TextDecoder().decode(result.beforeContextBytes)).toBe(
      'α\r\nbefore ',
    );
    expect(new TextDecoder().decode(result.afterContextBytes)).toBe(' after');
  });

  test('a missing ripgrep binary is unavailable with a remedy and never reaches spawn', async () => {
    const workspaceRoot = createTemporaryWorkspace('invar-workspace-no-rg-');
    let spawnCount = 0;
    const backend = new WorkspaceSearchBackend.Class({
      resolveRipgrepPath: () => null,
      spawnProcess: () => {
        spawnCount++;
        return completedCandidateProcess([]);
      },
    });

    const result = await backend.search(request(workspaceRoot));

    expect(result.state).toBe('unavailable');
    expect(result.results).toEqual([]);
    expect(result.error).toContain('ripgrep is not installed');
    expect(result.error).toContain('Install ripgrep');
    expect(spawnCount).toBe(0);
  });

  test('include then exclude filters and ignore rules work in both polarities', async () => {
    const workspaceRoot = createTemporaryWorkspace('invar-workspace-search-');
    mkdirSync(join(workspaceRoot, 'src'), { recursive: true });
    mkdirSync(join(workspaceRoot, 'notes'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'src', 'keep.ts'), 'TARGET keep\n');
    writeFileSync(join(workspaceRoot, 'src', 'drop.ts'), 'TARGET drop\n');
    writeFileSync(join(workspaceRoot, 'notes', 'keep.txt'), 'TARGET note\n');
    writeFileSync(join(workspaceRoot, 'ignored.ts'), 'TARGET ignored\n');
    const argumentVectors: string[][] = [];
    const backend = new WorkspaceSearchBackend.Class({
      resolveRipgrepPath: () => '/resolved-tools/rg',
      spawnProcess: (argumentVector) => {
        argumentVectors.push(argumentVector);
        return completedCandidateProcess(
          argumentVector.includes('--no-ignore')
            ? ['src/keep.ts', 'src/drop.ts', 'notes/keep.txt', 'ignored.ts']
            : ['src/keep.ts', 'src/drop.ts', 'notes/keep.txt'],
        );
      },
    });
    const filtered = await backend.search(
      request(workspaceRoot, {
        includeGlobs: ['**/*.ts'],
        excludeGlobs: ['**/drop.ts'],
      }),
    );
    expect(filtered.state).toBe('ready');
    expect(filtered.results.map((result) => result.relativePath)).toEqual([
      'src/keep.ts',
    ]);

    const withoutIgnores = await backend.search(
      request(workspaceRoot, {
        includeGlobs: ['**/*.ts'],
        excludeGlobs: ['**/drop.ts'],
        useIgnoreFiles: false,
      }),
    );
    expect(
      withoutIgnores.results.map((result) => result.relativePath).sort(),
    ).toEqual(['ignored.ts', 'src/keep.ts']);
    expect(argumentVectors[0]?.[0]).toBe('/resolved-tools/rg');
    expect(argumentVectors[0]).not.toContain('--no-ignore');
    expect(argumentVectors[1]).toContain('--no-ignore');
  });

  test('the shared 10-line and 100,000-line fixtures return the same canonical match', async () => {
    for (const lineCount of [10, 100_000]) {
      const fixture =
        await HarnessSmoke.Class.createDriveScaleFixture(lineCount);
      temporaryDirectories.push(fixture.workspaceRoot);
      const backend = backendWithCandidates([basename(fixture.filePath)]);
      const result = await backend.search(
        request(fixture.workspaceRoot, {
          query: {
            text: 'DRIVE-LINE-000010',
            caseSensitive: true,
            wholeWord: false,
            useRegex: false,
          },
        }),
      );
      expect(result.state).toBe('ready');
      expect(result.limited).toBe(false);
      expect(result.results).toMatchObject([
        {
          line: 9,
          startColumn: 0,
          endColumn: 17,
          matchedText: 'DRIVE-LINE-000010',
        },
      ]);
    }
  });

  test('the planted 20,001st match trips the exact 20,000-match cap', async () => {
    const fixture = await HarnessSmoke.Class.createDriveScaleFixture(20_001);
    temporaryDirectories.push(fixture.workspaceRoot);
    const backend = backendWithCandidates([basename(fixture.filePath)]);
    const result = await backend.search(
      request(fixture.workspaceRoot, {
        query: {
          text: 'DRIVE-LINE',
          caseSensitive: true,
          wholeWord: false,
          useRegex: false,
        },
      }),
    );

    expect(result.state).toBe('ready');
    expect(result.results).toHaveLength(20_000);
    expect(result.limited).toBe(true);
    expect(result.results.at(-1)).toMatchObject({ line: 19_999 });
  });
});

describe('WorkspaceSearchBackend streaming and cancellation', () => {
  test('duplicate candidates read once and an escaping path never reaches the file seam', async () => {
    const workspaceRoot = createTemporaryWorkspace('invar-workspace-confine-');
    writeFileSync(join(workspaceRoot, 'one.txt'), 'TARGET\n');
    let capturedArgumentVector: readonly string[] = [];
    const output =
      ripgrepMatchLine('one.txt') +
      ripgrepMatchLine('one.txt') +
      ripgrepMatchLine('../escape.txt');
    const process: WorkspaceSearchProcess = {
      stdout: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(output));
          controller.close();
        },
      }),
      exited: Promise.resolve(0),
      kill: () => {},
    };
    const readPaths: string[] = [];
    const backend = new WorkspaceSearchBackend.Class({
      resolveRipgrepPath: () => '/resolved-tools/rg',
      spawnProcess: (argumentVector) => {
        capturedArgumentVector = argumentVector;
        return process;
      },
      readFile: (path) => {
        readPaths.push(path);
        return readFileSync(path, 'utf8');
      },
    });
    const result = await backend.search(
      request(workspaceRoot, {
        query: {
          text: 'TARGET; touch escaped',
          caseSensitive: false,
          wholeWord: true,
          useRegex: false,
        },
        useIgnoreFiles: false,
      }),
    );

    expect(capturedArgumentVector).toContain('--fixed-strings');
    expect(capturedArgumentVector[0]).toBe('/resolved-tools/rg');
    expect(capturedArgumentVector).toContain('--word-regexp');
    expect(capturedArgumentVector).toContain('--no-ignore');
    expect(capturedArgumentVector).toContain('--hidden');
    expect(capturedArgumentVector).toContain('!.git/**');
    expect(capturedArgumentVector).toContain('TARGET; touch escaped');
    expect(readPaths).toEqual([join(workspaceRoot, 'one.txt')]);
    expect(result.results).toEqual([]);
  });

  test('a file batch arrives before process exit', async () => {
    const workspaceRoot = createTemporaryWorkspace('invar-workspace-stream-');
    const filePath = join(workspaceRoot, 'one.txt');
    writeFileSync(filePath, 'TARGET\n');
    let resolveExit: (exitCode: number) => void = () => {};
    let exitResolved = false;
    const exited = new Promise<number>((resolve) => {
      resolveExit = (exitCode) => {
        exitResolved = true;
        resolve(exitCode);
      };
    });
    const process: WorkspaceSearchProcess = {
      stdout: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(ripgrepMatchLine('one.txt')),
          );
          controller.close();
        },
      }),
      exited,
      kill: () => resolveExit(130),
    };
    const backend = new WorkspaceSearchBackend.Class({
      resolveRipgrepPath: () => '/resolved-tools/rg',
      spawnProcess: () => process,
    });
    const resultPromise = backend.search(request(workspaceRoot), (results) => {
      expect(exitResolved).toBe(false);
      expect(results).toHaveLength(1);
      resolveExit(0);
    });
    const result = await resultPromise;
    expect(result.state).toBe('ready');
  });

  test('count-based cancellation stops the stream after its first file batch', async () => {
    const workspaceRoot = createTemporaryWorkspace('invar-workspace-cancel-');
    writeFileSync(join(workspaceRoot, 'one.txt'), 'TARGET\n');
    writeFileSync(join(workspaceRoot, 'two.txt'), 'TARGET\n');
    let closeOutput: () => void = () => {};
    let resolveExit: (exitCode: number) => void = () => {};
    let killCount = 0;
    const exited = new Promise<number>((resolve) => {
      resolveExit = resolve;
    });
    let emittedFileCount = 0;
    const process: WorkspaceSearchProcess = {
      stdout: new ReadableStream({
        start(controller) {
          closeOutput = () => controller.close();
        },
        pull(controller) {
          const relativePath = emittedFileCount === 0 ? 'one.txt' : 'two.txt';
          controller.enqueue(
            new TextEncoder().encode(ripgrepMatchLine(relativePath)),
          );
          emittedFileCount++;
          if (emittedFileCount === 2) {
            controller.close();
            resolveExit(0);
          }
        },
      }),
      exited,
      kill: () => {
        killCount++;
        closeOutput();
        resolveExit(130);
      },
    };
    const readPaths: string[] = [];
    const backend = new WorkspaceSearchBackend.Class({
      resolveRipgrepPath: () => '/resolved-tools/rg',
      spawnProcess: () => process,
      readFile: (path) => {
        readPaths.push(path);
        return readFileSync(path, 'utf8');
      },
    });

    const result = await backend.search(request(workspaceRoot), () => {
      backend.cancel();
    });
    expect(result.state).toBe('cancelled');
    expect(killCount).toBe(1);
    expect(readPaths).toEqual([join(workspaceRoot, 'one.txt')]);
  });
});

describe('WorkspaceSearchWorkspace live-document overlay', () => {
  test('an unsaved match replaces disk truth in both directions', async () => {
    const workspaceRoot = createTemporaryWorkspace('invar-workspace-overlay-');
    const removedPath = join(workspaceRoot, 'removed.txt');
    const addedPath = join(workspaceRoot, 'added.txt');
    writeFileSync(removedPath, 'TARGET exists only on disk\n');
    writeFileSync(addedPath, 'nothing on disk\n');

    const removedDocument = new TextDocument.Class();
    removedDocument.loadFromFile(removedPath);
    removedDocument.replaceAll(['removed in the live document']);
    const addedDocument = new TextDocument.Class();
    addedDocument.loadFromFile(addedPath);
    addedDocument.replaceAll(['TARGET exists only in the live document']);
    const removedHandle = new DocumentHandle.Class(
      Symbol('removed'),
      removedPath,
    );
    const addedHandle = new DocumentHandle.Class(Symbol('added'), addedPath);
    removedHandle.attach(removedDocument);
    addedHandle.attach(addedDocument);

    const workspaceSearch = new WorkspaceSearchWorkspace.Class({
      workspaceRoot: () => workspaceRoot,
      openDocumentHandles: () => [removedHandle, addedHandle],
      backend: backendWithCandidates(['removed.txt', 'added.txt']),
    });
    workspaceSearch.queryInput.setValue('TARGET');
    const results = await workspaceSearch.search();

    expect(workspaceSearch.flowState.value).toBe('ready');
    expect(workspaceSearch.resultCount).toBe(1);
    expect(workspaceSearch.fileCount.value).toBe(1);
    expect(results).toMatchObject([
      {
        relativePath: 'added.txt',
        line: 0,
        matchedText: 'TARGET',
        lineText: 'TARGET exists only in the live document',
      },
    ]);
    expect(
      results.some((result) => result.relativePath === 'removed.txt'),
    ).toBe(false);
    expect(workspaceSearch.resultTree.rows.map((row) => row.kind)).toEqual([
      'file',
      'match',
    ]);

    workspaceSearch.replacementInput.setValue('REPLACED');
    await workspaceSearch.search();
    expect(workspaceSearch.resultTree.rows.map((row) => row.kind)).toEqual([
      'file',
      'match',
      'replacementPreview',
    ]);

    workspaceSearch.queryInput.setValue('document');
    expect(await workspaceSearch.search()).toHaveLength(2);
    expect(workspaceSearch.fileCount.value).toBe(2);

    workspaceSearch.queryInput.setValue('missing');
    expect(await workspaceSearch.search()).toEqual([]);
    expect(workspaceSearch.resultCount).toBe(0);
    expect(workspaceSearch.fileCount.value).toBe(0);

    workspaceSearch.queryInput.clear();
    expect(await workspaceSearch.search()).toEqual([]);
    expect(workspaceSearch.flowState.value).toBe('ready');

    workspaceSearch.queryInput.setValue('TARGET');
    expect(await workspaceSearch.search()).toHaveLength(1);
    expect(workspaceSearch.fileCount.value).toBe(1);
    workspaceSearch.dispose();
  });
});
