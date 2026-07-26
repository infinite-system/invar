import { Momentum, type MomentumOptions } from '../system/Momentum';
import type { Settings } from '../settings/Settings';
import type { Workspace } from '../workspace/Workspace';
import type { WorkspaceContribution } from '../workspace/WorkspacePlugin.interface';
import { FileTree } from './FileTree';

// invariant: The file tree costs only what is expanded and visible (filetree.invariants.md)
class $FileTreeWorkspace implements WorkspaceContribution {
  constructor(readonly workspace: Workspace.Model) {}

  // invariant: Construction goes through overridable seams (project.invariants.md)
  readonly tree = this.createTree();
  protected settingsSource: Settings.Instance | null = null;

  protected createTree(): FileTree.Instance {
    return new FileTree.Class();
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

  protected get flingMomentum(): MomentumOptions {
    const settings = this.settingsSource;
    if (!settings) return Momentum.Class.verticalOptions;
    return {
      impulse: settings.scrollAccelGain.value,
      max: settings.verticalFlingCeiling.value,
      decayPerSec: settings.scrollFriction.value,
      stopVelocity: Momentum.Class.verticalOptions.stopVelocity,
    };
  }

  impulseVerticalScroll(deltaRows: number): void {
    this.tree.selectionMomentum.value = Momentum.Class.addImpulse(
      this.tree.selectionMomentum.value,
      deltaRows,
      this.flingMomentum,
    );
  }

  impulseHorizontalScroll(deltaColumns: number): void {
    this.tree.horizontalScrollMomentum.value = Momentum.Class.addImpulse(
      this.tree.horizontalScrollMomentum.value,
      deltaColumns,
      this.flingMomentum,
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
