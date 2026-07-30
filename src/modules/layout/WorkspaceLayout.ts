import type { WorkspaceContribution } from '../workspace/WorkspaceContributor.interface';
import type {
  WorkspaceLayoutSlotPorts,
  WorkspaceLayoutSlotValues,
} from './WorkspaceLayoutSlotPorts.interface';

// One workspace's layout slots, held while that workspace is hidden.
//
// This is the layout module's own cold-state contribution. It rides the same suspend/resume
// lifecycle every other module already uses (the source-control watcher, the language client, the
// file tree), so workspace scoping is one more contribution rather than a switch statement in the
// host: capture on the way out, restore on the way in.
// invariant: Layout slot sizes are workspace scoped (src/modules/layout/layout.invariants.md)
class $WorkspaceLayout implements WorkspaceContribution {
  constructor(
    protected readonly ports: WorkspaceLayoutSlotPorts,
    /** The slots a workspace opened now starts with — the application defaults. */
    protected readonly newWorkspaceSlots: () => WorkspaceLayoutSlotValues,
    /** Whether this workspace is the one the application is showing. */
    protected readonly workspaceIsActive: () => boolean,
  ) {}

  protected storedSlots: WorkspaceLayoutSlotValues | null = null;

  /** This workspace's slots: its own values once captured, else the defaults it opened with. */
  get slots(): WorkspaceLayoutSlotValues | null {
    return this.storedSlots;
  }

  /** A workspace opens at the application defaults, never at whatever the last workspace was
   *  dragged to. That is the whole leak: a new project inheriting another project's geometry. */
  opened(_root: string): void {
    this.storedSlots = this.newWorkspaceSlots();
    if (this.workspaceIsActive()) this.ports.applySlots(this.storedSlots);
  }

  /** The workspace is about to be hidden: take its geometry with it.
   *  The active check matters for LATE registration — attaching this contributor to an already
   *  open set calls `opened` then `suspended` on every hidden workspace, and a hidden workspace
   *  reading the live slots would copy the ACTIVE workspace's geometry onto itself. */
  suspended(): void {
    if (this.workspaceIsActive()) this.storedSlots = this.ports.readSlots();
  }

  /** The workspace is on screen again: put its own geometry back. */
  resumed(): void {
    if (this.storedSlots) this.ports.applySlots(this.storedSlots);
  }

  disposed(): void {}
}

export namespace WorkspaceLayout {
  export const $Class = $WorkspaceLayout;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
