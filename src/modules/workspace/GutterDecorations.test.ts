import { expect, test } from 'bun:test';
import { DocumentHandle } from './DocumentHandle';
import { GutterDecorations } from './GutterDecorations';

test('gutter contributions aggregate for the requested document handle', () => {
  const registry = new GutterDecorations.Class();
  const handle = new DocumentHandle.Class(Symbol('document'), '/one.ts');
  registry.register({
    byLine: (received) =>
      received === handle
        ? new Map([
            [
              2,
              [
                {
                  gutter: {
                    glyph: 'bar' as const,
                    color: 'modified' as const,
                    priority: 100,
                  },
                },
              ],
            ],
          ])
        : new Map(),
  });
  registry.register({
    byLine: () =>
      new Map([
        [
          2,
          [
            {
              gutter: {
                glyph: 'bar' as const,
                color: 'error' as const,
                priority: 500,
              },
              underline: {
                startColumn: 0,
                endColumn: 3,
                color: 'error' as const,
              },
            },
          ],
        ],
      ]),
  });
  expect(
    registry
      .byLine(handle)
      .get(2)
      ?.map((mark) => mark.gutter.color),
  ).toEqual(['modified', 'error']);
});
