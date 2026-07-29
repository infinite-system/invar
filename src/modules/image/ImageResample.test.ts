import { expect, test } from 'bun:test';
import { ImageResample } from './ImageResample';
import type { DecodedImage } from './ImageDecoders';

test('fitWithin preserves aspect inside the requested box', () => {
  expect(ImageResample.Class.fitWithin(400, 200, 80, 80)).toEqual({
    width: 80,
    height: 40,
  });
  expect(ImageResample.Class.fitWithin(200, 400, 80, 80)).toEqual({
    width: 40,
    height: 80,
  });
});

test('toRgbGrid averages alpha-weighted pixels over the background', () => {
  const image: DecodedImage = {
    width: 2,
    height: 1,
    rgba: Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 0]),
  };

  expect(
    Array.from(ImageResample.Class.toRgbGrid(image, 1, 1, 0, 100, 200)),
  ).toEqual([127, 50, 100]);
});
