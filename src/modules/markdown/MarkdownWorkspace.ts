import { Reactive } from 'ivue';
import { shallowRef } from 'vue';
import { Files } from '../system/Files';
import type { Settings } from '../settings/Settings';
import type { Workspace } from '../workspace/Workspace';
import type { WorkspaceContribution } from '../workspace/WorkspaceContributor.interface';
import type { EditorSurfaceClaim } from '../workspace/EditorSurfaceClaims';

// Markdown's per-workspace contribution: which tabs are showing the source | preview split, and the
// claim that answers the host's capability questions while one is.
//
// This state used to live on `Workspace` (`markdownPreviewPaths`, `activeFileIsMarkdown`,
// `showingMarkdownPreview`, `toggleMarkdownPreview`) — including the `.md` extension test, in host
// core. The host now knows only that SOMETHING may occupy the editor surface.
//
// invariant: A Markdown file offers a live source preview split (src/modules/markdown/markdown.invariants.md)
// invariant: The editor surface answers capabilities, not plugin modes (src/modules/workspace/workspace.invariants.md)
class $MarkdownWorkspace implements WorkspaceContribution, EditorSurfaceClaim {
  constructor(
    readonly workspace: Workspace.Model,
    /** Whether the MOUNTED preview pane currently holds the keyboard. Supplied by the plugin, which
     *  owns the surface; null while nothing is mounted. */
    protected readonly mountedPreviewFocused: () => boolean,
  ) {
    this.disposeEditorSurfaceClaim = workspace.editorSurfaces.register(this);
  }

  protected readonly disposeEditorSurfaceClaim: () => void;

  /** File paths whose tabs currently show the source | preview split. A set keeps the mode PER TAB,
   *  so switching away and back does not silently discard the user's view choice. */
  get previewPaths() {
    return shallowRef<ReadonlySet<string>>(new Set());
  }

  /** The active TAB's path, read from the buffer set rather than through `Workspace.editor`.
   *  `Workspace.editor` consults the surface capability to decide what is visible, and the capability
   *  consults this claim — so reaching for it here is a cycle, and was one (a boot-time stack
   *  overflow, caught by driving the app). The tab is also the more honest subject: the preview mode
   *  belongs to the TAB, not to whatever happens to be painted over it. */
  protected activeTabPath(): string {
    return this.workspace.activeDocumentHandle?.path ?? '';
  }

  /** A pure fact about the active tab. Deliberately does NOT consult the surface capability either:
   *  this getter feeds `showingPreview`, which feeds this contribution's own
   *  `occupyingEditorSurface`, so asking the registry here would ask the registry about itself.
   *  `previewToggleAvailable` is where the capability belongs, and it is safe there because the
   *  answer THIS claim gives back is a constant. */
  get activeFileIsMarkdown(): boolean {
    const path = this.activeTabPath();
    return path !== '' && Files.Class.extname(path).toLowerCase() === '.md';
  }

  /** Whether to offer the preview toggle: a Markdown tab that is itself the presented document, so a
   *  comparison over the tabs offers no toggle for the file hidden behind it. */
  get previewToggleAvailable(): boolean {
    return (
      this.activeFileIsMarkdown &&
      this.workspace.editorSurfaces.activeDocumentIsPresented
    );
  }

  get showingPreview(): boolean {
    return (
      this.activeFileIsMarkdown &&
      this.previewPaths.value.has(this.activeTabPath())
    );
  }

  togglePreview(): void {
    if (!this.previewToggleAvailable) return;
    const path = this.activeTabPath();
    const nextPaths = new Set(this.previewPaths.value);
    if (nextPaths.has(path)) nextPaths.delete(path);
    else nextPaths.add(path);
    this.previewPaths.value = nextPaths;
    this.workspace.focusEditor();
  }

  // --- EditorSurfaceClaim -------------------------------------------------------------------------
  readonly identifier = 'markdown.preview';

  get occupyingEditorSurface(): boolean {
    return this.showingPreview;
  }

  /** TRUE while the split is up: the split EMBEDS the real editor in its left pane, so the active
   *  document is still the presented one and every language capability keeps working. This is the
   *  answer the old "is a diff showing?" question could not express. */
  readonly activeDocumentIsPresented = true;

  /** But the keyboard follows the focused pane: while the rendered preview holds focus, the source
   *  editor is not the keyboard target. */
  get activeDocumentIsKeyboardTarget(): boolean {
    return !this.mountedPreviewFocused();
  }

  /** Nothing to tear down: this claim is DERIVED from which tab is active, not stored, so opening or
   *  switching a tab already stops it occupying the surface. Deleting the path from `previewPaths`
   *  here would discard the user's per-tab view choice — the very thing the set exists to keep — and
   *  the host calls this BEFORE the tab actually changes, so it would fire on the outgoing file. */
  release(): void {}

  // --- WorkspaceContribution ----------------------------------------------------------------------
  opened(): void {}
  settingsAttached(_settings: Settings.Instance): void {}
  suspended(): void {}
  resumed(): void {}
  disposed(): void {
    this.disposeEditorSurfaceClaim();
    this.previewPaths.value = new Set();
  }
}

export namespace MarkdownWorkspace {
  export const $Class = $MarkdownWorkspace;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
