import { Momentum, type MomentumOptions } from '../system/Momentum';
import type { Settings } from '../settings/Settings';
import type { Workspace } from '../workspace/Workspace';
import type { WorkspaceContribution } from '../workspace/WorkspaceContributor.interface';
import { FileTree } from './FileTree';
import { ref, type Ref } from 'vue';

// invariant: The file tree costs only what is expanded and visible (src/modules/filetree/filetree.invariants.md)
class $FileTreeWorkspace implements WorkspaceContribution {
  constructor(
    readonly workspace: Workspace.Model,
    protected readonly showHiddenFiles?: Readonly<Ref<boolean>>,
    protected readonly revealOpenFile: Readonly<Ref<boolean>> = ref(true),
  ) {
    this.tree = this.createTree();
  }

  // invariant: Construction goes through overridable seams (project.invariants.md)
  readonly tree: FileTree.Instance;
  protected settingsSource: Settings.Instance | null = null;

  get rowCount(): number {
    return this.tree.rows.length;
  }

  protected createTree(): FileTree.Instance {
    return new FileTree.Class(this.showHiddenFiles);
  }

  settingsAttached(settings: Settings.Instance): void {
    this.settingsSource = settings;
  }

  opened(root: string): void {
    this.tree.open(root);
    this.workspace.focusPrimaryPane('files');
  }

  suspended(): void {}

  resumed(): void {}

  disposed(): void {}

  // invariant: The tree reveal follows the active file (src/modules/filetree/filetree.invariants.md)
  documentBecameActive(path: string): void {
    if (this.revealOpenFile.value) this.revealFile(path);
  }

  revealActiveFile(): boolean {
    const path = this.workspace.activeDocumentHandle?.path;
    return path ? this.revealFile(path) : false;
  }

  protected revealFile(path: string): boolean {
    this.haltVerticalScroll();
    return this.tree.revealPath(path);
  }

  protected get flingMomentum(): MomentumOptions {
    const settings = this.settingsSource;
    if (!settings) return Momentum.Class.verticalOptions;
    return {
      impulse: settings.scrollAccelGain.value,
      max: settings.verticalFlingCeiling.value,
      decayPerSec: settings.scrollFriction.value,
      stopVelocity: Momentum.Class.verticalOptions.stopVelocity,
      maximumGlideDurationMilliseconds:
        settings.maximumGlideDurationMilliseconds.value,
    };
  }

  impulseVerticalScroll(deltaRows: number): void {
    Momentum.Class.queueImpulse(this.tree.selectionMomentum.value, deltaRows);
  }

  impulseHorizontalScroll(deltaColumns: number): void {
    Momentum.Class.queueImpulse(
      this.tree.horizontalScrollMomentum.value,
      deltaColumns,
    );
  }

  haltVerticalScroll(): void {
    this.tree.selectionMomentum.value = Momentum.Class.halt();
  }

  haltHorizontalScroll(): void {
    this.tree.horizontalScrollMomentum.value = Momentum.Class.halt();
  }

  tickScroll(deltaSeconds: number): boolean {
    const verticalStep = Momentum.Class.stepMomentum(
      this.tree.selectionMomentum.value,
      deltaSeconds,
      this.flingMomentum,
    );
    this.tree.selectionMomentum.value = verticalStep.momentum;
    if (verticalStep.rows !== 0) this.tree.scrollBy(verticalStep.rows);

    const horizontalStep = Momentum.Class.stepMomentum(
      this.tree.horizontalScrollMomentum.value,
      deltaSeconds,
      this.flingMomentum,
    );
    this.tree.horizontalScrollMomentum.value = horizontalStep.momentum;
    if (horizontalStep.rows !== 0) {
      this.tree.scrollByColumns(horizontalStep.rows);
    }

    return [verticalStep.momentum, horizontalStep.momentum].some((momentum) =>
      Momentum.Class.isMoving(momentum),
    );
  }

  activateSelected(): { opened?: string } {
    this.haltVerticalScroll();
    const result = this.tree.activateSelected();
    if (!result || !('openFile' in result)) return {};
    this.workspace.openFileInTab(result.openFile);
    this.workspace.focusEditor();
    return { opened: result.openFile };
  }
}

export namespace FileTreeWorkspace {
  export const $Class = $FileTreeWorkspace;
  export let Class = $FileTreeWorkspace;
  export type Model = InstanceType<typeof Class>;
}
