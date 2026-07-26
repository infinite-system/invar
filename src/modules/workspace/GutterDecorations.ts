import type { DocumentHandle } from './DocumentHandle';

// invariant: Gutter marks come from document scoped contributions (workspace.invariants.md)
class $GutterDecorations {
  protected readonly contributions = new Set<GutterDecorationContribution>();

  register(contribution: GutterDecorationContribution): () => void {
    this.contributions.add(contribution);
    return () => this.contributions.delete(contribution);
  }

  byLine(handle: DocumentHandle.Model): Map<number, EditorLineDecoration[]> {
    const decorationsByLine = new Map<number, EditorLineDecoration[]>();
    for (const contribution of this.contributions) {
      for (const [lineIndex, contributedDecorations] of contribution.byLine(
        handle,
      )) {
        const decorations = decorationsByLine.get(lineIndex) ?? [];
        decorations.push(...contributedDecorations);
        decorationsByLine.set(lineIndex, decorations);
      }
    }
    return decorationsByLine;
  }
}

export namespace GutterDecorations {
  export const $Class = $GutterDecorations;
  export let Class = $GutterDecorations;
  export type Model = InstanceType<typeof Class>;
}

export interface GutterDecorationContribution {
  byLine(
    handle: DocumentHandle.Model,
  ): ReadonlyMap<number, readonly EditorLineDecoration[]>;
}

export interface EditorLineDecoration {
  readonly gutter: {
    readonly glyph: 'bar' | 'underline';
    readonly color: EditorDecorationColor;
    readonly priority: number;
  };
  readonly underline?: {
    readonly startColumn: number;
    readonly endColumn: number;
    readonly color: EditorDecorationColor;
  };
}

export type EditorDecorationColor =
  'added' | 'modified' | 'deleted' | 'error' | 'warning' | 'info' | 'hint';
