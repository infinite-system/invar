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

  beginHeadRequest(): number {
    this.hasHeadText.value = false;
    return ++this.requestGeneration;
  }

  applyHeadText(requestGeneration: number, headText: string): boolean {
    if (requestGeneration !== this.requestGeneration) return false;
    this.headText.value = headText;
    this.hasHeadText.value = true;
    return true;
  }

  invalidate(): void {
    this.requestGeneration += 1;
    this.hasHeadText.value = false;
  }

  decorationsByLine(): Map<number, EditorLineDecoration[]> {
    const document = this.handle.document;
    if (!document || !this.hasHeadText.value) return new Map();
    const decorationsByLine = new Map<number, EditorLineDecoration[]>();
    for (const [lineIndex, status] of GutterDiff.Class.statusByLine(
      this.headText.value,
      document.text,
    )) {
      decorationsByLine.set(lineIndex, [
        {
          gutter: {
            glyph: status === 'deleted' ? 'underline' : 'bar',
            color: status,
            priority: 10,
          },
        },
      ]);
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
