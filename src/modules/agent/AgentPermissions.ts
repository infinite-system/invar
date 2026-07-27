import { Static } from 'ivue/extras';

// invariant: Seams are drawn at the shared generator (project.invariants.md)

class $AgentPermissions {
  /** Resolve a permission-mode option to a live boolean: a getter is read NOW, a plain boolean passes
   *  through, undefined → false. */
  static resolveLive(value: boolean | (() => boolean) | undefined): boolean {
    return typeof value === 'function' ? value() : Boolean(value);
  }
}

export namespace AgentPermissions {
  export const $Class = Static($AgentPermissions);
  export let Class = $Class;
}
