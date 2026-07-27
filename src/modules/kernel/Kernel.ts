import { Static } from 'ivue/extras';
import { Logging } from '../system/Logging';

// The kernel composes module implementations (via the namespace Class slots) and SEALS
// before any application instance is constructed. In M1 there are no plugins yet, so the
// kernel simply enforces the ordering guarantee; M7 fills in contribution composition.
// invariant: The app is built only after the kernel is sealed (project.invariants.md)
// invariant: Construction goes through overridable seams (project.invariants.md)
class $Kernel {
  protected static singleton: $Kernel | undefined;
  protected hooks: SealHook[] = [];
  protected sealed = false;

  static get instance(): $Kernel {
    return (this.singleton ??= new this());
  }

  /** Register a composition hook to run at seal time (plugins, class replacement). */
  register(hook: SealHook): void {
    if (this.sealed) {
      throw new Error('Kernel.register: cannot register after seal');
    }
    this.hooks.push(hook);
  }

  get isSealed(): boolean {
    return this.sealed;
  }

  /** Run every composition hook once, then freeze. Constructing App before this throws. */
  seal(): void {
    if (this.sealed) return;
    for (const hook of this.hooks) hook();
    this.sealed = true;
    Logging.Class.info(`Kernel sealed (${this.hooks.length} hooks)`);
  }

  /** Guard called by App construction to prove the kernel was sealed first. */
  assertSealed(): void {
    if (!this.sealed) {
      throw new Error('The app is built only after the kernel is sealed');
    }
  }
}

export namespace Kernel {
  export const $Class = Static($Kernel);
  export let Class = $Class;
}

export type SealHook = () => void;
