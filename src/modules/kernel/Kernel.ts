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
  protected targets = new Map<string, KernelTarget>();
  protected extensions: KernelExtension[] = [];
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

  defineClass(
    identifier: string,
    baseClass: KernelClass,
    publish: (selectedClass: KernelClass) => void,
  ): void {
    if (this.sealed) {
      throw new Error('Kernel.defineClass: cannot define after seal');
    }
    const existing = this.targets.get(identifier);
    if (existing) {
      if (existing.baseClass !== baseClass) {
        throw new Error(`Kernel.defineClass: duplicate target ${identifier}`);
      }
      return;
    }
    this.targets.set(identifier, { identifier, baseClass, publish });
  }

  extend(
    pluginIdentity: string,
    targetIdentifier: string,
    factory: KernelExtensionFactory,
  ): void {
    if (this.sealed) {
      throw new Error('Kernel.extend: cannot register after seal');
    }
    if (!this.targets.has(targetIdentifier)) {
      throw new Error(`Kernel.extend: unpublished target ${targetIdentifier}`);
    }
    this.extensions.push({ pluginIdentity, targetIdentifier, factory });
  }

  registeredExtensions(): readonly KernelExtensionRegistration[] {
    return this.extensions.map(({ pluginIdentity, targetIdentifier }) => ({
      pluginIdentity,
      targetIdentifier,
    }));
  }

  get isSealed(): boolean {
    return this.sealed;
  }

  /** Run every composition hook once, then freeze. Constructing App before this throws. */
  seal(): void {
    if (this.sealed) return;
    for (const target of this.targets.values()) {
      let selectedClass = target.baseClass;
      for (const extension of this.extensions) {
        if (extension.targetIdentifier !== target.identifier) continue;
        selectedClass = extension.factory(selectedClass);
        if (typeof selectedClass !== 'function') {
          throw new Error(
            `Kernel extension ${extension.pluginIdentity} returned no class for ${target.identifier}`,
          );
        }
      }
      target.publish(selectedClass);
    }
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

  reset(): void {
    for (const target of this.targets.values()) {
      target.publish(target.baseClass);
    }
    this.hooks = [];
    this.extensions = [];
    this.sealed = false;
  }
}

export namespace Kernel {
  export const $Class = Static($Kernel);
  export let Class = $Class;
}

export type SealHook = () => void;
export type KernelClass = abstract new (...arguments_: never[]) => unknown;
export type KernelExtensionFactory = (baseClass: KernelClass) => KernelClass;
export interface KernelExtensionRegistration {
  readonly pluginIdentity: string;
  readonly targetIdentifier: string;
}
interface KernelExtension extends KernelExtensionRegistration {
  readonly factory: KernelExtensionFactory;
}
interface KernelTarget {
  readonly identifier: string;
  readonly baseClass: KernelClass;
  readonly publish: (selectedClass: KernelClass) => void;
}
