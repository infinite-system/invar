import { TextCoordinates } from '../text/TextCoordinates';
import type { TextDocument } from '../text/TextDocument';

/**
 * One compiled, single-line text query. In-file and workspace search both use this class so accepted
 * syntax, canonical spans, capture groups, and replacement expansion cannot drift between surfaces.
 *
 * invariant: Seams are drawn at the shared generator (project.invariants.md)
 */
class $TextSearchPattern {
  constructor(readonly query: TextSearchQuery) {
    const compilation = this.compileRegularExpression();
    this.regularExpression = compilation.regularExpression;
    this.error = compilation.error;
  }

  readonly regularExpression: RegExp | null;
  readonly error: string;

  get valid(): boolean {
    return this.regularExpression !== null;
  }

  /** The query source passed to ripgrep. Whole-word and case options remain explicit arguments. */
  get ripgrepPattern(): string {
    return this.query.text;
  }

  matchesInDocument(
    document: TextDocument.Model,
    maximumMatchCount = Number.POSITIVE_INFINITY,
  ): readonly TextSearchMatch[] {
    const matches: TextSearchMatch[] = [];
    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
      this.appendLineMatches(
        matches,
        document.line(lineIndex),
        lineIndex,
        maximumMatchCount,
      );
      if (matches.length >= maximumMatchCount) break;
    }
    return matches;
  }

  matchesInText(
    text: string,
    maximumMatchCount = Number.POSITIVE_INFINITY,
  ): readonly TextSearchMatch[] {
    const matches: TextSearchMatch[] = [];
    const lines = text.split(/\r\n|\n|\r/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      this.appendLineMatches(
        matches,
        lines[lineIndex] ?? '',
        lineIndex,
        maximumMatchCount,
      );
      if (matches.length >= maximumMatchCount) break;
    }
    return matches;
  }

  expandReplacement(replacement: string, match: TextSearchMatch): string {
    return replacement.replace(
      /\$(\$|&|`|'|<([^>]+)>|(\d{1,2}))/g,
      (
        replacementToken,
        substitutionToken: string,
        capturedName: string | undefined,
        capturedNumberText: string | undefined,
      ) => {
        if (substitutionToken === '$') return '$';
        if (substitutionToken === '&') return match.matchedText;
        if (substitutionToken === '`') {
          return match.lineText.slice(0, match.startUtf16Offset);
        }
        if (substitutionToken === "'") {
          return match.lineText.slice(match.endUtf16Offset);
        }
        if (capturedName !== undefined) {
          if (match.namedCapturedTexts === undefined) return replacementToken;
          return match.namedCapturedTexts[capturedName] ?? '';
        }

        const capturedNumber = Number(capturedNumberText);
        if (
          capturedNumber > 0 &&
          capturedNumber <= match.capturedTexts.length
        ) {
          return match.capturedTexts[capturedNumber - 1] ?? '';
        }

        if (capturedNumberText?.length === 2) {
          const firstCapturedNumber = Number(capturedNumberText[0]);
          if (
            firstCapturedNumber > 0 &&
            firstCapturedNumber <= match.capturedTexts.length
          ) {
            return (
              (match.capturedTexts[firstCapturedNumber - 1] ?? '') +
              capturedNumberText[1]
            );
          }
        }
        return replacementToken;
      },
    );
  }

  protected appendLineMatches(
    matches: TextSearchMatch[],
    lineText: string,
    lineIndex: number,
    maximumMatchCount: number,
  ): void {
    const regularExpression = this.regularExpression;
    if (regularExpression === null) return;
    regularExpression.lastIndex = 0;
    let regularExpressionMatch: RegExpExecArray | null;
    while (
      (regularExpressionMatch = regularExpression.exec(lineText)) !== null
    ) {
      const startUtf16Offset = regularExpressionMatch.index;
      const endUtf16Offset =
        startUtf16Offset + regularExpressionMatch[0].length;
      matches.push({
        line: lineIndex,
        startColumn: TextCoordinates.Class.u16ToGrapheme(
          lineText,
          startUtf16Offset,
        ),
        endColumn: TextCoordinates.Class.u16ToGrapheme(
          lineText,
          endUtf16Offset,
        ),
        startUtf16Offset,
        endUtf16Offset,
        matchedText: regularExpressionMatch[0],
        capturedTexts: regularExpressionMatch.slice(1),
        namedCapturedTexts: regularExpressionMatch.groups,
        lineText,
      });
      if (matches.length >= maximumMatchCount) return;

      if (regularExpressionMatch[0].length === 0) {
        regularExpression.lastIndex = this.nextUtf16Offset(
          lineText,
          startUtf16Offset,
        );
      }
    }
  }

  protected compileRegularExpression(): TextSearchPatternCompilation {
    if (this.query.text.length === 0) {
      return { regularExpression: null, error: '' };
    }
    if (this.query.useRegex) {
      const compatibilityError = this.regexCompatibilityError(this.query.text);
      if (compatibilityError.length > 0) {
        return { regularExpression: null, error: compatibilityError };
      }
    }

    const querySource = this.query.useRegex
      ? this.query.text
      : this.escapeRegularExpression(this.query.text);
    const regularExpressionSource = this.query.wholeWord
      ? `\\b(?:${querySource})\\b`
      : querySource;
    try {
      return {
        regularExpression: new RegExp(
          regularExpressionSource,
          this.query.caseSensitive ? 'gu' : 'giu',
        ),
        error: '',
      };
    } catch (error) {
      return {
        regularExpression: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  protected regexCompatibilityError(source: string): string {
    if (
      source.includes('\n') ||
      source.includes('\r') ||
      /\\[nr]/.test(source)
    ) {
      return 'Workspace search accepts single-line regular expressions only.';
    }
    if (/\\(?:[1-9]\d*|k<)/.test(source)) {
      return 'Backreferences are not supported by both search engines.';
    }
    if (/\(\?(?:[=!]|<[=!])/.test(source)) {
      return 'Look-around is not supported by both search engines.';
    }
    return '';
  }

  protected escapeRegularExpression(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  protected nextUtf16Offset(text: string, offset: number): number {
    if (offset >= text.length) return offset + 1;
    const codePoint = text.codePointAt(offset);
    return offset + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1);
  }
}

export namespace TextSearchPattern {
  export const $Class = $TextSearchPattern;
  export let Class = $Class;
  export type Instance = InstanceType<typeof Class>;
}

export interface TextSearchQuery {
  readonly text: string;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly useRegex: boolean;
}

export interface TextSearchMatch {
  readonly line: number;
  readonly startColumn: number;
  readonly endColumn: number;
  readonly startUtf16Offset: number;
  readonly endUtf16Offset: number;
  readonly matchedText: string;
  readonly capturedTexts: readonly (string | undefined)[];
  readonly namedCapturedTexts:
    Readonly<Record<string, string | undefined>> | undefined;
  readonly lineText: string;
}

interface TextSearchPatternCompilation {
  readonly regularExpression: RegExp | null;
  readonly error: string;
}
