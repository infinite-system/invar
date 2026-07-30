import { Static } from 'ivue/extras';
import type { Palette } from '../theme/ThemePalettes';
import type { BlockKind, BlockRecord } from './MarkdownParser';
import type { PreviewRowRole } from './MarkdownPreview';

// invariant: Markdown presentation resolves through one stylesheet (src/modules/markdown/markdown.invariants.md)
// invariant: Seams are drawn at the shared generator (project.invariants.md)
/** The css-in-terminal stylesheet for the Markdown preview. Every mapping from a markdown
 *  element class (heading level, paragraph, blockquote, code fence, list, table, rule) to
 *  terminal presentation (pane padding, margins, prefixes, frame glyphs, palette slots, text
 *  attributes) lives here. `MarkdownPreview` asks it for geometry, `MarkdownRenderable` asks
 *  it for paint, and themes stay upstream: the stylesheet names palette SLOTS, never colors. */
class $MarkdownStylesheet {
  /** Breathing room between the pane edges and every rendered row, in display cells. */
  protected static get $panePadding(): MarkdownPanePadding {
    const panePadding: MarkdownPanePadding = Object.freeze({
      left: 2,
      right: 2,
      top: 1,
    });
    return panePadding;
  }

  static get panePadding(): MarkdownPanePadding {
    return this.$panePadding;
  }

  static get panePaddingText(): string {
    return ' '.repeat(this.$panePadding.left);
  }

  /** One rule per element selector: vertical margins (collapsed CSS-style between neighbours)
   *  plus the text presentation for rows of that element. */
  protected static get $elementRules(): Readonly<
    Record<MarkdownElementSelector, MarkdownElementRule>
  > {
    const inherit = null;
    const rules: Record<MarkdownElementSelector, MarkdownElementRule> = {
      heading1: this.buildRule(2, 1, 'keyword', inherit, { bold: true }),
      heading2: this.buildRule(2, 1, 'accent', inherit, { bold: true }),
      heading3: this.buildRule(1, 1, 'accent', inherit, {}),
      heading4: this.buildRule(1, 1, 'fg', inherit, { bold: true }),
      heading5: this.buildRule(1, 1, 'dim', inherit, { bold: true }),
      heading6: this.buildRule(1, 1, 'dim', inherit, {
        bold: true,
        italic: true,
      }),
      paragraph: this.buildRule(1, 1, 'fg', inherit, {}),
      blockquote: this.buildRule(1, 1, 'dim', inherit, { italic: true }),
      listItem: this.buildRule(0, 0, 'fg', inherit, {}),
      codeBlock: this.buildRule(1, 1, 'string', 'panel', {}),
      codeBorder: this.buildRule(1, 1, 'border', inherit, {}),
      table: this.buildRule(1, 1, 'fg', inherit, {}),
      tableHeader: this.buildRule(0, 0, 'fg', inherit, { bold: true }),
      tableBody: this.buildRule(0, 0, 'fg', inherit, {}),
      tableBorder: this.buildRule(0, 0, 'border', inherit, {}),
      rule: this.buildRule(1, 1, 'dim', inherit, {}),
      status: this.buildRule(0, 0, 'dim', inherit, { italic: true }),
      spacer: this.buildRule(0, 0, 'fg', inherit, {}),
    };
    return Object.freeze(rules);
  }

  /** Inline run presentation layered over the containing element's style; a null color slot
   *  inherits the element color. */
  protected static get $inlineRules(): Readonly<
    Record<MarkdownInlineSelector, MarkdownTextStyle>
  > {
    const rules: Record<MarkdownInlineSelector, MarkdownTextStyle> = {
      inlineCode: this.buildTextStyle('string', 'panel', {}),
      inlineEmphasis: this.buildTextStyle(null, null, { italic: true }),
      inlineStrong: this.buildTextStyle(null, null, { bold: true }),
      inlineLink: this.buildTextStyle('accent', null, { underline: true }),
    };
    return Object.freeze(rules);
  }

  /** Decorative prefix presentation per row role (quote bar, list markers, code gutter). */
  protected static get $prefixRules(): Readonly<
    Partial<Record<PreviewRowRole, MarkdownTextStyle>>
  > {
    const rules: Partial<Record<PreviewRowRole, MarkdownTextStyle>> = {
      quote: this.buildTextStyle('accent', null, { bold: true }),
      codeContent: this.buildTextStyle('border', 'panel', {}),
    };
    return Object.freeze(rules);
  }

  protected static get $defaultPrefixStyle(): MarkdownTextStyle {
    return this.buildTextStyle('accent', null, {});
  }

  protected static get $findHighlightStyle(): MarkdownTextStyle {
    return this.buildTextStyle(null, 'cursorLine', {});
  }

  protected static get $referenceHoverStyle(): MarkdownTextStyle {
    return this.buildTextStyle('accent', null, { bold: true, underline: true });
  }

  protected static get $deadReferenceStyle(): MarkdownTextStyle {
    return this.buildTextStyle('error', null, { underline: true });
  }

  /** Structural vocabulary: quote bar, list markers, code frame, rule glyph. */
  protected static get $vocabulary(): MarkdownStyleVocabulary {
    const vocabulary: MarkdownStyleVocabulary = Object.freeze({
      quoteBarPrefix: '│ ',
      listMarkerFallback: '•',
      listIndentPerLevel: 2,
      ruleGlyph: '─',
      codeFrame: Object.freeze({
        topLeft: '┌',
        topRight: '┐',
        bottomLeft: '└',
        bottomRight: '┘',
        horizontal: '─',
        vertical: '│',
      }),
    });
    return vocabulary;
  }

  static get vocabulary(): MarkdownStyleVocabulary {
    return this.$vocabulary;
  }

  static elementRule(selector: MarkdownElementSelector): MarkdownElementRule {
    return this.$elementRules[selector];
  }

  static textStyle(selector: MarkdownElementSelector): MarkdownTextStyle {
    return this.$elementRules[selector].text;
  }

  static inlineTextStyle(selector: MarkdownInlineSelector): MarkdownTextStyle {
    return this.$inlineRules[selector];
  }

  static prefixStyle(role: PreviewRowRole): MarkdownTextStyle {
    return this.$prefixRules[role] ?? this.$defaultPrefixStyle;
  }

  static get findHighlightStyle(): MarkdownTextStyle {
    return this.$findHighlightStyle;
  }

  static get referenceHoverStyle(): MarkdownTextStyle {
    return this.$referenceHoverStyle;
  }

  static get deadReferenceStyle(): MarkdownTextStyle {
    return this.$deadReferenceStyle;
  }

  /** The element selector for a whole block, used for margin accounting. */
  static blockSelector(block: BlockRecord): MarkdownElementSelector {
    if (block.kind === 'heading') return this.headingSelector(block.level);
    return this.$blockKindSelectors[block.kind] ?? 'paragraph';
  }

  /** The element selector for one rendered row, used for paint. */
  static rowSelector(
    role: PreviewRowRole,
    kind: BlockKind | null,
    headingLevel: number | undefined,
  ): MarkdownElementSelector {
    if (role === 'content') {
      if (kind === 'heading') return this.headingSelector(headingLevel);
      if (kind === 'listitem') return 'listItem';
      return 'paragraph';
    }
    return this.$rowRoleSelectors[role] ?? 'paragraph';
  }

  static headingSelector(level: number | undefined): MarkdownElementSelector {
    const boundedLevel = Math.min(6, Math.max(1, level ?? 1));
    return `heading${boundedLevel}` as MarkdownElementSelector;
  }

  /** Blank rows between two adjacent rendered blocks: CSS-collapsed margins. Document edges
   *  use the pane's vertical padding instead of a margin. */
  static spacingBetween(
    previousSelector: MarkdownElementSelector | null,
    nextSelector: MarkdownElementSelector | null,
  ): number {
    if (previousSelector === null && nextSelector === null) return 0;
    if (previousSelector === null) return this.$panePadding.top;
    if (nextSelector === null) {
      return this.$elementRules[previousSelector].marginBottom;
    }
    return Math.max(
      this.$elementRules[previousSelector].marginBottom,
      this.$elementRules[nextSelector].marginTop,
    );
  }

  /** Blank rows between parsed blocks. Heading starts follow the source gap exactly instead of
   *  inheriting a synthetic CSS margin; every other block pair keeps the stylesheet margins. */
  static spacingBetweenBlocks(
    previousBlock: BlockRecord | null,
    nextBlock: BlockRecord | null,
  ): number {
    if (nextBlock?.kind === 'heading') {
      if (previousBlock === null) return 0;
      return Math.max(
        0,
        nextBlock.range.startLine - previousBlock.range.endLine,
      );
    }
    return this.spacingBetween(
      previousBlock === null ? null : this.blockSelector(previousBlock),
      nextBlock === null ? null : this.blockSelector(nextBlock),
    );
  }

  static listIndentText(level: number | undefined): string {
    const depth = Math.max(0, (level ?? 1) - 1);
    return ' '.repeat(depth * this.$vocabulary.listIndentPerLevel);
  }

  /** Resolve a slot-named style against the active palette. */
  static paletteColor(
    palette: Palette,
    slot: MarkdownColorSlot | null,
    fallbackSlot: MarkdownColorSlot = 'fg',
  ): string {
    return palette[slot ?? fallbackSlot];
  }

  protected static get $blockKindSelectors(): Readonly<
    Partial<Record<BlockKind, MarkdownElementSelector>>
  > {
    const selectors: Partial<Record<BlockKind, MarkdownElementSelector>> = {
      paragraph: 'paragraph',
      blockquote: 'blockquote',
      listitem: 'listItem',
      code: 'codeBlock',
      table: 'table',
      hr: 'rule',
    };
    return Object.freeze(selectors);
  }

  protected static get $rowRoleSelectors(): Readonly<
    Partial<Record<PreviewRowRole, MarkdownElementSelector>>
  > {
    const selectors: Partial<Record<PreviewRowRole, MarkdownElementSelector>> =
      {
        quote: 'blockquote',
        codeContent: 'codeBlock',
        codeBorder: 'codeBorder',
        tableHeader: 'tableHeader',
        tableBody: 'tableBody',
        tableSeparator: 'tableBorder',
        rule: 'rule',
        status: 'status',
        spacer: 'spacer',
      };
    return Object.freeze(selectors);
  }

  protected static buildRule(
    marginTop: number,
    marginBottom: number,
    colorSlot: MarkdownColorSlot | null,
    backgroundSlot: MarkdownColorSlot | null,
    attributes: MarkdownTextAttributes,
  ): MarkdownElementRule {
    return Object.freeze({
      marginTop,
      marginBottom,
      text: this.buildTextStyle(colorSlot, backgroundSlot, attributes),
    });
  }

  protected static buildTextStyle(
    colorSlot: MarkdownColorSlot | null,
    backgroundSlot: MarkdownColorSlot | null,
    attributes: MarkdownTextAttributes,
  ): MarkdownTextStyle {
    return Object.freeze({
      colorSlot,
      backgroundSlot,
      bold: attributes.bold ?? false,
      italic: attributes.italic ?? false,
      underline: attributes.underline ?? false,
    });
  }
}

export namespace MarkdownStylesheet {
  export const $Class = Static($MarkdownStylesheet);
  export let Class = $Class;
}

export type MarkdownColorSlot = Exclude<keyof Palette, 'name'>;

export type MarkdownElementSelector =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'paragraph'
  | 'blockquote'
  | 'listItem'
  | 'codeBlock'
  | 'codeBorder'
  | 'table'
  | 'tableHeader'
  | 'tableBody'
  | 'tableBorder'
  | 'rule'
  | 'status'
  | 'spacer';

export type MarkdownInlineSelector =
  'inlineCode' | 'inlineEmphasis' | 'inlineStrong' | 'inlineLink';

export interface MarkdownTextStyle {
  /** Palette slot for the foreground, or null to inherit the containing element's color. */
  readonly colorSlot: MarkdownColorSlot | null;
  readonly backgroundSlot: MarkdownColorSlot | null;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
}

interface MarkdownTextAttributes {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
}

export interface MarkdownElementRule {
  readonly marginTop: number;
  readonly marginBottom: number;
  readonly text: MarkdownTextStyle;
}

export interface MarkdownPanePadding {
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

export interface MarkdownCodeFrameGlyphSet {
  readonly topLeft: string;
  readonly topRight: string;
  readonly bottomLeft: string;
  readonly bottomRight: string;
  readonly horizontal: string;
  readonly vertical: string;
}

export interface MarkdownStyleVocabulary {
  readonly quoteBarPrefix: string;
  readonly listMarkerFallback: string;
  readonly listIndentPerLevel: number;
  readonly ruleGlyph: string;
  readonly codeFrame: MarkdownCodeFrameGlyphSet;
}
