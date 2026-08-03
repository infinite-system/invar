// Pane runtimes publish human-readable activity without knowing which contributed surface displays
// it. This registry is the one application seam between those sources and their live listeners.
class $SystemNoteContributions {
  protected readonly listeners = new Set<(note: string) => void>();

  register(listener: (note: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(note: string): void {
    for (const listener of this.listeners) listener(note);
  }
}

export namespace SystemNoteContributions {
  export const $Class = $SystemNoteContributions;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
