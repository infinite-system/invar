// The rendezvous between a structure SOURCE plugin and the structure PANE. Both are peer plugins;
// neither may name the other's concrete class, and the host's own provider registry
// (`Workspace.provider`, resolved from `WorkspaceContribution.providers`) is protected — host-only,
// closed to peer consumers. So the consumer module owns this registry: a source registers per
// workspace, the pane resolves per workspace, and either side can be uninstalled alone.
//
// Registration is REVERSIBLE by construction: `register` returns the disposer, the same shape every
// host registry uses, so a source plugin's uninstall withdraws its answer and the pane degrades to
// its stated empty affordance instead of holding a corpse.
//
// invariant: A structure source answers or declines, never blanks (src/modules/structure/structure.invariants.md)
// invariant: Plugin boundaries grant one authority (project.invariants.md)
import { Static } from 'ivue/extras';
import { ref, type Ref } from 'vue';
import type { StructureSource } from './StructureSource.interface';

class $StructureSources {
  /** Sources per workspace, registration order preserved. WeakMap so a dropped workspace frees
   *  its row without an unregister ceremony the workspace cannot perform. */
  protected static get $sourcesByWorkspace(): WeakMap<
    object,
    StructureSource[]
  > {
    return new WeakMap();
  }

  /** Bumped on every register/unregister so a reactive consumer (the pane) re-resolves when a
   *  source plugin is installed or uninstalled mid-session. */
  protected static get $revision(): Ref<number> {
    return ref(0);
  }

  static get revision(): Readonly<Ref<number>> {
    return this.$revision;
  }

  /** Register `source` for `workspace`. Returns the disposer that withdraws it. */
  static register(workspace: object, source: StructureSource): () => void {
    const sources = this.$sourcesByWorkspace.get(workspace) ?? [];
    sources.push(source);
    this.$sourcesByWorkspace.set(workspace, sources);
    this.$revision.value++;
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      const index = sources.indexOf(source);
      if (index >= 0) sources.splice(index, 1);
      this.$revision.value++;
    };
  }

  /** The source that answers for `workspace` — the most recently registered one, mirroring the
   *  last-wins scan of the host's own provider resolution. Null when none is installed. */
  static sourceFor(workspace: object): StructureSource | null {
    void this.revision.value;
    const sources = this.$sourcesByWorkspace.get(workspace);
    if (!sources || sources.length === 0) return null;
    return sources[sources.length - 1] ?? null;
  }
}

export namespace StructureSources {
  export const $Class = Static($StructureSources);
  export let Class = $Class;
}
