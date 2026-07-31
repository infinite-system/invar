import { Static } from 'ivue/extras';

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
