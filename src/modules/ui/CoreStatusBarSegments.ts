import { Static } from 'ivue/extras';
import type {
  StatusBarSegmentContext,
  StatusBarSegmentContribution,
} from './StatusBarSegments';

// invariant: Status text is assembled from ordered contributions (src/modules/ui/ui.invariants.md)
class $CoreStatusBarSegments {
  static segments(context: StatusBarSegmentContext): readonly string[] {
    const workspace = context.workspaceSet.active;
    const editor = workspace.editor;
    const segments: string[] = [workspace.name.value || '—'];
    if (editor.hasDocument.value) {
      segments.push(editor.title);
      segments.push(
        `Ln ${editor.cursor.line.value + 1}, Col ${editor.cursor.col.value + 1}`,
      );
      segments.push(`${editor.document.lineCount} lines`);
    }
    if (context.focusedSurfaceTitle) {
      segments.push(`[${context.focusedSurfaceTitle}]`);
    } else if (workspace.focus.value === 'primaryPane') {
      const title = context.primaryDockHost.activeContent?.title;
      if (title) segments.push(`[${title}]`);
    }
    if (context.app.copyNotice.value) {
      segments.push(context.app.copyNotice.value);
    }
    const languageProviderNotice = workspace.languageProviderNotice();
    if (languageProviderNotice) segments.push(languageProviderNotice);
    segments.push(
      context.app.quitChordArmed.value
        ? 'Ctrl+X armed — Ctrl+C quits'
        : 'Ctrl+Q/F10 quit',
    );
    return segments;
  }
}

export namespace CoreStatusBarSegments {
  export const $Class = Static($CoreStatusBarSegments);
  export let Class = $Class;
}
