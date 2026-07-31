import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodeLens, type CodeLensPayload } from './CodeLens';

describe('CodeLens', () => {
  test('extracts a bounded span around a present line', () => {
    const span = CodeLens.Class.extractSpan(
      ['first', 'second', 'third', 'fourth', 'fifth'].join('\n'),
      'fixture.ts',
      3,
      1,
    );
    expect(span).toEqual({
      resolved: true,
      path: 'fixture.ts',
      line: 3,
      startLine: 2,
      endLine: 4,
      source: 'second\nthird\nfourth',
      language: 'typescript',
    });
  });

  test('returns an honest absent result for a missing file', () => {
    const scratchDirectory = mkdtempSync(
      join(tmpdir(), 'invariant-field-code-lens-missing-'),
    );
    try {
      const result = CodeLens.Class.readCurrentSource(
        scratchDirectory,
        'missing.ts',
      );
      expect(result).toEqual({
        resolved: false,
        reason: 'not-found',
        message: 'The cited file does not resolve in the repository.',
        path: 'missing.ts',
      });
    } finally {
      rmSync(scratchDirectory, { recursive: true });
    }
  });

  test('refuses lexical and symlink paths outside the repository', () => {
    const scratchDirectory = mkdtempSync(
      join(tmpdir(), 'invariant-field-code-lens-confined-'),
    );
    const outsideFile = join(
      tmpdir(),
      `invariant-field-code-lens-outside-${process.pid}.ts`,
    );
    writeFileSync(outsideFile, 'export const outside = true;\n');
    symlinkSync(outsideFile, join(scratchDirectory, 'outside-link.ts'));
    try {
      expect(
        CodeLens.Class.readCurrentSource(scratchDirectory, '../outside.ts'),
      ).toMatchObject({
        resolved: false,
        reason: 'outside-repository',
      });
      expect(
        CodeLens.Class.readCurrentSource(scratchDirectory, 'outside-link.ts'),
      ).toMatchObject({
        resolved: false,
        reason: 'outside-repository',
      });
    } finally {
      rmSync(scratchDirectory, { recursive: true });
      rmSync(outsideFile);
    }
  });

  test('makes the endpoint read-only and path-confined', async () => {
    const scratchDirectory = mkdtempSync(
      join(tmpdir(), 'invariant-field-code-lens-endpoint-'),
    );
    writeFileSync(
      join(scratchDirectory, 'fixture.ts'),
      'export const fixture = true;\n',
    );
    const options = {
      repositoryRoot: scratchDirectory,
      currentCommit: 'current',
      allowedCommits: new Set(['current']),
    };
    try {
      const outsideResponse = await CodeLens.Class.response(
        new Request('http://field.test/api/code?path=../outside.ts&line=1'),
        options,
      );
      expect(outsideResponse.status).toBe(403);
      expect(((await outsideResponse.json()) as CodeLensPayload).resolved).toBe(
        false,
      );

      const writeResponse = await CodeLens.Class.response(
        new Request('http://field.test/api/code?path=fixture.ts&line=1', {
          method: 'POST',
        }),
        options,
      );
      expect(writeResponse.status).toBe(405);
      expect(writeResponse.headers.get('allow')).toBe('GET');
    } finally {
      rmSync(scratchDirectory, { recursive: true });
    }
  });

  test('highlights TypeScript and Vue spans deterministically', async () => {
    const typescriptSpan = CodeLens.Class.extractSpan(
      'export const answer: number = 42;',
      'fixture.ts',
      1,
    );
    const vueSpan = CodeLens.Class.extractSpan(
      '<template><button>{{ answer }}</button></template>',
      'Fixture.vue',
      1,
    );
    const firstTypescriptOutput =
      await CodeLens.Class.highlight(typescriptSpan);
    const secondTypescriptOutput =
      await CodeLens.Class.highlight(typescriptSpan);
    const vueOutput = await CodeLens.Class.highlight(vueSpan);
    expect(secondTypescriptOutput).toBe(firstTypescriptOutput);
    expect(firstTypescriptOutput).toContain('code-lens-focus-line');
    expect(firstTypescriptOutput).toContain('color:');
    expect(vueOutput).toContain('code-lens-focus-line');
    expect(vueOutput).toContain('>template</span>');
  });
});
