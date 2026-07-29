import type { TextDocument } from '../text/TextDocument';
import type { DocumentFoldState } from '../text/DocumentFoldState.interface';

// invariant: Document identity survives document instance replacement (src/modules/workspace/workspace.invariants.md)
class $DocumentHandle {
  constructor(
    readonly identifier: symbol,
    readonly path: string,
  ) {}

  protected documentInstance: TextDocument.Model | null = null;
  readonly foldState: DocumentFoldState = {
    collapsedLineStarts: new Set<number>(),
  };

  get document(): TextDocument.Model | null {
    return this.documentInstance;
  }

  attach(document: TextDocument.Model): void {
    this.documentInstance = document;
  }

  detach(document: TextDocument.Model): void {
    if (this.documentInstance === document) this.documentInstance = null;
  }
}

export namespace DocumentHandle {
  export const $Class = $DocumentHandle;
  export let Class = $DocumentHandle;
  export type Model = InstanceType<typeof Class>;
}
