import type { PanelContentFactory } from './PanelContentFactory.interface';
import type { PaneAddMenuEntry } from './PaneContent.interface';

// invariant: Seams are drawn at the shared generator (project.invariants.md)
// invariant: Plugin boundaries grant one authority (project.invariants.md)
class $PanelContentFactories {
  protected readonly factoriesByKind = new Map<string, PanelContentFactory>();

  register(factory: PanelContentFactory): () => void {
    const existingFactory = this.factoriesByKind.get(factory.kind);
    if (existingFactory && existingFactory !== factory) {
      throw new Error(
        `Panel content factory kind already belongs to another factory: ${factory.kind}`,
      );
    }
    this.factoriesByKind.set(factory.kind, factory);
    return () => {
      if (this.factoriesByKind.get(factory.kind) === factory) {
        this.factoriesByKind.delete(factory.kind);
      }
    };
  }

  factory(kind: string): PanelContentFactory | null {
    return this.factoriesByKind.get(kind) ?? null;
  }

  addableKinds(): readonly { kind: string; label: string }[] {
    return [...this.factoriesByKind.values()].map((factory) => ({
      kind: factory.kind,
      label: factory.instanceLabel,
    }));
  }

  paneAddMenuEntries(spaceKind: string): readonly PanelFactoryMenuEntry[] {
    return [...this.factoriesByKind.values()].flatMap((factory) =>
      (factory.paneAddMenuEntries ?? [])
        .filter((entry) => entry.spaceKind === spaceKind)
        .map((entry) => ({ factoryKind: factory.kind, entry })),
    );
  }

  paneAddMenuEntry(identifier: string): PanelFactoryMenuEntry | null {
    for (const factory of this.factoriesByKind.values()) {
      const entry = factory.paneAddMenuEntries?.find(
        (candidate) => candidate.identifier === identifier,
      );
      if (entry) return { factoryKind: factory.kind, entry };
    }
    return null;
  }
}

export namespace PanelContentFactories {
  export const $Class = $PanelContentFactories;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface PanelFactoryMenuEntry {
  readonly factoryKind: string;
  readonly entry: PaneAddMenuEntry;
}
