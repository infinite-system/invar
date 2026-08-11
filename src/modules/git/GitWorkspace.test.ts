import { expect, test } from 'bun:test';
import { Workspace } from '../workspace/Workspace';
import { CommitLog } from './CommitLog';
import { GitCommands, type GitCommandResult } from './GitCommands';
import { GitRepository } from './GitRepository';
import { GitWorkspace } from './GitWorkspace';

test('repository document state is keyed behind the contribution', () => {
  const workspace = new Workspace.Class();
  const contribution = new GitWorkspace.Class(workspace);
  expect('activeHeadText' in contribution).toBe(false);
  // The host cannot ask for an unscoped projection: the stable handle is mandatory.
  // @ts-expect-error document-scoped contributions reject an unkeyed gutter read
  contribution.byLine();
  expect(contribution.byLine({} as never)).toEqual(new Map());
  contribution.disposed();
});

// invariant: The commit log follows repository reality (src/modules/git/git.invariants.md)
test('a hidden git pane spawns no tip probe; a visible one does', async () => {
  let revParseCalls = 0;
  class CountingCommands extends GitCommands.$Class {
    static override revParse(
      _workingDirectory: string,
      reference: string,
    ): Promise<GitCommandResult> {
      revParseCalls += 1;
      return Promise.resolve({
        code: 0,
        stdout: `${reference}-tip\n`,
        stderr: '',
      });
    }
  }
  let observed = false;
  class GatedGitWorkspace extends GitWorkspace.$Class {
    constructor(workspace: Workspace.Model) {
      super(workspace, undefined, undefined, () => observed);
    }

    protected override get GitCommands() {
      return CountingCommands;
    }
  }
  const workspace = new Workspace.Class();
  const contribution = new GatedGitWorkspace(workspace);
  contribution.commitLog.value = new CommitLog.Class('/repo', {
    fetch: async () => [],
  });
  contribution.repository.value = new GitRepository.Class('/repo');
  contribution.repository.value.branch.value = 'main';
  contribution.repository.value.head.value = 'main-tip';
  contribution.selectLogBranch('feature');

  await contribution.reconcileLogTip();
  expect(revParseCalls).toBe(0);

  observed = true;
  await contribution.reconcileLogTip();
  expect(revParseCalls).toBe(1);
  contribution.disposed();
});

test('forty opened comparisons produce forty distinct history entries', () => {
  const workspace = new Workspace.Class();
  const contribution = new GitWorkspace.Class(workspace);
  for (let fileIndex = 0; fileIndex < 40; fileIndex += 1) {
    contribution.showComparison(
      {
        previousVersionText: `before ${fileIndex}`,
        currentVersionText: `after ${fileIndex}`,
        previousVersionPath: `file-${fileIndex}.ts @ previous`,
        currentVersionPath: `file-${fileIndex}.ts`,
      },
      true,
    );
  }

  expect(workspace.navigationHistory.size).toBe(40);
  expect(workspace.navigationHistory.back()).toBe(true);
  expect(contribution.comparisonRequest.value?.currentVersionPath).toBe(
    'file-38.ts',
  );
  expect(workspace.navigationHistory.size).toBe(40);
  contribution.disposed();
});
