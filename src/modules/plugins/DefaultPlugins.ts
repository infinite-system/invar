import { Static } from 'ivue/extras';
import type { ApplicationPlugin } from '../app/ApplicationPlugin.interface';
import { GitPlugin } from '../git/GitPlugin';
import { ExtensionsPlugin } from './ExtensionsPlugin';

class $DefaultPlugins {
  static create(): ApplicationPlugin[] {
    return [new GitPlugin.Class(), new ExtensionsPlugin.Class()];
  }
}

export namespace DefaultPlugins {
  export const $Class = $DefaultPlugins;
  export const Class = Static($DefaultPlugins);
}
