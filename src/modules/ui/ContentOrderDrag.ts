import type { PanelHost } from './PanelHost';

// invariant: Seams are drawn at the shared generator (project.invariants.md)
class $ContentOrderDrag {
  protected draggingIdentifier: string | null = null;

  constructor(protected readonly panelHost: PanelHost.Instance) {}

  pointerDown(identifier: string): void {
    this.draggingIdentifier = identifier;
  }

  pointerDrag(targetIndex: number): boolean {
    if (this.draggingIdentifier === null) return false;
    this.panelHost.moveContentTo(this.draggingIdentifier, targetIndex);
    return true;
  }

  pointerUp(): void {
    this.draggingIdentifier = null;
  }
}

export namespace ContentOrderDrag {
  export const $Class = $ContentOrderDrag;
  export let Class = $ContentOrderDrag;
  export type Model = InstanceType<typeof Class>;
}
