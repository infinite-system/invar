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
