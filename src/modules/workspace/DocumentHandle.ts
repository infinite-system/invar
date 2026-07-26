import type { TextDocument } from '../editor/TextDocument';

// invariant: Document identity survives document instance replacement (workspace.invariants.md)
class $DocumentHandle {
  constructor(
    readonly identifier: symbol,
    readonly path: string,
  ) {}

  protected documentInstance: TextDocument.Model | null = null;

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
