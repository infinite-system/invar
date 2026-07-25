import { Static } from 'ivue/extras';

class $TextSegmentation {
  protected static get $graphemeSegmenter(): Intl.Segmenter {
    const graphemeSegmenter = new Intl.Segmenter(undefined, {
      granularity: 'grapheme',
    });
    Object.defineProperty(this, '$graphemeSegmenter', {
      configurable: true,
      value: graphemeSegmenter,
    });
    return graphemeSegmenter;
  }

  protected static get $wordSegmenter(): Intl.Segmenter {
    const wordSegmenter = new Intl.Segmenter(undefined, {
      granularity: 'word',
    });
    Object.defineProperty(this, '$wordSegmenter', {
      configurable: true,
      value: wordSegmenter,
    });
    return wordSegmenter;
  }

  static graphemes(text: string): string[] {
    return Array.from(
      this.$graphemeSegmenter.segment(text),
      (segment) => segment.segment,
    );
  }

  static words(text: string): TextWordSegment[] {
    return Array.from(this.$wordSegmenter.segment(text), (segment) => ({
      text: segment.segment,
      utf16Offset: segment.index,
      isWordLike: segment.isWordLike ?? false,
    }));
  }
}

export namespace TextSegmentation {
  export const $Class = $TextSegmentation;
  export const Class = Static($Class);
}

export interface TextWordSegment {
  readonly text: string;
  readonly utf16Offset: number;
  readonly isWordLike: boolean;
}
