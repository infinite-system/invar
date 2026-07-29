import { describe, expect, test } from 'bun:test';
import { Static } from 'ivue/extras';
import {
  RipgrepSearch,
  type RipgrepSearchOptions,
  type RipgrepSearchRow,
} from './RipgrepSearch';

const fixtureOutput = [
  JSON.stringify({ type: 'begin', data: { path: { text: 'src/example.ts' } } }),
  JSON.stringify({
    type: 'match',
    data: {
      path: { text: 'src/example.ts' },
      lines: { text: 'const café = needle + needle;\n' },
      line_number: 12,
      absolute_offset: 180,
      submatches: [
        { match: { text: 'needle' }, start: 14, end: 20 },
        { match: { text: 'needle' }, start: 23, end: 29 },
      ],
    },
  }),
  JSON.stringify({
    type: 'match',
    data: {
      path: { text: 'README.md' },
      lines: { text: 'Needle on Windows\r\n' },
      line_number: 3,
      absolute_offset: 30,
      submatches: [{ match: { text: 'Needle' }, start: 0, end: 6 }],
    },
  }),
  JSON.stringify({
    type: 'end',
    data: { path: { text: 'src/example.ts' }, stats: {} },
  }),
  JSON.stringify({ type: 'summary', data: { stats: {} } }),
  '',
].join('\n');

describe('RipgrepSearch', () => {
  test('parses match events into one structured row per submatch', () => {
    expect(RipgrepSearch.Class.parseOutput(fixtureOutput)).toEqual([
      {
        path: 'src/example.ts',
        line: 12,
        column: 15,
        text: 'const café = needle + needle;',
        matchStart: 14,
        matchEnd: 20,
      },
      {
        path: 'src/example.ts',
        line: 12,
        column: 24,
        text: 'const café = needle + needle;',
        matchStart: 23,
        matchEnd: 29,
      },
      {
        path: 'README.md',
        line: 3,
        column: 1,
        text: 'Needle on Windows',
        matchStart: 0,
        matchEnd: 6,
      },
    ]);
  });

  test('maps include exclude case word and regular-expression options to argv', () => {
    expect(
      RipgrepSearch.Class.buildArgumentVector('needle', '/workspace', {
        caseSensitive: false,
        wholeWord: true,
        regularExpression: false,
        includeGlobs: ['src/**/*.ts', '*.md'],
        excludeGlobs: ['dist/**', '*.test.ts'],
      }),
    ).toEqual([
      'rg',
      '--json',
      '--line-number',
      '--column',
      '-i',
      '-w',
      '-F',
      '--glob',
      'src/**/*.ts',
      '--glob',
      '*.md',
      '--glob',
      '!dist/**',
      '--glob',
      '!*.test.ts',
      '--',
      'needle',
      '/workspace',
    ]);
  });

  test('omits disabled flags and keeps a leading-dash query positional', () => {
    expect(
      RipgrepSearch.Class.buildArgumentVector('--hidden', '/workspace', {
        caseSensitive: true,
        wholeWord: false,
        regularExpression: true,
      }),
    ).toEqual([
      'rg',
      '--json',
      '--line-number',
      '--column',
      '--',
      '--hidden',
      '/workspace',
    ]);
  });

  test('skips malformed lines and malformed match records without throwing', () => {
    const malformedOutput = [
      'not json',
      JSON.stringify({
        type: 'match',
        data: { path: { text: 'missing-fields.ts' } },
      }),
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: 'partial.ts' },
          lines: { text: 'valid and invalid\n' },
          line_number: 7,
          submatches: [
            { start: 'zero', end: 5 },
            { start: 10, end: 4 },
            { start: 6, end: 9 },
          ],
        },
      }),
    ].join('\n');

    expect(RipgrepSearch.Class.parseOutput(malformedOutput)).toEqual([
      {
        path: 'partial.ts',
        line: 7,
        column: 7,
        text: 'valid and invalid',
        matchStart: 6,
        matchEnd: 9,
      },
    ]);
  });

  test('search composes through the overridable process seam without spawning ripgrep', async () => {
    let receivedQuery = '';
    let receivedRoot = '';
    let receivedOptions: RipgrepSearchOptions | undefined;

    class FixtureRipgrepSearch extends RipgrepSearch.$Class {
      static override async runRipgrep(
        query: string,
        root: string,
        options?: RipgrepSearchOptions,
      ) {
        receivedQuery = query;
        receivedRoot = root;
        receivedOptions = options;
        return { code: 0, stdout: fixtureOutput, stderr: '', ok: true };
      }
    }

    const FixtureSearch = Static(FixtureRipgrepSearch);
    const options = { caseSensitive: true, regularExpression: true };
    const rows: RipgrepSearchRow[] = await FixtureSearch.search(
      'needle',
      '/workspace',
      options,
    );

    expect(receivedQuery).toBe('needle');
    expect(receivedRoot).toBe('/workspace');
    expect(receivedOptions).toBe(options);
    expect(rows).toHaveLength(3);
  });
});
