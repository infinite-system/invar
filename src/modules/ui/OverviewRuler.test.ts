import { expect, test } from 'bun:test';
import type { EditorDecorationSnapshot } from '../workspace/GutterDecorations';
import { OverviewRuler } from './OverviewRuler';

test('overview projects top middle and bottom lines proportionally', () => {
  const snapshot: EditorDecorationSnapshot = {
    generation: 1,
    byLine: new Map([
      [
        0,
        [
          {
            owner: 'versionControl',
            kind: 'added',
            hoverLabel: 'added',
          },
        ],
      ],
      [
        499,
        [
          {
            owner: 'diagnostics',
            severity: 'warning',
            hoverLabel: 'warning',
            underline: { startColumn: 0, endColumn: 1 },
          },
        ],
      ],
      [
        999,
        [
          {
            owner: 'diagnostics',
            severity: 'error',
            hoverLabel: 'error',
            underline: { startColumn: 0, endColumn: 1 },
          },
        ],
      ],
    ]),
  };

  expect(new OverviewRuler.Class().project(snapshot, 1_000, 21)).toEqual([
    { trackOffset: 0, color: 'added', hoverLabels: ['added'] },
    { trackOffset: 10, color: 'warning', hoverLabels: ['warning'] },
    { trackOffset: 20, color: 'error', hoverLabels: ['error'] },
  ]);
});

test('many lines in one track cell resolve to the highest severity', () => {
  const snapshot: EditorDecorationSnapshot = {
    generation: 1,
    byLine: new Map([
      [
        40,
        [
          {
            owner: 'diagnostics',
            severity: 'warning',
            hoverLabel: 'warning',
            underline: { startColumn: 0, endColumn: 1 },
          },
        ],
      ],
      [
        41,
        [
          {
            owner: 'diagnostics',
            severity: 'error',
            hoverLabel: 'error',
            underline: { startColumn: 0, endColumn: 1 },
          },
        ],
      ],
    ]),
  };

  expect(new OverviewRuler.Class().project(snapshot, 1_000, 10)).toEqual([
    {
      trackOffset: 0,
      color: 'error',
      hoverLabels: ['error', 'warning'],
    },
  ]);
});

test('overview aggregation is cached until its inputs change', () => {
  const overviewRuler = new OverviewRuler.Class();
  const firstSnapshot: EditorDecorationSnapshot = {
    generation: 1,
    byLine: new Map(),
  };
  const secondSnapshot: EditorDecorationSnapshot = {
    generation: 2,
    byLine: new Map(),
  };

  const firstProjection = overviewRuler.project(firstSnapshot, 10_000, 30);
  expect(overviewRuler.project(firstSnapshot, 10_000, 30)).toBe(
    firstProjection,
  );
  expect(overviewRuler.recomputationCount).toBe(1);

  overviewRuler.project(secondSnapshot, 10_000, 30);
  overviewRuler.project(secondSnapshot, 10_000, 31);
  expect(overviewRuler.recomputationCount).toBe(3);
});
