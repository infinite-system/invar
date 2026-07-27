import type { StatusSnapshot } from '../system/StatusChannel';

class $StatusProjectionContributions {
  protected readonly contributions = new Set<StatusProjectionContribution>();
  protected projectedKeys = new Set<keyof StatusSnapshot>();

  register(contribution: StatusProjectionContribution): () => void {
    this.contributions.add(contribution);
    return () => this.contributions.delete(contribution);
  }

  snapshot(): Partial<StatusSnapshot> {
    const currentSnapshot = Object.assign(
      {},
      ...[...this.contributions].map((contribution) => contribution.snapshot()),
    );
    const currentKeys = new Set(
      Object.keys(currentSnapshot) as (keyof StatusSnapshot)[],
    );
    const snapshotWithRemovedKeys = {
      ...Object.fromEntries(
        [...this.projectedKeys]
          .filter((key) => !currentKeys.has(key))
          .map((key) => [key, undefined]),
      ),
      ...currentSnapshot,
    };
    this.projectedKeys = currentKeys;
    return snapshotWithRemovedKeys;
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
