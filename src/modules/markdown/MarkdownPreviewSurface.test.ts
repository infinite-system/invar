import { describe, expect, it } from 'bun:test';
import { MarkdownPreviewSurface } from './MarkdownPreviewSurface';
import type { MarkdownPreviewContent } from './MarkdownPreviewContent';
import type { MarkdownWorkspace } from './MarkdownWorkspace';
import type { EditorSurfaceContentContext } from '../ui/EditorSurfaceContents';
import { ref } from 'vue';

function createMarkdownWorkspace(root: string, path: string) {
  const markdownWorkspace = {
    showingPreview: false,
    workspace: { root, editor: { document: { path } } },
  };
  return markdownWorkspace as unknown as MarkdownWorkspace.Model &
    typeof markdownWorkspace;
}

function createSurface(
  markdownWorkspace: MarkdownWorkspace.Model | null,
  previewSideValue = 'left',
) {
  const splitRatioReads: number[] = [];
  const splitRatio = ref(0.5);
  Object.defineProperty(splitRatio, 'value', {
    configurable: true,
    get() {
      splitRatioReads.push(1);
      return 0.5;
    },
  });
  const splitRatioSetting = {
    value: splitRatio,
    save() {},
    dispose() {},
  };
  const previewSideReads: number[] = [];
  const previewSide = ref(previewSideValue);
  Object.defineProperty(previewSide, 'value', {
    configurable: true,
    get() {
      previewSideReads.push(1);
      return previewSideValue;
    },
  });
  const previewSideSetting = {
    value: previewSide,
    save() {},
    dispose() {},
  };
  const scrollSyncReads: number[] = [];
  const scrollSync = ref(true);
  Object.defineProperty(scrollSync, 'value', {
    configurable: true,
    get() {
      scrollSyncReads.push(1);
      return true;
    },
  });
  const scrollSyncSetting = {
    value: scrollSync,
    save() {},
    dispose() {},
  };
  const created: EditorSurfaceContentContext[] = [];
  class TestSurface extends MarkdownPreviewSurface.$Class {
    protected override createContent(
      _markdownWorkspace: MarkdownWorkspace.Model,
      context: EditorSurfaceContentContext,
    ): MarkdownPreviewContent.Model {
      created.push(context);
      return {
        previewFocused: false,
      } as unknown as MarkdownPreviewContent.Model;
    }
  }
  return {
    surface: new TestSurface(
      () => markdownWorkspace,
      splitRatioSetting,
      previewSideSetting,
      scrollSyncSetting,
    ),
    splitRatioReads,
    previewSideReads,
    scrollSyncReads,
    created,
  };
}

describe('MarkdownPreviewSurface', () => {
  it('claims nothing without an active workspace contribution', () => {
    expect(createSurface(null).surface.mountIdentity()).toBe('');
  });

  it('claims nothing while no tab is showing its preview', () => {
    const markdownWorkspace = createMarkdownWorkspace(
      '/project',
      '/project/a.md',
    );
    expect(createSurface(markdownWorkspace).surface.mountIdentity()).toBe('');
  });

  it('keys its mount identity to the root, the source path, and the side', () => {
    const markdownWorkspace = createMarkdownWorkspace(
      '/project',
      '/project/a.md',
    );
    markdownWorkspace.showingPreview = true;
    expect(createSurface(markdownWorkspace).surface.mountIdentity()).toBe(
      '/project:preview:/project/a.md:left',
    );
  });

  // Flipping the contributed side setting must rebuild the split in the new pane order.
  it('changes identity when the preview side setting flips', () => {
    const markdownWorkspace = createMarkdownWorkspace(
      '/project',
      '/project/a.md',
    );
    markdownWorkspace.showingPreview = true;
    expect(
      createSurface(markdownWorkspace, 'right').surface.mountIdentity(),
    ).toBe('/project:preview:/project/a.md:right');
  });

  it('normalizes an unknown side value to the default left', () => {
    const markdownWorkspace = createMarkdownWorkspace(
      '/project',
      '/project/a.md',
    );
    markdownWorkspace.showingPreview = true;
    const { surface } = createSurface(markdownWorkspace, 'sideways');
    expect(surface.previewSide()).toBe('left');
  });

  // Switching to another Markdown tab must rebuild the split against THAT tab's document.
  it('changes identity when the previewed document changes', () => {
    const markdownWorkspace = createMarkdownWorkspace(
      '/project',
      '/project/a.md',
    );
    markdownWorkspace.showingPreview = true;
    const { surface } = createSurface(markdownWorkspace);
    const first = surface.mountIdentity();
    markdownWorkspace.workspace.editor.document.path = '/project/b.md';
    expect(surface.mountIdentity()).not.toBe(first);
  });

  it('builds its content with the host-supplied mount context', () => {
    const markdownWorkspace = createMarkdownWorkspace(
      '/project',
      '/project/a.md',
    );
    markdownWorkspace.showingPreview = true;
    const { surface, created } = createSurface(markdownWorkspace);
    const context = {
      mountIdentity: '/project:preview:/project/a.md',
    } as unknown as EditorSurfaceContentContext;
    surface.create(context);
    expect(created).toEqual([context]);
  });

  it('refuses to build without an active workspace contribution', () => {
    const { surface } = createSurface(null);
    expect(() =>
      surface.create({} as unknown as EditorSurfaceContentContext),
    ).toThrow('Markdown surface created without an active workspace');
  });

  // The mount disposes the content when the claim drops; the provider must not hand back a
  // reference that outlived it.
  it('stops reporting its content once the claim drops', () => {
    const markdownWorkspace = createMarkdownWorkspace(
      '/project',
      '/project/a.md',
    );
    markdownWorkspace.showingPreview = true;
    const { surface } = createSurface(markdownWorkspace);
    surface.create({} as unknown as EditorSurfaceContentContext);
    expect(surface.previewContent).not.toBeNull();
    markdownWorkspace.showingPreview = false;
    expect(surface.previewContent).toBeNull();
  });

  it('subscribes the split settings so their changes repaint the host', () => {
    const { surface, splitRatioReads, previewSideReads, scrollSyncReads } =
      createSurface(null);
    surface.observePaintSignals();
    expect(splitRatioReads.length).toBe(1);
    expect(previewSideReads.length).toBe(1);
    expect(scrollSyncReads.length).toBe(1);
  });
});
