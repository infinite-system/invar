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
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
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

  constructor(
    readonly cwd: string,
    protected readonly repository: GitRepository.Model,
    options: GitWatcherOptions = {},
  ) {
    this.onReconciled = options.onReconciled ?? null;
    this.debounceMilliseconds = Math.max(0, options.debounceMs ?? 80);
    this.reconcileIntervalMilliseconds = Math.max(1, options.reconcileIntervalMilliseconds ?? 5_000);
    this.start();
    this.startReconcileFloor();
    this.watchHead();
  }

  /** Watch HEAD so a `git checkout`/`switch` refreshes the branch even when the working tree does not
   * change (the tree walk skips .git; the 5s reconcile floor is only a fallback). We watch the git
   * DIR — not the HEAD file — because git replaces HEAD by rename (HEAD.lock -> HEAD), which would
   * break a file watch after the first switch; a directory watch survives it. HEAD lives in THIS
   * worktree's own git dir (the linked-worktree dir for a worktree, `<root>/.git` for the main
   * checkout), resolved via `rev-parse --absolute-git-dir`.
   */
  protected watchHead(): void {
    if (this.disposed) {
      return;
    }
    const result = spawnSync('git', ['-C', this.cwd, 'rev-parse', '--absolute-git-dir'], {
      encoding: 'utf8',
      timeout: 2000,
    });
    if (result.status !== 0) {
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

  /** The absolute paths of every watched directory (for verification that ignored subtrees such as
   * `node_modules` were never watched). */
  watchedDirectories(): string[] {
    return [...this.directoryWatchers.keys()];
  }

  start(): boolean {
    if (this.disposed || this.directoryWatchers.size > 0) {
      return this.active;
    }
    try {
      this.walkAndWatch(this.cwd);
    } catch {
      // Catastrophic walk failure (unreadable root): fall back to a single non-recursive watch on
      // the root so top-level changes still refresh, rather than watching nothing.
      this.scheduleRefresh();
      this.watchDirectory(this.cwd);
    }
    return this.active;
  }

  /** Establish a non-recursive watch on `directory`, then recurse into each child directory git
   * does not ignore (and that is not `.git`). Symlinked directories are not followed. */
  protected walkAndWatch(directory: string): void {
    if (this.disposed) {
      return;
    }
    if (!this.watchDirectory(directory)) {
      return;
    }

    let childDirectoryNames: string[];
    try {
      childDirectoryNames = readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== '.git')
        .map((entry) => entry.name);
    } catch {
      this.scheduleRefresh();
      return;
    }
    if (childDirectoryNames.length === 0) {
      return;
    }

    for (const childName of this.filterIgnoredChildren(directory, childDirectoryNames)) {
      this.walkAndWatch(join(directory, childName));
    }
  }

  protected watchDirectory(directory: string): boolean {
    if (this.disposed || this.directoryWatchers.has(directory)) {
      return false;
    }
    try {
      const watcher = watch(directory, (_eventType, changedName) =>
        this.onDirectoryEvent(directory, changedName),
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
  protected filterIgnoredChildren(
    parentDirectory: string,
    childDirectoryNames: string[],
  ): string[] {
    const ignoredDirectoryNames = this.queryIgnoredNames(parentDirectory, childDirectoryNames);
    if (ignoredDirectoryNames === null) {
      const gitWatcherClass = this.constructor as typeof $GitWatcher;
      return childDirectoryNames.filter(
        (childName) => !gitWatcherClass.fallbackIgnoredDirectoryNames.has(childName),
      );
    }
    return childDirectoryNames.filter(
      (childName) => !ignoredDirectoryNames.has(childName),
    );
  }

  /** Ask git which of `childDirectoryNames` (relative to `parentDirectory`) are ignored. `git check-ignore`
   * exits 0 when at least one path is ignored, 1 when none are, and otherwise fails (not a
   * repository, git missing) — a failure returns null so the caller can fall back. */
  protected queryIgnoredNames(
    parentDirectory: string,
    childDirectoryNames: string[],
  ): Set<string> | null {
    let result: ReturnType<typeof spawnSync>;
    try {
      result = spawnSync('git', ['check-ignore', '-z', '--stdin'], {
        cwd: parentDirectory,
        input: childDirectoryNames.join('\0'),
        encoding: 'utf8',
      });
    } catch {
      return null;
    }
    if (result.error) {
      return null;
    }
    if (result.status !== 0 && result.status !== 1) {
      return null;
    }

    const ignoredDirectoryNames = new Set<string>();
    for (const ignoredDirectoryName of String(result.stdout).split('\0')) {
      if (ignoredDirectoryName.length > 0) {
        ignoredDirectoryNames.add(ignoredDirectoryName);
      }
    }
    return ignoredDirectoryNames;
  }

  protected onDirectoryEvent(
    directory: string,
    changedName: string | Buffer | null,
  ): void {
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
      const childName = typeof changedName === 'string' ? changedName : changedName.toString();
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
      if (!childStats || childStats.isSymbolicLink() || !childStats.isDirectory()) {
        return;
      }
      if (this.filterIgnoredChildren(directory, [childName]).length === 0) {
        return;
      }
      this.walkAndWatch(childPath);
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
  /** Called after each COMPLETED background reconcile (debounced event flush or the periodic
   * floor). The owner hangs cheap follow-up checks here — e.g. the commit-log tip-SHA staleness
   * probe — so they ride the existing reconcile cadence instead of owning a second timer. Never
   * called after dispose(). */
  onReconciled?: () => void;
}
