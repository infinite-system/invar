import { Static } from 'ivue/extras';
import { EditorSourceTextViews } from '../text/EditorSourceTextViews';
import { Editor } from './Editor';
import { EditorContributions } from './EditorContributions';

// The editor plugin's concrete assembly for the core source-text view provider. Core owns the
// provider lifecycle. This factory alone names the Editor implementation and its contribution
// registry.
// invariant: Construction goes through overridable seams (project.invariants.md)
// invariant: One provider creates every workspace buffer view (src/modules/workspace/workspace.invariants.md)
class $EditorSourceTextViewProviderFactory {
  static create(): EditorSourceTextViews.Model {
    const contributions = new EditorContributions.Class();
    return new EditorSourceTextViews.Class(contributions, () => {
      const editor = new Editor.Class();
      editor.attachEditorContributions(contributions);
      return editor;
    });
  }
}

export namespace EditorSourceTextViewProviderFactory {
  export const $Class = Static($EditorSourceTextViewProviderFactory);
  export let Class = $Class;
}
