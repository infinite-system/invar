import { Static } from 'ivue/extras';
import type { DocumentHandle } from './DocumentHandle';

// invariant: Gutter marks come from document scoped contributions (src/modules/workspace/workspace.invariants.md)
// invariant: One mark has one reserved meaning (src/modules/workspace/workspace.invariants.md)
class $GutterDecorations {
  static priorityFor(decoration: EditorLineDecoration): number {
    if (decoration.owner === 'diagnostics') {
      if (decoration.severity === 'error') return 700;
      if (decoration.severity === 'warning') return 600;
      if (decoration.severity === 'info') return 500;
      return 400;
    }
    if (decoration.kind === 'modified') return 300;
    if (decoration.kind === 'added') return 200;
    return 100;
  }
  static colorFor(decoration: EditorLineDecoration): EditorDecorationColor {
    return decoration.owner === 'diagnostics'
      ? decoration.severity
      : decoration.kind;
  }
  static highestPriority(
    decorations: readonly EditorLineDecoration[],
  ): EditorLineDecoration | null {
    let highestPriorityDecoration: EditorLineDecoration | null = null;
    for (const decoration of decorations) {
      if (
        highestPriorityDecoration === null ||
        this.priorityFor(decoration) >
          this.priorityFor(highestPriorityDecoration)
      ) {
        highestPriorityDecoration = decoration;
      }
    }
    return highestPriorityDecoration;
  }

  protected readonly contributions = new Set<GutterDecorationContribution>();
  protected snapshotCache = new WeakMap<
    DocumentHandle.Model,
    DecorationSnapshotCache
  >();
  protected registrationRevision = 0;
  protected snapshotGeneration = 0;

  register(contribution: GutterDecorationContribution): () => void {
    this.contributions.add(contribution);
    this.registrationRevision += 1;
    return () => {
      if (!this.contributions.delete(contribution)) return;
      this.registrationRevision += 1;
    };
  }

  snapshotFor(handle: DocumentHandle.Model): EditorDecorationSnapshot {
    const contributions = [...this.contributions];
    const contributionRevisions = contributions.map((contribution) =>
      contribution.revision(handle),
    );
    const documentRevision = handle.document?.revision.value ?? -1;
    const cached = this.snapshotCache.get(handle);
    if (
      cached &&
      cached.registrationRevision === this.registrationRevision &&
      cached.documentRevision === documentRevision &&
      cached.contributionRevisions.length === contributionRevisions.length &&
      cached.contributionRevisions.every((revision, contributionIndex) =>
        Object.is(revision, contributionRevisions[contributionIndex]),
      )
    ) {
      return cached.snapshot;
    }

    const decorationsByLine = new Map<number, EditorLineDecoration[]>();
    for (const contribution of contributions) {
      for (const [lineIndex, contributedDecorations] of contribution.byLine(
        handle,
      )) {
        const decorations = decorationsByLine.get(lineIndex) ?? [];
        decorations.push(...contributedDecorations);
        decorationsByLine.set(lineIndex, decorations);
      }
    }
    const snapshot: EditorDecorationSnapshot = {
      generation: ++this.snapshotGeneration,
      byLine: decorationsByLine,
    };
    this.snapshotCache.set(handle, {
      registrationRevision: this.registrationRevision,
      documentRevision,
      contributionRevisions,
      snapshot,
    });
    return snapshot;
  }

  byLine(
    handle: DocumentHandle.Model,
  ): ReadonlyMap<number, readonly EditorLineDecoration[]> {
    return this.snapshotFor(handle).byLine;
  }
}

export namespace GutterDecorations {
  export const $Class = Static($GutterDecorations);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface GutterDecorationContribution {
  revision(handle: DocumentHandle.Model): unknown;
  byLine(
    handle: DocumentHandle.Model,
  ): ReadonlyMap<number, readonly EditorLineDecoration[]>;
}

export interface EditorDecorationSnapshot {
  readonly generation: number;
  readonly byLine: ReadonlyMap<number, readonly EditorLineDecoration[]>;
}

export interface VersionControlLineDecoration {
  readonly owner: 'versionControl';
  readonly kind: VersionControlDecorationKind;
  readonly hoverLabel: string;
}

export interface DiagnosticLineDecoration {
  readonly owner: 'diagnostics';
  readonly severity: DiagnosticDecorationSeverity;
  readonly hoverLabel: string;
  readonly underline: {
    readonly startColumn: number;
    readonly endColumn: number;
  };
}

export type EditorLineDecoration =
  VersionControlLineDecoration | DiagnosticLineDecoration;

export type VersionControlDecorationKind = 'added' | 'modified' | 'deleted';

export type DiagnosticDecorationSeverity =
  'error' | 'warning' | 'info' | 'hint';

export type EditorDecorationColor =
  VersionControlDecorationKind | DiagnosticDecorationSeverity;

interface DecorationSnapshotCache {
  readonly registrationRevision: number;
  readonly documentRevision: number;
  readonly contributionRevisions: readonly unknown[];
  readonly snapshot: EditorDecorationSnapshot;
}
