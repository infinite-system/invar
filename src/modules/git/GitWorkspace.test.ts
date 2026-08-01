import { expect, test } from 'bun:test';
import { Workspace } from '../workspace/Workspace';
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
