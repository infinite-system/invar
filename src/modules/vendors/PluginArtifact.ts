import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Static } from 'ivue/extras';

class $PluginArtifact {
  static digest(root: string): string {
    return this.digestFiles(root, new Set());
  }

  static digestWithoutAdmission(root: string): string {
    return this.digestFiles(root, new Set(['invar.admission.json']));
  }

  protected static digestFiles(
    root: string,
    excludedNames: ReadonlySet<string>,
  ): string {
    const hash = createHash('sha256');
    for (const path of this.files(root, excludedNames)) {
      const relativePath = relative(root, path).replaceAll('\\', '/');
      hash.update(relativePath);
      hash.update('\0');
      hash.update(readFileSync(path));
      hash.update('\0');
    }
    return hash.digest('hex');
  }

  protected static files(
    root: string,
    excludedNames: ReadonlySet<string>,
  ): string[] {
    const files: string[] = [];
    const visit = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
        (first, second) => first.name.localeCompare(second.name),
      )) {
        if (excludedNames.has(entry.name)) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.isFile()) files.push(path);
      }
    };
    visit(root);
    return files;
  }
}

export namespace PluginArtifact {
  export const $Class = Static($PluginArtifact);
  export let Class = $Class;
}
