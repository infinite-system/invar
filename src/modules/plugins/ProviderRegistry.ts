import { Reactive } from 'ivue';
import { ref } from 'vue';

// invariant: Provider rendezvous is host carried (src/modules/plugins/plugins.invariants.md)
class $ProviderRegistry {
  protected readonly providersByIdentifier = new Map<string, unknown[]>();

  get revision() {
    return ref(0);
  }

  register<Provider>(identifier: string, provider: Provider): () => void {
    const providers = this.providersByIdentifier.get(identifier) ?? [];
    providers.push(provider);
    this.providersByIdentifier.set(identifier, providers);
    this.revision.value++;
    let registered = true;
    return (): void => {
      if (!registered) return;
      registered = false;
      const providerIndex = providers.indexOf(provider);
      if (providerIndex >= 0) providers.splice(providerIndex, 1);
      if (providers.length === 0) {
        this.providersByIdentifier.delete(identifier);
      }
      this.revision.value++;
    };
  }

  resolve<Provider>(identifier: string): Provider | null {
    void this.revision.value;
    const providers = this.providersByIdentifier.get(identifier);
    if (!providers || providers.length === 0) return null;
    return (providers[providers.length - 1] as Provider | undefined) ?? null;
  }

  /** Every registered provider for a capability, registration-ordered (oldest first). For a
   *  capability whose providers each answer a SUBSET of subjects (a per-file-type source), the
   *  consumer walks this list and picks the provider that answers — `resolve` alone would let the
   *  newest registration shadow a peer that still answers for other subjects. */
  resolveAll<Provider>(identifier: string): readonly Provider[] {
    void this.revision.value;
    const providers = this.providersByIdentifier.get(identifier);
    if (!providers || providers.length === 0) return [];
    return [...providers] as Provider[];
  }

  dispose(): void {
    if (this.providersByIdentifier.size === 0) return;
    this.providersByIdentifier.clear();
    this.revision.value++;
  }
}

export namespace ProviderRegistry {
  export const $Class = $ProviderRegistry;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
