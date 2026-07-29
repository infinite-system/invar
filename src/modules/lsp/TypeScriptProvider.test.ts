import { expect, test } from 'bun:test';
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
