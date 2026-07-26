import {
  GutterDecorations,
  type EditorDecorationColor,
  type EditorDecorationSnapshot,
  type EditorLineDecoration,
} from '../workspace/GutterDecorations';

// invariant: The editor overview derives from the decoration snapshot (ui.invariants.md)
class $OverviewRuler {
  protected cachedSnapshot: EditorDecorationSnapshot | null = null;
  protected cachedDocumentLineCount = -1;
  protected cachedTrackLength = -1;
  protected cachedMarks: readonly OverviewRulerMark[] = [];
  protected recomputationCountValue = 0;

  project(
    snapshot: EditorDecorationSnapshot,
    documentLineCount: number,
    trackLength: number,
  ): readonly OverviewRulerMark[] {
    if (
      this.cachedSnapshot === snapshot &&
      this.cachedDocumentLineCount === documentLineCount &&
      this.cachedTrackLength === trackLength
    ) {
      return this.cachedMarks;
    }

    this.cachedSnapshot = snapshot;
    this.cachedDocumentLineCount = documentLineCount;
    this.cachedTrackLength = trackLength;
    this.recomputationCountValue += 1;
    if (documentLineCount <= 0 || trackLength <= 0) {
      this.cachedMarks = [];
      return this.cachedMarks;
    }

    const decorationsByTrackOffset = new Map<number, EditorLineDecoration[]>();
    for (const [lineIndex, decorations] of snapshot.byLine) {
      const trackOffset = this.trackOffsetForLine(
        lineIndex,
        documentLineCount,
        trackLength,
      );
      const aggregatedDecorations =
        decorationsByTrackOffset.get(trackOffset) ?? [];
      aggregatedDecorations.push(...decorations);
      decorationsByTrackOffset.set(trackOffset, aggregatedDecorations);
    }

    this.cachedMarks = [...decorationsByTrackOffset]
      .sort(
        ([firstTrackOffset], [secondTrackOffset]) =>
          firstTrackOffset - secondTrackOffset,
      )
      .flatMap(([trackOffset, decorations]) => {
        const highestPriorityDecoration =
          GutterDecorations.Class.highestPriority(decorations);
        if (!highestPriorityDecoration) return [];
        return [
          {
            trackOffset,
            color: GutterDecorations.Class.colorFor(highestPriorityDecoration),
            hoverLabels: decorations
              .toSorted(
                (firstDecoration, secondDecoration) =>
                  GutterDecorations.Class.priorityFor(secondDecoration) -
                  GutterDecorations.Class.priorityFor(firstDecoration),
              )
              .map((decoration) => decoration.hoverLabel),
          },
        ];
      });
    return this.cachedMarks;
  }

  get recomputationCount(): number {
    return this.recomputationCountValue;
  }

  protected trackOffsetForLine(
    lineIndex: number,
    documentLineCount: number,
    trackLength: number,
  ): number {
    if (documentLineCount <= 1 || trackLength <= 1) return 0;
    const clampedLineIndex = Math.max(
      0,
      Math.min(lineIndex, documentLineCount - 1),
    );
    return Math.round(
      (clampedLineIndex / (documentLineCount - 1)) * (trackLength - 1),
    );
  }
}

export namespace OverviewRuler {
  export const $Class = $OverviewRuler;
  export let Class = $OverviewRuler;
  export type Model = InstanceType<typeof Class>;
}

export interface OverviewRulerMark {
  readonly trackOffset: number;
  readonly color: EditorDecorationColor;
  readonly hoverLabels: readonly string[];
}
