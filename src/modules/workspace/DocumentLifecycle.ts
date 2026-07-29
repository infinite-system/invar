import type { DocumentHandle } from './DocumentHandle';

// invariant: Document identity survives document instance replacement (src/modules/workspace/workspace.invariants.md)
class $DocumentLifecycle {
  protected readonly contributions = new Set<DocumentLifecycleContribution>();

  register(contribution: DocumentLifecycleContribution): () => void {
    this.contributions.add(contribution);
    return () => this.contributions.delete(contribution);
  }

  opened(handle: DocumentHandle.Model): void {
    for (const contribution of this.contributions) {
      contribution.opened(handle);
    }
  }

  becameActive(handle: DocumentHandle.Model): void {
    for (const contribution of this.contributions) {
      contribution.becameActive(handle);
    }
  }

  closed(handle: DocumentHandle.Model): void {
    for (const contribution of this.contributions) {
      contribution.closed(handle);
    }
  }
}

export namespace DocumentLifecycle {
  export const $Class = $DocumentLifecycle;
  export let Class = $DocumentLifecycle;
  export type Model = InstanceType<typeof Class>;
}

export interface DocumentLifecycleContribution {
  opened(handle: DocumentHandle.Model): void;
  becameActive(handle: DocumentHandle.Model): void;
  closed(handle: DocumentHandle.Model): void;
}
