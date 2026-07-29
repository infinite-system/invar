import { expect, test } from 'bun:test';
import { ref } from 'vue';
import { MarkdownParser } from './MarkdownParser';
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

test('the final visible row hits and the row after it misses', () => {
  class TestMarkdownRenderable extends MarkdownRenderable.$Class {
    setVisibleReferenceRow(): void {
      Object.defineProperty(this, 'bodyRenderable', {
        value: { x: 4, y: 7 },
      });
      Object.defineProperty(this, 'preview', {
        value: {
          scrollLeft: ref(0),
          textForRow: () => 'Reference',
        },
      });
      this.visibleRowsSnapshot = [
        {
          block: {
            spans: [
              0,
              'Reference'.length,
              MarkdownParser.Class.inlineStyles.link,
              1,
            ],
            links: ['target.ts'],
          },
          blockIndex: 0,
          prefix: '',
          textStart: 0,
        },
      ] as never;
    }
  }

  const renderable = Object.create(
    TestMarkdownRenderable.prototype,
  ) as TestMarkdownRenderable;
  renderable.setVisibleReferenceRow();

  expect(renderable.referenceAtCell(4, 7)?.target).toBe('target.ts');
  expect(renderable.referenceAtCell(4, 8)).toBeNull();
});
