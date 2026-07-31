import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { BunPlugin } from 'bun';
import { Static } from 'ivue/extras';
import { compileScript, parse } from '@vue/compiler-sfc';

class $VueSingleFileComponentPlugin {
  static create(): BunPlugin {
    const singleFileComponentPluginClass = this;
    return {
      name: 'invariant-field-vue-single-file-components',
      setup(build) {
        build.onLoad({ filter: /\.vue$/ }, async ({ path }) => ({
          contents: singleFileComponentPluginClass.compile(
            path,
            await readFile(path, 'utf8'),
          ),
          loader: 'ts',
        }));
      },
    };
  }

  static compile(path: string, source: string): string {
    const parseResult = parse(source, { filename: path });
    if (parseResult.errors.length > 0) {
      throw new Error(
        `Cannot compile ${path}: ${parseResult.errors.map(String).join('\n')}`,
      );
    }
    if (!parseResult.descriptor.scriptSetup) {
      throw new Error(`${path} must use script setup.`);
    }
    if (!parseResult.descriptor.template) {
      throw new Error(`${path} must contain one template.`);
    }
    const componentIdentifier = createHash('sha256')
      .update(path)
      .digest('hex')
      .slice(0, 8);
    return compileScript(parseResult.descriptor, {
      id: componentIdentifier,
      inlineTemplate: true,
      fs: {
        fileExists: existsSync,
        readFile: (filePath) => readFileSync(filePath, 'utf8'),
      },
    }).content;
  }
}

export namespace VueSingleFileComponentPlugin {
  export const $Class = Static($VueSingleFileComponentPlugin);
  export let Class = $Class;
}
