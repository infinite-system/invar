import type { DiffView } from '../diff/DiffView';
import type {
  EditorSurfaceContent,
  EditorSurfaceContentContext,
  EditorSurfaceContentProvider,
} from '../ui/EditorSurfaceContents';
import type { Settings } from '../settings/Settings';
import { GitComparisonContent } from './GitComparisonContent';
import type { GitComparisonRequest, GitWorkspace } from './GitWorkspace';

// Source control's occupant of the editor surface: the side-by-side comparison of two revisions.
//
// This class is the whole of what the HOST used to do for it — construct the `DiffView`, key its
// identity off the request token, tick its glide, repaint it once its container reaches a real
// laid-out height, route editor-context keys into it, and hand over its find target and selection.
// The host now holds none of that; it mounts whatever `EditorSurfaceContents` gives it.
//
// invariant: Base and current stay unambiguous (src/modules/diff/diff.invariants.md)
// invariant: Diff selection reuses shared drag behavior (src/modules/diff/diff.invariants.md)
class $GitComparisonSurface implements EditorSurfaceContentProvider {
  constructor(
    protected readonly activeWorkspace: () => GitWorkspace.Model | null,
    protected readonly settings: Settings.Instance,
  ) {}

  readonly identifier = 'sourceControl.comparison';
  protected content: GitComparisonContent.Model | null = null;

  /** The mounted comparison view, or null. Read by the plugin's own commands and status snapshot —
   *  never by the host, which knows only the generic content contract. */
  get comparisonView(): DiffView.Instance | null {
    // Guarded by the live identity: the mount disposes the content when the claim drops, and this
    // reference would otherwise outlive it.
    if (this.mountIdentity() === '') return null;
    return this.content?.comparisonView ?? null;
  }

  /** Empty while no comparison is up. Otherwise root + request token, so a fresh request rebuilds
   *  the view and a workspace switch never shows another root's comparison. */
  mountIdentity(): string {
    const workspace = this.activeWorkspace();
    if (!workspace || !workspace.showingComparison.value) return '';
    const request = workspace.comparisonRequest.value;
    if (!request) return '';
    return `${workspace.workspace.root}:comparison:${request.token}`;
  }

  /** The comparison's pane split is persisted, so a drag of the divider must repaint the host.
   *  invariant: The diff pane split stays draggable and persistent (src/modules/diff/diff.invariants.md) */
  observePaintSignals(): void {
    void this.settings.diffSplitRatio.value;
  }

  // invariant: Construction goes through overridable seams (project.invariants.md)
  protected createContent(
    workspace: GitWorkspace.Model,
    request: GitComparisonRequest,
    context: EditorSurfaceContentContext,
  ): GitComparisonContent.Model {
    return new GitComparisonContent.Class(workspace, request, context);
  }

  create(context: EditorSurfaceContentContext): EditorSurfaceContent {
    const workspace = this.activeWorkspace();
    const request = workspace?.comparisonRequest.value ?? null;
    if (!workspace || !request) {
      throw new Error('Comparison surface created without a pending request');
    }
    const content = this.createContent(workspace, request, context);
    this.content = content;
    return content;
  }
}

export namespace GitComparisonSurface {
  export const $Class = $GitComparisonSurface;
  export let Class = $GitComparisonSurface;
  export type Model = InstanceType<typeof Class>;
}
