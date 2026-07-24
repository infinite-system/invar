import { Static } from 'ivue/extras';

// invariant: Narration speaks prose, not markdown syntax (src/modules/narration/narration.invariants.md)
// invariant: Inline code content is preserved without backticks (src/modules/narration/narration.invariants.md)

class $SpeakableText {
  /** Recognized source/file extensions — dropped from a BARE spoken name (`Editor.ts` → `Editor`). A
   *  closed list keeps prose abbreviations such as "e.g" intact. Inline code bypasses this transform. */
  protected static get codeExtension(): RegExp {
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
    const pathSegments = cleanedToken.split('/').filter((pathSegment) => pathSegment.length > 0);
    return pathSegments.length > 0
      ? (pathSegments[pathSegments.length - 1] as string)
      : cleanedToken;
  }

  /** Drop a trailing known file extension so a bare filename is not spoken as "dot tee-ess". */
  protected static dropExtension(token: string): string {
    return token.replace(this.codeExtension, '');
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
      camelCaseBoundaryCount >= 2
      || /[a-z]_[a-z]/i.test(token)
      || this.codeExtension.test(token)
    );
  }

  /** Make a bare prose token speakable while keeping trailing punctuation flush. Inline-code content
   *  is replaced by protected placeholders before this pass and therefore remains verbatim. */
  protected static speakBareToken(token: string): string {
    const tokenParts = /^(.*?)([.,;:!?)\]]*)$/.exec(token);
    const tokenCore = tokenParts?.[1] ?? token;
    const trailingPunctuation = tokenParts?.[2] ?? '';
    if (!tokenCore) return token;
    if (this.isPathLike(tokenCore)) {
      return this.dropExtension(this.lastSegment(tokenCore)) + trailingPunctuation;
    }
    if (this.isBareCodeIdentifier(tokenCore)) {
      return this.splitWords(this.dropExtension(tokenCore)) + trailingPunctuation;
    }
    return token;
  }

  protected static inlineCodePlaceholder(
    inlineCodeSentinelPrefix: string,
    inlineCodeIndex: number,
  ): string {
    return `${inlineCodeSentinelPrefix}${inlineCodeIndex}\uE001`;
  }

  /** Strip markdown decoration while preserving every single-backtick inline-code span's content in
   *  place. Fenced code blocks retain their existing spoken "code block" placeholder. */
  static forSpeech(markdown: string): string {
    const inlineCodeContents: string[] = [];
    let inlineCodeSentinelPrefix = '\uE000';
    while (markdown.includes(inlineCodeSentinelPrefix)) {
      inlineCodeSentinelPrefix += '\uE000';
    }

    let text = markdown;
    text = text.replace(/```[\s\S]*?```/g, ' code block ');
    text = text.replace(
      /`([^`\n]+)`/g,
      (_matchedInlineCode, inlineCodeContent: string) => {
        const inlineCodeIndex = inlineCodeContents.length;
        inlineCodeContents.push(inlineCodeContent);
        return this.inlineCodePlaceholder(inlineCodeSentinelPrefix, inlineCodeIndex);
      },
    );
    text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
    text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
    text = text.replace(/^\s*[-*+]\s+/gm, '');
    text = text.replace(/^\s*>\s?/gm, '');
    text = text.replace(/(\*\*|__)(.+?)\1/g, '$2');
    text = text.replace(/(\*|_)(.+?)\1/g, '$2');
    text = text
      .split(/(\s+)/)
      .map((token) => (/\S/.test(token) ? this.speakBareToken(token) : token))
      .join('');

    let speakableText = text.replace(/\s+/g, ' ').trim();
    for (
      let inlineCodeIndex = 0;
      inlineCodeIndex < inlineCodeContents.length;
      inlineCodeIndex += 1
    ) {
      const inlineCodeContent = inlineCodeContents[inlineCodeIndex] as string;
      const inlineCodePlaceholder = this.inlineCodePlaceholder(
        inlineCodeSentinelPrefix,
        inlineCodeIndex,
      );
      speakableText = speakableText.replaceAll(
        inlineCodePlaceholder,
        () => inlineCodeContent,
      );
    }
    return speakableText;
  }
}

export namespace SpeakableText {
  export const $Class = $SpeakableText;
  export const Class = Static($SpeakableText);
}
