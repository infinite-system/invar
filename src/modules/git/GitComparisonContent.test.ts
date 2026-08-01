import { describe, expect, it } from 'bun:test';
import { GitComparisonContent } from './GitComparisonContent';
import type { GitComparisonRequest, GitWorkspace } from './GitWorkspace';
import type { EditorSurfaceContentContext } from '../ui/EditorSurfaceContents';
import type { DiffView } from '../diff/DiffView';

// A stand-in for the real DiffView: the same public members this content drives, each recording the
// call. Injected through the createComparisonView seam, so no renderer or terminal is needed to
// prove the key routing, the settle-repaint, and the release-on-escape.
function createFakeComparisonView() {
  const view = {
    alignedRowMoves: [] as number[],
    keyboardColumnMoves: [] as number[],
    pages: [] as number[],
    updates: 0,
    nextChangeJumps: 0,
    previousChangeJumps: 0,
    openFullCalls: 0,
    disposals: 0,
    momentumLive: false,
    laidOutHeight: 0,
    rootRenderable: {
      get height() {
        return view.laidOutHeight;
      },
    },
    moveByKeyboardAlignedRows(deltaRows: number) {
      view.alignedRowMoves.push(deltaRows);
    },
    moveByKeyboardColumns(deltaColumns: number) {
      view.keyboardColumnMoves.push(deltaColumns);
    },
    pageByKeyboard(direction: -1 | 1) {
      view.pages.push(direction);
    },
    jumpToNextChange() {
      view.nextChangeJumps += 1;
    },
    jumpToPreviousChange() {
      view.previousChangeJumps += 1;
    },
    openFull() {
      view.openFullCalls += 1;
    },
    update() {
      view.updates += 1;
    },
    tickScrollMomentum: () => view.momentumLive,
    findTarget: () => ({ identifier: 'comparison:current' }),
    copySelection: () => Promise.resolve(7),
    dispose() {
      view.disposals += 1;
    },
  };
  return view;
}

const request: GitComparisonRequest = {
  token: 1,
  previousVersionText: 'a\n',
  currentVersionText: 'b\n',
  previousVersionPath: 'file.ts',
  currentVersionPath: 'file.ts',
};

function createContent() {
  const releases: number[] = [];
  const gitWorkspace = {
    workspace: { root: '/project' },
    release() {
      releases.push(1);
    },
  } as unknown as GitWorkspace.Model;
  const view = createFakeComparisonView();
  class TestContent extends GitComparisonContent.$Class {
    protected override createComparisonView(): DiffView.Instance {
      return view as unknown as DiffView.Instance;
    }
  }
  const content = new TestContent(
    gitWorkspace,
    request,
    {} as unknown as EditorSurfaceContentContext,
  );
  return { content, view, releases };
}

describe('GitComparisonContent', () => {
  it('supplies the compared file path to the editor-area shell', () => {
    const { content } = createContent();
    expect(content.displayedPath).toBe('/project/file.ts');
  });

  it('routes vertical, paged, and horizontal keys into the comparison panes', () => {
    const { content, view } = createContent();
    expect(content.handleKey({ name: 'up', ctrl: false, shift: false })).toBe(
      true,
    );
    expect(content.handleKey({ name: 'down', ctrl: false, shift: false })).toBe(
      true,
    );
    expect(
      content.handleKey({ name: 'pageup', ctrl: false, shift: false }),
    ).toBe(true);
    expect(
      content.handleKey({ name: 'pagedown', ctrl: false, shift: false }),
    ).toBe(true);
    expect(content.handleKey({ name: 'left', ctrl: false, shift: false })).toBe(
      true,
    );
    expect(
      content.handleKey({ name: 'right', ctrl: false, shift: false }),
    ).toBe(true);
    expect(view.alignedRowMoves).toEqual([-1, 1]);
    expect(view.pages).toEqual([-1, 1]);
    expect(view.keyboardColumnMoves).toEqual([-1, 1]);
  });

  it('jumps changes on n and p', () => {
    const { content, view } = createContent();
    expect(content.handleKey({ name: 'n', ctrl: false, shift: false })).toBe(
      true,
    );
    expect(content.handleKey({ name: 'p', ctrl: false, shift: false })).toBe(
      true,
    );
    expect(view.nextChangeJumps).toBe(1);
    expect(view.previousChangeJumps).toBe(1);
  });

  it('promotes the working side on plain Enter and declines Ctrl+Enter', () => {
    const { content, view } = createContent();
    expect(
      content.handleKey({ name: 'return', ctrl: false, shift: false }),
    ).toBe(true);
    expect(view.openFullCalls).toBe(1);
    expect(
      content.handleKey({ name: 'return', ctrl: true, shift: false }),
    ).toBe(false);
    expect(view.openFullCalls).toBe(1);
  });

  // Escape releases the contribution's own claim; the host never writes that state.
  it('releases the claim on escape instead of mutating host state', () => {
    const { content, releases } = createContent();
    expect(
      content.handleKey({ name: 'escape', ctrl: false, shift: false }),
    ).toBe(true);
    expect(releases).toEqual([1]);
  });

  it('declines a key it does not own so the keybinding registry still sees it', () => {
    const { content } = createContent();
    expect(content.handleKey({ name: 's', ctrl: true, shift: false })).toBe(
      false,
    );
  });

  // The container lays out AFTER the reactive paint swaps it in, so the first real height arrives on
  // a later frame. The content must repaint itself until the height stops moving, then go quiet so
  // idle-quiescence holds.
  it('repaints until its laid-out height settles, then reports at rest', () => {
    const { content, view } = createContent();
    view.laidOutHeight = 0;
    expect(content.tick(0.016)).toBe(true); // -1 -> 0 is a change
    expect(view.updates).toBe(1);
    view.laidOutHeight = 24;
    expect(content.tick(0.016)).toBe(true);
    expect(view.updates).toBe(2);
    expect(content.tick(0.016)).toBe(false); // height stable and momentum at rest
    expect(view.updates).toBe(2);
  });

  it('stays live while its own scroll momentum is moving', () => {
    const { content, view } = createContent();
    content.tick(0.016); // settle the height so only momentum can keep it live
    expect(content.tick(0.016)).toBe(false);
    view.momentumLive = true;
    expect(content.tick(0.016)).toBe(true);
  });

  it('hands over its own find target and selection, and disposes its view', () => {
    const { content, view } = createContent();
    expect(content.findTarget()?.identifier).toBe('comparison:current');
    expect(content.copySelection()).toBeInstanceOf(Promise);
    content.dispose();
    expect(view.disposals).toBe(1);
  });
});
