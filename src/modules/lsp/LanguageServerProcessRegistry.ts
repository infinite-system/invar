import { Static } from 'ivue/extras';

// invariant: Monitored server identity comes from its owner (src/modules/lsp/lsp.invariants.md)
class $LanguageServerProcessRegistry {
  protected static get $registrations(): Map<
    object,
    LanguageServerProcessRegistration
  > {
    return new Map();
  }

  static register(
    owner: object,
    registration: LanguageServerProcessRegistration,
  ): void {
    this.$registrations.set(owner, Object.freeze({ ...registration }));
  }

  static unregister(owner: object): void {
    this.$registrations.delete(owner);
  }

  static entries(): readonly LanguageServerProcessRegistration[] {
    return [...this.$registrations.values()];
  }

  static entry(owner: object): LanguageServerProcessRegistration | null {
    return this.$registrations.get(owner) ?? null;
  }

  static reset(): void {
    this.$registrations.clear();
  }
}

export namespace LanguageServerProcessRegistry {
  export const $Class = Static($LanguageServerProcessRegistry);
  export let Class = $Class;
}

export interface LanguageServerProcessRegistration {
  readonly serverName: string;
  readonly processId: number;
}
