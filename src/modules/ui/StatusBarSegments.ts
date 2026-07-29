import type { App } from '../app/App';
import type { PanelHost } from './PanelHost';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';

// invariant: Status text is assembled from ordered contributions (src/modules/ui/ui.invariants.md)
class $StatusBarSegments {
  protected readonly contributions = new Set<StatusBarSegmentContribution>();

  register(contribution: StatusBarSegmentContribution): () => void {
    this.contributions.add(contribution);
    return () => this.contributions.delete(contribution);
  }

  segments(context: StatusBarSegmentContext): string[] {
    return [...this.contributions].flatMap((contribution) =>
      contribution.segments(context),
    );
  }
}

export namespace StatusBarSegments {
  export const $Class = $StatusBarSegments;
  export let Class = $StatusBarSegments;
  export type Model = InstanceType<typeof Class>;
}

export interface StatusBarSegmentContribution {
  segments(context: StatusBarSegmentContext): readonly string[];
}

export interface StatusBarSegmentContext {
  readonly workspaceSet: WorkspaceSet.Instance;
  readonly app: App.Instance;
  readonly primaryDockHost: PanelHost.Instance;
  /** Name of the focused pane of whatever contributed surface occupies the editor column, or null
   *  when the source editor owns it (or the surface labels its own panes). */
  readonly focusedSurfaceTitle: string | null;
}
