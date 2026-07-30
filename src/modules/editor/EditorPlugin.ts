// The source-text editor as an ordinary CONTRIBUTOR — the last host-owned surface to become one.
// This file is the whole of what the host used to know about the editor column: that a source-text
// view goes in it, what that view needs to be built, and what its bracket match projects. The host
// now holds a slot, a registry, and a name it cannot resolve.
//
// It contributes three things and releases all three:
//   1. the column's DEFAULT occupant — `SourceTextPaneContent`, built lazily into the host's slot;
//   2. a status projection — the bracket-match partner cell, which is an editor question;
//   3. nothing else. Keystrokes stay with the command layer (see #228), and the buffer VIEW
//      provider stays with the host, because a workspace holds documents with or without an editor.
//
// Uninstall symmetry is the point of the release path, not a courtesy: withdrawing this contributor
// disposes the pane content, which unmounts the renderables it built AND releases every source-text
// view its workspaces' provider made. Without that, an uninstalled editor keeps painting and keeps
// its views alive — the orphaned-pane defect #114 found for runtimes, one layer up.
//
// invariant: Plugin boundaries grant one authority (project.invariants.md)
// invariant: The editor column's default occupant is a contribution (src/modules/ui/ui.invariants.md)
// invariant: The source text editor is a pane content citizen (src/modules/ui/ui.invariants.md)
// invariant: One provider creates every workspace buffer view (src/modules/workspace/workspace.invariants.md)
import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import type { StatusSnapshot } from '../system/StatusChannel';
import type { PaneContent } from '../ui/PaneContent.interface';
import {
  EditorColumnDefault,
  type EditorColumnDefaultContext,
  type EditorColumnDefaultHostPort,
  type EditorColumnDefaultProvider,
  type EditorColumnRasterProjectionPort,
  type EditorColumnSymbolHoverPort,
} from '../ui/EditorColumnDefault';
import { BracketMatch } from './BracketMatch';
import type { EditorFrameAttribution } from './EditorFrameAttribution';
import { SourceTextPaneContent } from './SourceTextPaneContent';

class $EditorPlugin
  implements ApplicationContributor, EditorColumnDefaultProvider
{
  readonly identifier = 'source-text-editor';
  readonly name = 'Source Text Editor';
  protected application: ApplicationContributionContext | null = null;
  protected hostPort: EditorColumnDefaultHostPort | null = null;
  protected disposeStatusProjection: (() => void) | null = null;

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    this.hostPort = context.registerEditorColumnDefault(this);
    this.disposeStatusProjection =
      context.statusProjectionContributions.register({
        snapshot: () => this.statusSnapshot(),
      });
  }

  /** Build the source-text pane into the host's slot. The three host services this content needs
   *  are resolved BY NAME, so the mount context names no editor type and a host that offers none of
   *  them still gets a working editor — a raster document simply never projects. */
  create(context: EditorColumnDefaultContext): PaneContent {
    const hover = context.hostCapability<EditorColumnSymbolHoverPort>(
      EditorColumnDefault.Class.SYMBOL_HOVER_CAPABILITY,
    );
    const rasterProjection =
      context.hostCapability<EditorColumnRasterProjectionPort>(
        EditorColumnDefault.Class.RASTER_PROJECTION_CAPABILITY,
      );
    const frameAttribution =
      context.hostCapability<EditorFrameAttribution.Model>(
        EditorColumnDefault.Class.FRAME_ATTRIBUTION_CAPABILITY,
      );
    if (!frameAttribution) {
      throw new Error(
        'the editor column publishes no frame-attribution port, so a source-text paint could ' +
          'not be counted',
      );
    }
    return this.buildSourceTextPaneContent(context, {
      hover,
      rasterProjection,
      frameAttribution,
    });
  }

  // invariant: Construction goes through overridable seams (project.invariants.md)
  protected buildSourceTextPaneContent(
    context: EditorColumnDefaultContext,
    ports: {
      hover: EditorColumnSymbolHoverPort | null;
      rasterProjection: EditorColumnRasterProjectionPort | null;
      frameAttribution: EditorFrameAttribution.Model;
    },
  ): PaneContent {
    return new SourceTextPaneContent.Class({
      renderer: context.renderer,
      slot: context.slot,
      workspaceSet: context.workspaceSet,
      findBar: context.findBar,
      settings: context.settings,
      theme: context.theme,
      frameAttribution: ports.frameAttribution,
      tooltip: context.tooltip,
      readPalette: context.readPalette,
      viewportRows: context.viewportRows,
      viewportColumns: context.viewportColumns,
      focusSourceEditor: context.focusSourceEditor,
      hover: ports.hover ?? {
        pointAt: () => {},
        clear: () => {},
        pointerOffSymbol: () => {},
      },
      rasterProjection: (region) => ports.rasterProjection?.(region) ?? null,
      // The views this content shows exist only to be shown by it, so the content that goes away
      // takes them with it. The DOCUMENTS and the open tabs stay — they are the workspace's own.
      releaseSourceTextViews: () => {
        for (const workspace of context.workspaceSet.entries.value) {
          workspace.releaseSourceTextViews();
        }
      },
    });
  }

  /** The matched partner cell for the cursor's bracket, or -1/-1 when the cursor sits on none.
   *  An editor question, projected by the editor: with this contributor withdrawn the keys are
   *  absent rather than lying about a match nobody can see. */
  protected statusSnapshot(): Partial<StatusSnapshot> {
    const match = this.cursorBracketMatch();
    return {
      matchingBracketLine: match?.line ?? -1,
      matchingBracketColumn: match?.column ?? -1,
    };
  }

  protected cursorBracketMatch(): { line: number; column: number } | null {
    const context = this.application;
    if (!context) return null;
    const workspace = context.workspaceSet.active;
    const editor = workspace.editor;
    if (!editor.hasDocument.value) return null;
    if (!workspace.editorSurfaces.activeDocumentIsPresented) return null;
    return (
      BracketMatch.Class.findInDocument(
        editor.document,
        editor.cursor.line.value,
        editor.cursor.col.value,
        workspace.documentSyntax,
      )?.match ?? null
    );
  }

  disposeApplication(): void {
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    // Release the content BEFORE withdrawing the provider: a withdrawn contributor must leave no
    // renderable painting and no view alive. Withdrawal on its own releases nothing, exactly as a
    // pane runtime's `dispose` releases no pane.
    this.hostPort?.releaseContent();
    this.hostPort?.dispose();
    this.hostPort = null;
    this.application = null;
  }
}

export namespace EditorPlugin {
  export const $Class = $EditorPlugin;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
