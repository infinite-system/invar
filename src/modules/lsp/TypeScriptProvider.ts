import { Files } from '../system/Files';
import type {
  LanguageCapabilities,
  LanguageProvider,
  LanguageServerCommand,
} from './LanguageProvider';

class $TypeScriptProvider implements LanguageProvider {
  protected static get $typescriptExtensions(): ReadonlySet<string> {
    const typescriptExtensions = new Set([
      '.ts',
      '.tsx',
      '.mts',
      '.cts',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
    ]);
    Object.defineProperty(this, '$typescriptExtensions', {
      configurable: true,
      value: typescriptExtensions,
    });
    return typescriptExtensions;
  }

  /** The two supported TypeScript servers keyed by `typescriptServer` setting value. `tsgo` is the
   *  native `@typescript/native-preview` build — invoked with BOTH double-dash flags (`--lsp --stdio`). */
  protected static get $serverCandidates(): Readonly<
    Record<string, ServerCandidate>
  > {
    const serverCandidates: Readonly<Record<string, ServerCandidate>> = {
      tsgo: { command: 'tsgo', args: ['--lsp', '--stdio'] },
      'typescript-language-server': {
        command: 'typescript-language-server',
        args: ['--stdio'],
      },
    };
    Object.defineProperty(this, '$serverCandidates', {
      configurable: true,
      value: serverCandidates,
    });
    return serverCandidates;
  }

  /** Default preference order — tsgo primary, typescript-language-server fallback. */
  protected static get $defaultOrder(): readonly string[] {
    const defaultOrder = ['tsgo', 'typescript-language-server'];
    Object.defineProperty(this, '$defaultOrder', {
      configurable: true,
      value: defaultOrder,
    });
    return defaultOrder;
  }

  readonly id = 'typescript';
  readonly capabilities: LanguageCapabilities = {
    diagnostics: true,
    definition: true,
    hover: true,
    references: true,
  };

  constructor(protected readonly options: TypeScriptProviderOptions = {}) {}

  protected get Files() {
    return Files.Class;
  }

  supportsPath(path: string): boolean {
    const providerClass = this.constructor as typeof $TypeScriptProvider;
    return providerClass.$typescriptExtensions.has(
      this.Files.extname(path).toLowerCase(),
    );
  }

  async resolve(rootPath: string): Promise<LanguageServerCommand | null> {
    const providerClass = this.constructor as typeof $TypeScriptProvider;
    for (const server of this.candidateOrder()) {
      const candidate = providerClass.$serverCandidates[server];
      if (!candidate) continue;
      const command = this.findExecutable(candidate.command, rootPath);
      if (command) return { command, args: candidate.args };
    }
    return null;
  }

  /** Resolution order: the chosen server FIRST, then the other supported server as a graceful fallback
   *  (so a chosen-but-uninstalled server never disables LSP). Defaults to tsgo-primary when unset. */
  protected candidateOrder(): readonly string[] {
    const providerClass = this.constructor as typeof $TypeScriptProvider;
    const preferred = this.options.preferredServer?.() ?? 'tsgo';
    if (!providerClass.$serverCandidates[preferred]) {
      return providerClass.$defaultOrder;
    }
    return [
      preferred,
      ...providerClass.$defaultOrder.filter((server) => server !== preferred),
    ];
  }

  protected findExecutable(command: string, rootPath: string): string | null {
    const local = this.Files.join(rootPath, 'node_modules', '.bin', command);
    if (this.Files.exists(local)) return local;
    try {
      return Bun.which(command);
    } catch {
      return null;
    }
  }
}

export namespace TypeScriptProvider {
  export const $Class = $TypeScriptProvider;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface TypeScriptProviderOptions {
  /** Late-read of the `typescriptServer` setting — the server to prefer ('tsgo' by default). */
  preferredServer?: () => string;
}

interface ServerCandidate {
  command: string;
  args: readonly string[];
}
