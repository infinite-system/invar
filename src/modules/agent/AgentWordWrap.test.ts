import { describe, expect, test } from 'bun:test';
import { AgentWordWrap } from './AgentWordWrap';
import { WrapText } from '../ui/WrapText';

describe('AgentWordWrap', () => {
  test('moves plain words whole at whitespace boundaries', () => {
    expect(AgentWordWrap.Class.wrap('alpha beta gamma', 10)).toEqual([
      'alpha beta',
      'gamma',
    ]);
  });

  test('breaks an over-width hyphenated word only after an existing hyphen', () => {
    expect(AgentWordWrap.Class.wrap('state-of-the-art', 9)).toEqual([
      'state-of-',
      'the-art',
    ]);
  });

  test('hard-breaks an over-width unbreakable token as the last resort', () => {
    expect(AgentWordWrap.Class.wrap('abcdefghij', 4)).toEqual([
      'abcd',
      'efgh',
      'ij',
    ]);
  });

  test('keeps code-only separators out of the prose profile', () => {
    expect(AgentWordWrap.Class.wrap('alpha_beta', 7)).toEqual([
      'alpha_b',
      'eta',
    ]);
  });

  test('keeps CJK emoji and combining graphemes whole while measuring display cells', () => {
    const rows = AgentWordWrap.Class.wrap('界界界 😀😀 e\u0301e\u0301', 4);
    expect(rows).toEqual(['界界', '界', '😀😀', 'e\u0301e\u0301']);
    expect(rows.every((row) => WrapText.Class.displayWidth(row) <= 4)).toBe(
      true,
    );
  });

  test('preserves true trailing spaces without inventing a leading-space word row', () => {
    expect(AgentWordWrap.Class.wrap('tail   ', 5)).toEqual(['tail ', '  ']);
    expect(AgentWordWrap.Class.wrap('alpha beta', 5)).toEqual([
      'alpha',
      'beta',
    ]);
  });

  test('consumed wrap whitespace remains in source geometry for caret positions', () => {
    const segments = AgentWordWrap.Class.segments('alpha beta', 5);
    expect(segments[0]).toMatchObject({
      text: 'alpha',
      sourceText: 'alpha ',
      graphemeStart: 0,
      graphemeCount: 6,
    });
    expect(AgentWordWrap.Class.visualPositionOf(segments, 5)).toEqual({
      line: 0,
      column: 5,
    });
    expect(AgentWordWrap.Class.visualPositionOf(segments, 6)).toEqual({
      line: 1,
      column: 0,
    });
  });
});
