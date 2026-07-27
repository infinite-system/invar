import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
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

function validStaticClassFile(className: string): string {
  return `
class $${className} {
  static run(): void {}
}

export namespace ${className} {
  export const $Class = Static($${className});
  export const Class = $Class;
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

function runCheckerFixture(
  moduleName: string,
  fixture: { fileName: string; sourceText: string } = {
    fileName: 'Example.ts',
    sourceText: `${validClassFile('Example')}\nconst detachedData = 1;\n`,
  },
): {
  exitCode: number;
  combinedOutput: string;
} {
  const fixtureRoot = mkdtempSync(
    resolve(tmpdir(), 'invar-file-grammar-ratchet-'),
  );
  const fixtureModuleDirectory = resolve(
    fixtureRoot,
    'src',
    'modules',
    moduleName,
  );
  mkdirSync(fixtureModuleDirectory, { recursive: true });
  writeFileSync(
    resolve(fixtureModuleDirectory, fixture.fileName),
    fixture.sourceText,
  );
  writeFileSync(
    resolve(fixtureModuleDirectory, 'Example.test.ts'),
    `import { test } from 'bun:test';\ntest('example', () => {});\n`,
  );

  try {
    const checkerProcess = Bun.spawnSync({
      cmd: [
        process.execPath,
        resolve(import.meta.dir, 'check-file-grammar.ts'),
      ],
      cwd: fixtureRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return {
      exitCode: checkerProcess.exitCode,
      combinedOutput:
        checkerProcess.stdout.toString() + checkerProcess.stderr.toString(),
    };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

describe('file grammar failure paths', () => {
  test('rejects a class file without its eponymous raw class', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/example/Example.ts',
          sourceText: 'export const value = "example";',
        },
      ],
      'eponymous-class',
    );
  });

  test('rejects a contract file without its eponymous interface', () => {
    expectRule(
      [
        {
          fileName: 'src/modules/agent/AgentEvents.interface.ts',
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
          fileName: 'src/modules/lsp/LanguageProvider.interface.ts',
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

  test('rejects classes and detached functions in contract-interface files', () => {
    const violations = inspectFileGrammar([
      {
        fileName: 'src/modules/example/Example.interface.ts',
        sourceText: `
export interface Example {
  value: string;
}

class ExampleImplementation {}
function createExample(): Example {
  return { value: 'example' };
}
`,
      },
    ]);

    expect(
      violations.filter(
        (violation) => violation.rule === 'contract-interface-content',
      ),
    ).toHaveLength(2);
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

  test('accepts a Static-wrapped immutable class anchor', () => {
    const violations = inspectFileGrammar([
      {
        fileName: 'src/modules/example/Example.ts',
        sourceText: validStaticClassFile('Example'),
      },
      {
        fileName: 'src/modules/example/Example.test.ts',
        sourceText:
          "import { test } from 'bun:test';\ntest('example', () => {});\n",
      },
    ]);

    expect(violations).toEqual([]);
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
      fileName: 'src/modules/agent/AgentBackend.interface.ts',
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

test('suggests the interface naming convention for a legacy type-only contract', () => {
  const violations = inspectFileGrammar([
    {
      fileName: 'src/modules/example/Example.ts',
      sourceText: `
export interface Example {
  value: string;
}
`,
    },
  ]);

  expect(violations).toEqual([
    expect.objectContaining({
      rule: 'contract-interface-file-name',
      message: expect.stringContaining('Example.interface.ts'),
    }),
  ]);
});

describe('converted-module enforcement ratchet', () => {
  test('a violation in the converted syntax module fails', () => {
    const checkerResult = runCheckerFixture('syntax');

    expect(checkerResult.exitCode).toBe(1);
    expect(checkerResult.combinedOutput).toContain('syntax\tenforced\t1');
    expect(checkerResult.combinedOutput).toContain(
      '[module-variable] module-level data or behavior must live on the eponymous class',
    );
  });

  test('the same violation in an unconverted module is reported without failing', () => {
    const checkerResult = runCheckerFixture('diagnostics');

    expect(checkerResult.exitCode).toBe(0);
    expect(checkerResult.combinedOutput).toContain('diagnostics\treported\t1');
    expect(checkerResult.combinedOutput).toContain('check-file-grammar: PASS');
  });

  test('contract-interface shape violations are enforced in every module', () => {
    const checkerResult = runCheckerFixture('app', {
      fileName: 'Example.interface.ts',
      sourceText: `
export interface Example {
  value: string;
}
function createExample(): Example {
  return { value: 'example' };
}
`,
    });

    expect(checkerResult.exitCode).toBe(1);
    expect(checkerResult.combinedOutput).toContain('app\tenforced\t1');
    expect(checkerResult.combinedOutput).toContain(
      '[contract-interface-content] *.interface.ts files may declare interfaces and type aliases, never classes or detached functions',
    );
  });

  test('legacy contract filename suggestions remain report-only in converted modules', () => {
    const checkerResult = runCheckerFixture('lsp', {
      fileName: 'Example.ts',
      sourceText: `
export interface Example {
  value: string;
}
`,
    });

    expect(checkerResult.exitCode).toBe(0);
    expect(checkerResult.combinedOutput).toContain('lsp\treported\t1');
    expect(checkerResult.combinedOutput).toContain(
      'suggestion: type-only contract file should be named Example.interface.ts',
    );
    expect(checkerResult.combinedOutput).toContain('check-file-grammar: PASS');
  });
});
