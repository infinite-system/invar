import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TypeScriptProvider } from './TypeScriptProvider';

class ResolvedTypeScriptProvider extends TypeScriptProvider.$Class {
  readonly executableLookups: string[] = [];

  protected override findExecutable(
    command: string,
    _rootPath: string,
  ): string | null {
    this.executableLookups.push(command);
    return `/tools/${command}`;
  }
}

class ApplicationToolTypeScriptProvider extends TypeScriptProvider.$Class {
  constructor(protected readonly configuredApplicationRootPath: string) {
    super();
  }

  protected override applicationRootPath(): string {
    return this.configuredApplicationRootPath;
  }
}

test('the preferred TypeScript server resolves before its fallback', async () => {
  const provider = new ResolvedTypeScriptProvider({
    preferredServer: () => 'typescript-language-server',
  });

  expect(await provider.resolve('/workspace')).toEqual({
    command: '/tools/typescript-language-server',
    args: ['--stdio'],
  });
  expect(provider.executableLookups).toEqual(['typescript-language-server']);
});

test('supported paths use the TypeScript and JavaScript extension set', () => {
  const provider = new TypeScriptProvider.Class();

  expect(provider.supportsPath('/workspace/component.TSX')).toBe(true);
  expect(provider.supportsPath('/workspace/readme.md')).toBe(false);
});

test('an external workspace resolves the TypeScript server from the application root', async () => {
  const fixtureRootPath = mkdtempSync(
    join(tmpdir(), 'invar-typescript-provider-'),
  );
  const applicationRootPath = join(fixtureRootPath, 'application');
  const workspaceRootPath = join(fixtureRootPath, 'external-workspace');
  const applicationExecutablePath = join(
    applicationRootPath,
    'node_modules',
    '.bin',
    'tsgo',
  );
  mkdirSync(join(applicationRootPath, 'node_modules', '.bin'), {
    recursive: true,
  });
  mkdirSync(workspaceRootPath);
  writeFileSync(applicationExecutablePath, '');

  try {
    const provider = new ApplicationToolTypeScriptProvider(applicationRootPath);
    expect(await provider.resolve(workspaceRootPath)).toEqual({
      command: applicationExecutablePath,
      args: ['--lsp', '--stdio'],
    });

    const workspaceExecutablePath = join(
      workspaceRootPath,
      'node_modules',
      '.bin',
      'tsgo',
    );
    mkdirSync(join(workspaceRootPath, 'node_modules', '.bin'), {
      recursive: true,
    });
    writeFileSync(workspaceExecutablePath, '');
    expect(await provider.resolve(workspaceRootPath)).toEqual({
      command: workspaceExecutablePath,
      args: ['--lsp', '--stdio'],
    });
  } finally {
    rmSync(fixtureRootPath, { recursive: true, force: true });
  }
});
