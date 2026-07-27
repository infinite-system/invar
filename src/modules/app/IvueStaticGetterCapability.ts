import { Static } from 'ivue/extras';

// invariant: Boot checks ivue static getter caching (app.invariants.md)
class $IvueStaticGetterCapability {
  static assertAvailable(): void {
    if (process.env.INVAR_SKIP_CAPABILITY_CHECK === '1') return;
    if (this.cachesStaticGetters()) return;

    throw new Error(
      'ivue Static() is not caching $-getters. Every cached table in this ' +
        'app would recompute on\nevery read. Your node_modules is out of ' +
        'date with package.json — run: bun install\n' +
        'To bypass this check, set: INVAR_SKIP_CAPABILITY_CHECK=1',
    );
  }

  protected static cachesStaticGetters(): boolean {
    class $Canary {}
    Object.defineProperty($Canary, '$TABLE', {
      configurable: true,
      get: (): readonly number[] => [1, 2, 3],
    });
    const Canary = Static($Canary) as typeof $Canary & {
      readonly $TABLE: readonly number[];
    };
    return Canary.$TABLE === Canary.$TABLE;
  }
}

export namespace IvueStaticGetterCapability {
  export const $Class = Static($IvueStaticGetterCapability);
  export let Class = $Class;
}
