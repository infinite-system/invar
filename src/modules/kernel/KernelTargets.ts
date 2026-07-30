import { Static } from 'ivue/extras';
import { App } from '../app/App';
import { Kernel, type KernelClass } from './Kernel';

class $KernelTargets {
  static register(): void {
    Kernel.Class.instance.defineClass(
      'invar/app/App',
      App.$Class as KernelClass,
      (selectedClass) => {
        App.Class = selectedClass as typeof App.Class;
      },
    );
  }
}

export namespace KernelTargets {
  export const $Class = Static($KernelTargets);
  export let Class = $Class;
}
