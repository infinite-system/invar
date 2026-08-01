import { Files } from '../system/Files';
import type { NavigationHistoryContributor } from '../navigation/NavigationHistory';
import type { Workspace } from '../workspace/Workspace';
import type { WorkspaceContribution } from '../workspace/WorkspaceContributor.interface';

// The source editor owns the shape and meaning of its history payload. NavigationHistory sees only
// an identifier and an opaque value, while this contribution knows how to capture and restore the
// active document's cursor.
// invariant: Programmatic history navigation does not record new history (src/modules/navigation/navigation.invariants.md)
// invariant: Public classes use the namespace pattern (project.invariants.md)
class $EditorNavigationHistoryContribution
  implements WorkspaceContribution, NavigationHistoryContributor
{
  constructor(readonly workspace: Workspace.Model) {
    this.disposeNavigationHistory = workspace.navigationHistory.register(this);
  }

  readonly identifier = 'sourceText.editor';
  protected readonly disposeNavigationHistory: () => void;

  captureCurrentState(): EditorNavigationHistoryState | null {
    if (this.workspace.editorSurfaces.occupyingClaim !== null) return null;
    const editor = this.workspace.editor;
    if (!editor.hasDocument.value || !editor.document.path) return null;
    return {
      documentPath: editor.document.path,
      line: editor.cursor.line.value,
      column: editor.cursor.col.value,
    };
  }

  restoreState(payload: unknown): boolean {
    if (!this.isNavigationHistoryState(payload)) return false;
    if (
      !Files.Class.exists(payload.documentPath) ||
      Files.Class.isDir(payload.documentPath)
    ) {
      return false;
    }
    this.workspace.openFileInTab(payload.documentPath);
    this.workspace.focusEditor();
    this.workspace.revealSourceLocation(payload.line, payload.column);
    return true;
  }

  samePlace(previousPayload: unknown, nextPayload: unknown): boolean {
    return (
      this.isNavigationHistoryState(previousPayload) &&
      this.isNavigationHistoryState(nextPayload) &&
      previousPayload.documentPath === nextPayload.documentPath &&
      previousPayload.line === nextPayload.line
    );
  }

  protected isNavigationHistoryState(
    payload: unknown,
  ): payload is EditorNavigationHistoryState {
    if (typeof payload !== 'object' || payload === null) return false;
    const candidate = payload as Partial<EditorNavigationHistoryState>;
    return (
      typeof candidate.documentPath === 'string' &&
      typeof candidate.line === 'number' &&
      typeof candidate.column === 'number'
    );
  }

  opened(): void {}
  suspended(): void {}
  resumed(): void {}
  disposed(): void {
    this.disposeNavigationHistory();
  }
}

export namespace EditorNavigationHistoryContribution {
  export const $Class = $EditorNavigationHistoryContribution;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface EditorNavigationHistoryState {
  documentPath: string;
  line: number;
  column: number;
}
