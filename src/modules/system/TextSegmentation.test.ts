import { expect, test } from 'bun:test';
import { TextSegmentation } from './TextSegmentation';

test('segments emoji variation selectors and joiner sequences as complete graphemes', () => {
  expect(TextSegmentation.Class.graphemes('a🦊✨👩‍💻e\u0301')).toEqual([
    'a',
    '🦊',
    '✨',
    '👩‍💻',
    'e\u0301',
  ]);
});

test('segments words while retaining whitespace and punctuation boundaries', () => {
  expect(TextSegmentation.Class.words('alpha-beta  gamma').map((segment) => segment.text)).toEqual([
    'alpha',
    '-',
    'beta',
    '  ',
    'gamma',
  ]);
});
