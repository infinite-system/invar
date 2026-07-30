import type { Workspace } from '../workspace/Workspace';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
} from '../workspace/WorkspaceContributor.interface';
import { WorkspaceLayout } from './WorkspaceLayout';
import type {
  WorkspaceLayoutSlotPorts,
  WorkspaceLayoutSlotValues,
} from './WorkspaceLayoutSlotPorts.interface';

// Gives every workspace its own layout slots. Registered once on the workspace set; the set
// attaches one `WorkspaceLayout` per workspace and drives it through the shared lifecycle.
// invariant: Layout slot sizes are workspace scoped (src/modules/layout/layout.invariants.md)
class $WorkspaceLayoutContributor implements WorkspaceContributor {
  constructor(protected readonly options: WorkspaceLayoutContributorOptions) {}

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    return this.createWorkspaceLayout(workspace);
  }

  // invariant: Construction goes through overridable seams (project.invariants.md)
  protected createWorkspaceLayout(
    workspace: Workspace.Model,
  ): WorkspaceContribution {
    return new WorkspaceLayout.Class(
      this.options.ports,
      () => this.newWorkspaceSlots,
      () => this.options.workspaceIsActive(workspace),
    );
  }

  protected capturedNewWorkspaceSlots: WorkspaceLayoutSlotValues | null = null;

  /** The application defaults, captured ONCE at the first attachment and never again.
   *  Reading them live instead would restore the leak by another route: drag workspace A wider,
   *  open workspace B, and B would start at A's width because A's width had become "the default". */
  protected get newWorkspaceSlots(): WorkspaceLayoutSlotValues {
    return (this.capturedNewWorkspaceSlots ??= this.options.ports.readSlots());
  }
}

export namespace WorkspaceLayoutContributor {
  export const $Class = $WorkspaceLayoutContributor;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface WorkspaceLayoutContributorOptions {
  ports: WorkspaceLayoutSlotPorts;
  workspaceIsActive(workspace: Workspace.Model): boolean;
}
