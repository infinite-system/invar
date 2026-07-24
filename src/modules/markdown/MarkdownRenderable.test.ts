import { expect, test } from 'bun:test';
import { MarkdownRenderable } from './MarkdownRenderable';

test('reference keys remain reachable through an overridable prototype seam', () => {
  class CustomMarkdownRenderable extends MarkdownRenderable.$Class {
    protected override referenceKey(
      blockIndex: number,
      spanStart: number,
      spanEnd: number,
      inlineStyle: number,
    ): string {
      return `custom:${super.referenceKey(
        blockIndex,
        spanStart,
        spanEnd,
        inlineStyle,
      )}`;
    }

    createReferenceKey(
      blockIndex: number,
      spanStart: number,
      spanEnd: number,
      inlineStyle: number,
    ): string {
      return this.referenceKey(blockIndex, spanStart, spanEnd, inlineStyle);
    }
  }

  const renderable = Object.create(
    CustomMarkdownRenderable.prototype,
  ) as CustomMarkdownRenderable;
  expect(renderable.createReferenceKey(2, 3, 5, 4)).toBe('custom:2:3:5:4');
});
