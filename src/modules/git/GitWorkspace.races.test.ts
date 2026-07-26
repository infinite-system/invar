import { describe, expect, test } from 'bun:test';
import { CommitLog } from './CommitLog';
import { GitCommands, type GitCommandResult } from './GitCommands';
import { GitRepository } from './GitRepository';
import type { CommitRecord } from './GitParsers';
import { GitWorkspace } from './GitWorkspace';
import { Workspace } from '../workspace/Workspace';

class TestGitWorkspace extends GitWorkspace.$Class {
  constructor(
    workspace: Workspace.Model,
    protected readonly commandsClass: typeof GitCommands.Class,
  ) {
    super(workspace);
  }

  protected override get GitCommands() {
    return this.commandsClass;
  }
}

function commit(index: number, branch: string): CommitRecord {
  return {
    sha: `${branch}-sha${index}`,
    shortSha: `s${index}`,
    author: 'author',
    dateIso: 'date',
    subject: `${branch} ${index}`,
    refs: [],
  };
}

function result(code: number, stdout = ''): GitCommandResult {
  return { code, stdout, stderr: '' };
}

function viewer(commandsClass: typeof GitCommands.Class): TestGitWorkspace {
  const workspace = new Workspace.Class();
  const contribution = new TestGitWorkspace(workspace, commandsClass);
  contribution.commitLog.value = new CommitLog.Class('/repo', {
    fetch: async (skip, limit, branch) =>
      Array.from({ length: limit }, (_unused, index) =>
        commit(skip + index, branch ?? 'HEAD'),
      ),
  });
  contribution.repository.value = new GitRepository.Class('/repo');
  contribution.repository.value.branch.value = 'main';
  contribution.repository.value.head.value = 'main-tip';
  return contribution;
}

describe('repository contribution supersession', () => {
  test('comparison preview preserves pane focus until activation', () => {
    const workspace = new Workspace.Class();
    const contribution = new TestGitWorkspace(workspace, GitCommands.Class);
    const comparison = {
      previousVersionText: 'before',
      currentVersionText: 'after',
      previousVersionPath: 'sample.ts @ previous',
      currentVersionPath: 'sample.ts',
    };
    workspace.focusPrimaryPane('git');

    contribution.showComparison(comparison, false);
    expect(workspace.focus.value).toBe('primaryPane');

    contribution.showComparison(comparison, true);
    expect(workspace.focus.value).toBe('editor');
  });

  test('a stale failed tip probe cannot replace a newer branch view', async () => {
    let releaseProbe: ((value: GitCommandResult) => void) | null = null;
    class DeferredCommands extends GitCommands.$Class {
      static override revParse(
        _workingDirectory: string,
        reference: string,
      ): Promise<GitCommandResult> {
        if (reference === 'refs/heads/branch-a') {
          return new Promise((resolve) => {
            releaseProbe = resolve;
          });
        }
        return Promise.resolve(result(0, `${reference}-tip\n`));
      }
    }
    const contribution = viewer(DeferredCommands);
    contribution.selectLogBranch('branch-a');
    const probe = contribution.reconcileLogTip();
    contribution.selectLogBranch('branch-b');
    releaseProbe!(result(128));
    await probe;
    expect(contribution.commitLog.value?.branch.value).toBe('branch-b');
  });

  test('the newest diff request wins when completions arrive out of order', async () => {
    const pending = new Map<string, (value: GitCommandResult) => void>();
    class DeferredCommands extends GitCommands.$Class {
      static override fileAtRef(
        _workingDirectory: string,
        reference: string,
        filePath: string,
      ): Promise<GitCommandResult> {
        return new Promise((resolve) => {
          pending.set(`${reference}:${filePath}`, resolve);
        });
      }
    }
    const contribution = viewer(DeferredCommands);
    const release = async (key: string, text: string): Promise<void> => {
      while (!pending.has(key)) await Promise.resolve();
      pending.get(key)!(result(0, text));
      pending.delete(key);
    };
    const older = contribution.openCommitFileDiff('older', 'older.ts');
    const newer = contribution.openCommitFileDiff('newer', 'newer.ts');
    await release('newer^:newer.ts', 'newer previous');
    await release('newer:newer.ts', 'newer current');
    await newer;
    await release('older^:older.ts', 'older previous');
    await release('older:older.ts', 'older current');
    await older;
    expect(contribution.comparisonRequest.value?.currentVersionPath).toBe(
      'newer.ts',
    );
  });
});
