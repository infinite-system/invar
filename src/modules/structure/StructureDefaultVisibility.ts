// The structure pane's default-visibility policy: for a document some installed source answers,
// the pane's current dock shows the outline unbidden; for anything else it stays out of the way. The
// contributed `structureShowByDefault` setting turns the default off, and a hand-close is
// respected PER DOCUMENT — closing the pane on one file keeps it closed for that file, while
// switching to another supported file re-applies the default (the same reader-respect rule the
// markdown preview follows in #237).
//
// The policy only ASKS `supportsDocument` — the cheap capability question every source must
// answer without starting a process — so deciding visibility issues zero outline requests and
// the outline's observed-cost contract is untouched.
//
// invariant: The structure pane shows itself for a supported document (src/modules/structure/structure.invariants.md)
import { Reactive } from 'ivue';
import type { Ref } from 'vue';
import type { RegisteredDockContent } from '../app/ApplicationContributor.interface';
import type { Workspace } from '../workspace/Workspace';
import type {
  StructureDocument,
  StructureSource,
} from './StructureSource.interface';

class $StructureDefaultVisibility {
  declare $watch: typeof import('vue').watch;
  declare $stopEffects: () => void;

  /** Absolute paths whose reader closed the pane by hand; the default skips them. */
  protected readonly readerClosedPaths = new Set<string>();
  /** True while the visible dock was opened by THIS policy, so only its own reveals auto-hide. */
  protected autoShown = false;
  /** Guards the visibility watch while the policy itself mutates the dock. */
  protected applyingDefault = false;

  constructor(protected readonly options: StructureDefaultVisibilityOptions) {
    this.autoShown = this.options.dockContent.isVisible();
    this.$watch(
      () => this.documentFingerprint,
      () => this.applyDefault(),
      { immediate: true },
    );
    // SYNC flush: the reader-choice watch must run inside the very mutation that flipped
    // visibility, while `applyingDefault` still marks the policy's own writes — a queued
    // callback would observe the flag already cleared and record the policy's reveal as the
    // reader's own gesture.
    this.$watch(
      () => this.options.dockContent.host().visible.value,
      (visible, wasVisible) => this.recordReaderChoice(visible, wasVisible),
      { flush: 'sync' },
    );
  }

  /** Everything the default depends on: workspace, document, installed sources, the setting. */
  protected get documentFingerprint(): string {
    const workspace = this.options.workspaceSet.active;
    return [
      this.options.workspaceSet.activeWorkspaceIndex.value,
      workspace.activeDocumentHandle?.document?.path ?? '',
      workspace.providers.revision.value,
      this.options.showByDefault() ? 'default-on' : 'default-off',
      this.options.dockContent.value.value,
    ].join(':');
  }

  protected get activeDocument(): StructureDocument | null {
    const document =
      this.options.workspaceSet.active.activeDocumentHandle?.document ?? null;
    if (!document || !document.path) return null;
    return document;
  }

  /** True when some installed source answers for the document — the cheap question only. */
  protected documentIsSupported(document: StructureDocument): boolean {
    const sources =
      this.options.workspaceSet.active.providers.resolveAll<StructureSource>(
        'structure',
      );
    return sources.some((source) => source.supportsDocument(document));
  }

  protected applyDefault(): void {
    const host = this.options.dockContent.host();
    const document = this.activeDocument;
    const wanted =
      document !== null &&
      this.options.showByDefault() &&
      !this.readerClosedPaths.has(document.path) &&
      this.documentIsSupported(document);
    if (wanted) {
      if (this.options.dockContent.isVisible()) return;
      // Never hijack a dock another content occupies; the default only fills an empty stage.
      if (host.visible.value) return;
      this.applyingDefault = true;
      this.options.dockContent.reveal();
      this.applyingDefault = false;
      this.autoShown = true;
      this.options.requestRender();
      return;
    }
    // Take back only what the policy itself put up, and never from under the user's keyboard.
    if (
      this.autoShown &&
      this.options.dockContent.isVisible() &&
      !host.focused.value
    ) {
      this.applyingDefault = true;
      host.hide();
      this.applyingDefault = false;
      this.autoShown = false;
      this.options.requestRender();
    }
  }

  /** A visibility change the policy did not make is the reader's own choice — record it. */
  protected recordReaderChoice(
    visible: boolean | undefined,
    wasVisible: boolean | undefined,
  ): void {
    if (this.applyingDefault) return;
    const path = this.activeDocument?.path ?? '';
    if (wasVisible && !visible) {
      if (
        path &&
        this.options.dockContent.host().activeContent?.id === 'structure'
      ) {
        this.readerClosedPaths.add(path);
      }
      this.autoShown = false;
      return;
    }
    if (!wasVisible && visible) {
      // Reopening by hand re-endorses the pane for this document.
      if (path) this.readerClosedPaths.delete(path);
      this.autoShown = false;
    }
  }

  /** The explicit show command re-endorses the pane for the active document. */
  noteManualShow(): void {
    const path = this.activeDocument?.path ?? '';
    if (path) this.readerClosedPaths.delete(path);
    this.autoShown = false;
  }

  dispose(): void {
    this.$stopEffects();
  }
}

export namespace StructureDefaultVisibility {
  export const $Class = $StructureDefaultVisibility;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

export interface StructureDefaultVisibilityOptions {
  readonly dockContent: RegisteredDockContent;
  readonly workspaceSet: {
    readonly active: Workspace.Model;
    readonly activeWorkspaceIndex: Ref<number>;
  };
  /** The contributed `structureShowByDefault` setting, read late so a live change applies. */
  showByDefault(): boolean;
  requestRender(): void;
}
