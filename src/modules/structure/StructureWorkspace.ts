// The structure navigator's per-workspace contribution: owns the outline model and the pane's
// scroll momentum, mirroring the file-tree workspace shape so the two dock siblings share one
// scroll feel through the same Momentum seam and the same settings knobs.
//
// invariant: Outline cost tracks the observed document (src/modules/structure/structure.invariants.md)
import { Momentum, type MomentumOptions } from '../system/Momentum';
import type { Settings } from '../settings/Settings';
import type { Workspace } from '../workspace/Workspace';
import type { WorkspaceContribution } from '../workspace/WorkspaceContributor.interface';
import { StructureOutline } from './StructureOutline';

class $StructureWorkspace implements WorkspaceContribution {
  constructor(
    readonly workspace: Workspace.Model,
    protected readonly paneIsObserved: () => boolean,
  ) {
    this.outline = this.createOutline();
  }

  // invariant: Construction goes through overridable seams (project.invariants.md)
  readonly outline: StructureOutline.Model;
  protected settingsSource: Settings.Instance | null = null;

  protected createOutline(): StructureOutline.Model {
    return new StructureOutline.Class(this.workspace, this.paneIsObserved);
  }

  settingsAttached(settings: Settings.Instance): void {
    this.settingsSource = settings;
  }

  opened(_root: string): void {}

  suspended(): void {}

  resumed(): void {}

  disposed(): void {
    this.outline.dispose();
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
    Momentum.Class.queueImpulse(this.outline.scrollMomentum.value, deltaRows);
  }

  haltVerticalScroll(): void {
    this.outline.scrollMomentum.value = Momentum.Class.halt();
  }

  tickScroll(deltaSeconds: number): boolean {
    const verticalStep = Momentum.Class.stepMomentum(
      this.outline.scrollMomentum.value,
      deltaSeconds,
      this.flingMomentum,
    );
    this.outline.scrollMomentum.value = verticalStep.momentum;
    if (verticalStep.rows !== 0) this.outline.scrollBy(verticalStep.rows);
    return Momentum.Class.isMoving(verticalStep.momentum);
  }

  /** Jump the editor to the selected symbol; halting the glide first keeps the click target. */
  activateSelected(): boolean {
    this.haltVerticalScroll();
    return this.outline.activateSelected();
  }
}

export namespace StructureWorkspace {
  export const $Class = $StructureWorkspace;
  export let Class = $StructureWorkspace;
  export type Model = InstanceType<typeof Class>;
}
