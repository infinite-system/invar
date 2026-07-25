import { StyledText } from '@opentui/core';
import { expect, test } from 'bun:test';
import {
  ImagePreview,
  type ImagePreviewDecoders,
  type ImagePreviewFiles,
  type ImagePreviewRenderer,
} from './ImagePreview';
import type { DecodedImage } from './ImageDecoders';

class TestImagePreview extends ImagePreview.$Class {
  constructor(
    protected readonly files: ImagePreviewFiles,
    protected readonly decoders: ImagePreviewDecoders,
    protected readonly renderer: ImagePreviewRenderer,
  ) {
    super();
  }

  protected override get Files(): ImagePreviewFiles {
    return this.files;
  }

  protected override get ImageDecoders(): ImagePreviewDecoders {
    return this.decoders;
  }

  protected override get HalfBlockRenderer(): ImagePreviewRenderer {
    return this.renderer;
  }
}

test('decode and render are memoized by path and render inputs', () => {
  const image: DecodedImage = {
    width: 1,
    height: 1,
    rgba: Uint8Array.from([10, 20, 30, 255]),
  };
  let readCount = 0;
  let renderCount = 0;
  const renderedText = new StyledText([]);
  const preview = new TestImagePreview(
    {
      extname: () => '.png',
      readBytes: () => {
        readCount++;
        return Uint8Array.from([1, 2, 3]);
      },
    },
    {
      decoderFor: () => () => image,
    },
    {
      render: () => {
        renderCount++;
        return { styledText: renderedText };
      },
    },
  );

  expect(preview.render('/picture.png', 20, 10, '#000000', '#ff0000')).toBe(
    renderedText,
  );
  expect(preview.render('/picture.png', 20, 10, '#000000', '#ff0000')).toBe(
    renderedText,
  );
  expect(preview.decodedImage('/picture.png')).toBe(image);
  expect(readCount).toBe(1);
  expect(renderCount).toBe(1);
});

test('unsupported images render a stable friendly error instead of throwing', () => {
  const preview = new TestImagePreview(
    {
      extname: () => '.gif',
      readBytes: () => {
        throw new Error('readBytes should not run without a decoder');
      },
    },
    {
      decoderFor: () => null,
    },
    {
      render: () => {
        throw new Error('renderer should not run after a decode error');
      },
    },
  );

  const firstRender = preview.render(
    '/picture.gif',
    20,
    10,
    '#000000',
    '#ff0000',
  );
  const secondRender = preview.render(
    '/picture.gif',
    20,
    10,
    '#000000',
    '#ff0000',
  );
  expect(secondRender).toBe(firstRender);
  expect(firstRender.chunks.map((chunk) => chunk.text).join('')).toContain(
    "Cannot preview this image — no decoder registered for '.gif' files",
  );
});
