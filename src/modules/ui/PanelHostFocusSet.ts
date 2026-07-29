// invariant: One panel host owns keyboard focus (src/modules/ui/ui.invariants.md)
class $PanelHostFocusSet {
  protected readonly hosts = new Set<PanelHostFocusTarget>();

  register(host: PanelHostFocusTarget): () => void {
    this.hosts.add(host);
    return () => this.hosts.delete(host);
  }

  claim(claimant: PanelHostFocusTarget): void {
    for (const host of this.hosts) {
      if (host !== claimant) host.blur();
    }
  }
}

export namespace PanelHostFocusSet {
  export const $Class = $PanelHostFocusSet;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface PanelHostFocusTarget {
  blur(): void;
}
