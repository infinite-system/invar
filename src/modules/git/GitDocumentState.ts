import { Reactive } from 'ivue';
import { shallowRef } from 'vue';
import { GutterDiff } from '../diff/GutterDiff';
import type { EditorLineDecoration } from '../workspace/GutterDecorations';
import type { DocumentHandle } from '../workspace/DocumentHandle';

// invariant: Document identity survives document instance replacement (src/modules/workspace/workspace.invariants.md)
// invariant: The editor gutter reflects HEAD changes (src/modules/diff/diff.invariants.md)
class $GitDocumentState {
  constructor(readonly handle: DocumentHandle.Model) {}

  get headText() {
    return shallowRef('');
  }

  get hasHeadText() {
    return shallowRef(false);
  }

  protected requestGeneration = 0;

  protected get appliedHeadRevision() {
    return shallowRef(0);
  }

  beginHeadRequest(): number {
    return ++this.requestGeneration;
  }

  applyHeadText(requestGeneration: number, headText: string | null): boolean {
    if (requestGeneration !== this.requestGeneration) return false;
    const hasHeadText = headText !== null;
    if (
      this.hasHeadText.value === hasHeadText &&
      (!hasHeadText || this.headText.value === headText)
    ) {
      return true;
    }
    this.headText.value = headText ?? '';
    this.hasHeadText.value = hasHeadText;
    this.appliedHeadRevision.value += 1;
    return true;
  }

  invalidate(): void {
    this.requestGeneration += 1;
    if (!this.hasHeadText.value) return;
    this.hasHeadText.value = false;
    this.appliedHeadRevision.value += 1;
  }

  get decorationRevision(): string {
    return `${this.appliedHeadRevision.value}:${
      this.hasHeadText.value ? 1 : 0
    }`;
  }

  decorationsByLine(): Map<number, EditorLineDecoration[]> {
    const document = this.handle.document;
    if (!document || !this.hasHeadText.value) return new Map();
    const decorationsByLine = new Map<number, EditorLineDecoration[]>();
    for (const [lineIndex, marks] of GutterDiff.Class.marksByLine(
      this.headText.value,
      document.text,
    )) {
      decorationsByLine.set(
        lineIndex,
        marks.map((mark) => ({
          owner: 'versionControl',
          kind: mark.kind,
          hoverLabel: mark.hoverLabel,
        })),
      );
    }
    return decorationsByLine;
  }
}

export namespace GitDocumentState {
  export const $Class = $GitDocumentState;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
