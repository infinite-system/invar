import { Reactive } from 'ivue';
import { ref, shallowRef, type Ref } from 'vue';
import { Workspace } from './Workspace';
import type { Settings } from '../settings/Settings';
import type { WorkspaceContributor } from './WorkspaceContributor.interface';
import type { SourceTextViewProvider } from './SourceTextView.interface';

/** The project-layer workspace set. Each entry preserves its own editor/tree state while cold. */
// invariant: Workspace and file navigation are separate layers (src/modules/workspace/workspace.invariants.md)
class $WorkspaceSet {
  protected readonly contributors: WorkspaceContributor[];
  protected readonly activeWorkspaceListeners = new Set<
    (workspace: Workspace.Instance) => void
  >();
  protected readonly disposedWorkspaceListeners = new Set<
    (workspace: Workspace.Instance) => void
  >();

  constructor(
    protected readonly settings: Settings.Instance,
    protected readonly options: WorkspaceSetOptions = {},
  ) {
    this.contributors = [...(options.contributors ?? [])];
  }

  get entries() {
    return shallowRef<Workspace.Instance[]>([]);
  }

  get activeWorkspaceIndex() {
    return ref(-1);
  }

  get count(): number {
    return this.entries.value.length;
  }

  get active(): Workspace.Instance {
    const workspace = this.entries.value[this.activeWorkspaceIndex.value];
    if (!workspace) throw new Error('WorkspaceSet has no active workspace');
    return workspace;
  }

  tabs(): WorkspaceTab[] {
    const activeWorkspaceIndex = this.activeWorkspaceIndex.value;
    return this.entries.value.map((workspace, workspaceIndex) => ({
      root: workspace.root,
      name: workspace.name.value,
      detail: workspace.tabDetail,
      active: workspaceIndex === activeWorkspaceIndex,
    }));
  }

  /** Open a project root as a workspace, or focus its existing tab when already open. */
  open(root: string): number {
    const existingWorkspaceIndex = this.entries.value.findIndex(
      (workspace) => workspace.root === root,
    );
    if (existingWorkspaceIndex >= 0) {
      this.activate(existingWorkspaceIndex);
      return existingWorkspaceIndex;
    }

    const previousWorkspaceIndex = this.activeWorkspaceIndex.value;
    const previousWorkspace = previousWorkspaceIndex >= 0 ? this.active : null;
    previousWorkspace?.suspendOwnedResources();
    const workspace = this.createWorkspace();
    workspace.attachSettings(this.settings);
    if (this.options.codeFoldingEnabled) {
      workspace.attachCodeFolding(this.options.codeFoldingEnabled);
    }
    try {
      workspace.open(root, () => {
        this.entries.value = [...this.entries.value, workspace];
        this.activeWorkspaceIndex.value = this.entries.value.length - 1;
        this.notifyActiveWorkspaceChanged(workspace);
      });
    } catch (error) {
      workspace.dispose();
      this.entries.value = this.entries.value.filter(
        (candidateWorkspace) => candidateWorkspace !== workspace,
      );
      this.activeWorkspaceIndex.value = previousWorkspaceIndex;
      if (previousWorkspace) {
        this.notifyActiveWorkspaceChanged(previousWorkspace);
        previousWorkspace.resumeOwnedResources();
      }
      this.notifyWorkspaceDisposed(workspace);
      throw error;
    }
    return this.activeWorkspaceIndex.value;
  }

  /** Switch project layers without retaining a live watcher for the workspace left behind. */
  activate(workspaceIndex: number): void {
    if (
      workspaceIndex < 0 ||
      workspaceIndex >= this.entries.value.length ||
      workspaceIndex === this.activeWorkspaceIndex.value
    ) {
      return;
    }
    if (this.activeWorkspaceIndex.value >= 0)
      this.active.suspendOwnedResources();
    this.activeWorkspaceIndex.value = workspaceIndex;
    this.notifyActiveWorkspaceChanged(this.active);
    this.active.resumeOwnedResources();
  }

  cycle(workspaceDelta: number): void {
    if (this.count === 0) return;
    const nextWorkspaceIndex =
      (((this.activeWorkspaceIndex.value + workspaceDelta) % this.count) +
        this.count) %
      this.count;
    this.activate(nextWorkspaceIndex);
  }

  /** Close one project. The final workspace stays open so every live view retains a valid root. */
  close(workspaceIndex: number): boolean {
    if (this.count <= 1) return false;
    const workspace = this.entries.value[workspaceIndex];
    if (!workspace) return false;
    const closingActiveWorkspace =
      workspaceIndex === this.activeWorkspaceIndex.value;
    workspace.dispose();
    this.entries.value = this.entries.value.filter(
      (_workspace, candidateWorkspaceIndex) =>
        candidateWorkspaceIndex !== workspaceIndex,
    );

    if (closingActiveWorkspace) {
      this.activeWorkspaceIndex.value = Math.min(
        workspaceIndex,
        this.entries.value.length - 1,
      );
      this.notifyActiveWorkspaceChanged(this.active);
      this.active.resumeOwnedResources();
    } else if (workspaceIndex < this.activeWorkspaceIndex.value) {
      this.activeWorkspaceIndex.value -= 1;
    }
    this.notifyWorkspaceDisposed(workspace);
    return true;
  }

  closeActive(): boolean {
    return this.close(this.activeWorkspaceIndex.value);
  }

  dispose(): void {
    for (const workspace of this.entries.value) {
      workspace.dispose();
      this.notifyWorkspaceDisposed(workspace);
    }
    this.entries.value = [];
    this.activeWorkspaceIndex.value = -1;
    this.activeWorkspaceListeners.clear();
    this.disposedWorkspaceListeners.clear();
  }

  /** Observe the synchronous ownership switch before the selected workspace starts its work. */
  // invariant: Each workspace owns one panel world (src/modules/workspace/workspace.invariants.md)
  onActiveWorkspaceChanged(
    listener: (workspace: Workspace.Instance) => void,
  ): () => void {
    this.activeWorkspaceListeners.add(listener);
    return () => this.activeWorkspaceListeners.delete(listener);
  }

  /** Observe final workspace disposal after another active workspace has taken ownership. */
  // invariant: Each workspace owns one panel world (src/modules/workspace/workspace.invariants.md)
  onWorkspaceDisposed(
    listener: (workspace: Workspace.Instance) => void,
  ): () => void {
    this.disposedWorkspaceListeners.add(listener);
    return () => this.disposedWorkspaceListeners.delete(listener);
  }

  registerContributor(contributor: WorkspaceContributor): () => void {
    if (this.contributors.includes(contributor)) return () => {};
    this.contributors.push(contributor);
    for (const workspace of this.entries.value) {
      workspace.registerContributor(contributor);
    }
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      const contributorIndex = this.contributors.indexOf(contributor);
      if (contributorIndex >= 0) {
        this.contributors.splice(contributorIndex, 1);
      }
      for (const workspace of this.entries.value) {
        workspace.unregisterContributor(contributor);
      }
    };
  }

  protected createWorkspace(): Workspace.Instance {
    return (
      this.options.createWorkspace?.() ??
      new Workspace.Class({
        awaitNextViewPaint: this.options.awaitNextViewPaint,
        contributors: this.contributors,
        createSourceTextViews: this.options.createSourceTextViews,
      })
    );
  }

  protected notifyActiveWorkspaceChanged(workspace: Workspace.Instance): void {
    for (const listener of this.activeWorkspaceListeners) listener(workspace);
  }

  protected notifyWorkspaceDisposed(workspace: Workspace.Instance): void {
    for (const listener of this.disposedWorkspaceListeners) listener(workspace);
  }
}

export namespace WorkspaceSet {
  export const $Class = $WorkspaceSet;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface WorkspaceSetOptions {
  createWorkspace?: () => Workspace.Instance;
  /** Passed to every workspace this set opens: who makes its buffer views. */
  createSourceTextViews?: () => SourceTextViewProvider;
  awaitNextViewPaint?: () => Promise<void>;
  contributors?: readonly WorkspaceContributor[];
  codeFoldingEnabled?: Ref<boolean>;
}

export interface WorkspaceTab {
  root: string;
  name: string;
  /** Second tab line: the linked-worktree name when the root is one, else the checked-out branch. */
  detail: string;
  active: boolean;
}
