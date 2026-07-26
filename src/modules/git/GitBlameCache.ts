// Workspace-OWNED blame cache (GitLens-parity current-line blame). Blaming a file is a git SPAWN,
// but a cursor move must be instant — so a file is blamed ONCE and its per-line authorship map is
// cached keyed on the file's on-disk mtime; every subsequent line query is a pure map lookup. A
// save (mtime bump) re-blames; an unblamable file (untracked / non-repo) caches an EMPTY map so
// the negative result never re-spawns per frame.
//
// Ownership and bounds (the restructure the review demanded): this is an instance the WORKSPACE
// creates for its root and disposes when the workspace suspends or closes — never module-level
// state hiding behind a Static facade. The cache is LRU-BOUNDED (a per-line map per file must
// track the actively observed set, not every file ever visited), and the on-disk stat is memoized
// for one paint tick so the status bar and the status publisher querying in the same frame cost
// one stat, not two.
//
// invariant: Current-line blame is a cached lookup, not a per-move git spawn (src/modules/git/git.invariants.md)
// invariant: An unblamable file degrades to no blame, never an error (src/modules/git/git.invariants.md)
// invariant: Cost tracks the actively observed set (project.invariants.md)
import { Reactive } from 'ivue';
import { ref } from 'vue';
import { Files } from '../system/Files';
import { GitCommands } from './GitCommands';
import { GitBlame, type BlameLine } from './GitBlame';

class $GitBlameCache {
  constructor(
    readonly cwd: string,
    readonly options: GitBlameCacheOptions = {},
  ) {}

  /**
   * Bumped when an async blame load lands (or fails) — a render effect reading lineBlame() tracks
   * this, so blame appears the moment it is known and idle stays quiescent otherwise.
   */
  get revision() {
    return ref(0);
  }

  // LRU over insertion order: a hit re-inserts its key, so the FIRST key is always the coldest.
  protected readonly cache = new Map<string, GitFileStatus>();
  protected readonly inFlightPaths = new Set<string>();
  protected disposed = false;
  // One stat per paint, not per query: the same (path) asked again inside the memo window reuses
  // the mtime — the status bar and the status side-channel both query during one frame.
  protected statMemo: GitStatMemo | null = null;

  static get maximumBlamedFiles(): number {
    return 16;
  }

  protected static get statMemoWindowMilliseconds(): number {
    return 30;
  }

  get cachedFileCount(): number {
    return this.cache.size;
  }

  /**
   * The blame for one 0-based line of `documentPath`, or null. Pure cache lookup when the file is
   * already blamed at its current mtime; otherwise kicks ONE async load and returns null until it
   * resolves (the revision bump repaints the caller).
   */
  lineBlame(documentPath: string, lineNumber: number): BlameLine | null {
    void this.revision.value;
    if (this.disposed || !documentPath) {
      return null;
    }
    const mtimeMs = this.statMemoizedMtime(documentPath);
    if (mtimeMs === 0) {
      return null;
    }
    const cached = this.cache.get(documentPath);
    if (cached && cached.mtimeMs === mtimeMs) {
      this.refreshRecency(documentPath, cached);
      return cached.lines.get(lineNumber + 1) ?? null;
    }
    void this.loadBlame(documentPath, mtimeMs);
    return null;
  }

  /** Drop every retained blame map and make any in-flight load inert. */
  dispose(): void {
    this.disposed = true;
    this.cache.clear();
    this.inFlightPaths.clear();
    this.statMemo = null;
  }

  protected statMemoizedMtime(documentPath: string): number {
    const nowMs = Date.now();
    const gitBlameCacheClass = this.constructor as typeof $GitBlameCache;
    if (
      this.statMemo !== null &&
      this.statMemo.documentPath === documentPath &&
      nowMs - this.statMemo.checkedAtMs <
        gitBlameCacheClass.statMemoWindowMilliseconds
    ) {
      return this.statMemo.mtimeMs;
    }
    const mtimeMs = this.options.mtime
      ? this.options.mtime(documentPath)
      : Files.Class.mtimeMs(documentPath);
    this.statMemo = {
      documentPath,
      mtimeMs,
      checkedAtMs: nowMs,
    };
    return mtimeMs;
  }

  /** LRU touch: re-insert so the map's first key stays the least-recently-used entry. */
  protected refreshRecency(documentPath: string, status: GitFileStatus): void {
    this.cache.delete(documentPath);
    this.cache.set(documentPath, status);
  }

  protected storeBounded(documentPath: string, status: GitFileStatus): void {
    this.cache.delete(documentPath);
    this.cache.set(documentPath, status);
    const gitBlameCacheClass = this.constructor as typeof $GitBlameCache;
    while (this.cache.size > gitBlameCacheClass.maximumBlamedFiles) {
      const coldestPath = this.cache.keys().next().value;
      if (coldestPath === undefined) {
        break;
      }
      this.cache.delete(coldestPath);
    }
  }

  /** Blame `documentPath` once and cache the result under its current mtime. A nonzero exit
   * (untracked / non-repo) caches an EMPTY map so the negative result is remembered. */
  protected async loadBlame(
    documentPath: string,
    mtimeMs: number,
  ): Promise<void> {
    if (this.inFlightPaths.has(documentPath)) {
      return;
    }
    this.inFlightPaths.add(documentPath);

    try {
      const porcelain = await this.runBlame(documentPath);
      if (this.disposed) {
        return;
      }
      const lines =
        porcelain === null
          ? new Map<number, BlameLine>()
          : GitBlame.Class.parsePorcelain(porcelain);
      this.storeBounded(documentPath, { mtimeMs, lines });
    } catch {
      if (!this.disposed) {
        this.storeBounded(documentPath, {
          mtimeMs,
          lines: new Map<number, BlameLine>(),
        });
      }
    } finally {
      this.inFlightPaths.delete(documentPath);
      if (!this.disposed) {
        this.revision.value += 1;
      }
    }
  }

  protected runBlame(documentPath: string): Promise<string | null> {
    if (this.options.blame) {
      return this.options.blame(documentPath);
    }
    return GitCommands.Class.blamePorcelain(this.cwd, documentPath).then(
      (result) => (result.code === 0 ? result.stdout : null),
    );
  }
}

export namespace GitBlameCache {
  export const $Class = $GitBlameCache;
  export let Class = Reactive($GitBlameCache);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

interface GitFileStatus {
  readonly mtimeMs: number;
  readonly lines: ReadonlyMap<number, BlameLine>;
}

interface GitStatMemo {
  documentPath: string;
  mtimeMs: number;
  checkedAtMs: number;
}

export interface GitBlameCacheOptions {
  /** Injectable blame subprocess (tests): resolve porcelain stdout, or null for a nonzero exit. */
  blame?: (documentPath: string) => Promise<string | null>;
  /** Injectable mtime probe (tests): milliseconds, 0 = not on disk. */
  mtime?: (documentPath: string) => number;
}
