import { Static } from 'ivue/extras';

// invariant: Wrapped surfaces share one break generator (project.invariants.md)
// invariant: Seams are drawn at the shared generator (project.invariants.md)
class $WrapBreakOpportunity {
  static breakKindBetween(
    previousText: string,
    nextGrapheme: string | undefined,
    breakProfile: WrapBreakProfile,
  ): WrapBreakKind | null {
    if (previousText.length === 0) return null;
    if (this.isWhitespace(previousText)) return 'whitespace';
    if (previousText === '-') return 'separator';
    if (breakProfile === 'prose') return null;
    if (
      this.codeSeparators.includes(previousText) ||
      this.openingBrackets.includes(previousText)
    ) {
      return 'separator';
    }
    if (
      nextGrapheme !== undefined &&
      this.closingBrackets.includes(nextGrapheme)
    ) {
      return 'bracket';
    }
    if (
      this.isAsciiLowercase(previousText) &&
      this.isAsciiUppercase(nextGrapheme)
    ) {
      return 'camel-case';
    }
    const previousIsOperator = this.codeOperators.includes(previousText);
    const nextIsOperator =
      nextGrapheme !== undefined && this.codeOperators.includes(nextGrapheme);
    return previousIsOperator !== nextIsOperator ? 'operator' : null;
  }

  static previousBreakOpportunity(
    graphemes: readonly string[],
    segmentStart: number,
    fittingEnd: number,
    breakProfile: WrapBreakProfile,
  ): number {
    const boundedEnd = Math.max(
      segmentStart,
      Math.min(fittingEnd, graphemes.length),
    );
    for (
      let breakIndex = boundedEnd;
      breakIndex > segmentStart;
      breakIndex -= 1
    ) {
      if (
        this.breakKindBetween(
          graphemes[breakIndex - 1]!,
          graphemes[breakIndex],
          breakProfile,
        ) !== null
      ) {
        return breakIndex;
      }
    }
    return segmentStart;
  }

  protected static isWhitespace(text: string): boolean {
    if (text.length === 0) return false;
    for (let utf16Offset = 0; utf16Offset < text.length; utf16Offset += 1) {
      const codePoint = text.codePointAt(utf16Offset);
      if (codePoint === undefined || !this.isWhitespaceCodePoint(codePoint)) {
        return false;
      }
      if (codePoint > 0xffff) utf16Offset += 1;
    }
    return true;
  }

  protected static get codeSeparators(): string {
    return '_/\\.,;:';
  }

  protected static get openingBrackets(): string {
    return '([{';
  }

  protected static get closingBrackets(): string {
    return ')]}';
  }

  protected static get codeOperators(): string {
    return '=+*%<>!&|^?~';
  }

  protected static isWhitespaceCodePoint(codePoint: number): boolean {
    return (
      (codePoint >= 0x0009 && codePoint <= 0x000d) ||
      codePoint === 0x0020 ||
      codePoint === 0x00a0 ||
      codePoint === 0x1680 ||
      (codePoint >= 0x2000 && codePoint <= 0x200a) ||
      codePoint === 0x2028 ||
      codePoint === 0x2029 ||
      codePoint === 0x202f ||
      codePoint === 0x205f ||
      codePoint === 0x3000 ||
      codePoint === 0xfeff
    );
  }

  protected static isAsciiLowercase(grapheme: string | undefined): boolean {
    return (
      grapheme !== undefined &&
      grapheme.length === 1 &&
      grapheme >= 'a' &&
      grapheme <= 'z'
    );
  }

  protected static isAsciiUppercase(grapheme: string | undefined): boolean {
    return (
      grapheme !== undefined &&
      grapheme.length === 1 &&
      grapheme >= 'A' &&
      grapheme <= 'Z'
    );
  }
}

export namespace WrapBreakOpportunity {
  export const $Class = $WrapBreakOpportunity;
  export const Class = Static($Class);
}

export type WrapBreakProfile = 'prose' | 'code';

export type WrapBreakKind =
  'whitespace' | 'separator' | 'bracket' | 'camel-case' | 'operator';
