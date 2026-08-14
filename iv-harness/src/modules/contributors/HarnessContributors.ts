import { Static } from 'ivue/extras';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The contributor seam: a project extends the graph by dropping
 * `.invar/harness/<name>.harness.ts` files exporting a default
 * contributor — never by modifying core. The host graph is COMPLETE
 * without contributors; a contributor mounts ONE authority under its
 * own key and inherits ls/get/misses/did-you-mean/bounded-print for
 * free from the plain-object resolver. The contract surface is this
 * module's exported interface plus a version number; skew warns
 * loudly and skips, never guesses.
 */
// invariant: The harness graph never imports from the app (iv-harness/iv-harness.invariants.md)
// invariant: A wrapped script keeps its logic in one place (iv-harness/iv-harness.invariants.md)
class $HarnessContributors {
  static get CONTRACT_VERSION(): number {
    return 1;
  }

  static get CONTRIBUTORS_DIRECTORY_RELATIVE_PATH(): string {
    return '.invar/harness';
  }

  static contributorFiles(rootDirectory: string): string[] {
    const contributorsDirectory = join(
      rootDirectory,
      this.CONTRIBUTORS_DIRECTORY_RELATIVE_PATH,
    );
    if (!existsSync(contributorsDirectory)) return [];
    return readdirSync(contributorsDirectory)
      .filter((fileName) => fileName.endsWith('.harness.ts'))
      .sort()
      .map((fileName) => join(contributorsDirectory, fileName));
  }

  /**
   * Loads every contributor (dynamic import happens HERE, before graph
   * construction — the graph itself stays synchronous). Returns mounted
   * node builders plus loud per-file problems; a broken contributor
   * never breaks the host graph.
   */
  static async load(
    rootDirectory: string,
    reservedNames: readonly string[],
  ): Promise<ContributorLoadResult> {
    const mounted: Record<string, ContributedNodeBuilder> = {};
    const problems: string[] = [];
    for (const filePath of this.contributorFiles(rootDirectory)) {
      let loadedModule: { default?: unknown };
      try {
        loadedModule = await import(filePath);
      } catch (error) {
        problems.push(
          `${filePath}: failed to import — ${(error as Error).message}`,
        );
        continue;
      }
      const contributor = loadedModule.default as
        HarnessContributor | undefined;
      if (
        contributor === undefined ||
        typeof contributor.name !== 'string' ||
        typeof contributor.node !== 'function' ||
        typeof contributor.contractVersion !== 'number'
      ) {
        problems.push(
          `${filePath}: default export is not a contributor ` +
            '(needs name, contractVersion, node())',
        );
        continue;
      }
      if (contributor.contractVersion !== this.CONTRACT_VERSION) {
        problems.push(
          `${filePath}: contract version ${contributor.contractVersion} does not match ` +
            `host version ${this.CONTRACT_VERSION} — skipped, update the contributor`,
        );
        continue;
      }
      if (
        reservedNames.includes(contributor.name) ||
        contributor.name in mounted
      ) {
        problems.push(
          `${filePath}: name '${contributor.name}' collides with a core domain ` +
            'or another contributor — skipped',
        );
        continue;
      }
      mounted[contributor.name] = () => contributor.node({ rootDirectory });
    }
    return { mounted, problems };
  }
}

export namespace HarnessContributors {
  export const $Class = Static($HarnessContributors);
  export let Class = $Class;
}

/** THE contract surface — contributors depend on this and nothing else. */
export interface HarnessContributor {
  name: string;
  contractVersion: number;
  node(context: ContributorContext): unknown;
}

export interface ContributorContext {
  rootDirectory: string;
}

export type ContributedNodeBuilder = () => unknown;

export interface ContributorLoadResult {
  mounted: Record<string, ContributedNodeBuilder>;
  problems: string[];
}
