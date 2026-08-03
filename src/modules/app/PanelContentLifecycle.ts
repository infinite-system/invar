import type { PaneContent } from '../ui/PaneContent.interface';

// Runtime consumers can bind to newly registered pane capabilities without the host naming either
// side. Registration is published only after PanelHost can resolve the content as current.
class $PanelContentLifecycle {
  protected readonly registeredListeners = new Set<
    (content: PaneContent) => void
  >();

  onRegistered(listener: (content: PaneContent) => void): () => void {
    this.registeredListeners.add(listener);
    return () => this.registeredListeners.delete(listener);
  }

  publishRegistered(content: PaneContent): void {
    for (const listener of this.registeredListeners) listener(content);
  }
}

export namespace PanelContentLifecycle {
  export const $Class = $PanelContentLifecycle;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
