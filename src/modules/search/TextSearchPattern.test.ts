import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextSearchPattern } from './TextSearchPattern';

function pattern(
  text: string,
  options: {
    caseSensitive?: boolean;
    wholeWord?: boolean;
    useRegex?: boolean;
  } = {},
): TextSearchPattern.Instance {
  return new TextSearchPattern.Class({
    text,
    caseSensitive: options.caseSensitive ?? false,
    wholeWord: options.wholeWord ?? false,
    useRegex: options.useRegex ?? false,
  });
}

describe('TextSearchPattern', () => {
  test('literal, case, whole-word, regular-expression, and grapheme spans share one matcher', () => {
    expect(pattern('a.b').matchesInText('😀 a.b aXb')).toMatchObject([
      { line: 0, startColumn: 2, endColumn: 5, matchedText: 'a.b' },
    ]);
    expect(
      pattern('foo', { caseSensitive: true }).matchesInText('Foo foo'),
    ).toHaveLength(1);
    expect(
      pattern('foo', { wholeWord: true }).matchesInText('foo food'),
    ).toHaveLength(1);
    expect(
      pattern('(?<name>[a-z]+)=(\\d+)', { useRegex: true }).matchesInText(
        'left=12',
      ),
    ).toMatchObject([
      {
        matchedText: 'left=12',
        capturedTexts: ['left', '12'],
        namedCapturedTexts: { name: 'left' },
      },
    ]);
  });

  test('replacement expansion supports the shared JavaScript substitution forms', () => {
    const textSearchPattern = pattern('(?<name>[a-z]+)=(\\d+)', {
      useRegex: true,
    });
    const match = textSearchPattern.matchesInText('before left=12 after')[0];
    expect(match).toBeDefined();
    expect(
      match &&
        textSearchPattern.expandReplacement(
          "$$|$&|$1|$2|$<name>|$`|$'|$99",
          match,
        ),
    ).toBe('$|left=12|left|12|left|before | after|$99');
  });

  test('empty, invalid, multiline, look-around, and backreference queries are rejected', () => {
    expect(pattern('').valid).toBe(false);
    expect(pattern('[', { useRegex: true }).valid).toBe(false);
    expect(pattern('a\nb', { useRegex: true }).error).toContain('single-line');
    expect(pattern('a\\nb', { useRegex: true }).error).toContain('single-line');
    expect(pattern('a(?=b)', { useRegex: true }).error).toContain(
      'Look-around',
    );
    expect(pattern('(a)\\1', { useRegex: true }).error).toContain(
      'Backreferences',
    );
  });

  test('zero-width matches advance by a Unicode code point and terminate', () => {
    const matches = pattern('(?:)', { useRegex: true }).matchesInText('😀a');
    expect(matches.map((match) => match.startUtf16Offset)).toEqual([0, 2, 3]);
  });

  test('the accepted compatibility corpus produces the same ASCII spans in ripgrep and locally', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'invar-search-corpus-'));
    const filePath = join(workspaceRoot, 'corpus.txt');
    const text = 'Foo foo food\nleft=12 right=7\nstart middle end\n';
    writeFileSync(filePath, text);
    const cases = [
      pattern('foo'),
      pattern('foo', { caseSensitive: true }),
      pattern('foo', { wholeWord: true }),
      pattern('(?<name>[a-z]+)=(\\d+)', { useRegex: true }),
      pattern('start|end', { useRegex: true }),
    ];
    try {
      for (const textSearchPattern of cases) {
        const argumentsForRipgrep = [
          'rg',
          '--json',
          '--color',
          'never',
          textSearchPattern.query.caseSensitive
            ? '--case-sensitive'
            : '--ignore-case',
          ...(textSearchPattern.query.useRegex ? [] : ['--fixed-strings']),
          ...(textSearchPattern.query.wholeWord ? ['--word-regexp'] : []),
          '-e',
          textSearchPattern.ripgrepPattern,
          'corpus.txt',
        ];
        const ripgrep = Bun.spawnSync(argumentsForRipgrep, {
          cwd: workspaceRoot,
          stdout: 'pipe',
          stderr: 'pipe',
        });
        expect(ripgrep.exitCode).toBe(0);
        const ripgrepSpans = ripgrep.stdout
          .toString()
          .trim()
          .split('\n')
          .filter((line) => line.length > 0)
          .flatMap((line) => {
            const message = JSON.parse(line) as {
              type: string;
              data?: {
                line_number?: number;
                submatches?: Array<{ start: number; end: number }>;
              };
            };
            if (message.type !== 'match') return [];
            return (message.data?.submatches ?? []).map((submatch) => ({
              line: (message.data?.line_number ?? 1) - 1,
              start: submatch.start,
              end: submatch.end,
            }));
          });
        const localSpans = textSearchPattern
          .matchesInText(text)
          .map((match) => ({
            line: match.line,
            start: match.startUtf16Offset,
            end: match.endUtf16Offset,
          }));
        expect(localSpans).toEqual(ripgrepSpans);
      }
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
