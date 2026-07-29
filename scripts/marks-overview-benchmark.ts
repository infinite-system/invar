#!/usr/bin/env bun
import { TextDocument } from '../src/modules/editor/TextDocument';
import { OverviewRuler } from '../src/modules/ui/OverviewRuler';
import { DocumentHandle } from '../src/modules/workspace/DocumentHandle';
import {
  GutterDecorations,
  type EditorLineDecoration,
} from '../src/modules/workspace/GutterDecorations';

const documentLineCount = 20_000;

const diagnosticLineCount = 10_000;

const trackLength = 60;

const measurementIterations = 25;

const identityVisualProjection = {
  key: `identity:${documentLineCount}`,
  rowCount: documentLineCount,
  rowOfLine: (lineIndex: number) => lineIndex,
};

const documentText = Array.from(
  { length: documentLineCount },
  (_unusedValue, lineIndex) => `const line${lineIndex} = ${lineIndex};`,
).join('\n');

const diagnosticDecorations = new Map<
  number,
  readonly EditorLineDecoration[]
>();

for (
  let diagnosticIndex = 0;
  diagnosticIndex < diagnosticLineCount;
  diagnosticIndex += 1
) {
  diagnosticDecorations.set(diagnosticIndex * 2, [
    {
      owner: 'diagnostics',
      severity: diagnosticIndex % 10 === 0 ? 'error' : 'warning',
      hoverLabel: diagnosticIndex % 10 === 0 ? 'error' : 'warning',
      underline: { startColumn: 6, endColumn: 12 },
    },
  ]);
}

function median(measurements: readonly number[]): number {
  const orderedMeasurements = [...measurements].sort(
    (firstMeasurement, secondMeasurement) =>
      firstMeasurement - secondMeasurement,
  );
  return orderedMeasurements[Math.floor(orderedMeasurements.length / 2)] ?? 0;
}

function measure(operation: () => void): number {
  const measurements: number[] = [];
  for (
    let measurementIndex = 0;
    measurementIndex < measurementIterations;
    measurementIndex += 1
  ) {
    const startedAtMilliseconds = performance.now();
    operation();
    measurements.push(performance.now() - startedAtMilliseconds);
  }
  return median(measurements);
}

const loadOnlyMilliseconds = measure(() => {
  const document = new TextDocument.Class();
  document.loadFromText(documentText, '/large.ts');
});

const initialProjectionMilliseconds = measure(() => {
  const document = new TextDocument.Class();
  document.loadFromText(documentText, '/large.ts');
  const handle = new DocumentHandle.Class(Symbol('document'), '/large.ts');
  handle.attach(document);
  const decorations = new GutterDecorations.Class();
  decorations.register({ revision: () => 0, byLine: () => new Map() });
  const overviewRuler = new OverviewRuler.Class();
  overviewRuler.project(
    decorations.snapshotFor(handle),
    identityVisualProjection,
    trackLength,
  );
});

const measuredDocument = new TextDocument.Class();

measuredDocument.loadFromText(documentText, '/large.ts');

const measuredHandle = new DocumentHandle.Class(
  Symbol('document'),
  '/large.ts',
);

measuredHandle.attach(measuredDocument);

let diagnosticRevision = 1;

const measuredDecorations = new GutterDecorations.Class();

measuredDecorations.register({
  revision: () => diagnosticRevision,
  byLine: () => diagnosticDecorations,
});

const measuredOverviewRuler = new OverviewRuler.Class();

const decorationRecomputeMilliseconds = measure(() => {
  diagnosticRevision += 1;
  const snapshot = measuredDecorations.snapshotFor(measuredHandle);
  measuredOverviewRuler.project(
    snapshot,
    identityVisualProjection,
    trackLength,
  );
});

const cachedReadIterations = 100_000;

const cachedSnapshot = measuredDecorations.snapshotFor(measuredHandle);

measuredOverviewRuler.project(
  cachedSnapshot,
  identityVisualProjection,
  trackLength,
);

const cachedReadsStartedAtMilliseconds = performance.now();

for (
  let cachedReadIndex = 0;
  cachedReadIndex < cachedReadIterations;
  cachedReadIndex += 1
) {
  measuredOverviewRuler.project(
    cachedSnapshot,
    identityVisualProjection,
    trackLength,
  );
}

const cachedReadMicroseconds =
  ((performance.now() - cachedReadsStartedAtMilliseconds) * 1_000) /
  cachedReadIterations;

console.log(
  JSON.stringify(
    {
      documentLineCount,
      diagnosticLineCount,
      trackLength,
      measurementIterations,
      loadOnlyMedianMilliseconds: loadOnlyMilliseconds,
      loadAndEmptyOverviewMedianMilliseconds: initialProjectionMilliseconds,
      initialOverviewIncrementMedianMilliseconds:
        initialProjectionMilliseconds - loadOnlyMilliseconds,
      decorationAndOverviewRecomputeMedianMilliseconds:
        decorationRecomputeMilliseconds,
      cachedOverviewReadMicroseconds: cachedReadMicroseconds,
      overviewRecomputationCount: measuredOverviewRuler.recomputationCount,
    },
    null,
    2,
  ),
);
