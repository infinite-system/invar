import { expect, test } from 'bun:test';
import { TextDocument } from '../editor/TextDocument';
import { DocumentHandle } from './DocumentHandle';
import {
  GutterDecorations,
  type EditorLineDecoration,
} from './GutterDecorations';

test('decoration contributions aggregate for one document snapshot', () => {
  const registry = new GutterDecorations.Class();
  const handle = new DocumentHandle.Class(Symbol('document'), '/one.ts');
  let versionControlRevision = 1;
  let diagnosticRevision = 1;
  registry.register({
    revision: () => versionControlRevision,
    byLine: (receivedHandle) =>
      receivedHandle === handle
        ? new Map([
            [
              2,
              [
                {
                  owner: 'versionControl' as const,
                  kind: 'modified' as const,
                  hoverLabel: 'modified',
                },
              ],
            ],
          ])
        : new Map(),
  });
  registry.register({
    revision: () => diagnosticRevision,
    byLine: () =>
      new Map([
        [
          2,
          [
            {
              owner: 'diagnostics' as const,
              severity: 'error' as const,
              hoverLabel: 'error',
              underline: {
                startColumn: 0,
                endColumn: 3,
              },
            },
          ],
        ],
      ]),
  });

  const firstSnapshot = registry.snapshotFor(handle);
  const cachedSnapshot = registry.snapshotFor(handle);
  expect(cachedSnapshot).toBe(firstSnapshot);
  expect(
    firstSnapshot.byLine.get(2)?.map((decoration) => decoration.owner),
  ).toEqual(['versionControl', 'diagnostics']);

  diagnosticRevision += 1;
  const diagnosticSnapshot = registry.snapshotFor(handle);
  expect(diagnosticSnapshot).not.toBe(firstSnapshot);
  expect(registry.snapshotFor(handle)).toBe(diagnosticSnapshot);

  versionControlRevision += 1;
  expect(registry.snapshotFor(handle)).not.toBe(diagnosticSnapshot);
});

test('a document edit invalidates a cached decoration snapshot', () => {
  const registry = new GutterDecorations.Class();
  const handle = new DocumentHandle.Class(Symbol('document'), '/one.ts');
  const document = new TextDocument.Class();
  document.loadFromText('one', handle.path);
  handle.attach(document);
  registry.register({
    revision: () => 1,
    byLine: () => new Map(),
  });

  const firstSnapshot = registry.snapshotFor(handle);
  document.setLine(0, 'one changed');

  expect(registry.snapshotFor(handle)).not.toBe(firstSnapshot);
});

test('reserved decoration priority is deterministic across owners', () => {
  const decorations: EditorLineDecoration[] = [
    {
      owner: 'versionControl',
      kind: 'deleted',
      hoverLabel: '3 lines deleted above',
    },
    {
      owner: 'versionControl',
      kind: 'modified',
      hoverLabel: 'modified',
    },
    {
      owner: 'diagnostics',
      severity: 'warning',
      hoverLabel: 'warning',
      underline: { startColumn: 0, endColumn: 1 },
    },
    {
      owner: 'diagnostics',
      severity: 'error',
      hoverLabel: 'error',
      underline: { startColumn: 0, endColumn: 1 },
    },
  ];

  expect(
    decorations
      .toSorted(
        (firstDecoration, secondDecoration) =>
          GutterDecorations.Class.priorityFor(secondDecoration) -
          GutterDecorations.Class.priorityFor(firstDecoration),
      )
      .map((decoration) => GutterDecorations.Class.colorFor(decoration)),
  ).toEqual(['error', 'warning', 'modified', 'deleted']);
});
