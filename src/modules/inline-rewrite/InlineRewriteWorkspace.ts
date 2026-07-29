import { bg, dim, fg, italic, type TextChunk } from '@opentui/core';
import type { RewriteProvider } from './RewriteProvider.interface';
import type { SourceTextView } from '../workspace/SourceTextView.interface';
import type { EditorContribution } from '../editor/EditorContributions';
import { TextCoordinates } from '../text/TextCoordinates';
import { LanguageRegistry } from '../syntax/LanguageRegistry';
import type { Palette } from '../theme/ThemePalettes';
import type { Workspace } from '../workspace/Workspace';
// prettier-ignore
import type {
  WorkspaceContribution,
} from '../workspace/WorkspaceContributor.interface';
import { InlineRewrite } from './InlineRewrite';

// invariant: Disabled rewrites observe nothing (src/modules/inline-rewrite/inline-rewrite.invariants.md)
// invariant: Proposals preserve source text (src/modules/inline-rewrite/inline-rewrite.invariants.md)
class $InlineRewriteWorkspace
  implements WorkspaceContribution, EditorContribution
{
  protected readonly controllers = new Map<
    SourceTextView,
    InlineRewrite.Instance
  >();
  protected disposeEditorContribution: (() => void) | null = null;
  protected enabled = false;

  constructor(
    protected readonly workspace: Workspace.Model,
    protected readonly options: InlineRewriteWorkspaceOptions,
  ) {
    this.setEnabled(options.enabled);
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.disposeEditorContribution =
        this.workspace.editorContributions.register(this);
    } else {
      this.disposeEditorContribution?.();
      this.disposeEditorContribution = null;
      this.disposeControllers();
    }
  }

  opened(_root: string): void {}

  suspended(): void {
    for (const controller of this.controllers.values()) controller.dismiss();
  }

  resumed(): void {}

  disposed(): void {
    this.setEnabled(false);
    this.options.disposed?.();
  }

  attached(_editor: SourceTextView): void {}

  detached(editor: SourceTextView): void {
    this.controllers.get(editor)?.dispose();
    this.controllers.delete(editor);
  }

  recordTyping(
    editor: SourceTextView,
    firstEditedLine: number,
    lastEditedLine: number,
  ): void {
    if (!this.enabled) return;
    this.controllerFor(editor, true)?.recordTyping(
      firstEditedLine,
      lastEditedLine,
    );
  }

  recordOrdinaryEdit(editor: SourceTextView): void {
    this.controllers.get(editor)?.dismiss();
  }

  lineEndChunks(editor: SourceTextView, lineIndex: number): TextChunk[] {
    const controller = this.controllers.get(editor);
    const projectedLine = controller?.projectedLine(
      lineIndex,
      (candidateLineIndex) => editor.document.line(candidateLineIndex),
    );
    if (projectedLine === null || projectedLine === undefined) return [];
    const palette = this.options.palette();
    return [
      fg(palette.dim)('  → '),
      dim(
        italic(
          bg(palette.inlineRewriteBackground)(
            fg(palette.inlineRewriteForeground)(projectedLine),
          ),
        ),
      ),
    ];
  }

  title(editor: SourceTextView): { text: string; color: string } | null {
    const controller = this.controllers.get(editor);
    if (!controller?.selectedCandidate) return null;
    const acceptHint = this.options.bindingHint(
      'inlineRewrite.accept',
      'editor',
    );
    const rejectHint = this.options.bindingHint(
      'inlineRewrite.reject',
      'editor',
    );
    const nextHint = this.options.bindingHint('inlineRewrite.next', 'editor');
    const previousHint = this.options.bindingHint(
      'inlineRewrite.previous',
      'editor',
    );
    const nextKeyHint = nextHint.split('+').at(-1) ?? nextHint;
    return {
      text:
        ` AI ${controller.selectedCandidateIndex.value + 1}/` +
        `${controller.candidates.value.length} · ${acceptHint} accept · ` +
        `${rejectHint} reject · ${previousHint}/${nextKeyHint} vary `,
      color: this.options.palette().inlineRewriteForeground,
    };
  }

  request(editor: SourceTextView): void {
    this.controllerFor(editor, true)?.requestNow();
  }

  accept(editor: SourceTextView): void {
    const controller = this.controllers.get(editor);
    const candidate = controller?.takeSelectedCandidate();
    if (!candidate) return;
    editor.replaceRangeAsUndoStep(candidate.region, candidate.replacementText);
  }

  reject(editor: SourceTextView): void {
    this.controllers.get(editor)?.dismiss();
  }

  cycle(editor: SourceTextView, candidateDelta: number): void {
    this.controllers.get(editor)?.cycle(candidateDelta);
  }

  controllerFor(
    editor: SourceTextView,
    create = false,
  ): InlineRewrite.Instance | null {
    const existing = this.controllers.get(editor);
    if (existing || !create || !this.enabled) return existing ?? null;
    const provider = this.options.createProvider();
    if (!provider) return null;
    const controller = this.createController(editor, provider);
    this.controllers.set(editor, controller);
    return controller;
  }

  protected createController(
    editor: SourceTextView,
    provider: RewriteProvider,
  ): InlineRewrite.Instance {
    const controller = new InlineRewrite.Class({
      provider,
      snapshot: (region) => {
        if (!editor.hasDocument.value) return null;
        return {
          request: {
            documentPath: editor.document.path,
            documentText: editor.document.text,
            editRegion: region,
            cursor: {
              line: editor.cursor.line.value,
              column: editor.cursor.col.value,
            },
            languageId: LanguageRegistry.Class.forPath(editor.document.path),
          },
          revision: editor.document.revision.value,
          dirty: editor.document.dirty,
        };
      },
      currentRevision: () => editor.document.revision.value,
      currentLineRegion: () =>
        editor.hasDocument.value
          ? this.lineRegion(
              editor,
              editor.cursor.line.value,
              editor.cursor.line.value,
            )
          : null,
      lineRegion: (firstLine, lastLine) =>
        this.lineRegion(editor, firstLine, lastLine),
    });
    controller.attachEligibility(
      () =>
        this.options.eligible() &&
        this.workspace.focus.value === 'editor' &&
        this.workspace.editor === editor &&
        this.workspace.editorSurfaces.activeDocumentIsKeyboardTarget,
    );
    return controller;
  }

  protected lineRegion(
    editor: SourceTextView,
    firstLine: number,
    lastLine: number,
  ) {
    const maximumLine = Math.max(0, editor.document.lineCount - 1);
    const startLine = Math.max(0, Math.min(firstLine, maximumLine));
    const endLine = Math.max(startLine, Math.min(lastLine, maximumLine));
    return {
      start: { line: startLine, column: 0 },
      end: {
        line: endLine,
        column: TextCoordinates.Class.graphemeCount(
          editor.document.line(endLine),
        ),
      },
    };
  }

  protected disposeControllers(): void {
    for (const controller of this.controllers.values()) controller.dispose();
    this.controllers.clear();
  }
}

export namespace InlineRewriteWorkspace {
  export const $Class = $InlineRewriteWorkspace;
  export let Class = $InlineRewriteWorkspace;
  export type Model = InstanceType<typeof Class>;
}

export interface InlineRewriteWorkspaceOptions {
  enabled: boolean;
  createProvider: () => RewriteProvider | null;
  eligible: () => boolean;
  palette: () => Palette;
  bindingHint: (action: string, context: string) => string;
  disposed?: () => void;
}
