import { Static } from 'ivue/extras';
import type { ApplicationPlugin } from '../app/ApplicationPlugin.interface';
import { GitPlugin } from '../git/GitPlugin';

class $DefaultPlugins {
  static create(): ApplicationPlugin[] {
    return [new GitPlugin.Class()];
  }
}

export namespace DefaultPlugins {
  export const $Class = $DefaultPlugins;
  export const Class = Static($DefaultPlugins);
}
