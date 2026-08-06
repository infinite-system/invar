import { describe, expect, test } from 'bun:test';
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

  test('the accepted backend corpus produces stable canonical ASCII spans', () => {
    const text = 'Foo foo food\nleft=12 right=7\nstart middle end\n';
    const cases = [
      {
        textSearchPattern: pattern('foo'),
        expectedSpans: [
          { line: 0, start: 0, end: 3 },
          { line: 0, start: 4, end: 7 },
          { line: 0, start: 8, end: 11 },
        ],
      },
      {
        textSearchPattern: pattern('foo', { caseSensitive: true }),
        expectedSpans: [
          { line: 0, start: 4, end: 7 },
          { line: 0, start: 8, end: 11 },
        ],
      },
      {
        textSearchPattern: pattern('foo', { wholeWord: true }),
        expectedSpans: [
          { line: 0, start: 0, end: 3 },
          { line: 0, start: 4, end: 7 },
        ],
      },
      {
        textSearchPattern: pattern('(?<name>[a-z]+)=(\\d+)', {
          useRegex: true,
        }),
        expectedSpans: [
          { line: 1, start: 0, end: 7 },
          { line: 1, start: 8, end: 15 },
        ],
      },
      {
        textSearchPattern: pattern('start|end', { useRegex: true }),
        expectedSpans: [
          { line: 2, start: 0, end: 5 },
          { line: 2, start: 13, end: 16 },
        ],
      },
    ];
    for (const { textSearchPattern, expectedSpans } of cases) {
      const localSpans = textSearchPattern.matchesInText(text).map((match) => ({
        line: match.line,
        start: match.startUtf16Offset,
        end: match.endUtf16Offset,
      }));
      expect(localSpans).toEqual(expectedSpans);
    }
  });
});
