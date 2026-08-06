import { expect, test } from 'bun:test';
import { FfmpegVideoSource } from './FfmpegVideoSource';

test('the deterministic sample uses raw RGBA video and disables audio', () => {
  const argumentsList = FfmpegVideoSource.Class.sampleArgumentVector(
    '/tools/ffmpeg',
    80,
    48,
    15,
    '/tmp/generated-video.rgba',
  );

  const sourceArgument = argumentsList[argumentsList.indexOf('-i') + 1];
  expect(sourceArgument).toStartWith('mandelbrot=size=80x48:rate=15');
  expect(argumentsList).toContain('-an');
  expect(argumentsList).toContain('rgba');
  expect(argumentsList.at(-2)).toBe('rawvideo');
  expect(argumentsList.at(-1)).toBe('/tmp/generated-video.rgba');
});

test('the sample picture holds its scale instead of zooming into flat detail', () => {
  const argumentsList = FfmpegVideoSource.Class.sampleArgumentVector(
    '/tools/ffmpeg',
    80,
    48,
    15,
  );
  const sourceArgument = argumentsList[argumentsList.indexOf('-i') + 1] ?? '';

  const startScale = Number(/start_scale=([\d.]+)/.exec(sourceArgument)?.[1]);
  const endScale = Number(/end_scale=([\d.]+)/.exec(sourceArgument)?.[1]);
  const morphAmplitude = Number(/morphamp=([\d.]+)/.exec(sourceArgument)?.[1]);

  // A zoom runs out of visible detail at pane resolution and settles on a
  // flat or speckled frame. Equal scales keep the picture alive forever, and
  // the morph amplitude is what still moves it.
  expect(startScale).toBeGreaterThan(0);
  expect(endScale).toBe(startScale);
  expect(morphAmplitude).toBeGreaterThan(0);
});

test('a dropped video is scaled and padded to the pane frame', () => {
  const argumentsList = FfmpegVideoSource.Class.fileArgumentVector(
    '/tools/ffmpeg',
    '/tmp/movie with spaces.mp4',
    80,
    48,
    15,
    '/tmp/dropped-video.rgba',
  );

  expect(argumentsList[argumentsList.indexOf('-i') + 1]).toBe(
    '/tmp/movie with spaces.mp4',
  );
  expect(argumentsList[argumentsList.indexOf('-vf') + 1]).toContain(
    'scale=80:48:force_original_aspect_ratio=decrease',
  );
  expect(argumentsList[argumentsList.indexOf('-vf') + 1]).toContain(
    'pad=80:48',
  );
  expect(argumentsList).toContain('-an');
  expect(argumentsList.at(-1)).toBe('/tmp/dropped-video.rgba');
});
