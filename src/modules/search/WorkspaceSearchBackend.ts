import { Static } from 'ivue/extras';
import { Files } from '../system/Files';
import { Processes } from '../system/Processes';
import {
  TextSearchPattern,
  type TextSearchMatch,
  type TextSearchQuery,
} from './TextSearchPattern';
import { WorkspaceSearchPathFilter } from './WorkspaceSearchPathFilter';

/**
 * Streaming ripgrep provider for workspace content search. Ripgrep identifies candidate files; the
 * shared local pattern reads each candidate once and produces every canonical span and capture.
 */
class $WorkspaceSearchBackend {
  // invariant: Cost tracks the actively observed set (project.invariants.md)
  static get MAXIMUM_MATCH_COUNT(): number {
    return 20_000;
  }

  static resultForMatch(
    relativePath: string,
    absolutePath: string,
    match: TextSearchMatch,
    replacementText: string,
    sourceText: string,
  ): WorkspaceSearchResult {
    return this.resultForMatchInSource(
      relativePath,
      absolutePath,
      match,
      replacementText,
      this.sourceContext(sourceText),
    );
  }

  static sourceContext(sourceText: string): WorkspaceSearchSourceContext {
    const encoder = new TextEncoder();
    const sourceBytes = encoder.encode(sourceText);
    const lineStartByteOffsets = [0];
    const lineBreak = /\r\n|\n|\r/g;
    let previousLineStartUtf16Offset = 0;
    let nextLineStartByteOffset = 0;
    let lineBreakMatch: RegExpExecArray | null;
    while ((lineBreakMatch = lineBreak.exec(sourceText)) !== null) {
      const nextLineStartUtf16Offset =
        lineBreakMatch.index + lineBreakMatch[0].length;
      nextLineStartByteOffset += encoder.encode(
        sourceText.slice(
          previousLineStartUtf16Offset,
          nextLineStartUtf16Offset,
        ),
      ).byteLength;
      lineStartByteOffsets.push(nextLineStartByteOffset);
      previousLineStartUtf16Offset = nextLineStartUtf16Offset;
    }
    return { sourceBytes, lineStartByteOffsets };
  }

  static resultForMatchInSource(
    relativePath: string,
    absolutePath: string,
    match: TextSearchMatch,
    replacementText: string,
    sourceContext: WorkspaceSearchSourceContext,
  ): WorkspaceSearchResult {
    const encoder = new TextEncoder();
    const lineStartByteOffset =
      sourceContext.lineStartByteOffsets[match.line] ?? 0;
    const baselineByteOffset =
      lineStartByteOffset +
      encoder.encode(match.lineText.slice(0, match.startUtf16Offset))
        .byteLength;
    const removedByteLength = encoder.encode(
      match.lineText.slice(match.startUtf16Offset, match.endUtf16Offset),
    ).byteLength;
    const beforeStart = Math.max(0, baselineByteOffset - 64);
    const afterStart = baselineByteOffset + removedByteLength;
    return {
      relativePath,
      absolutePath,
      line: match.line,
      startColumn: match.startColumn,
      endColumn: match.endColumn,
      startUtf16Offset: match.startUtf16Offset,
      endUtf16Offset: match.endUtf16Offset,
      baselineByteOffset,
      matchedText: match.matchedText,
      lineText: match.lineText,
      replacementText,
      beforeContextBytes: sourceContext.sourceBytes.slice(
        beforeStart,
        baselineByteOffset,
      ),
      afterContextBytes: sourceContext.sourceBytes.slice(
        afterStart,
        Math.min(sourceContext.sourceBytes.byteLength, afterStart + 64),
      ),
    };
  }

  constructor(readonly options: WorkspaceSearchBackendOptions = {}) {}

  protected activeSearch: ActiveWorkspaceSearch | null = null;

  get maximumMatchCount(): number {
    return (this.constructor as typeof $WorkspaceSearchBackend)
      .MAXIMUM_MATCH_COUNT;
  }

  async search(
    request: WorkspaceSearchRequest,
    onFileResults?: WorkspaceSearchFileResultListener,
  ): Promise<WorkspaceSearchBackendResult> {
    this.cancel();
    const pattern = new TextSearchPattern.Class(request.query);
    if (!pattern.valid) {
      return {
        state: request.query.text.length === 0 ? 'ready' : 'failed',
        results: [],
        limited: false,
        error: pattern.error,
      };
    }

    const ripgrepPath = this.resolveRipgrepPath();
    if (ripgrepPath === null) {
      return {
        state: 'unavailable',
        results: [],
        limited: false,
        error:
          'Workspace search is unavailable because ripgrep is not installed. Install ripgrep, make rg available in PATH, and restart Invar.',
      };
    }

    let process: WorkspaceSearchProcess;
    try {
      process = this.spawn(
        this.argumentVector(ripgrepPath, request, pattern),
        request.workspaceRoot,
      );
    } catch (error) {
      return {
        state: 'failed',
        results: [],
        limited: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const activeSearch: ActiveWorkspaceSearch = {
      process,
      cancelled: false,
    };
    this.activeSearch = activeSearch;

    const errorTextPromise = process.stderr
      ? new Response(process.stderr).text()
      : Promise.resolve('');
    const results: WorkspaceSearchResult[] = [];
    const searchedAbsolutePaths = new Set<string>();
    const skippedAbsolutePaths = new Set(
      request.skippedAbsolutePaths.map((path) => Files.Class.absolute(path)),
    );
    const pathFilter = new WorkspaceSearchPathFilter.Class(
      request.includeGlobs,
      request.excludeGlobs,
    );
    let limited = false;
    let bufferedText = '';

    try {
      const reader = process.stdout.getReader();
      const decoder = new TextDecoder();
      while (!activeSearch.cancelled) {
        const read = await reader.read();
        if (read.done) break;
        bufferedText += decoder.decode(read.value, { stream: true });
        const lines = bufferedText.split('\n');
        bufferedText = lines.pop() ?? '';
        for (const line of lines) {
          if (
            this.consumeRipgrepLine(
              line,
              request,
              pattern,
              results,
              searchedAbsolutePaths,
              skippedAbsolutePaths,
              pathFilter,
              onFileResults,
            )
          ) {
            limited = true;
            this.stop(activeSearch);
            break;
          }
          if (activeSearch.cancelled) break;
        }
      }
      bufferedText += decoder.decode();
      if (!activeSearch.cancelled && !limited && bufferedText.length > 0) {
        limited = this.consumeRipgrepLine(
          bufferedText,
          request,
          pattern,
          results,
          searchedAbsolutePaths,
          skippedAbsolutePaths,
          pathFilter,
          onFileResults,
        );
        if (limited) this.stop(activeSearch);
      }
    } catch (error) {
      if (!activeSearch.cancelled) {
        this.stop(activeSearch);
        await Promise.allSettled([process.exited, errorTextPromise]);
        if (this.activeSearch === activeSearch) this.activeSearch = null;
        return {
          state: 'failed',
          results,
          limited,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    const [exitCode, errorText] = await Promise.all([
      process.exited,
      errorTextPromise,
    ]);
    if (this.activeSearch === activeSearch) this.activeSearch = null;
    if (activeSearch.cancelled && !limited) {
      return { state: 'cancelled', results, limited: false, error: '' };
    }
    if (limited || exitCode === 0 || exitCode === 1) {
      return { state: 'ready', results, limited, error: '' };
    }
    return {
      state: 'failed',
      results,
      limited,
      error:
        errorText.trim() || `ripgrep exited with status ${String(exitCode)}`,
    };
  }

  cancel(): void {
    if (this.activeSearch) this.stop(this.activeSearch);
  }

  protected stop(activeSearch: ActiveWorkspaceSearch): void {
    if (activeSearch.cancelled) return;
    activeSearch.cancelled = true;
    try {
      activeSearch.process.kill();
    } catch {
      // A process that exited between the last stream read and cancellation is already stopped.
    }
  }

  protected consumeRipgrepLine(
    line: string,
    request: WorkspaceSearchRequest,
    pattern: TextSearchPattern.Instance,
    results: WorkspaceSearchResult[],
    searchedAbsolutePaths: Set<string>,
    skippedAbsolutePaths: ReadonlySet<string>,
    pathFilter: WorkspaceSearchPathFilter.Instance,
    onFileResults: WorkspaceSearchFileResultListener | undefined,
  ): boolean {
    const candidatePath = this.candidatePathFromJson(line);
    if (candidatePath === null) return false;
    // invariant: File access is confined to a single root (src/modules/system/system.invariants.md)
    const absolutePath = Files.Class.confineToRoot(
      request.workspaceRoot,
      candidatePath,
    );
    const relativePath =
      absolutePath === null
        ? ''
        : this.relativePath(request.workspaceRoot, absolutePath);
    if (
      absolutePath === null ||
      !pathFilter.includes(relativePath) ||
      skippedAbsolutePaths.has(absolutePath) ||
      searchedAbsolutePaths.has(absolutePath)
    ) {
      return false;
    }
    searchedAbsolutePaths.add(absolutePath);

    let text: string;
    try {
      text = this.readFile(absolutePath);
    } catch {
      return false;
    }
    const remainingMatchCount = this.maximumMatchCount - results.length;
    const localMatches = pattern.matchesInText(text, remainingMatchCount + 1);
    const acceptedMatches = localMatches.slice(0, remainingMatchCount);
    const sourceContext = (
      this.constructor as typeof $WorkspaceSearchBackend
    ).sourceContext(text);
    const fileResults = acceptedMatches.map((match) =>
      (
        this.constructor as typeof $WorkspaceSearchBackend
      ).resultForMatchInSource(
        relativePath,
        absolutePath,
        match,
        pattern.expandReplacement(request.replacementText, match),
        sourceContext,
      ),
    );
    results.push(...fileResults);
    if (fileResults.length > 0) onFileResults?.(fileResults);
    return localMatches.length > remainingMatchCount;
  }

  protected candidatePathFromJson(line: string): string | null {
    if (line.length === 0) return null;
    try {
      const message = JSON.parse(line) as RipgrepJsonMessage;
      if (message.type !== 'match') return null;
      return message.data?.path?.text ?? null;
    } catch {
      return null;
    }
  }

  protected argumentVector(
    ripgrepPath: string,
    request: WorkspaceSearchRequest,
    pattern: TextSearchPattern.Instance,
  ): string[] {
    const argumentVector = [
      ripgrepPath,
      '--json',
      '--line-number',
      '--with-filename',
      '--color',
      'never',
      request.query.caseSensitive ? '--case-sensitive' : '--ignore-case',
    ];
    if (!request.query.useRegex) argumentVector.push('--fixed-strings');
    if (request.query.wholeWord) argumentVector.push('--word-regexp');
    if (!request.useIgnoreFiles) {
      argumentVector.push('--no-ignore', '--hidden', '--glob', '!.git/**');
    }
    argumentVector.push('-e', pattern.ripgrepPattern, '.');
    return argumentVector;
  }

  protected resolveRipgrepPath(): string | null {
    if (this.options.resolveRipgrepPath) {
      return this.options.resolveRipgrepPath();
    }
    return Processes.Class.which('rg');
  }

  protected relativePath(workspaceRoot: string, absolutePath: string): string {
    return Files.Class.relative(workspaceRoot, absolutePath)
      .split('\\')
      .join('/');
  }

  protected readFile(path: string): string {
    return this.options.readFile?.(path) ?? Files.Class.read(path);
  }

  protected spawn(
    argumentVector: string[],
    workingDirectory: string,
  ): WorkspaceSearchProcess {
    if (this.options.spawnProcess) {
      return this.options.spawnProcess(argumentVector, workingDirectory);
    }
    // invariant: External tools share one launch policy (src/modules/system/system.invariants.md)
    return Processes.Class.spawn(argumentVector, {
      cwd: workingDirectory,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    }) as WorkspaceSearchProcess;
  }
}

export namespace WorkspaceSearchBackend {
  export const $Class = Static($WorkspaceSearchBackend);
  export let Class = $Class;
  export type Instance = InstanceType<typeof Class>;
}

export interface WorkspaceSearchRequest {
  readonly workspaceRoot: string;
  readonly query: TextSearchQuery;
  readonly replacementText: string;
  readonly includeGlobs: readonly string[];
  readonly excludeGlobs: readonly string[];
  readonly useIgnoreFiles: boolean;
  readonly skippedAbsolutePaths: readonly string[];
}

export interface WorkspaceSearchSourceContext {
  readonly sourceBytes: Uint8Array;
  readonly lineStartByteOffsets: readonly number[];
}

export interface WorkspaceSearchResult {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly line: number;
  readonly startColumn: number;
  readonly endColumn: number;
  readonly startUtf16Offset: number;
  readonly endUtf16Offset: number;
  readonly baselineByteOffset: number;
  readonly matchedText: string;
  readonly lineText: string;
  readonly replacementText: string;
  readonly beforeContextBytes: Uint8Array;
  readonly afterContextBytes: Uint8Array;
}

export interface WorkspaceSearchBackendResult {
  readonly state: 'ready' | 'cancelled' | 'unavailable' | 'failed';
  readonly results: readonly WorkspaceSearchResult[];
  readonly limited: boolean;
  readonly error: string;
}

export type WorkspaceSearchFileResultListener = (
  results: readonly WorkspaceSearchResult[],
) => void;

export interface WorkspaceSearchProcess {
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr?: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  kill(): void;
}

export interface WorkspaceSearchBackendOptions {
  readonly resolveRipgrepPath?: () => string | null;
  readonly spawnProcess?: (
    argumentVector: string[],
    workingDirectory: string,
  ) => WorkspaceSearchProcess;
  readonly readFile?: (path: string) => string;
}

interface ActiveWorkspaceSearch {
  readonly process: WorkspaceSearchProcess;
  cancelled: boolean;
}

interface RipgrepJsonMessage {
  readonly type?: string;
  readonly data?: {
    readonly path?: {
      readonly text?: string;
    };
  };
}
