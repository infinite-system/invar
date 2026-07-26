import { Static } from 'ivue/extras';
import type { ApplicationContributor } from '../app/ApplicationContributor.interface';
import { FileTreeContributor } from '../filetree/FileTreeContributor';
import { GitPlugin } from '../git/GitPlugin';
import { MarkdownPlugin } from '../markdown/MarkdownPlugin';
import { ExtensionsPlugin } from './ExtensionsPlugin';

class $DefaultPlugins {
  static create(): ApplicationContributor[] {
    return [
      new FileTreeContributor.Class(),
      new GitPlugin.Class(),
      new MarkdownPlugin.Class(),
      new ExtensionsPlugin.Class(),
    ];
  }
}

export namespace DefaultPlugins {
  export const $Class = $DefaultPlugins;
  export const Class = Static($DefaultPlugins);
}
