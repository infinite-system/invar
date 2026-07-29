import type { Ref } from 'vue';
import type { PaneContent } from './PaneContent.interface';
import type { PanelHost } from './PanelHost';

// invariant: The active activity item determines its dock content (src/modules/ui/ui.invariants.md)
// invariant: Activity bar order is one persisted sequence (src/modules/ui/ui.invariants.md)
class $ActivitySurface {
  constructor(protected readonly options: ActivitySurfaceOptions) {}

  get orderedContents(): PaneContent[] {
    const contentsByIdentifier = new Map<string, PaneContent>();
    for (const host of this.options.hosts) {
      for (const content of host.orderedContents) {
        contentsByIdentifier.set(content.id, content);
      }
    }
    return this.options.contentOrder.value
      .map((identifier) => contentsByIdentifier.get(identifier))
      .filter((content): content is PaneContent => content !== undefined);
  }

  get activeIdentifier(): string | null {
    const focusedHost = this.options.hosts.find(
      (host) => host.focused.value && host.visible.value,
    );
    if (focusedHost) return focusedHost.activeId.value;
    const visibleHost = this.options.hosts.find(
      (host) => host.visible.value && host.activeContent !== null,
    );
    return visibleHost?.activeId.value ?? null;
  }

  hostFor(identifier: string): PanelHost.Instance | null {
    return this.options.hosts.find((host) => host.has(identifier)) ?? null;
  }

  toggleContent(identifier: string): 'shown' | 'hidden' | 'missing' {
    const host = this.hostFor(identifier);
    if (!host) return 'missing';
    if (host.isContentVisible(identifier)) {
      host.hide();
      return 'hidden';
    }
    host.revealContent(identifier);
    host.focus();
    return 'shown';
  }

  moveContentTo(identifier: string, targetIndex: number): void {
    const registeredContents = this.orderedContents;
    const sourceIndex = registeredContents.findIndex(
      (content) => content.id === identifier,
    );
    const clampedTargetIndex = Math.max(
      0,
      Math.min(targetIndex, registeredContents.length - 1),
    );
    if (sourceIndex < 0 || sourceIndex === clampedTargetIndex) return;
    const targetIdentifier = registeredContents[clampedTargetIndex]?.id ?? null;
    if (targetIdentifier === null) return;
    const nextOrder = [...this.options.contentOrder.value];
    const sourceOrderIndex = nextOrder.indexOf(identifier);
    const targetOrderIndex = nextOrder.indexOf(targetIdentifier);
    if (sourceOrderIndex < 0 || targetOrderIndex < 0) return;
    nextOrder.splice(sourceOrderIndex, 1);
    nextOrder.splice(targetOrderIndex, 0, identifier);
    this.options.contentOrder.value = nextOrder;
    this.options.persistContentOrder();
  }

  moveContent(identifier: string, direction: -1 | 1): void {
    const sourceIndex = this.orderedContents.findIndex(
      (content) => content.id === identifier,
    );
    if (sourceIndex < 0) return;
    this.moveContentTo(identifier, sourceIndex + direction);
  }
}

export namespace ActivitySurface {
  export const $Class = $ActivitySurface;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface ActivitySurfaceOptions {
  hosts: readonly PanelHost.Instance[];
  contentOrder: Ref<string[]>;
  persistContentOrder: () => void;
}
