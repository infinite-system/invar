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

  expect(argumentsList).toContain('testsrc2=size=80x48:rate=15');
  expect(argumentsList).toContain('-an');
  expect(argumentsList).toContain('rgba');
  expect(argumentsList.at(-2)).toBe('rawvideo');
  expect(argumentsList.at(-1)).toBe('/tmp/generated-video.rgba');
});
