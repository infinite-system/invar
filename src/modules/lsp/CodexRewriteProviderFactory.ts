import { Static } from 'ivue/extras';
import type {
  RewriteProvider,
  RewriteProviderFactory,
} from '../inline-rewrite/RewriteProvider.interface';
import { CodexRewriteProvider } from './CodexRewriteProvider';

class $CodexRewriteProviderFactory {
  static get available(): boolean {
    const provider = this.create();
    const available = provider.available;
    provider.dispose();
    return available;
  }

  static create(): RewriteProvider {
    return new CodexRewriteProvider.Class();
  }
}

export namespace CodexRewriteProviderFactory {
  export const $Class = Static($CodexRewriteProviderFactory);
  export let Class: typeof $Class & RewriteProviderFactory = $Class;
}
