import type {
  SourceTextView,
  SourceTextViewContributions,
  SourceTextViewProvider,
} from '../workspace/SourceTextView.interface';

// The shared owner for one workspace's source-text view factory and contribution registry. The
// process composition supplies the concrete view. The workspace only asks this provider for a new
// SourceTextView and never imports the plugin that made it.
//
// invariant: One provider creates every workspace buffer view (src/modules/workspace/workspace.invariants.md)
// invariant: Construction goes through overridable seams (project.invariants.md)
class $EditorSourceTextViews implements SourceTextViewProvider {
  constructor(
    readonly contributions: SourceTextViewContributions,
    protected readonly createSourceTextView: () => SourceTextView,
  ) {}

  createView(): SourceTextView {
    return this.createSourceTextView();
  }
}

export namespace EditorSourceTextViews {
  export const $Class = $EditorSourceTextViews;
  export let Class = $EditorSourceTextViews;
  export type Model = InstanceType<typeof Class>;
}
