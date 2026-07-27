import { Static } from 'ivue/extras';

// invariant: Narration speaks prose, not markdown syntax (src/modules/narration/narration.invariants.md)
// invariant: Inline code speaks its content, pronounceably, without backticks (src/modules/narration/narration.invariants.md)
// invariant: Internal tokens are never speakable (src/modules/narration/narration.invariants.md)

class $SpeakableText {
  /** Recognized source/file extensions — dropped from a BARE spoken name (`Editor.ts` → `Editor`). A
   *  closed list keeps prose abbreviations such as "e.g" intact. Inline code bypasses this transform. */
  protected static get CODE_EXTENSION(): RegExp {
    return /\.(ts|tsx|js|jsx|mjs|cjs|md|json|onnx|sh|py|rb|go|rs|c|cc|cpp|h|hpp|css|scss|html|vue|txt|yml|yaml|toml)$/i;
  }

  /** A whitespace-delimited token that reads as a filesystem path: starts with `/`, `~`, or `.`, or
   *  has at least two path separators. A single-slash word such as "and/or" remains prose. */
  protected static isPathLike(token: string): boolean {
    const slashCount = (token.match(/\//g) ?? []).length;
    if (slashCount === 0) return false;
    if (/^[~./]/.test(token)) return true;
    return slashCount >= 2;
  }

  /** Return the last meaningful segment of a path-like token and trim trailing prose punctuation. */
  protected static lastSegment(token: string): string {
    const cleanedToken = token.replace(/[.,;:!?)\]]+$/, '');
    const pathSegments = cleanedToken
      .split('/')
      .filter((pathSegment) => pathSegment.length > 0);
    return pathSegments.length > 0
      ? (pathSegments[pathSegments.length - 1] as string)
      : cleanedToken;
  }

  /** Drop a trailing known file extension so a bare filename is not spoken as "dot tee-ess". */
  protected static dropExtension(token: string): string {
    return token.replace(this.CODE_EXTENSION, '');
  }

  /** Split camelCase, PascalCase, snake_case, and kebab-case identifiers into spoken words. */
  protected static splitWords(identifier: string): string {
    return identifier
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Identify a bare prose token worth reading as a code identifier. The two-hump floor leaves common
   *  CamelCase brand words such as GitHub, JavaScript, and iPhone intact. */
  protected static isBareCodeIdentifier(token: string): boolean {
    const camelCaseBoundaryCount = (token.match(/[a-z][A-Z]/g) ?? []).length;
    return (
      camelCaseBoundaryCount >= 2 ||
      /[a-z]_[a-z]/i.test(token) ||
      this.CODE_EXTENSION.test(token)
    );
  }

  /** Make a bare prose token speakable while keeping trailing punctuation flush. Inline-code content
   *  is replaced by protected placeholders before this pass and therefore remains verbatim. */
  protected static speakBareToken(token: string): string {
    const tokenParts = /^(.*?)([.,;:!?)\]]*)$/.exec(token);
    const tokenCore = tokenParts?.[1] ?? token;
    const trailingPunctuation = tokenParts?.[2] ?? '';
    if (!tokenCore) return token;
    const urlParts = /^https?:\/\/([^/\s]+)/.exec(tokenCore);
    if (urlParts) {
      // A URL spoken segment-by-segment is babble; the host is the part a listener can use.
      return `${urlParts[1]} link${trailingPunctuation}`;
    }
    if (this.isPathLike(tokenCore)) {
      return (
        this.dropExtension(this.lastSegment(tokenCore)) + trailingPunctuation
      );
    }
    if (this.isBareCodeIdentifier(tokenCore)) {
      return (
        this.splitWords(this.dropExtension(tokenCore)) + trailingPunctuation
      );
    }
    return token;
  }

  /** Hex commit-ish token: 7-40 hex digits containing BOTH letters and digits (a bare number like
   *  1200000 stays a number; a bare word like "deadbeef"... also qualifies — speech prefers "hash"
   *  over eight spelled letters). */
  protected static get COMMIT_HASH_TOKEN(): RegExp {
    return /^[0-9a-f]{7,40}$/i;
  }

  protected static get UUID_TOKEN(): RegExp {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  }

  protected static get HEX_COLOR_TOKEN(): RegExp {
    return /^#[0-9a-f]{3,8}$/i;
  }

  /** A long mixed-alphabet run with digits and no path/prose shape — base64 payloads, tokens, keys. */
  protected static get ENCODED_DATA_TOKEN(): RegExp {
    return /^[A-Za-z0-9+/_-]{16,}={0,2}$/;
  }

  protected static get ESCAPE_SEQUENCE_TOKEN(): RegExp {
    return /\\x1b|\\e\[|\\u001b/;
  }

  /** Spoken stand-ins for tokens a speech engine can only spell letter-by-letter (the "bebebe"
   *  babble). Applied to the FINAL restored text, so inline-code content is covered too: the
   *  inline-code rule is "no backticks, content spoken in pronounceable form", not letter-junk. */
  protected static makeTokenPronounceable(token: string): string {
    const tokenParts = /^(.*?)([.,;:!?)\]]*)$/.exec(token);
    const tokenCore = tokenParts?.[1] ?? token;
    const trailingPunctuation = tokenParts?.[2] ?? '';
    if (!tokenCore) return token;
    if (this.UUID_TOKEN.test(tokenCore))
      return `identifier${trailingPunctuation}`;
    if (this.HEX_COLOR_TOKEN.test(tokenCore))
      return `color${trailingPunctuation}`;
    if (
      this.COMMIT_HASH_TOKEN.test(tokenCore) &&
      /[a-f]/i.test(tokenCore) &&
      /\d/.test(tokenCore)
    ) {
      return `hash${trailingPunctuation}`;
    }
    if (
      this.ENCODED_DATA_TOKEN.test(tokenCore) &&
      !tokenCore.includes('_') &&
      (tokenCore.endsWith('=') ||
        (/\d/.test(tokenCore) &&
          /[a-z]/.test(tokenCore) &&
          /[A-Z]/.test(tokenCore)))
    ) {
      return `encoded data${trailingPunctuation}`;
    }
    if (this.ESCAPE_SEQUENCE_TOKEN.test(tokenCore))
      return `escape sequence${trailingPunctuation}`;
    if (tokenCore === '&&') return `and${trailingPunctuation}`;
    if (tokenCore === '||') return `or${trailingPunctuation}`;
    if (/^--?[a-zA-Z][\w-]*$/.test(tokenCore)) {
      return (
        this.splitWords(tokenCore.replace(/^--?/, '')) + trailingPunctuation
      );
    }
    return token;
  }

  /** Speech-normalize the final text: babble tokens become spoken stand-ins, markdown table rows
   *  lose their pipe walls, and separator rows disappear. */
  protected static makePronounceable(text: string): string {
    const withoutTableChrome = text
      .replace(/\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?/g, ' ')
      .replace(/\s\|\s/g, ', ')
      .replace(/^\|\s*/g, '')
      .replace(/\s*\|$/g, '');
    return withoutTableChrome
      .split(/(\s+)/)
      .map((token) =>
        /\S/.test(token) ? this.makeTokenPronounceable(token) : token,
      )
      .join('')
      .replace(/,(\s*,)+/g, ',')
      .replace(/\s+/g, ' ')
      .trim();
  }

  protected static inlineCodePlaceholder(
    inlineCodeSentinelPrefix: string,
    inlineCodeIndex: number,
  ): string {
    return `${inlineCodeSentinelPrefix}${inlineCodeIndex}\uE001`;
  }

  protected static inlineCodePlaceholderPattern(
    inlineCodeSentinelPrefix: string,
  ): RegExp {
    return new RegExp(`${inlineCodeSentinelPrefix}\\d+\uE001`, 'gu');
  }

  /** Strip markdown decoration while preserving every single-backtick inline-code span's content in
   *  place. The final registry sweep is total: every extracted placeholder must be encountered exactly
   *  once and no placeholder prefix may survive. A failed proof returns the original text so no
   *  internal token can become speech. */
  static prepareForSpeech(markdown: string): SpeakableTextPreparation {
    const inlineCodeByPlaceholder = new Map<string, string>();
    let inlineCodeSentinelPrefix = '\uE000';
    while (markdown.includes(inlineCodeSentinelPrefix)) {
      inlineCodeSentinelPrefix += '\uE000';
    }

    let text = markdown;
    text = text.replace(/```[\s\S]*?```/g, ' code block ');
    text = text.replace(
      /`([^`\n]+)`/g,
      (_matchedInlineCode, inlineCodeContent: string) => {
        const inlineCodePlaceholder = this.inlineCodePlaceholder(
          inlineCodeSentinelPrefix,
          inlineCodeByPlaceholder.size,
        );
        inlineCodeByPlaceholder.set(inlineCodePlaceholder, inlineCodeContent);
        return inlineCodePlaceholder;
      },
    );
    text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
    text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
    text = text.replace(/^\s*[-*+]\s+/gm, '');
    text = text.replace(/^\s*>\s?/gm, '');
    // [\s\S] instead of dot: emphasis spans crossing a line break must still shed their markers.
    text = text.replace(/(\*\*|__)([\s\S]+?)\1/g, '$2');
    text = text.replace(/(\*|_)([\s\S]+?)\1/g, '$2');
    text = text
      .split(/(\s+)/)
      .map((token) => (/\S/.test(token) ? this.speakBareToken(token) : token))
      .join('');

    let restorationIsTotal = true;
    const speakableText = text
      .replace(/\s+/g, ' ')
      .trim()
      .replace(
        this.inlineCodePlaceholderPattern(inlineCodeSentinelPrefix),
        (inlineCodePlaceholder) => {
          const inlineCodeContent = inlineCodeByPlaceholder.get(
            inlineCodePlaceholder,
          );
          if (inlineCodeContent === undefined) {
            restorationIsTotal = false;
            return inlineCodePlaceholder;
          }
          inlineCodeByPlaceholder.delete(inlineCodePlaceholder);
          return inlineCodeContent;
        },
      );
    if (
      inlineCodeByPlaceholder.size > 0 ||
      speakableText.includes(inlineCodeSentinelPrefix)
    ) {
      restorationIsTotal = false;
    }
    if (!restorationIsTotal) {
      return { text: markdown, usedOriginalFallback: true };
    }
    return {
      text: this.makePronounceable(speakableText),
      usedOriginalFallback: false,
    };
  }

  static forSpeech(markdown: string): string {
    return this.prepareForSpeech(markdown).text;
  }
}

export namespace SpeakableText {
  export const $Class = $SpeakableText;
  export const Class = Static($SpeakableText);
}

export interface SpeakableTextPreparation {
  readonly text: string;
  readonly usedOriginalFallback: boolean;
}
