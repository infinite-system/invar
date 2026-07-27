import { Processes } from '../system/Processes';
import { GitParsers } from './GitParsers';
import { Static } from 'ivue/extras';

// Git CLI capability. Arguments are always passed as an argv array through Processes, never
// through a shell, and every process outcome is returned as data.
class $GitCommands {
  // invariant: Git command failures stay data (src/modules/git/git.invariants.md)
  protected static async run(
    workingDirectory: string,
    commandArguments: string[],
  ): Promise<GitCommandResult> {
    const result = await Processes.Class.run(
      ['git', ...commandArguments],
      workingDirectory,
    );
    return { code: result.code, stdout: result.stdout, stderr: result.stderr };
  }

  static statusPorcelainV2Branch(
    workingDirectory: string,
  ): Promise<GitCommandResult> {
    return this.run(workingDirectory, [
      '-c',
      'core.quotepath=false',
      'status',
      '--porcelain=v2',
      '--branch',
    ]);
  }

  static diffNameStatus(
    workingDirectory: string,
    options: DiffNameStatusOptions = {},
  ): Promise<GitCommandResult> {
    const commandArguments = ['diff', '--no-ext-diff', '--name-status'];
    if (options.cached) {
      commandArguments.push('--cached');
    }
    return this.run(workingDirectory, commandArguments);
  }

  static log(options: GitLogOptions): Promise<GitCommandResult> {
    const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
    const commandWorkingDirectory = options.cwd;
    const commandArguments = [
      'log',
      '--decorate=short',
      '--date=iso-strict',
      `--max-count=${limit}`,
      `--format=${GitParsers.Class.logFormat}`,
    ];

    if (options.skip !== undefined && options.skip > 0) {
      // Offset window: skip N from the branch/HEAD tip (for a virtualized commit list).
      commandArguments.push(`--skip=${Math.floor(options.skip)}`);
      if (options.branch) {
        commandArguments.push(options.branch);
      }
    } else if (options.cursor) {
      commandArguments.push('--skip=1', options.cursor);
    } else if (options.branch) {
      commandArguments.push(options.branch);
    }

    return this.run(commandWorkingDirectory, commandArguments);
  }

  /**
   * Unified diff for one file: staged -> index vs HEAD; unstaged -> worktree vs index;
   * untracked -> the whole file as additions (--no-index exits 1 on differences: not an error).
   */
  static diffFile(
    workingDirectory: string,
    filePath: string,
    bucket: 'staged' | 'unstaged' | 'untracked',
  ): Promise<GitCommandResult> {
    if (bucket === 'staged') {
      return this.run(workingDirectory, [
        'diff',
        '--no-ext-diff',
        '--no-color',
        '--cached',
        '--',
        filePath,
      ]);
    }
    if (bucket === 'untracked') {
      return this.run(workingDirectory, [
        'diff',
        '--no-ext-diff',
        '--no-color',
        '--no-index',
        '--',
        '/dev/null',
        filePath,
      ]);
    }
    return this.run(workingDirectory, [
      'diff',
      '--no-ext-diff',
      '--no-color',
      '--',
      filePath,
    ]);
  }

  /**
   * Discard a file's changes in the working tree — DESTRUCTIVE (guarded by an explicit user
   * confirmation upstream; see 'Destructive working-tree operations require confirmation' in
   * git.invariants.md). untracked -> clean; staged -> restore index+worktree from HEAD;
   * unstaged -> restore worktree.
   */
  static discard(
    workingDirectory: string,
    filePath: string,
    bucket: 'staged' | 'unstaged' | 'untracked',
  ): Promise<GitCommandResult> {
    if (bucket === 'untracked') {
      return this.run(workingDirectory, ['clean', '-f', '--', filePath]);
    }
    if (bucket === 'staged') {
      return this.run(workingDirectory, [
        'restore',
        '--staged',
        '--worktree',
        '--source=HEAD',
        '--',
        filePath,
      ]);
    }
    return this.run(workingDirectory, ['restore', '--', filePath]);
  }

  static show(
    workingDirectory: string,
    ref: string,
  ): Promise<GitCommandResult> {
    return this.run(workingDirectory, [
      'show',
      '--no-ext-diff',
      '--no-color',
      '--decorate=short',
      ref,
      '--',
    ]);
  }

  /** One commit's changed files as name-status lines (lazy commit expansion in the log). */
  static showNameStatus(
    workingDirectory: string,
    sha: string,
  ): Promise<GitCommandResult> {
    return this.run(workingDirectory, [
      '-c',
      'core.quotepath=false',
      'show',
      '--name-status',
      '--format=',
      '--no-ext-diff',
      '--no-color',
      sha,
      '--',
    ]);
  }

  /** Unified diff of ONE file as of ONE commit (parent → commit). Exits nonzero on a root commit
   *  (`<sha>^` does not exist) — callers fall back to `showCommitFile`. */
  static diffCommitFile(
    workingDirectory: string,
    sha: string,
    filePath: string,
  ): Promise<GitCommandResult> {
    return this.run(workingDirectory, [
      'diff',
      '--no-ext-diff',
      '--no-color',
      `${sha}^`,
      sha,
      '--',
      filePath,
    ]);
  }

  /** Root-commit fallback for `diffCommitFile`: the commit's own patch for one file. */
  static showCommitFile(
    workingDirectory: string,
    sha: string,
    filePath: string,
  ): Promise<GitCommandResult> {
    return this.run(workingDirectory, [
      'show',
      '--no-ext-diff',
      '--no-color',
      '--format=',
      sha,
      '--',
      filePath,
    ]);
  }

  /**
   * The FULL text of a file as of a git ref (`HEAD:path`, `<sha>:path`, `<sha>^:path`, `:path` for the
   * index) — the two SIDES a side-by-side DiffView needs, not a unified patch. A path absent at that ref
   * (an added/untracked/root-commit file) exits nonzero; callers treat that as the empty side (no
   * previous/next version). `--textconv` off keeps it byte-exact.
   */
  static fileAtRef(
    workingDirectory: string,
    ref: string,
    filePath: string,
  ): Promise<GitCommandResult> {
    return this.run(workingDirectory, ['show', `${ref}:${filePath}`]);
  }

  static branchShowCurrent(
    workingDirectory: string,
  ): Promise<GitCommandResult> {
    return this.run(workingDirectory, ['branch', '--show-current']);
  }

  /** LOCAL branch names only (`refs/heads`), sorted — the read-only branch viewer's source list.
   *  Never touches remotes and never spawns a network fetch.
   */
  static localBranches(workingDirectory: string): Promise<GitCommandResult> {
    return this.run(workingDirectory, [
      'for-each-ref',
      'refs/heads',
      '--format=%(refname:short)',
      '--sort=refname',
    ]);
  }

  /** The commit SHA a LOCAL ref points at (`HEAD`, `refs/heads/<branch>`). The cheap tip probe the
   * log-staleness reconcile polls — one local ref read, never a log walk, never the network. */
  static revParse(
    workingDirectory: string,
    ref: string,
  ): Promise<GitCommandResult> {
    return this.run(workingDirectory, [
      'rev-parse',
      '--verify',
      '--quiet',
      ref,
    ]);
  }

  /**
   * Line-by-line authorship for a file in `--porcelain` form (stable, machine-readable): one header
   * `<sha> <origLine> <finalLine> [numLines]` per hunk, each commit's author/summary metadata sent once
   * on its first appearance, then a tab-prefixed content line. A non-tracked / non-repo path exits
   * nonzero — the caller treats that as "no blame". `-w` ignores whitespace-only changes so a reindent
   * does not steal authorship.
   */
  static blamePorcelain(
    workingDirectory: string,
    filePath: string,
  ): Promise<GitCommandResult> {
    return this.run(workingDirectory, [
      'blame',
      '--porcelain',
      '-w',
      '--',
      filePath,
    ]);
  }

  static stage(
    workingDirectory: string,
    paths: string[],
  ): Promise<GitCommandResult> {
    if (paths.length === 0) {
      return Promise.resolve({ code: 0, stdout: '', stderr: '' });
    }
    return this.run(workingDirectory, ['add', '--', ...paths]);
  }

  static unstage(
    workingDirectory: string,
    paths: string[],
  ): Promise<GitCommandResult> {
    if (paths.length === 0) {
      return Promise.resolve({ code: 0, stdout: '', stderr: '' });
    }
    return this.run(workingDirectory, ['restore', '--staged', '--', ...paths]);
  }
}

export namespace GitCommands {
  export const $Class = Static($GitCommands);
  export const Class = $Class;
}

export interface GitCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface DiffNameStatusOptions {
  cached?: boolean;
}

export interface GitLogOptions {
  cwd: string;
  branch?: string;
  limit?: number;
  cursor?: string;
  /** Offset paging: skip this many commits before the page (for a virtualized commit list). */
  skip?: number;
}
