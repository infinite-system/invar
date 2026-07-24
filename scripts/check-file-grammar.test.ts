import { describe, expect, test } from 'bun:test';
import {
  inspectFileGrammar,
  type FileGrammarInput,
  type FileGrammarRule,
} from './check-file-grammar';

function validClassFile(className: string, classBody = ''): string {
  return `
class $${className} {
${classBody}
}

export namespace ${className} {
  export const $Class = $${className};
  export const Class = $${className};
}

export interface ${className}Options {
  enabled: boolean;
}
`;
}

function expectRule(
  files: readonly FileGrammarInput[],
  expectedRule: FileGrammarRule,
): void {
  const violations = inspectFileGrammar(files);
  expect(violations.map((violation) => violation.rule)).toContain(expectedRule);
}

describe('file grammar failure paths', () => {
  test('rejects a class file without its eponymous raw class', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/example/Example.ts',
          sourceText: 'export type Value = string;',
        },
      ],
      'eponymous-class',
    );
  });

  test('rejects a contract file without its eponymous interface', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/agent/AgentEvents.ts',
          sourceText: 'export type AgentEvent = { kind: string };',
        },
      ],
      'eponymous-interface',
    );
  });

  test('rejects declarations before the eponymous class', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/example/Example.ts',
          sourceText: `enum Mode { Ready }\n${validClassFile('Example')}`,
        },
      ],
      'class-file-order',
    );
  });

  test('rejects declarations before the eponymous contract interface', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/lsp/LanguageProvider.ts',
          sourceText: `
enum ProviderMode { Ready }
export interface LanguageProvider {
  id: string;
}
`,
        },
      ],
      'contract-interface-order',
    );
  });

  test('rejects supporting types above the eponymous declaration', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/example/Example.ts',
          sourceText: `export type Value = string;\n${validClassFile('Example')}`,
        },
      ],
      'type-before-eponymous',
    );
  });

  test('rejects module-level function declarations', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/example/Example.ts',
          sourceText: `${validClassFile('Example')}\nfunction detachedBehavior(): void {}`,
        },
      ],
      'module-function',
    );
  });

  test('rejects module-level variable statements', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/example/Example.ts',
          sourceText: `${validClassFile('Example')}\nconst detachedData = 1;`,
        },
      ],
      'module-variable',
    );
  });

  test('rejects private modifiers', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/example/Example.ts',
          sourceText: validClassFile('Example', '  private hidden(): void {}'),
        },
      ],
      'private-modifier',
    );
  });

  test('rejects hash-private members', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/example/Example.ts',
          sourceText: validClassFile('Example', '  #hidden = 1;'),
        },
      ],
      'hash-private-field',
    );
  });

  test('rejects arrow-function class fields', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/example/Example.ts',
          sourceText: validClassFile('Example', '  protected run = () => 1;'),
        },
      ],
      'arrow-function-class-field',
    );
  });

  test('rejects a namespace manifest that bypasses the raw class', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/example/Example.ts',
          sourceText: `
class $Example {}
class $Replacement {}
export namespace Example {
  export const $Class = $Example;
  export const Class = $Replacement;
}
`,
        },
      ],
      'namespace-manifest',
    );
  });

  test('rejects raw constructor use that bypasses the selected Class seam', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/example/Example.ts',
          sourceText: validClassFile(
            'Example',
            '  protected create(): object { return new Example.$Class(); }',
          ),
        },
      ],
      'construction-bypass',
    );
  });

  test('rejects test files under __tests__ directories', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/example/__tests__/Example.test.ts',
          sourceText: `import { test } from 'bun:test';\ntest('example', () => {});`,
        },
      ],
      'test-colocation',
    );
  });

  test('rejects an eponymous class without its colocated test pair', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/example/Example.ts',
          sourceText: validClassFile('Example'),
        },
      ],
      'missing-colocated-test',
    );
  });
});

test('accepts the complete class grammar and colocated pair', () => {
  const violations = inspectFileGrammar([
    {
      fileName: 'src/modules/example/Example.ts',
      sourceText: validClassFile(
        'Example',
        '  protected run(): number { return 1; }',
      ),
    },
    {
      fileName: 'src/modules/example/Example.test.ts',
      sourceText: `import { test } from 'bun:test';\ntest('example', () => {});`,
    },
  ]);
  expect(violations).toEqual([]);
});

test('accepts an eponymous contract interface without a test pair', () => {
  const violations = inspectFileGrammar([
    {
      fileName: 'src/modules/agent/AgentBackend.ts',
      sourceText: `
export interface AgentBackend {
  send(prompt: string): void;
}

export type AgentBackendFactory = () => AgentBackend;
`,
    },
  ]);
  expect(violations).toEqual([]);
});
