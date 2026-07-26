import type { StatusSnapshot } from '../system/StatusChannel';

class $StatusProjectionContributions {
  protected readonly contributions = new Set<StatusProjectionContribution>();

  register(contribution: StatusProjectionContribution): () => void {
    this.contributions.add(contribution);
    return () => this.contributions.delete(contribution);
  }

  snapshot(): Partial<StatusSnapshot> {
    return Object.assign(
      {},
      ...[...this.contributions].map((contribution) => contribution.snapshot()),
    );
  }
}

export namespace StatusProjectionContributions {
  export const $Class = $StatusProjectionContributions;
  export let Class = $StatusProjectionContributions;
  export type Model = InstanceType<typeof Class>;
}

export interface StatusProjectionContribution {
  snapshot(): Partial<StatusSnapshot>;
}
