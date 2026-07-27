import type { TextChunk } from '@opentui/core';
import type { Editor } from './Editor';

// invariant: Plugin boundaries grant one authority (project.invariants.md)
class $EditorContributions {
  protected readonly editors = new Set<Editor.Model>();
  protected readonly contributions = new Set<EditorContribution>();

  get contributionCount(): number {
    return this.contributions.size;
  }

  attach(editor: Editor.Model): () => void {
    if (this.editors.has(editor)) return () => {};
    this.editors.add(editor);
    for (const contribution of this.contributions) {
      contribution.attached?.(editor);
    }
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      for (const contribution of this.contributions) {
        contribution.detached?.(editor);
      }
      this.editors.delete(editor);
    };
  }

  register(contribution: EditorContribution): () => void {
    if (this.contributions.has(contribution)) return () => {};
    this.contributions.add(contribution);
    for (const editor of this.editors) contribution.attached?.(editor);
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      for (const editor of this.editors) contribution.detached?.(editor);
      this.contributions.delete(contribution);
    };
  }

  recordTyping(
    editor: Editor.Model,
    firstEditedLine: number,
    lastEditedLine: number,
  ): void {
    for (const contribution of this.contributions) {
      contribution.recordTyping?.(editor, firstEditedLine, lastEditedLine);
    }
  }

  recordOrdinaryEdit(editor: Editor.Model): void {
    for (const contribution of this.contributions) {
      contribution.recordOrdinaryEdit?.(editor);
    }
  }

  lineEndChunks(editor: Editor.Model, lineIndex: number): TextChunk[] {
    return [...this.contributions].flatMap(
      (contribution) => contribution.lineEndChunks?.(editor, lineIndex) ?? [],
    );
  }

  title(editor: Editor.Model): EditorContributionTitle | null {
    for (const contribution of [...this.contributions].reverse()) {
      const title = contribution.title?.(editor);
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

export interface EditorContribution {
  attached?(editor: Editor.Model): void;
  detached?(editor: Editor.Model): void;
  recordTyping?(
    editor: Editor.Model,
    firstEditedLine: number,
    lastEditedLine: number,
  ): void;
  recordOrdinaryEdit?(editor: Editor.Model): void;
  lineEndChunks?(editor: Editor.Model, lineIndex: number): TextChunk[];
  title?(editor: Editor.Model): EditorContributionTitle | null;
}

export interface EditorContributionTitle {
  text: string;
  color: string;
}
