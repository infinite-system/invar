// Disposable working-directory watcher. A storm of filesystem events owns only one resettable
// timer and therefore produces one Git refresh after the tree settles.
//
// It watches the working tree by WALKING it and establishing one NON-recursive watch per
// directory, SKIPPING every directory git considers ignored (queried with `git check-ignore`)
// plus `.git`. A single recursive watch on the root would descend into ignored trees like
// `node_modules` — thousands of nested directories, each an open filesystem watch handle, a real
// handle/memory sink on large projects — and on this platform Bun's recursive watch does not even
// reliably deliver nested events. The per-directory walk instead never opens a watch handle inside
// an ignored directory: an ignored path is pruned before its watch is ever created.
//
// invariant: Filesystem notifications arrive in bursts (src/modules/git/git.invariants.md)
// invariant: The watcher has one disposable debounce (src/modules/git/git.invariants.md)
// invariant: The git panel converges without watcher notifications (src/modules/git/git.invariants.md)
// invariant: The watcher never watches inside an ignored directory (src/modules/git/git.invariants.md)
import { watch, readdirSync, lstatSync, type FSWatcher } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { Processes } from '../system/Processes';
import type { GitRepository } from './GitRepository';

class $GitWatcher {
  protected static get fallbackIgnoredDirectoryNames(): Set<string> {
    return new Set(['node_modules', '.git', 'dist']);
  }

  protected readonly directoryWatchers = new Map<string, FSWatcher>();
  // A SINGLE watch on this worktree's git dir, dedicated to HEAD changes (branch switches).
  protected headWatcher: FSWatcher | null = null;
  protected debounceTimer: ReturnType<typeof setTimeout> | null = null;
  protected reconcileTimer: ReturnType<typeof setInterval> | null = null;
  protected disposed = false;
  protected readonly debounceMilliseconds: number;
  protected readonly reconcileIntervalMilliseconds: number;
  protected readonly onReconciled: (() => void) | null;
  protected readonly onWatchSetEstablished: (() => void) | null;
  protected activationIgnoreQuerySubprocessCount = 0;
  protected activationWatchedDirectoryCount = 0;
  protected watchSetEstablished = false;
  protected readonly watchSetEstablishmentPromise: Promise<void>;

  constructor(
    readonly cwd: string,
    protected readonly repository: GitRepository.Model,
    options: GitWatcherOptions = {},
  ) {
    this.onReconciled = options.onReconciled ?? null;
    this.onWatchSetEstablished = options.onWatchSetEstablished ?? null;
    this.debounceMilliseconds = Math.max(0, options.debounceMs ?? 80);
    this.reconcileIntervalMilliseconds = Math.max(
      1,
      options.reconcileIntervalMilliseconds ?? 5_000,
    );
    this.watchSetEstablishmentPromise = this.establishWatchSet(
      options.viewPainted,
    );
  }

  protected get Processes() {
    return Processes.Class;
  }

  /** Watch HEAD so a `git checkout`/`switch` refreshes the branch even when the working tree does not
   * change (the tree walk skips .git; the 5s reconcile floor is only a fallback). We watch the git
   * DIR — not the HEAD file — because git replaces HEAD by rename (HEAD.lock -> HEAD), which would
   * break a file watch after the first switch; a directory watch survives it. HEAD lives in THIS
   * worktree's own git dir (the linked-worktree dir for a worktree, `<root>/.git` for the main
   * checkout), resolved via `rev-parse --absolute-git-dir`.
   */
  protected async establishHeadWatch(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const result = await this.Processes.run(
      ['git', 'rev-parse', '--absolute-git-dir'],
      this.cwd,
    );
    if (this.disposed || !result.ok) {
      return;
    }

    const gitDirectory = result.stdout.trim();
    if (!gitDirectory) {
      return;
    }

    try {
      this.headWatcher = watch(gitDirectory, (_event, changedName) => {
        // Refresh only on HEAD (the branch pointer); other git-internal writes are noise here. A null
        // filename (platform could not report it) is treated as "maybe HEAD" and refreshes to be safe.
        if (
          changedName === null ||
          changedName === 'HEAD' ||
          changedName.toString() === 'HEAD'
        ) {
          this.scheduleRefresh();
        }
      });
      this.headWatcher.unref?.();
    } catch {
      // HEAD unwatchable (permissions, transient race) — the reconcile floor still converges the
      // branch.
    }
  }

  get active(): boolean {
    return !this.disposed;
  }

  /** How many directories currently hold a watch handle. No entry ever points inside an ignored
   * directory — the walk prunes ignored paths before a watch is created. */
  get watchedDirectoryCount(): number {
    return this.directoryWatchers.size;
  }

  get activationIgnoreQuerySubprocesses(): number {
    return this.activationIgnoreQuerySubprocessCount;
  }

  get activationWatchedDirectories(): number {
    return this.activationWatchedDirectoryCount;
  }

  get activationCompleted(): boolean {
    return this.watchSetEstablished;
  }

  /** The absolute paths of every watched directory (for verification that ignored subtrees such as
   * `node_modules` were never watched). */
  watchedDirectories(): string[] {
    return [...this.directoryWatchers.keys()];
  }

  whenWatchSetEstablished(): Promise<void> {
    return this.watchSetEstablishmentPromise;
  }

  protected async establishWatchSet(
    viewPainted?: Promise<void>,
  ): Promise<void> {
    // Leave construction immediately so workspace activation can paint before any repository walk or
    // Git subprocess begins.
    await (viewPainted ?? this.yieldToEventLoop());
    if (this.disposed) {
      return;
    }

    this.startReconcileFloor();
    await Promise.all([
      this.establishWorkingTreeWatchSet(this.cwd, true),
      this.establishHeadWatch(),
    ]);
    if (this.disposed) {
      return;
    }
    this.activationWatchedDirectoryCount = this.directoryWatchers.size;
    this.watchSetEstablished = true;
    this.onWatchSetEstablished?.();
  }

  protected async establishWorkingTreeWatchSet(
    rootDirectory: string,
    countsTowardActivation: boolean,
  ): Promise<void> {
    try {
      await this.walkAndWatchByLevel(rootDirectory, countsTowardActivation);
    } catch {
      // Catastrophic walk failure (unreadable root): fall back to a single non-recursive watch on
      // the root so top-level changes still refresh, rather than watching nothing.
      this.scheduleRefresh();
      this.watchDirectory(rootDirectory);
    }
  }

  /** Establish non-recursive watches breadth-first. Every level contributes one bulk ignore query,
   * so subprocess cost follows tree depth rather than the number of visited directories. */
  protected async walkAndWatchByLevel(
    rootDirectory: string,
    countsTowardActivation: boolean,
  ): Promise<void> {
    let currentLevelDirectories = [rootDirectory];
    while (!this.disposed && currentLevelDirectories.length > 0) {
      const candidateChildDirectories: DirectoryCandidate[] = [];
      for (const directory of currentLevelDirectories) {
        if (!this.watchDirectory(directory)) {
          continue;
        }
        try {
          for (const entry of readdirSync(directory, {
            withFileTypes: true,
          })) {
            if (entry.isDirectory() && entry.name !== '.git') {
              const absolutePath = join(directory, entry.name);
              candidateChildDirectories.push({
                absolutePath,
                relativePath: relative(this.cwd, absolutePath),
              });
            }
          }
        } catch {
          this.scheduleRefresh();
        }
      }
      if (candidateChildDirectories.length === 0) {
        break;
      }

      // invariant: Workspace activation is view-only (src/modules/workspace/workspace.invariants.md)
      currentLevelDirectories = (
        await this.filterIgnoredDirectories(
          candidateChildDirectories,
          countsTowardActivation,
        )
      ).map((candidateDirectory) => candidateDirectory.absolutePath);
      await this.yieldToEventLoop();
    }
  }

  protected watchDirectory(directory: string): boolean {
    if (this.disposed || this.directoryWatchers.has(directory)) {
      return false;
    }
    try {
      const watcher = watch(
        directory,
        (_eventType, changedName) =>
          void this.onDirectoryEvent(directory, changedName),
      );
      watcher.on('error', () => this.onWatcherError(directory));
      this.directoryWatchers.set(directory, watcher);
      return true;
    } catch {
      this.scheduleRefresh();
      return false;
    }
  }

  // invariant: The git panel converges without watcher notifications (src/modules/git/git.invariants.md)
  protected startReconcileFloor(): void {
    if (this.disposed || this.reconcileTimer) {
      return;
    }
    this.reconcileTimer = setInterval(
      () => this.scheduleRefresh(),
      this.reconcileIntervalMilliseconds,
    );
    this.reconcileTimer.unref?.();
  }

  // invariant: The watcher never watches inside an ignored directory (src/modules/git/git.invariants.md)
  protected async filterIgnoredDirectories(
    candidateDirectories: DirectoryCandidate[],
    countsTowardActivation: boolean,
  ): Promise<DirectoryCandidate[]> {
    const ignoredRelativePaths = await this.queryIgnoredRelativePaths(
      candidateDirectories.map(
        (candidateDirectory) => candidateDirectory.relativePath,
      ),
      countsTowardActivation,
    );
    if (ignoredRelativePaths === null) {
      const gitWatcherClass = this.constructor as typeof $GitWatcher;
      return candidateDirectories.filter(
        (candidateDirectory) =>
          !gitWatcherClass.fallbackIgnoredDirectoryNames.has(
            basename(candidateDirectory.absolutePath),
          ),
      );
    }
    return candidateDirectories.filter(
      (candidateDirectory) =>
        !ignoredRelativePaths.has(candidateDirectory.relativePath),
    );
  }

  /** Ask git which working-tree-relative paths are ignored. `git check-ignore` exits 0 when at
   * least one path is ignored, 1 when none are, and otherwise fails. */
  protected async queryIgnoredRelativePaths(
    relativePaths: string[],
    countsTowardActivation: boolean,
  ): Promise<Set<string> | null> {
    const result = await this.Processes.run(
      ['git', 'check-ignore', '-z', '--stdin'],
      this.cwd,
      relativePaths.join('\0'),
    );
    if (countsTowardActivation && result.code !== -1) {
      this.activationIgnoreQuerySubprocessCount += 1;
    }
    if (result.code !== 0 && result.code !== 1) {
      return null;
    }

    const ignoredRelativePaths = new Set<string>();
    for (const ignoredRelativePath of result.stdout.split('\0')) {
      if (ignoredRelativePath.length > 0) {
        ignoredRelativePaths.add(ignoredRelativePath);
      }
    }
    return ignoredRelativePaths;
  }

  protected yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }

  protected async onDirectoryEvent(
    directory: string,
    changedName: string | Buffer | null,
  ): Promise<void> {
    // Nothing in this body may THROW: fs.watch invokes it outside any caller's try/catch, so an
    // escaped exception (e.g. a filesystem race) would take down the whole process.
    try {
      if (this.disposed) {
        return;
      }
      this.scheduleRefresh();

      // A newly created subdirectory (a 'rename' that added an entry) needs its own watch — but only
      // if git does not ignore it. Deletions or file changes resolve to no new directory and are
      // covered by the refresh above.
      if (!changedName) {
        return;
      }
      const childName =
        typeof changedName === 'string' ? changedName : changedName.toString();
      if (childName.length === 0 || childName === '.git') {
        return;
      }
      const childPath = join(directory, childName);
      if (this.directoryWatchers.has(childPath)) {
        return;
      }

      // lstat, NEVER stat: the initial walk's Dirent.isDirectory() does not follow symlinks, and the
      // runtime path must hold the same boundary — stat() follows links, so a symlink to .git or to
      // an external tree would be recursively watched, and a self-referential link makes stat()
      // throw ELOOP. lstat reports the link itself; a symlink is rejected regardless of its target.
      // invariant: The watcher never watches inside an ignored directory (src/modules/git/git.invariants.md)
      const childStats = lstatSync(childPath, { throwIfNoEntry: false });
      if (
        !childStats ||
        childStats.isSymbolicLink() ||
        !childStats.isDirectory()
      ) {
        return;
      }
      const candidateDirectory = {
        absolutePath: childPath,
        relativePath: relative(this.cwd, childPath),
      };
      if (
        (await this.filterIgnoredDirectories([candidateDirectory], false))
          .length === 0
      ) {
        return;
      }
      await this.establishWorkingTreeWatchSet(childPath, false);
    } catch {
      // A raced/vanished path or unreadable entry: the refresh above (or the reconcile floor)
      // still converges git state — never let the watcher callback throw.
    }
  }

  // invariant: The watcher has one disposable debounce (src/modules/git/git.invariants.md)
  protected scheduleRefresh(): void {
    if (this.disposed) {
      return;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(
      () => this.flushRefresh(),
      this.debounceMilliseconds,
    );
    this.debounceTimer.unref?.();
  }

  protected flushRefresh(): void {
    this.debounceTimer = null;
    if (this.disposed) {
      return;
    }
    void this.repository.refresh({ background: true }).then(() => {
      // The follow-up (log tip-SHA probe) runs only after the status reconcile LANDED, so it reads
      // fresh ground truth (head) — and never after disposal (no zombie refresh chain).
      if (!this.disposed) {
        this.onReconciled?.();
      }
    });
  }

  protected onWatcherError(directory: string): void {
    const watcher = this.directoryWatchers.get(directory);
    watcher?.close();
    this.directoryWatchers.delete(directory);
    this.scheduleRefresh();
  }

  // invariant: A referenced resource stays alive (project.invariants.md)
  dispose(): void {
    this.disposed = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = null;

    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
    }
    this.reconcileTimer = null;

    this.headWatcher?.close();
    this.headWatcher = null;

    for (const watcher of this.directoryWatchers.values()) {
      watcher.close();
    }
    this.directoryWatchers.clear();
  }
}

export namespace GitWatcher {
  export const $Class = $GitWatcher;
  export let Class = $GitWatcher;
  export type Model = InstanceType<typeof Class>;
}

export interface GitWatcherOptions {
  debounceMs?: number;
  reconcileIntervalMilliseconds?: number;
  /** Resolves after the workspace's newly active view has painted. No watch traversal or Git process
   * starts before this barrier. */
  viewPainted?: Promise<void>;
  /** Called after each COMPLETED background reconcile (debounced event flush or the periodic
   * floor). The owner hangs cheap follow-up checks here — e.g. the commit-log tip-SHA staleness
   * probe — so they ride the existing reconcile cadence instead of owning a second timer. Never
   * called after dispose(). */
  onReconciled?: () => void;
  /** Called once after the breadth-first working-tree watch set and the dedicated HEAD watch have
   * settled. The workspace uses it to publish activation counters without making this resource
   * owner reactive. */
  onWatchSetEstablished?: () => void;
}

interface DirectoryCandidate {
  absolutePath: string;
  relativePath: string;
}
