import {
  GutterDecorations,
  type EditorDecorationColor,
  type EditorDecorationSnapshot,
  type EditorLineDecoration,
} from '../workspace/GutterDecorations';

// invariant: The editor overview derives from the decoration snapshot (ui.invariants.md)
// invariant: One generator owns document-line-to-visual-row (src/modules/editor/editor.invariants.md)
class $OverviewRuler {
  protected cachedSnapshot: EditorDecorationSnapshot | null = null;
  protected cachedVisualProjectionKey = '';
  protected cachedTrackLength = -1;
  protected cachedMarks: readonly OverviewRulerMark[] = [];
  protected recomputationCountValue = 0;

  project(
    snapshot: EditorDecorationSnapshot,
    visualProjection: {
      readonly key: string;
      readonly rowCount: number;
      rowOfLine(lineIndex: number): number;
    },
    trackLength: number,
  ): readonly OverviewRulerMark[] {
    if (
      this.cachedSnapshot === snapshot &&
      this.cachedVisualProjectionKey === visualProjection.key &&
      this.cachedTrackLength === trackLength
    ) {
      return this.cachedMarks;
    }

    this.cachedSnapshot = snapshot;
    this.cachedVisualProjectionKey = visualProjection.key;
    this.cachedTrackLength = trackLength;
    this.recomputationCountValue += 1;
    if (visualProjection.rowCount <= 0 || trackLength <= 0) {
      this.cachedMarks = [];
      return this.cachedMarks;
    }

    const decorationsByTrackOffset = new Map<number, EditorLineDecoration[]>();
    for (const [lineIndex, decorations] of snapshot.byLine) {
      const trackOffset = this.trackOffsetForVisualRow(
        visualProjection.rowOfLine(lineIndex),
        visualProjection.rowCount,
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

  protected trackOffsetForVisualRow(
    visualRow: number,
    visualRowCount: number,
    trackLength: number,
  ): number {
    if (visualRowCount <= 1 || trackLength <= 1) return 0;
    const clampedVisualRow = Math.max(
      0,
      Math.min(visualRow, visualRowCount - 1),
    );
    return Math.round(
      (clampedVisualRow / (visualRowCount - 1)) * (trackLength - 1),
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
