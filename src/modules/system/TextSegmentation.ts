import { Static } from 'ivue/extras';

class $TextSegmentation {
  protected static readonly graphemeSegmenter = new Intl.Segmenter(
    undefined,
    { granularity: 'grapheme' },
  );

  static graphemes(text: string): string[] {
    return Array.from(
      this.graphemeSegmenter.segment(text),
      (segment) => segment.segment,
    );
  }
}

export namespace TextSegmentation {
  export const $Class = $TextSegmentation;
  export const Class = Static($Class);
}
