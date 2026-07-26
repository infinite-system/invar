import { describe, expect, it } from 'bun:test';
import { GitComparisonSurface } from './GitComparisonSurface';
import type { GitComparisonContent } from './GitComparisonContent';
import type { GitComparisonRequest, GitWorkspace } from './GitWorkspace';
import type { EditorSurfaceContentContext } from '../ui/EditorSurfaceContents';

const request: GitComparisonRequest = {
  token: 4,
  previousVersionText: 'a\n',
  currentVersionText: 'b\n',
  previousVersionPath: 'file.ts',
  currentVersionPath: 'file.ts',
};

// The per-workspace source-control contribution, reduced to the three members the provider reads.
function createGitWorkspace(root: string, splitRatioReads: number[] = []) {
  const gitWorkspace = {
    showingComparison: { value: false },
    comparisonRequest: { value: null as GitComparisonRequest | null },
    workspace: { root },
    diffSplitRatioSetting: {
      value: {
        get value() {
          splitRatioReads.push(1);
          return 0.5;
        },
      },
    },
  };
  return gitWorkspace as unknown as GitWorkspace.Model & typeof gitWorkspace;
}

function createSurface(gitWorkspace: GitWorkspace.Model | null) {
  const splitRatioReads: number[] = [];
  if (gitWorkspace) {
    (
      gitWorkspace as unknown as {
        diffSplitRatioSetting: { value: { value: number } };
      }
    ).diffSplitRatioSetting = {
      value: {
        get value() {
          splitRatioReads.push(1);
          return 0.5;
        },
      },
    };
  }
  const created: EditorSurfaceContentContext[] = [];
  class TestSurface extends GitComparisonSurface.$Class {
    protected override createContent(
      _workspace: GitWorkspace.Model,
      _request: GitComparisonRequest,
      context: EditorSurfaceContentContext,
    ): GitComparisonContent.Model {
      created.push(context);
      return {
        comparisonView: null,
      } as unknown as GitComparisonContent.Model;
    }
  }
  return {
    surface: new TestSurface(() => gitWorkspace),
    splitRatioReads,
    created,
  };
}

describe('GitComparisonSurface', () => {
  it('claims nothing when no workspace contribution is active', () => {
    const { surface } = createSurface(null);
    expect(surface.mountIdentity()).toBe('');
  });

  it('claims nothing while no comparison is showing', () => {
    const gitWorkspace = createGitWorkspace('/project');
    gitWorkspace.comparisonRequest.value = request;
    const { surface } = createSurface(gitWorkspace);
    expect(surface.mountIdentity()).toBe('');
  });

  it('claims nothing when showing but no request has landed', () => {
    const gitWorkspace = createGitWorkspace('/project');
    gitWorkspace.showingComparison.value = true;
    const { surface } = createSurface(gitWorkspace);
    expect(surface.mountIdentity()).toBe('');
  });

  it('keys its mount identity to the root and the request token', () => {
    const gitWorkspace = createGitWorkspace('/project');
    gitWorkspace.showingComparison.value = true;
    gitWorkspace.comparisonRequest.value = request;
    const { surface } = createSurface(gitWorkspace);
    expect(surface.mountIdentity()).toBe('/project:comparison:4');
  });

  // A fresh request must rebuild the view, and a different root must never show another root's
  // comparison — both are what the identity string is for.
  it('changes identity for a new request token and for a different root', () => {
    const gitWorkspace = createGitWorkspace('/project');
    gitWorkspace.showingComparison.value = true;
    gitWorkspace.comparisonRequest.value = request;
    const { surface } = createSurface(gitWorkspace);
    const first = surface.mountIdentity();
    gitWorkspace.comparisonRequest.value = { ...request, token: 5 };
    expect(surface.mountIdentity()).not.toBe(first);
    const otherRoot = createGitWorkspace('/other');
    otherRoot.showingComparison.value = true;
    otherRoot.comparisonRequest.value = request;
    expect(createSurface(otherRoot).surface.mountIdentity()).toBe(
      '/other:comparison:4',
    );
  });

  it('builds its content with the host-supplied mount context', () => {
    const gitWorkspace = createGitWorkspace('/project');
    gitWorkspace.showingComparison.value = true;
    gitWorkspace.comparisonRequest.value = request;
    const { surface, created } = createSurface(gitWorkspace);
    const context = {
      mountIdentity: '/project:comparison:4',
    } as unknown as EditorSurfaceContentContext;
    surface.create(context);
    expect(created).toEqual([context]);
  });

  it('refuses to build a comparison with no pending request', () => {
    const gitWorkspace = createGitWorkspace('/project');
    const { surface } = createSurface(gitWorkspace);
    expect(() =>
      surface.create({} as unknown as EditorSurfaceContentContext),
    ).toThrow('Comparison surface created without a pending request');
  });

  it('subscribes the persisted split ratio so a divider drag repaints the host', () => {
    const { surface, splitRatioReads } = createSurface(
      createGitWorkspace('/project'),
    );
    surface.observePaintSignals();
    expect(splitRatioReads.length).toBe(1);
  });

  it('reports no mounted comparison view before anything is built', () => {
    const { surface } = createSurface(null);
    expect(surface.comparisonView).toBeNull();
  });
});
