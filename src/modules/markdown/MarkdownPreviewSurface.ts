import { MarkdownPreviewContent } from './MarkdownPreviewContent';
import type { MarkdownWorkspace } from './MarkdownWorkspace';
import type { RegisteredSetting } from '../settings/SettingContribution.interface';
import type {
  EditorSurfaceContent,
  EditorSurfaceContentContext,
  EditorSurfaceContentProvider,
} from '../ui/EditorSurfaceContents';

// Markdown's occupant of the editor column. The host used to hard-code this branch in
// `EditorContentMount` — importing `MarkdownSplitView`, keying its identity, owning its lifecycle and
// arbitrating it against the comparison. All of that is here now; the host mounts whatever the
// registry gives it.
//
// invariant: A Markdown file offers a live source preview split (src/modules/markdown/markdown.invariants.md)
class $MarkdownPreviewSurface implements EditorSurfaceContentProvider {
  constructor(
    protected readonly activeWorkspace: () => MarkdownWorkspace.Model | null,
    protected readonly splitRatioSetting: RegisteredSetting<number>,
    protected readonly previewSideSetting: RegisteredSetting<string>,
  ) {}

  readonly identifier = 'markdown.preview';
  protected content: MarkdownPreviewContent.Model | null = null;

  /** The mounted split, or null. Read by this plugin's own commands and status snapshot. */
  get previewContent(): MarkdownPreviewContent.Model | null {
    // Guarded by the live identity: the mount disposes the content when the claim drops, and this
    // reference would otherwise outlive it.
    return this.mountIdentity() === '' ? null : this.content;
  }

  /** The contributed side, normalized: any value other than 'right' means the default left. */
  previewSide(): 'left' | 'right' {
    return this.previewSideSetting.value.value === 'right' ? 'right' : 'left';
  }

  /** Empty while no tab is showing its preview. Otherwise root + source path + side, so switching
   *  to another Markdown tab — or flipping the side setting — rebuilds the split for that shape. */
  mountIdentity(): string {
    const markdownWorkspace = this.activeWorkspace();
    if (!markdownWorkspace || !markdownWorkspace.showingPreview) return '';
    const workspace = markdownWorkspace.workspace;
    return `${workspace.root}:preview:${workspace.editor.document.path}:${this.previewSide()}`;
  }

  /** The split's pane ratio and side are persisted, so a divider drag or a settings flip must
   *  repaint the host. */
  observePaintSignals(): void {
    void this.splitRatioSetting.value.value;
    void this.previewSideSetting.value.value;
  }

  create(context: EditorSurfaceContentContext): EditorSurfaceContent {
    const markdownWorkspace = this.activeWorkspace();
    if (!markdownWorkspace) {
      throw new Error('Markdown surface created without an active workspace');
    }
    const content = this.createContent(markdownWorkspace, context);
    this.content = content;
    return content;
  }

  // invariant: Construction goes through overridable seams (project.invariants.md)
  protected createContent(
    markdownWorkspace: MarkdownWorkspace.Model,
    context: EditorSurfaceContentContext,
  ): MarkdownPreviewContent.Model {
    return new MarkdownPreviewContent.Class(
      markdownWorkspace.workspace,
      context,
      this.splitRatioSetting,
      this.previewSide(),
    );
  }
}

export namespace MarkdownPreviewSurface {
  export const $Class = $MarkdownPreviewSurface;
  export let Class = $MarkdownPreviewSurface;
  export type Model = InstanceType<typeof Class>;
}
