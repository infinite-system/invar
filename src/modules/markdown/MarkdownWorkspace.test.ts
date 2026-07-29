import { describe, expect, it } from 'bun:test';
import { MarkdownWorkspace } from './MarkdownWorkspace';
import { EditorSurfaceClaims } from '../workspace/EditorSurfaceClaims';
import { ProviderRegistry } from '../plugins/ProviderRegistry';
import type { Workspace } from '../workspace/Workspace';

function createHostWorkspace(path: string) {
  const editorSurfaces = new EditorSurfaceClaims.Class();
  let focused = '';
  const workspace = {
    editorSurfaces,
    providers: new ProviderRegistry.Class(),
    root: '/project',
    activeDocumentHandle: path === '' ? null : { path },
    editor: {
      hasDocument: { value: path !== '' },
      document: { path },
    },
    focusEditor() {
      focused = 'editor';
    },
    get focusedTarget() {
      return focused;
    },
  };
  return workspace as unknown as Workspace.Model & typeof workspace;
}

function createContribution(path: string, previewFocused = () => false) {
  const workspace = createHostWorkspace(path);
  return {
    workspace,
    contribution: new MarkdownWorkspace.Class(workspace, previewFocused),
  };
}

describe('MarkdownWorkspace', () => {
  it('recognises a Markdown tab case-insensitively and rejects other extensions', () => {
    expect(
      createContribution('/project/notes.md').contribution.activeFileIsMarkdown,
    ).toBe(true);
    expect(
      createContribution('/project/NOTES.MD').contribution.activeFileIsMarkdown,
    ).toBe(true);
    expect(
      createContribution('/project/main.ts').contribution.activeFileIsMarkdown,
    ).toBe(false);
    expect(createContribution('').contribution.activeFileIsMarkdown).toBe(
      false,
    );
  });

  // A surface that replaces the active document hides the Markdown tab behind it, so no preview is
  // offered for a file the user cannot see.
  it('offers no preview while another surface presents the editor column', () => {
    const { workspace, contribution } = createContribution('/project/notes.md');
    workspace.editorSurfaces.register({
      identifier: 'test.replacing',
      occupyingEditorSurface: true,
      activeDocumentIsPresented: false,
      release() {},
    });
    expect(contribution.activeFileIsMarkdown).toBe(true); // still a .md tab
    expect(contribution.previewToggleAvailable).toBe(false); // but hidden behind the surface
    contribution.togglePreview();
    expect(contribution.previewPaths.value.size).toBe(0);
  });

  it('toggles the preview per path and keeps the choice for other tabs', () => {
    const { contribution } = createContribution('/project/notes.md');
    expect(contribution.showingPreview).toBe(false);
    contribution.togglePreview();
    expect(contribution.showingPreview).toBe(true);
    expect(contribution.previewPaths.value.has('/project/notes.md')).toBe(true);
    contribution.togglePreview();
    expect(contribution.showingPreview).toBe(false);
  });

  it('focuses the editor when the preview is toggled on', () => {
    const { workspace, contribution } = createContribution('/project/notes.md');
    contribution.togglePreview();
    expect(workspace.focusedTarget).toBe('editor');
  });

  it('refuses to toggle a preview for a non-Markdown tab', () => {
    const { contribution } = createContribution('/project/main.ts');
    contribution.togglePreview();
    expect(contribution.previewPaths.value.size).toBe(0);
  });

  // The distinction the old "is a diff showing?" question could not express.
  it('claims the surface while PRESENTING the active document', () => {
    const { workspace, contribution } = createContribution('/project/notes.md');
    contribution.togglePreview();
    expect(contribution.occupyingEditorSurface).toBe(true);
    expect(workspace.editorSurfaces.occupyingClaim?.identifier).toBe(
      'markdown.preview',
    );
    expect(workspace.editorSurfaces.activeDocumentIsPresented).toBe(true);
  });

  it('moves the keyboard answer with the focused pane', () => {
    let previewFocused = false;
    const { workspace, contribution } = createContribution(
      '/project/notes.md',
      () => previewFocused,
    );
    contribution.togglePreview();
    expect(workspace.editorSurfaces.activeDocumentIsKeyboardTarget).toBe(true);
    previewFocused = true;
    expect(workspace.editorSurfaces.activeDocumentIsKeyboardTarget).toBe(false);
  });

  // Release must NOT drop the per-tab mode: the host calls it before the tab actually changes.
  it('keeps the per-tab preview choice when the host releases the surface', () => {
    const { workspace, contribution } = createContribution('/project/notes.md');
    contribution.togglePreview();
    workspace.editorSurfaces.releaseOccupying();
    expect(contribution.previewPaths.value.has('/project/notes.md')).toBe(true);
    expect(contribution.showingPreview).toBe(true);
  });

  it('unregisters its claim and clears its modes on disposal', () => {
    const { workspace, contribution } = createContribution('/project/notes.md');
    contribution.togglePreview();
    contribution.disposed();
    expect(contribution.previewPaths.value.size).toBe(0);
    expect(workspace.editorSurfaces.occupyingClaim).toBeNull();
  });

  it('registers the heading structure source and withdraws it on disposal', () => {
    const { workspace, contribution } = createContribution('/project/notes.md');
    expect(workspace.providers.resolveAll('structure')).toHaveLength(1);
    contribution.disposed();
    expect(workspace.providers.resolveAll('structure')).toHaveLength(0);
  });
});
