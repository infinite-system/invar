import { describe, expect, it } from 'bun:test';
import { ref } from 'vue';
import { MarkdownWorkspace } from './MarkdownWorkspace';
import { EditorSurfaceClaims } from '../workspace/EditorSurfaceClaims';
import { ProviderRegistry } from '../plugins/ProviderRegistry';
import type { EditorSurfaceClaim } from '../workspace/EditorSurfaceClaims';
import type { Workspace } from '../workspace/Workspace';
import type { RegisteredSetting } from '../settings/SettingContribution.interface';

function createViewModeSetting(
  initialValue: string,
  onSave: () => void = () => {},
): RegisteredSetting<string> {
  return {
    value: ref(initialValue),
    save: onSave,
    dispose: () => {},
  };
}

function createHostWorkspace(path: string) {
  const editorSurfaces = new EditorSurfaceClaims.Class();
  const activePath = ref(path);
  let focused = '';
  const workspace = {
    editorSurfaces,
    providers: new ProviderRegistry.Class(),
    root: '/project',
    get activeDocumentHandle() {
      return activePath.value === '' ? null : { path: activePath.value };
    },
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
    activateTab(nextPath: string) {
      activePath.value = nextPath;
    },
  };
  return workspace as unknown as Workspace.Model & typeof workspace;
}

function createContribution(
  path: string,
  previewFocused = () => false,
  prepareWorkspace?: (
    workspace: ReturnType<typeof createHostWorkspace>,
  ) => void,
  revealPreviewSourceLine: (lineIndex: number) => void = () => {},
  viewModeSetting?: RegisteredSetting<string>,
) {
  const workspace = createHostWorkspace(path);
  prepareWorkspace?.(workspace);
  return {
    workspace,
    contribution: new MarkdownWorkspace.Class(
      workspace,
      previewFocused,
      revealPreviewSourceLine,
      viewModeSetting,
    ),
  };
}

/** A claim that REPLACES the presented document, registered before markdown — mirroring the real
 *  app, where the Git comparison's claim registers ahead of markdown's. */
function replacingSurfaceClaim(): EditorSurfaceClaim {
  return {
    identifier: 'test.replacing',
    occupyingEditorSurface: true,
    activeDocumentIsPresented: false,
    release() {},
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

  // invariant: The Markdown preview opens itself and sits on the configured side (src/modules/markdown/markdown.invariants.md)
  it('opens the preview automatically for an active Markdown tab', () => {
    const { contribution } = createContribution('/project/notes.md');
    expect(contribution.showingPreview).toBe(true);
    expect(contribution.previewPaths.value.has('/project/notes.md')).toBe(true);
  });

  it('does not auto-open for a non-Markdown tab', () => {
    const { contribution } = createContribution('/project/main.ts');
    expect(contribution.showingPreview).toBe(false);
    expect(contribution.previewPaths.value.size).toBe(0);
  });

  // Auto-open must not steal the keyboard: the user did not ask for the pane.
  it('leaves focus untouched when the preview opens itself', () => {
    const { workspace, contribution } = createContribution('/project/notes.md');
    expect(contribution.showingPreview).toBe(true);
    expect(workspace.focusedTarget).toBe('');
  });

  // A surface that replaces the active document hides the Markdown tab behind it, so no preview is
  // offered — and none auto-opens — for a file the user cannot see.
  it('offers no preview while another surface presents the editor column', () => {
    const { contribution } = createContribution(
      '/project/notes.md',
      () => false,
      (workspace) => workspace.editorSurfaces.register(replacingSurfaceClaim()),
    );
    expect(contribution.activeFileIsMarkdown).toBe(true); // still a .md tab
    expect(contribution.previewToggleAvailable).toBe(false); // but hidden behind the surface
    expect(contribution.previewPaths.value.size).toBe(0); // and nothing auto-opened
    contribution.togglePreview();
    expect(contribution.previewPaths.value.size).toBe(0);
  });

  it('closes by hand and stays closed for that document', () => {
    const { contribution } = createContribution('/project/notes.md');
    expect(contribution.showingPreview).toBe(true);
    contribution.togglePreview();
    expect(contribution.showingPreview).toBe(false);
    expect(
      contribution.dismissedPreviewPaths.value.has('/project/notes.md'),
    ).toBe(true);
  });

  it('reopens a dismissed preview through its own toggle', () => {
    const { contribution } = createContribution('/project/notes.md');
    contribution.togglePreview();
    expect(contribution.showingPreview).toBe(false);
    contribution.togglePreview();
    expect(contribution.showingPreview).toBe(true);
    expect(contribution.dismissedPreviewPaths.value.size).toBe(0);
  });

  // The done-test's dismissal arm: a hand-close binds to ITS document; every other Markdown
  // document keeps the open-by-default behaviour.
  it('re-applies the default to another Markdown tab while a dismissed one stays closed', () => {
    const { workspace, contribution } = createContribution('/project/a.md');
    contribution.togglePreview(); // dismiss a.md
    workspace.activateTab('/project/b.md');
    expect(contribution.showingPreview).toBe(true); // b.md auto-opens
    workspace.activateTab('/project/a.md');
    expect(contribution.showingPreview).toBe(false); // a.md respects the hand-close
    workspace.activateTab('/project/b.md');
    expect(contribution.showingPreview).toBe(true); // b.md keeps its open state
  });

  it('focuses the editor when the preview is toggled', () => {
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
    expect(contribution.occupyingEditorSurface).toBe(true);
    expect(workspace.editorSurfaces.occupyingClaim?.identifier).toBe(
      'markdown.preview',
    );
    expect(workspace.editorSurfaces.activeDocumentIsPresented).toBe(true);
  });

  it('moves the keyboard answer with the focused pane', () => {
    let previewFocused = false;
    const { workspace } = createContribution(
      '/project/notes.md',
      () => previewFocused,
    );
    expect(workspace.editorSurfaces.activeDocumentIsKeyboardTarget).toBe(true);
    previewFocused = true;
    expect(workspace.editorSurfaces.activeDocumentIsKeyboardTarget).toBe(false);
  });

  it('never targets the hidden source editor in view-only mode', () => {
    const { workspace } = createContribution(
      '/project/notes.md',
      () => false,
      undefined,
      () => {},
      createViewModeSetting('preview'),
    );
    expect(workspace.editorSurfaces.activeDocumentIsKeyboardTarget).toBe(false);
  });

  it('forwards a source jump to its mounted preview', () => {
    const revealedSourceLines: number[] = [];
    const { workspace } = createContribution(
      '/project/notes.md',
      () => false,
      undefined,
      (lineIndex) => revealedSourceLines.push(lineIndex),
    );

    workspace.editorSurfaces.revealPresentedSourceLine(24);

    expect(revealedSourceLines).toEqual([24]);
  });

  // Release must NOT drop the per-tab mode: the host calls it before the tab actually changes.
  it('keeps the per-tab preview choice when the host releases the surface', () => {
    const { workspace, contribution } = createContribution('/project/notes.md');
    workspace.editorSurfaces.releaseOccupying();
    expect(contribution.previewPaths.value.has('/project/notes.md')).toBe(true);
    expect(contribution.showingPreview).toBe(true);
  });

  it('unregisters its claim, stops auto-open, and clears its modes on disposal', () => {
    const { workspace, contribution } = createContribution('/project/a.md');
    contribution.disposed();
    expect(contribution.previewPaths.value.size).toBe(0);
    expect(contribution.dismissedPreviewPaths.value.size).toBe(0);
    expect(workspace.editorSurfaces.occupyingClaim).toBeNull();
    workspace.activateTab('/project/b.md');
    expect(contribution.previewPaths.value.size).toBe(0); // the watcher is stopped
  });

  it('registers the heading structure source and withdraws it on disposal', () => {
    const { workspace, contribution } = createContribution('/project/notes.md');
    expect(workspace.providers.resolveAll('structure')).toHaveLength(1);
    contribution.disposed();
    expect(workspace.providers.resolveAll('structure')).toHaveLength(0);
  });

  it('persists one view-only choice across Markdown tabs', () => {
    let saveCount = 0;
    const viewModeSetting = createViewModeSetting('editor', () => {
      saveCount += 1;
    });
    const { workspace, contribution } = createContribution(
      '/project/a.md',
      () => false,
      undefined,
      () => {},
      viewModeSetting,
    );

    expect(contribution.showingPreview).toBe(false);
    contribution.togglePreview();
    expect(contribution.viewOnly).toBe(true);
    expect(viewModeSetting.value.value).toBe('preview');
    expect(saveCount).toBe(1);

    workspace.activateTab('/project/b.md');
    expect(contribution.viewOnly).toBe(true);

    contribution.togglePreview();
    expect(contribution.showingPreview).toBe(false);
    expect(viewModeSetting.value.value).toBe('editor');
    expect(saveCount).toBe(2);
  });

  it('never applies view-only mode to a non-Markdown tab', () => {
    const viewModeSetting = createViewModeSetting('preview');
    const { workspace, contribution } = createContribution(
      '/project/notes.md',
      () => false,
      undefined,
      () => {},
      viewModeSetting,
    );
    expect(contribution.viewOnly).toBe(true);
    workspace.activateTab('/project/main.ts');
    expect(contribution.showingPreview).toBe(false);
    expect(contribution.viewOnly).toBe(false);
  });
});
