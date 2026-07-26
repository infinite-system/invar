import { describe, expect, it } from 'bun:test';
import { MarkdownPreviewContent } from './MarkdownPreviewContent';
import type { MarkdownSplitView } from './MarkdownSplitView';
import type { Workspace } from '../workspace/Workspace';
import type { EditorSurfaceContentContext } from '../ui/EditorSurfaceContents';

// A stand-in for the real split: the same members this content drives, each recording the call.
function createFakeSplitView() {
  const view = {
    previewFocused: false,
    rowMoves: [] as number[],
    pages: [] as number[],
    selectAllCalls: 0,
    focusSourceCalls: 0,
    updates: 0,
    disposals: 0,
    tickLive: false,
    moveByKeyboardRows(rowDelta: number) {
      view.rowMoves.push(rowDelta);
    },
    pageByKeyboard(direction: -1 | 1) {
      view.pages.push(direction);
    },
    selectAll() {
      view.selectAllCalls += 1;
    },
    focusSource() {
      view.focusSourceCalls += 1;
    },
    update() {
      view.updates += 1;
    },
    tick: () => view.tickLive,
    findTarget: () => ({ identifier: 'markdown:preview' }),
    copySelection: () => Promise.resolve(4),
    previewFindTargetIdentifier: () => 'markdown:preview',
    dispose() {
      view.disposals += 1;
    },
  };
  return view;
}

function createContent() {
  const view = createFakeSplitView();
  const context = {
    findBar: { engineFor: () => ({ query: { value: 'needle' } }) },
  } as unknown as EditorSurfaceContentContext;
  class TestContent extends MarkdownPreviewContent.$Class {
    protected override createSplitView(): MarkdownSplitView.Instance {
      return view as unknown as MarkdownSplitView.Instance;
    }
  }
  return {
    content: new TestContent({} as unknown as Workspace.Model, context),
    view,
  };
}

describe('MarkdownPreviewContent', () => {
  // The split embeds the real editor, so it must NOT take keys outright — every movement arrives
  // through a rebindable host command instead.
  it('consumes no raw key, so remapped chords still reach the preview', () => {
    const { content } = createContent();
    expect(content.handleKey({ name: 'up', ctrl: false, shift: false })).toBe(
      false,
    );
    expect(
      content.handleKey({ name: 'escape', ctrl: false, shift: false }),
    ).toBe(false);
  });

  it('drives the preview through the shared movement verbs', () => {
    const { content, view } = createContent();
    content.scrollFocusedPaneByRows(-3);
    content.scrollFocusedPaneByRows(5);
    content.pageFocusedPane(-1);
    content.pageFocusedPane(1);
    content.selectAllInFocusedPane();
    expect(view.rowMoves).toEqual([-3, 5]);
    expect(view.pages).toEqual([-1, 1]);
    expect(view.selectAllCalls).toBe(1);
  });

  // Escape returns the keyboard to the embedded editor; it does NOT close the split, because the
  // preview mode is per tab and only its own toggle changes it.
  it('yields the keyboard to the source editor without closing the split', () => {
    const { content, view } = createContent();
    content.yieldKeyboardToSourceEditor();
    expect(view.focusSourceCalls).toBe(1);
  });

  it('owns the find target and the selection only while the preview has focus', () => {
    const { content, view } = createContent();
    expect(content.findTarget()).toBeNull();
    expect(content.copySelection()).toBeNull();
    view.previewFocused = true;
    expect(content.findTarget()?.identifier).toBe('markdown:preview');
    expect(content.copySelection()).toBeInstanceOf(Promise);
  });

  it('names the focused pane for the status bar only while the preview has focus', () => {
    const { content, view } = createContent();
    expect(content.focusedPaneTitle).toBeNull();
    view.previewFocused = true;
    expect(content.focusedPaneTitle).toBe('Markdown Preview');
  });

  it('reports the preview pane its own retained find query', () => {
    const { content } = createContent();
    expect(content.previewFindQuery()).toBe('needle');
  });

  it('passes the frame tick through and disposes its split', () => {
    const { content, view } = createContent();
    expect(content.tick(0.016)).toBe(false);
    view.tickLive = true;
    expect(content.tick(0.016)).toBe(true);
    content.update();
    expect(view.updates).toBe(1);
    content.dispose();
    expect(view.disposals).toBe(1);
  });
});
