import { Reactive } from 'ivue';
import { shallowRef } from 'vue';
import type { Settings } from '../settings/Settings';
import type { RegisteredSetting } from '../settings/SettingContribution.interface';
import type { Workspace } from '../workspace/Workspace';
import type { WorkspaceContribution } from '../workspace/WorkspaceContributor.interface';
import type { EditorSurfaceClaim } from '../workspace/EditorSurfaceClaims';
import { MarkdownStructureSource } from './MarkdownStructureSource';

// Markdown's per-workspace contribution: which tabs are showing the source | preview split, and the
// claim that answers the host's capability questions while one is.
//
// This state used to live on `Workspace` (`markdownPreviewPaths`, `activeFileIsMarkdown`,
// `showingMarkdownPreview`, `toggleMarkdownPreview`) — including the `.md` extension test, in host
// core. The host now knows only that SOMETHING may occupy the editor surface.
//
// Normal use reads one persisted editor-or-preview choice for every Markdown document. The older
// source-preview split remains an explicit compatibility value. In that value only, a Markdown tab
// gains its split without a keystroke and remembers a hand-close per path.
//
// invariant: A Markdown file offers a live source preview split (src/modules/markdown/markdown.invariants.md)
// invariant: The Markdown preview opens itself and sits on the configured side (src/modules/markdown/markdown.invariants.md)
// invariant: Markdown view mode persists across Markdown documents (src/modules/markdown/markdown.invariants.md)
// invariant: The editor surface answers capabilities, not plugin modes (src/modules/workspace/workspace.invariants.md)
class $MarkdownWorkspace implements WorkspaceContribution, EditorSurfaceClaim {
  declare $watch: typeof import('vue').watch;
  declare $stopEffects: () => void;

  constructor(
    readonly workspace: Workspace.Model,
    /** Whether the MOUNTED preview pane currently holds the keyboard. Supplied by the plugin, which
     *  owns the surface; null while nothing is mounted. */
    protected readonly mountedPreviewFocused: () => boolean,
    protected readonly revealMountedPreviewSourceLine: (
      lineIndex: number,
    ) => void = () => {},
    protected readonly viewModeSetting: RegisteredSetting<string> = {
      value: shallowRef('split'),
      save: () => {},
      dispose: () => {},
    },
  ) {
    this.disposeEditorSurfaceClaim = workspace.editorSurfaces.register(this);
    // The table of contents rides the host-carried provider rendezvous: the structure pane
    // resolves it by identifier and neither plugin names the other's concrete class.
    // invariant: Provider rendezvous is host carried (src/modules/plugins/plugins.invariants.md)
    this.structureSource = this.createStructureSource();
    this.disposeStructureSource = workspace.providers.register(
      'structure',
      this.structureSource,
    );
    // Sync flush: the auto-open must land in the same flush as the tab activation, so the mount
    // sync that runs on the next paint already sees the claim. The getter consults the surface
    // capability, which is safe in a WATCH (an action-time read, like togglePreview's guard) —
    // only the claim's own getters must never ask the registry about itself.
    this.$watch(
      () => this.autoOpenCandidatePath(),
      (path) => this.autoOpenPreview(path),
      { immediate: true, flush: 'sync' },
    );
  }

  protected readonly disposeEditorSurfaceClaim: () => void;
  protected readonly structureSource: MarkdownStructureSource.Model;
  protected readonly disposeStructureSource: () => void;

  // invariant: Construction goes through overridable seams (project.invariants.md)
  protected createStructureSource(): MarkdownStructureSource.Model {
    return new MarkdownStructureSource.Class();
  }

  /** File paths whose tabs show the compatibility source-preview split. */
  get previewPaths() {
    return shallowRef<ReadonlySet<string>>(new Set());
  }

  /** Compatibility-split paths whose preview the user closed by hand. */
  get dismissedPreviewPaths() {
    return shallowRef<ReadonlySet<string>>(new Set());
  }

  /** The path the preview should auto-open for right now, or '' when there is none: the active tab
   *  must be a presented Markdown document with no preview showing and no recorded hand-close. */
  protected autoOpenCandidatePath(): string {
    if (this.viewMode !== 'split') return '';
    if (!this.previewToggleAvailable) return '';
    const path = this.activeTabPath();
    if (this.previewPaths.value.has(path)) return '';
    if (this.dismissedPreviewPaths.value.has(path)) return '';
    return path;
  }

  /** Open the preview for an auto-open candidate. Deliberately does NOT move focus: the user did
   *  not ask for this pane, so the keyboard stays where it is and the split's own default keeps the
   *  SOURCE pane as the focused pane. */
  protected autoOpenPreview(path: string): void {
    if (path === '') return;
    const nextPaths = new Set(this.previewPaths.value);
    nextPaths.add(path);
    this.previewPaths.value = nextPaths;
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
    return MarkdownStructureSource.Class.isMarkdownPath(this.activeTabPath());
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
    if (this.viewMode === 'preview') return this.activeFileIsMarkdown;
    if (this.viewMode === 'editor') return false;
    return (
      this.activeFileIsMarkdown &&
      this.previewPaths.value.has(this.activeTabPath())
    );
  }

  get viewMode(): 'editor' | 'preview' | 'split' {
    const value = this.viewModeSetting.value.value;
    if (value === 'preview' || value === 'split') return value;
    return 'editor';
  }

  get viewOnly(): boolean {
    return this.showingPreview && this.viewMode === 'preview';
  }

  togglePreview(): void {
    if (!this.previewToggleAvailable) return;
    if (this.viewMode !== 'split') {
      this.viewModeSetting.value.value =
        this.viewMode === 'preview' ? 'editor' : 'preview';
      this.viewModeSetting.save();
      this.workspace.focusEditor();
      return;
    }
    const path = this.activeTabPath();
    const nextPaths = new Set(this.previewPaths.value);
    const nextDismissed = new Set(this.dismissedPreviewPaths.value);
    if (nextPaths.has(path)) {
      // A hand-close is a per-document choice auto-open must respect.
      nextPaths.delete(path);
      nextDismissed.add(path);
    } else {
      nextPaths.add(path);
      nextDismissed.delete(path);
    }
    // Dismissal FIRST: the auto-open watcher flushes synchronously on the previewPaths write, and
    // it must already see the hand-close, or it re-opens the pane between the two writes.
    this.dismissedPreviewPaths.value = nextDismissed;
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
    return !this.viewOnly && !this.mountedPreviewFocused();
  }

  revealPresentedSourceLine(lineIndex: number): void {
    this.revealMountedPreviewSourceLine(lineIndex);
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
    this.disposeStructureSource();
    this.structureSource.dispose();
    this.$stopEffects();
    this.previewPaths.value = new Set();
    this.dismissedPreviewPaths.value = new Set();
  }
}

export namespace MarkdownWorkspace {
  export const $Class = $MarkdownWorkspace;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
