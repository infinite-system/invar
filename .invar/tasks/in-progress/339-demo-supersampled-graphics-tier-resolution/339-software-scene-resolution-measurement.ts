#!/usr/bin/env bun
// Measure SoftwareScene.render at the current cell resolution and at 2x, 4x, and 8x
// supersampling of its 1x2-pixel half-block cell grid. Run it from the repository root with
// `bun .invar/tasks/in-progress/339-demo-supersampled-graphics-tier-resolution/339-software-scene-resolution-measurement.ts`.
// Each row reports 20 measured frames after five warmup frames for one scene and resolution.
// Median and p95 milliseconds show whether the scene fits the current 15 FPS, 66.667 ms budget.
// The dimension control deliberately supplies a wrong-width framebuffer and must be rejected before
// the timing table prints. A larger scale raises pixel count and shows the renderer's cost curve.

import { CellFramebuffer } from '../../../../src/modules/media/CellFramebuffer';
import {
  SoftwareScene,
  type MediaSceneKind,
} from '../../../../src/modules/media/SoftwareScene';

interface MeasurementShape {
  readonly label: string;
  readonly supersamplingScale: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

interface SceneMeasurement {
  readonly scene: MediaSceneKind;
  readonly shape: MeasurementShape;
  readonly samplesMilliseconds: readonly number[];
  readonly meanMilliseconds: number;
  readonly medianMilliseconds: number;
  readonly p95Milliseconds: number;
  readonly maximumMilliseconds: number;
}

const paneColumns = 100;
const paneRows = 24;
const warmupFrameCount = 5;
const measuredFrameCount = 20;
const frameBudgetMilliseconds = 1000 / 15;
const measurementShapes: readonly MeasurementShape[] = [
  {
    label: 'cell',
    supersamplingScale: 1,
    pixelWidth: paneColumns,
    pixelHeight: paneRows * 2,
  },
  {
    label: '2x',
    supersamplingScale: 2,
    pixelWidth: paneColumns * 2,
    pixelHeight: paneRows * 2 * 2,
  },
  {
    label: '4x',
    supersamplingScale: 4,
    pixelWidth: paneColumns * 4,
    pixelHeight: paneRows * 2 * 4,
  },
  {
    label: '8x',
    supersamplingScale: 8,
    pixelWidth: paneColumns * 8,
    pixelHeight: paneRows * 2 * 8,
  },
];

function createFramebuffer(shape: MeasurementShape): CellFramebuffer.Model {
  return new CellFramebuffer.Class(
    shape.pixelWidth,
    Math.ceil(shape.pixelHeight / 2),
  );
}

function assertFramebufferShape(
  framebuffer: CellFramebuffer.Model,
  shape: MeasurementShape,
): void {
  if (
    framebuffer.width !== shape.pixelWidth ||
    framebuffer.height !== shape.pixelHeight
  ) {
    throw new Error(
      `${shape.label} framebuffer measured ${framebuffer.width}x${framebuffer.height}, ` +
        `expected ${shape.pixelWidth}x${shape.pixelHeight}`,
    );
  }
}

function sortedPercentile(
  sortedSamples: readonly number[],
  percentile: number,
): number {
  const sampleIndex = Math.min(
    sortedSamples.length - 1,
    Math.ceil(sortedSamples.length * percentile) - 1,
  );
  return sortedSamples[sampleIndex]!;
}

function measureScene(
  sceneKind: MediaSceneKind,
  shape: MeasurementShape,
): SceneMeasurement {
  const framebuffer = createFramebuffer(shape);
  assertFramebufferShape(framebuffer, shape);
  const scene = new SoftwareScene.Class();
  for (
    let warmupFrameIndex = 0;
    warmupFrameIndex < warmupFrameCount;
    warmupFrameIndex++
  ) {
    scene.render(framebuffer, warmupFrameIndex / 15, sceneKind);
  }

  const samplesMilliseconds: number[] = [];
  for (
    let measuredFrameIndex = 0;
    measuredFrameIndex < measuredFrameCount;
    measuredFrameIndex++
  ) {
    const startedAtMilliseconds = performance.now();
    scene.render(framebuffer, measuredFrameIndex / 15, sceneKind);
    samplesMilliseconds.push(performance.now() - startedAtMilliseconds);
  }
  const sortedSamples = samplesMilliseconds.toSorted(
    (firstSample, secondSample) => firstSample - secondSample,
  );
  return {
    scene: sceneKind,
    shape,
    samplesMilliseconds,
    meanMilliseconds:
      samplesMilliseconds.reduce(
        (totalMilliseconds, sampleMilliseconds) =>
          totalMilliseconds + sampleMilliseconds,
        0,
      ) / samplesMilliseconds.length,
    medianMilliseconds: sortedPercentile(sortedSamples, 0.5),
    p95Milliseconds: sortedPercentile(sortedSamples, 0.95),
    maximumMilliseconds: sortedSamples.at(-1)!,
  };
}

const wrongWidthControl = createFramebuffer(measurementShapes[1]!);
let wrongWidthControlRejected = false;
try {
  assertFramebufferShape(wrongWidthControl, {
    ...measurementShapes[1]!,
    pixelWidth: measurementShapes[1]!.pixelWidth + 1,
  });
} catch {
  wrongWidthControlRejected = true;
}
if (!wrongWidthControlRejected) {
  throw new Error('the wrong-width dimension control did not fail');
}
console.log('PASS dimension control rejected a one-pixel width error');

const measurements = (['cube', 'torus'] as const).flatMap((sceneKind) =>
  measurementShapes.map((shape) => measureScene(sceneKind, shape)),
);

console.log(
  'scene\tscale\tdimensions\tpixels\tmean_ms\tmedian_ms\tp95_ms\tmax_ms\tfits_15_fps',
);
for (const measurement of measurements) {
  console.log(
    [
      measurement.scene,
      measurement.shape.label,
      `${measurement.shape.pixelWidth}x${measurement.shape.pixelHeight}`,
      measurement.shape.pixelWidth * measurement.shape.pixelHeight,
      measurement.meanMilliseconds.toFixed(3),
      measurement.medianMilliseconds.toFixed(3),
      measurement.p95Milliseconds.toFixed(3),
      measurement.maximumMilliseconds.toFixed(3),
      measurement.p95Milliseconds <= frameBudgetMilliseconds ? 'yes' : 'no',
    ].join('\t'),
  );
}
