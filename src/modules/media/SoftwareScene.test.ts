import { expect, test } from 'bun:test';
import { CellFramebuffer } from './CellFramebuffer';
import { SoftwareScene } from './SoftwareScene';

test('cube and torus render into the same fixed working set', () => {
  const framebuffer = new CellFramebuffer.Class(48, 18);
  const scene = new SoftwareScene.Class();
  const rgba = framebuffer.rgba;
  const depth = framebuffer.depth;

  expect(scene.render(framebuffer, 1, 'cube')).toBe('cube');
  const cubeFingerprint = Bun.hash(framebuffer.rgba);
  expect(scene.render(framebuffer, 1, 'torus')).toBe('torus');
  const torusFingerprint = Bun.hash(framebuffer.rgba);

  expect(torusFingerprint).not.toBe(cubeFingerprint);
  expect(framebuffer.rgba).toBe(rgba);
  expect(framebuffer.depth).toBe(depth);
});

test('automatic scene shows the cube and the torus without reallocating', () => {
  const framebuffer = new CellFramebuffer.Class(32, 12);
  const scene = new SoftwareScene.Class();
  const generation = framebuffer.bufferGeneration;

  expect(scene.render(framebuffer, 0, 'automatic')).toBe('cube');
  expect(scene.render(framebuffer, 5.1, 'automatic')).toBe('torus');
  expect(framebuffer.bufferGeneration).toBe(generation);
});
