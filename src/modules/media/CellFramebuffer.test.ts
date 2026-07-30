import { expect, test } from 'bun:test';
import { CellFramebuffer } from './CellFramebuffer';

test('fixed geometry reuses the RGBA and depth buffers', () => {
  const framebuffer = new CellFramebuffer.Class(12, 7);
  const rgba = framebuffer.rgba;
  const depth = framebuffer.depth;
  const generation = framebuffer.bufferGeneration;

  for (let frameIndex = 0; frameIndex < 200; frameIndex++) {
    framebuffer.clear(frameIndex % 255, 20, 30);
    framebuffer.setPixel(3, 4, 200, 210, 220, 0.5);
    expect(framebuffer.resize(12, 7)).toBe(false);
  }

  expect(framebuffer.rgba).toBe(rgba);
  expect(framebuffer.depth).toBe(depth);
  expect(framebuffer.bufferGeneration).toBe(generation);
  expect(framebuffer.workingSetBytes).toBe(12 * 14 * 8);
});

test('resize replaces one working set and then stays stable', () => {
  const framebuffer = new CellFramebuffer.Class(4, 3);
  const originalRgba = framebuffer.rgba;
  const originalDepth = framebuffer.depth;

  expect(framebuffer.resize(9, 5)).toBe(true);
  expect(framebuffer.rgba).not.toBe(originalRgba);
  expect(framebuffer.depth).not.toBe(originalDepth);
  expect(framebuffer.rgba.byteLength).toBe(9 * 10 * 4);
  expect(framebuffer.depth.byteLength).toBe(9 * 10 * 4);

  const resizedRgba = framebuffer.rgba;
  const resizedDepth = framebuffer.depth;
  expect(framebuffer.resize(9, 5)).toBe(false);
  expect(framebuffer.rgba).toBe(resizedRgba);
  expect(framebuffer.depth).toBe(resizedDepth);
});

test('supersampling multiplies both pixel axes and keeps one fixed working set', () => {
  const framebuffer = new CellFramebuffer.Class(12, 7, 8);
  const rgba = framebuffer.rgba;
  const depth = framebuffer.depth;
  const generation = framebuffer.bufferGeneration;

  expect(framebuffer.width).toBe(12 * 8);
  expect(framebuffer.height).toBe(7 * 2 * 8);
  expect(framebuffer.workingSetBytes).toBe(12 * 7 * 2 * 8 * 8 * 8);
  for (let frameIndex = 0; frameIndex < 200; frameIndex++) {
    framebuffer.clear(frameIndex % 255, 20, 30);
    framebuffer.setPixel(40, 60, 200, 210, 220, 0.5);
    expect(framebuffer.resize(12, 7, 8)).toBe(false);
  }

  expect(framebuffer.rgba).toBe(rgba);
  expect(framebuffer.depth).toBe(depth);
  expect(framebuffer.bufferGeneration).toBe(generation);
});
