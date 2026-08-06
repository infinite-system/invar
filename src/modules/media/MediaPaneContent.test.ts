import { expect, test } from 'bun:test';
import type { PixelMountTerminal } from '../image/PixelImageMount';
import { ThemePalettes } from '../theme/ThemePalettes';
import { MediaPaneContent } from './MediaPaneContent';

function recordingPixelTerminal(): PixelMountTerminal & {
  payloads: string[];
} {
  const payloads: string[] = [];
  return {
    payloads,
    writePayload: (data) => payloads.push(data),
    afterFramesSettled: () => Promise.resolve(),
    cellPixelSize: () => ({ width: 8, height: 16 }),
  };
}

test('demo starts with a nonblank cube and reuses buffers while advancing', () => {
  const pane = new MediaPaneContent.Class({
    identifier: 'media-demo',
    label: '3D Demo',
    mode: 'demo',
    columns: 36,
    rows: 12,
    framesPerSecond: 15,
    pixelTerminal: recordingPixelTerminal(),
  });
  const generation = pane.bufferGeneration;
  const projection = pane.render({
    width: 36,
    height: 12,
    palette: ThemePalettes.Class.DARK,
    glyphLevel: 'unicode',
    colorDepth: 'truecolor',
    graphicsTier: 'halfblock',
    focused: true,
  });

  expect(projection.chunks.some((chunk) => chunk.text.includes('▀'))).toBe(
    true,
  );
  expect(pane.activeScene).toBe('cube');
  pane.selectScene('torus');
  expect(pane.activeScene).toBe('torus');
  expect(pane.bufferGeneration).toBe(generation);
  pane.dispose();
});

test('missing ffmpeg is an explicit visible notice', () => {
  const pane = new MediaPaneContent.Class({
    identifier: 'media-video',
    label: 'Sample Video',
    mode: 'video',
    columns: 36,
    rows: 12,
    framesPerSecond: 15,
    pixelTerminal: recordingPixelTerminal(),
    createVideoStream: () => null,
  });
  const projection = pane.render({
    width: 36,
    height: 12,
    palette: ThemePalettes.Class.DARK,
    glyphLevel: 'ascii',
    colorDepth: '16',
    graphicsTier: 'halfblock',
    focused: true,
  });

  const text = projection.chunks.map((chunk) => chunk.text).join('');
  expect(text).toContain('VIDEO UNAVAILABLE');
  expect(text).toContain('ffmpeg was not found');
  pane.dispose();
});

test('a dropped image is a still media pane', () => {
  const pane = new MediaPaneContent.Class({
    identifier: 'media-image',
    label: 'picture.png',
    mode: 'image',
    columns: 12,
    rows: 6,
    framesPerSecond: 15,
    pixelTerminal: recordingPixelTerminal(),
    loadImage: () => ({
      width: 1,
      height: 2,
      rgba: Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 255]),
    }),
  });
  const projection = pane.render({
    width: 12,
    height: 6,
    palette: ThemePalettes.Class.DARK,
    glyphLevel: 'unicode',
    colorDepth: 'truecolor',
    graphicsTier: 'halfblock',
    focused: true,
  });

  expect(pane.title).toBe('picture.png');
  expect(pane.mediaMode).toBe('image');
  expect(projection.chunks.some((chunk) => chunk.text.includes('▀'))).toBe(
    true,
  );
  pane.togglePaused();
  expect(pane.paused).toBe(false);
  pane.dispose();
});

test('space pauses and resumes without replacing the working set', () => {
  const pane = new MediaPaneContent.Class({
    identifier: 'media-demo',
    label: '3D Demo',
    mode: 'demo',
    columns: 20,
    rows: 8,
    framesPerSecond: 15,
    pixelTerminal: recordingPixelTerminal(),
  });
  const generation = pane.bufferGeneration;

  pane.togglePaused();
  expect(pane.paused).toBe(true);
  pane.togglePaused();
  expect(pane.paused).toBe(false);
  expect(pane.bufferGeneration).toBe(generation);
  pane.dispose();
});
