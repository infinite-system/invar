import { Static } from 'ivue/extras';
import { EditorCoordinates } from '../editor/EditorCoordinates';

// Immediate-layer syntax highlighter: per-line tokenization into semantic role spans.
// This is the fast path that never blocks (Tree-sitter/LSP semantic tokens are the deferred
// upgrade, slotted behind the same LanguageRegistry seam — see KNOWN_LIMITATIONS.md).
//
// invariant: The immediate layer never blocks the deferred layer (project.invariants.md)
// invariant: Cost tracks the actively observed set (project.invariants.md)
//   — only the visible window is tokenized, one line at a time.

class $Highlighter {
  protected static get $typescriptKeywords(): ReadonlySet<string> {
    const typescriptKeywords = new Set([
      'abstract',
      'any',
      'as',
      'async',
      'await',
      'boolean',
      'break',
      'case',
      'catch',
      'class',
      'const',
      'continue',
      'debugger',
      'declare',
      'default',
      'delete',
      'do',
      'else',
      'enum',
      'export',
      'extends',
      'false',
      'finally',
      'for',
      'from',
      'function',
      'get',
      'if',
      'implements',
      'import',
      'in',
      'infer',
      'instanceof',
      'interface',
      'is',
      'keyof',
      'let',
      'namespace',
      'never',
      'new',
      'null',
      'number',
      'object',
      'of',
      'private',
      'protected',
      'public',
      'readonly',
      'return',
      'satisfies',
      'set',
      'static',
      'string',
      'super',
      'switch',
      'this',
      'throw',
      'true',
      'try',
      'type',
      'typeof',
      'undefined',
      'unknown',
      'var',
      'void',
      'while',
      'yield',
    ]);
    return typescriptKeywords;
  }

  protected static isIdentifierStart(character: string): boolean {
    return /[A-Za-z_$]/.test(character);
  }

  protected static isIdentifierPart(character: string): boolean {
    return /[A-Za-z0-9_$]/.test(character);
  }

  /** Tokenize a single line of TS/JS into role spans. Line-local (no cross-line block state). */
  protected static tokenizeCode(line: string): Span[] {
    const spans: Span[] = [];
    let index = 0;
    const length = line.length;
    const appendSpan = (text: string, role: Role) => {
      if (text) spans.push({ text, role });
    };
    // Doc-block CONTINUATION lines (line-local, mirroring the open-ended block-comment heuristic
    // below): a line whose first non-whitespace is `*` is the middle/closing line of a
    // `/** ... */` block — ` * prose`, a bare ` *`, or the closing ` */`. A `*` glued to an
    // identifier/bracket (a generator method like `*generate()` / `*[Symbol.iterator]()`) stays
    // code. Without this rule every middle line of a JSDoc block fell through to
    // identifier/operator roles and rendered in the default foreground.
    let leadingWhitespaceEnd = 0;
    while (
      leadingWhitespaceEnd < length &&
      (line[leadingWhitespaceEnd] === ' ' ||
        line[leadingWhitespaceEnd] === '\t')
    ) {
      leadingWhitespaceEnd++;
    }
    if (line[leadingWhitespaceEnd] === '*') {
      const following = line[leadingWhitespaceEnd + 1];
      if (following === '/') {
        // Closing ` */` — comment through the terminator; ordinary code may follow on the line.
        appendSpan(line.slice(0, leadingWhitespaceEnd + 2), 'comment');
        index = leadingWhitespaceEnd + 2;
      } else if (
        following === undefined ||
        following === ' ' ||
        following === '\t' ||
        following === '*'
      ) {
        return [{ text: line, role: 'comment' }];
      }
    }
    while (index < length) {
      const character = line[index]!;
      // line comment
      if (character === '/' && line[index + 1] === '/') {
        appendSpan(line.slice(index), 'comment');
        break;
      }
      // block comment (line-local; opens and may not close on this line)
      if (character === '/' && line[index + 1] === '*') {
        const commentEndIndex = line.indexOf('*/', index + 2);
        if (commentEndIndex === -1) {
          appendSpan(line.slice(index), 'comment');
          break;
        }
        appendSpan(line.slice(index, commentEndIndex + 2), 'comment');
        index = commentEndIndex + 2;
        continue;
      }
      // strings
      if (character === '"' || character === "'" || character === '`') {
        let scanIndex = index + 1;
        while (scanIndex < length && line[scanIndex] !== character) {
          if (line[scanIndex] === '\\') scanIndex++;
          scanIndex++;
        }
        appendSpan(
          line.slice(index, Math.min(scanIndex + 1, length)),
          'string',
        );
        index = scanIndex + 1;
        continue;
      }
      // numbers
      if (/[0-9]/.test(character)) {
        let scanIndex = index;
        while (scanIndex < length && /[0-9a-fA-FxX._]/.test(line[scanIndex]!))
          scanIndex++;
        appendSpan(line.slice(index, scanIndex), 'number');
        index = scanIndex;
        continue;
      }
      // identifiers / keywords / types / functions
      if (this.isIdentifierStart(character)) {
        let scanIndex = index;
        while (scanIndex < length && this.isIdentifierPart(line[scanIndex]!))
          scanIndex++;
        const word = line.slice(index, scanIndex);
        let role: Role = 'variable';
        if (this.$typescriptKeywords.has(word)) role = 'keyword';
        else if (/^[A-Z]/.test(word)) role = 'type';
        else if (line[scanIndex] === '(') role = 'func';
        appendSpan(word, role);
        index = scanIndex;
        continue;
      }
      // operators / punctuation
      if (/[+\-*/%=<>!&|^~?:.,;(){}\[\]]/.test(character)) {
        appendSpan(character, 'operator');
        index++;
        continue;
      }
      // whitespace / other
      appendSpan(character, 'text');
      index++;
    }
    return spans.length ? spans : [{ text: line, role: 'text' }];
  }

  protected static tokenizeJson(line: string): Span[] {
    const spans: Span[] = [];
    const pattern =
      /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}\[\],:])|(\s+)|(.)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
      if (match[1])
        spans.push({ text: match[1], role: 'type' }); // key
      else if (match[2]) spans.push({ text: match[2], role: 'string' });
      else if (match[3]) spans.push({ text: match[3], role: 'number' });
      else if (match[4]) spans.push({ text: match[4], role: 'keyword' });
      else if (match[5]) spans.push({ text: match[5], role: 'operator' });
      else spans.push({ text: match[0], role: 'text' });
    }
    return spans.length ? spans : [{ text: line, role: 'text' }];
  }

  protected static tokenizeMarkdown(line: string): Span[] {
    if (/^\s*#{1,6}\s/.test(line)) return [{ text: line, role: 'keyword' }];
    if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
      const match = line.match(/^(\s*(?:[-*+]|\d+\.)\s)(.*)$/);
      if (match)
        return [
          { text: match[1]!, role: 'operator' },
          { text: match[2]!, role: 'text' },
        ];
    }
    if (/^\s*>/.test(line)) return [{ text: line, role: 'comment' }];
    if (/^\s*```/.test(line)) return [{ text: line, role: 'string' }];
    // inline code
    if (line.includes('`')) {
      const spans: Span[] = [];
      const pattern = /`[^`]*`/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line))) {
        if (match.index > lastIndex)
          spans.push({
            text: line.slice(lastIndex, match.index),
            role: 'text',
          });
        spans.push({ text: match[0], role: 'string' });
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < line.length)
        spans.push({ text: line.slice(lastIndex), role: 'text' });
      return spans.length ? spans : [{ text: line, role: 'text' }];
    }
    return [{ text: line, role: 'text' }];
  }

  /** Tokenize one line of HTML (and, with `vue`, Vue-SFC template sugar: directives + interpolations).
   *  Line-local `insideTag` state, mirroring the block-comment heuristic in tokenizeCode — a tag that
   *  spans lines re-opens its attribute coloring on the next line, which is acceptable for the immediate
   *  layer (the deferred Tree-sitter upgrade is the exact-grammar path). */
  protected static tokenizeHtml(line: string, isVue: boolean): Span[] {
    const spans: Span[] = [];
    const appendSpan = (text: string, role: Role) => {
      if (text) spans.push({ text, role });
    };
    let index = 0;
    const length = line.length;
    let insideTag = false;
    while (index < length) {
      const character = line[index]!;
      if (!insideTag) {
        // HTML comment (line-local; may not close on this line)
        if (line.startsWith('<!--', index)) {
          const commentEndIndex = line.indexOf('-->', index + 4);
          if (commentEndIndex === -1) {
            appendSpan(line.slice(index), 'comment');
            break;
          }
          appendSpan(line.slice(index, commentEndIndex + 3), 'comment');
          index = commentEndIndex + 3;
          continue;
        }
        // Vue interpolation {{ expression }}
        if (isVue && line.startsWith('{{', index)) {
          const interpolationEndIndex = line.indexOf('}}', index + 2);
          appendSpan('{{', 'operator');
          appendSpan(
            line.slice(
              index + 2,
              interpolationEndIndex === -1 ? length : interpolationEndIndex,
            ),
            'variable',
          );
          if (interpolationEndIndex !== -1) appendSpan('}}', 'operator');
          index =
            interpolationEndIndex === -1 ? length : interpolationEndIndex + 2;
          continue;
        }
        // Tag open <tag / close </tag: the bracket is an operator, the tag name a keyword.
        if (character === '<') {
          let scanIndex = index + 1;
          const isClosingTag = line[scanIndex] === '/';
          if (isClosingTag) scanIndex++;
          appendSpan(isClosingTag ? '</' : '<', 'operator');
          index = scanIndex;
          const nameStart = index;
          while (index < length && /[A-Za-z0-9-]/.test(line[index]!)) index++;
          appendSpan(line.slice(nameStart, index), 'keyword');
          insideTag = true;
          continue;
        }
        // Entity &name; / &#123;
        if (character === '&') {
          const semicolon = line.indexOf(';', index);
          if (semicolon !== -1 && semicolon - index <= 10) {
            appendSpan(line.slice(index, semicolon + 1), 'type');
            index = semicolon + 1;
            continue;
          }
          appendSpan('&', 'text');
          index++;
          continue;
        }
        // Plain text up to the next tag / entity / interpolation.
        const textStart = index;
        while (
          index < length &&
          line[index] !== '<' &&
          line[index] !== '&' &&
          !(isVue && line.startsWith('{{', index))
        ) {
          index++;
        }
        appendSpan(line.slice(textStart, index), 'text');
        continue;
      }
      // Inside a tag: close, attribute value, '=', or attribute name.
      if (character === '>') {
        appendSpan('>', 'operator');
        insideTag = false;
        index++;
        continue;
      }
      if (character === '/' && line[index + 1] === '>') {
        appendSpan('/>', 'operator');
        insideTag = false;
        index += 2;
        continue;
      }
      if (character === '"' || character === "'") {
        let scanIndex = index + 1;
        while (scanIndex < length && line[scanIndex] !== character) scanIndex++;
        appendSpan(
          line.slice(index, Math.min(scanIndex + 1, length)),
          'string',
        );
        index = scanIndex + 1;
        continue;
      }
      if (character === '=') {
        appendSpan('=', 'operator');
        index++;
        continue;
      }
      if (/[A-Za-z_@:#]/.test(character)) {
        const nameStart = index;
        while (index < length && /[A-Za-z0-9_@:#.\-]/.test(line[index]!))
          index++;
        const attribute = line.slice(nameStart, index);
        // Vue directives (v-*, @event, :bind, #slot) pop as keywords; ordinary attributes are variables.
        const isVueDirective = isVue && /^(v-|@|:|#)/.test(attribute);
        appendSpan(attribute, isVueDirective ? 'keyword' : 'variable');
        continue;
      }
      appendSpan(character, 'text');
      index++;
    }
    return spans.length ? spans : [{ text: line, role: 'text' }];
  }

  /** Tokenize one line of CSS. Line-local (block comments/values that span lines re-color per line).
   *  A property is an identifier immediately followed by ':' (keyword); selectors (.class/#id/@rule) and
   *  values/colors/units get their own roles. */
  protected static tokenizeCss(line: string): Span[] {
    const spans: Span[] = [];
    const appendSpan = (text: string, role: Role) => {
      if (text) spans.push({ text, role });
    };
    let index = 0;
    const length = line.length;
    while (index < length) {
      const character = line[index]!;
      // Block comment (line-local)
      if (character === '/' && line[index + 1] === '*') {
        const commentEndIndex = line.indexOf('*/', index + 2);
        if (commentEndIndex === -1) {
          appendSpan(line.slice(index), 'comment');
          break;
        }
        appendSpan(line.slice(index, commentEndIndex + 2), 'comment');
        index = commentEndIndex + 2;
        continue;
      }
      // String
      if (character === '"' || character === "'") {
        let scanIndex = index + 1;
        while (scanIndex < length && line[scanIndex] !== character) {
          if (line[scanIndex] === '\\') scanIndex++;
          scanIndex++;
        }
        appendSpan(
          line.slice(index, Math.min(scanIndex + 1, length)),
          'string',
        );
        index = scanIndex + 1;
        continue;
      }
      // #hex color, else #id selector
      if (character === '#') {
        const hexColor = line.slice(index).match(/^#[0-9a-fA-F]{3,8}\b/);
        if (hexColor) {
          appendSpan(hexColor[0], 'number');
          index += hexColor[0].length;
          continue;
        }
        let scanIndex = index + 1;
        while (scanIndex < length && /[A-Za-z0-9_-]/.test(line[scanIndex]!))
          scanIndex++;
        appendSpan(line.slice(index, scanIndex), 'type');
        index = scanIndex;
        continue;
      }
      // .class selector
      if (character === '.' && /[A-Za-z_-]/.test(line[index + 1] ?? '')) {
        let scanIndex = index + 1;
        while (scanIndex < length && /[A-Za-z0-9_-]/.test(line[scanIndex]!))
          scanIndex++;
        appendSpan(line.slice(index, scanIndex), 'type');
        index = scanIndex;
        continue;
      }
      // @media / @import at-rule
      if (character === '@') {
        let scanIndex = index + 1;
        while (scanIndex < length && /[A-Za-z-]/.test(line[scanIndex]!))
          scanIndex++;
        appendSpan(line.slice(index, scanIndex), 'keyword');
        index = scanIndex;
        continue;
      }
      // !important
      if (character === '!') {
        const importantKeyword = line.slice(index).match(/^![A-Za-z]+/);
        if (importantKeyword) {
          appendSpan(importantKeyword[0], 'keyword');
          index += importantKeyword[0].length;
          continue;
        }
      }
      // number with optional unit
      if (
        /[0-9]/.test(character) ||
        (character === '-' && /[0-9.]/.test(line[index + 1] ?? ''))
      ) {
        const numberWithUnit = line
          .slice(index)
          .match(/^-?\d*\.?\d+(px|em|rem|%|vh|vw|vmin|vmax|pt|fr|s|ms|deg)?/);
        if (numberWithUnit) {
          appendSpan(numberWithUnit[0], 'number');
          index += numberWithUnit[0].length;
          continue;
        }
      }
      // identifier: a property (followed by ':') is a keyword; otherwise a value/variable
      if (/[A-Za-z_-]/.test(character)) {
        let scanIndex = index;
        while (scanIndex < length && /[A-Za-z0-9_-]/.test(line[scanIndex]!))
          scanIndex++;
        const word = line.slice(index, scanIndex);
        let lookAhead = scanIndex;
        while (lookAhead < length && line[lookAhead] === ' ') lookAhead++;
        appendSpan(word, line[lookAhead] === ':' ? 'keyword' : 'variable');
        index = scanIndex;
        continue;
      }
      // punctuation
      if (/[{}();:,>+~*=[\]]/.test(character)) {
        appendSpan(character, 'operator');
        index++;
        continue;
      }
      appendSpan(character, 'text');
      index++;
    }
    return spans.length ? spans : [{ text: line, role: 'text' }];
  }

  static highlightLine(line: string, language: LangId): Span[] {
    if (language === 'diff') {
      // Line-level diff coloring: whole-line roles keyed by the unified-diff prefix.
      if (line.startsWith('+')) return [{ text: line, role: 'added' }];
      if (line.startsWith('-')) return [{ text: line, role: 'removed' }];
      if (line.startsWith('@@')) return [{ text: line, role: 'func' }];
      if (line.startsWith('diff ') || line.startsWith('index '))
        return [{ text: line, role: 'comment' }];
      return [{ text: line, role: 'text' }];
    }
    switch (language) {
      case 'typescript':
      case 'javascript':
        return this.tokenizeCode(line);
      case 'json':
        return this.tokenizeJson(line);
      case 'markdown':
        return this.tokenizeMarkdown(line);
      case 'html':
        return this.tokenizeHtml(line, false);
      case 'vue':
        return this.tokenizeHtml(line, true);
      case 'css':
        return this.tokenizeCss(line);
      default:
        return [{ text: line, role: 'text' }];
    }
  }

  /**
   * Slice a logical line's span list to a GRAPHEME window [startGrapheme, endGrapheme) — the span
   * mapping for wrap continuations and any sub-window of an already-tokenized line. Roles survive
   * the cut: a comment span sliced mid-way stays a comment on both sides, which is exactly what a
   * per-slice RE-tokenization loses (a wrap continuation of `// ...` has no `//` prefix to see).
   * Grapheme-safe by construction — partial spans cut at grapheme boundaries, never inside a cluster.
   */
  static sliceSpans(
    spans: readonly Span[],
    startGrapheme: number,
    endGrapheme: number,
  ): Span[] {
    const sliced: Span[] = [];
    let spanStartGrapheme = 0;
    for (const span of spans) {
      const spanGraphemeCount = EditorCoordinates.Class.graphemeCount(
        span.text,
      );
      const spanEndGrapheme = spanStartGrapheme + spanGraphemeCount;
      if (spanEndGrapheme <= startGrapheme) {
        spanStartGrapheme = spanEndGrapheme;
        continue;
      }
      if (spanStartGrapheme >= endGrapheme) break;
      const sliceStartInSpan =
        Math.max(startGrapheme, spanStartGrapheme) - spanStartGrapheme;
      const sliceEndInSpan =
        Math.min(endGrapheme, spanEndGrapheme) - spanStartGrapheme;
      const text =
        sliceStartInSpan === 0 && sliceEndInSpan === spanGraphemeCount
          ? span.text
          : span.text.slice(
              EditorCoordinates.Class.graphemeToU16(
                span.text,
                sliceStartInSpan,
              ),
              EditorCoordinates.Class.graphemeToU16(span.text, sliceEndInSpan),
            );
      if (text) sliced.push({ text, role: span.role });
      spanStartGrapheme = spanEndGrapheme;
    }
    return sliced;
  }
}

export namespace Highlighter {
  export const $Class = Static($Highlighter);
  export let Class = $Class;
}

export type Role =
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'func'
  | 'type'
  | 'operator'
  | 'variable'
  | 'added'
  | 'removed'
  | 'text';

export interface Span {
  text: string;
  role: Role;
}

export type LangId =
  | 'typescript'
  | 'javascript'
  | 'json'
  | 'markdown'
  | 'html'
  | 'css'
  | 'vue'
  | 'diff'
  | 'plain';
