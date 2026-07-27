import { Static } from 'ivue/extras';
import type { ApplicationContributor } from '../app/ApplicationContributor.interface';
import { FileTreeContributor } from '../filetree/FileTreeContributor';
import { GitPlugin } from '../git/GitPlugin';
import { MarkdownPlugin } from '../markdown/MarkdownPlugin';
// prettier-ignore
import {
  InlineRewriteContributor,
} from '../inline-rewrite/InlineRewriteContributor';
import { ExtensionsPlugin } from './ExtensionsPlugin';

class $DefaultPlugins {
  static create(): ApplicationContributor[] {
    return [
      new FileTreeContributor.Class(),
      new GitPlugin.Class(),
      new MarkdownPlugin.Class(),
      new InlineRewriteContributor.Class(),
      new ExtensionsPlugin.Class(),
    ];
  }
}

export namespace DefaultPlugins {
  export const $Class = Static($DefaultPlugins);
  export const Class = $Class;
}
