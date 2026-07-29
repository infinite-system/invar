import { Editor } from './Editor';
import { EditorContributions } from './EditorContributions';
import type {
  SourceTextView,
  SourceTextViewProvider,
} from '../workspace/SourceTextView.interface';

// The editor's answer to "who makes this workspace's buffer views". One provider per workspace,
// because its contribution registry is per workspace. It is the ONLY place that knows a workspace
// buffer view is an `Editor`, which is what lets the workspace hold documents plus view handles
// and name no view class at all.
//
// invariant: One provider creates every workspace buffer view (src/modules/workspace/workspace.invariants.md)
// invariant: Construction goes through overridable seams (project.invariants.md)
class $EditorSourceTextViews implements SourceTextViewProvider {
  readonly contributions = this.createContributions();

  protected createContributions(): EditorContributions.Model {
    return new EditorContributions.Class();
  }

  createView(): SourceTextView {
    const editor = this.createEditor();
    editor.attachEditorContributions(this.contributions);
    return editor;
  }

  protected createEditor(): Editor.Instance {
    return new Editor.Class();
  }
}

export namespace EditorSourceTextViews {
  export const $Class = $EditorSourceTextViews;
  export let Class = $EditorSourceTextViews;
  export type Model = InstanceType<typeof Class>;
}
