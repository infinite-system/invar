import { describe, expect, test } from 'bun:test';
import { TextCoordinates } from './TextCoordinates';
import { WrapBreakOpportunity } from './WrapBreakOpportunity';

describe('WrapBreakOpportunity prose profile', () => {
  test('classifies complete whitespace runs without slicing them', () => {
    expect(
      WrapBreakOpportunity.Class.breakKindBetween(
        ' \t\u00a0\u3000',
        undefined,
        'prose',
      ),
    ).toBe('whitespace');
    expect(
      WrapBreakOpportunity.Class.breakKindBetween(' alpha', undefined, 'prose'),
    ).toBeNull();
  });

  test('offers whitespace and post-hyphen boundaries only', () => {
    const graphemes = TextCoordinates.Class.graphemes('alpha beta-gamma_delta');
    const breakKinds = graphemes.map((_grapheme, graphemeIndex) =>
      WrapBreakOpportunity.Class.breakKindBetween(
        graphemes[graphemeIndex]!,
        graphemes[graphemeIndex + 1],
        'prose',
      ),
    );
    expect(
      breakKinds
        .map((breakKind, breakKindIndex) =>
          breakKind === null ? null : [breakKindIndex + 1, breakKind],
        )
        .filter((breakKind) => breakKind !== null),
    ).toEqual([
      [6, 'whitespace'],
      [11, 'separator'],
    ]);
  });

  test('does not adopt code-only separators', () => {
    const graphemes = TextCoordinates.Class.graphemes('alpha_beta');
    expect(
      WrapBreakOpportunity.Class.previousBreakOpportunity(
        graphemes,
        0,
        7,
        'prose',
      ),
    ).toBe(0);
    expect(
      WrapBreakOpportunity.Class.previousBreakOpportunity(
        graphemes,
        0,
        7,
        'code',
      ),
    ).toBe(6);
  });
});

describe('WrapBreakOpportunity code profile', () => {
  test('offers every configured separator and bracket boundary', () => {
    for (const separator of ['-', '_', '/', '\\', '.', ',', ';', ':']) {
      const graphemes = TextCoordinates.Class.graphemes(
        `alpha${separator}beta`,
      );
      expect(
        WrapBreakOpportunity.Class.breakKindBetween(
          graphemes['alpha'.length]!,
          graphemes['alpha'.length + 1],
          'code',
        ),
      ).toBe('separator');
    }
    for (const openingBracket of ['(', '[', '{']) {
      const graphemes = TextCoordinates.Class.graphemes(
        `call${openingBracket}value`,
      );
      expect(
        WrapBreakOpportunity.Class.breakKindBetween(
          graphemes['call'.length]!,
          graphemes['call'.length + 1],
          'code',
        ),
      ).toBe('separator');
    }
    for (const closingBracket of [')', ']', '}']) {
      const graphemes = TextCoordinates.Class.graphemes(
        `value${closingBracket}`,
      );
      expect(
        WrapBreakOpportunity.Class.breakKindBetween(
          graphemes['value'.length - 1]!,
          graphemes['value'.length],
          'code',
        ),
      ).toBe('bracket');
    }
  });

  test('offers readable seams for paths punctuation brackets and camelCase', () => {
    const graphemes = TextCoordinates.Class.graphemes(
      'alpha_beta/path.name,(camelCase)',
    );
    const opportunities = graphemes
      .map((grapheme, graphemeIndex) => ({
        precedingGrapheme: grapheme,
        breakIndex: graphemeIndex + 1,
        kind: WrapBreakOpportunity.Class.breakKindBetween(
          graphemes[graphemeIndex]!,
          graphemes[graphemeIndex + 1],
          'code',
        ),
      }))
      .filter((opportunity) => opportunity.kind !== null);
    expect(
      opportunities.map(({ breakIndex, kind }) => [breakIndex, kind]),
    ).toEqual([
      [6, 'separator'],
      [11, 'separator'],
      [16, 'separator'],
      [21, 'separator'],
      [22, 'separator'],
      [27, 'camel-case'],
      [31, 'bracket'],
    ]);
  });

  test('offers boundaries around operator runs without splitting the run', () => {
    const graphemes = TextCoordinates.Class.graphemes('alpha===beta');
    expect(
      WrapBreakOpportunity.Class.breakKindBetween(
        graphemes[4]!,
        graphemes[5],
        'code',
      ),
    ).toBe('operator');
    expect(
      WrapBreakOpportunity.Class.breakKindBetween(
        graphemes[5]!,
        graphemes[6],
        'code',
      ),
    ).toBeNull();
    expect(
      WrapBreakOpportunity.Class.breakKindBetween(
        graphemes[6]!,
        graphemes[7],
        'code',
      ),
    ).toBeNull();
    expect(
      WrapBreakOpportunity.Class.breakKindBetween(
        graphemes[7]!,
        graphemes[8],
        'code',
      ),
    ).toBe('operator');
  });

  test('returns the latest fitting opportunity or the segment start', () => {
    const graphemes = TextCoordinates.Class.graphemes('repository/path.name');
    expect(
      WrapBreakOpportunity.Class.previousBreakOpportunity(
        graphemes,
        0,
        17,
        'code',
      ),
    ).toBe(16);
    expect(
      WrapBreakOpportunity.Class.previousBreakOpportunity(
        graphemes,
        11,
        15,
        'code',
      ),
    ).toBe(11);
  });

  test('accepts only boundaries between complete grapheme clusters', () => {
    const graphemes = TextCoordinates.Class.graphemes('family-👨‍👩‍👧‍👦Path');
    expect(graphemes).toContain('👨‍👩‍👧‍👦');
    expect(
      WrapBreakOpportunity.Class.previousBreakOpportunity(
        graphemes,
        0,
        graphemes.length,
        'code',
      ),
    ).toBe(7);
  });
});
