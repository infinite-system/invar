import type { TextChunk } from '@opentui/core';
import type {
  SourceTextView,
  SourceTextViewContribution,
  SourceTextViewContributionTitle,
  SourceTextViewContributions,
} from '../workspace/SourceTextView.interface';

// The per-workspace registry of source-text-view contributions. It names no view class: every
// method takes the host's `SourceTextView` seam, so a contribution written against the host
// compiles without the editor and the editor stays replaceable.
//
// invariant: Plugin boundaries grant one authority (project.invariants.md)
class $EditorContributions implements SourceTextViewContributions {
  protected readonly views = new Set<SourceTextView>();
  protected readonly contributions = new Set<SourceTextViewContribution>();

  get contributionCount(): number {
    return this.contributions.size;
  }

  attach(view: SourceTextView): () => void {
    if (this.views.has(view)) return () => {};
    this.views.add(view);
    for (const contribution of this.contributions) {
      contribution.attached?.(view);
    }
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      for (const contribution of this.contributions) {
        contribution.detached?.(view);
      }
      this.views.delete(view);
    };
  }

  register(contribution: SourceTextViewContribution): () => void {
    if (this.contributions.has(contribution)) return () => {};
    this.contributions.add(contribution);
    for (const view of this.views) contribution.attached?.(view);
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      for (const view of this.views) contribution.detached?.(view);
      this.contributions.delete(contribution);
    };
  }

  recordTyping(
    view: SourceTextView,
    firstEditedLine: number,
    lastEditedLine: number,
  ): void {
    for (const contribution of this.contributions) {
      contribution.recordTyping?.(view, firstEditedLine, lastEditedLine);
    }
  }

  recordOrdinaryEdit(view: SourceTextView): void {
    for (const contribution of this.contributions) {
      contribution.recordOrdinaryEdit?.(view);
    }
  }

  lineEndChunks(view: SourceTextView, lineIndex: number): TextChunk[] {
    return [...this.contributions].flatMap(
      (contribution) => contribution.lineEndChunks?.(view, lineIndex) ?? [],
    );
  }

  title(view: SourceTextView): SourceTextViewContributionTitle | null {
    for (const contribution of [...this.contributions].reverse()) {
      const title = contribution.title?.(view);
      if (title) return title;
    }
    return null;
  }
}

export namespace EditorContributions {
  export const $Class = $EditorContributions;
  export let Class = $EditorContributions;
  export type Model = InstanceType<typeof Class>;
}

export type EditorContribution = SourceTextViewContribution;

export type EditorContributionTitle = SourceTextViewContributionTitle;
