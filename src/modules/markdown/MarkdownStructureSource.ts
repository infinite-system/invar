// The markdown table of contents as a structure source: headings become the document's outline —
// document-ordered, nested by level — served through the SAME consumer-owned StructureSource seam
// the LSP provider uses, so the structure pane consumes it unchanged and no host file learns
// markdown exists. No LSP involvement: the headings come from the module's own MarkdownParser,
// which already knows a fenced code block's `# comment` is not a heading.
//
// A `.md` document with no headings answers an EMPTY list — "I answered and there is nothing to
// list" — never null, so the pane states "no symbols" instead of blaming the source.
//
// invariant: Markdown headings are the document's structure (src/modules/markdown/markdown.invariants.md)
// invariant: A structure source answers or declines, never blanks (src/modules/structure/structure.invariants.md)
// invariant: Provider rendezvous is host carried (src/modules/plugins/plugins.invariants.md)
import { Static } from 'ivue/extras';
import { Files } from '../system/Files';
import type {
  StructureDocument,
  StructureOutlineResult,
  StructureSource,
  StructureSymbol,
} from '../structure/StructureSource.interface';
import { MarkdownParser } from './MarkdownParser';

/** A heading row under construction: children stay mutable until its section closes. */
interface OpenHeading {
  readonly name: string;
  readonly level: number;
  readonly line: number;
  endLine: number;
  readonly children: OpenHeading[];
}

class $MarkdownStructureSource implements StructureSource {
  /** The one markdown-ness test this module applies to a path (shared with the workspace). */
  static isMarkdownPath(path: string): boolean {
    return path !== '' && Files.Class.extname(path).toLowerCase() === '.md';
  }

  protected parser: MarkdownParser.Model | null = null;

  protected get MarkdownStructureSource() {
    return this.constructor as typeof $MarkdownStructureSource;
  }

  /** Cheap capability answer — a path test, never a parse. */
  supportsDocument(document: StructureDocument): boolean {
    return this.MarkdownStructureSource.isMarkdownPath(document.path);
  }

  /** The heading outline: document-ordered, nested by level, anchored at each heading's line. */
  async documentSymbols(
    document: StructureDocument,
  ): Promise<StructureOutlineResult | null> {
    if (!this.supportsDocument(document)) return null;
    if (!this.parser) this.parser = this.createParser();
    const parsed = await this.parser.parseAsync(document.text, 0);
    const lastLine = Math.max(0, document.lineCount - 1);
    const rootHeadings: OpenHeading[] = [];
    const openHeadings: OpenHeading[] = [];
    for (const block of parsed.blocks) {
      if (block.kind !== 'heading') continue;
      const heading: OpenHeading = {
        name: block.text,
        level: block.level ?? 1,
        line: block.range.startLine,
        endLine: lastLine,
        children: [],
      };
      // A heading closes every open section at its own level or deeper: those sections end on
      // the line above it, and the new heading nests under the nearest shallower one.
      while (
        openHeadings.length > 0 &&
        openHeadings[openHeadings.length - 1]!.level >= heading.level
      ) {
        const closed = openHeadings.pop()!;
        closed.endLine = Math.max(closed.line, heading.line - 1);
      }
      const parent = openHeadings[openHeadings.length - 1];
      if (parent) parent.children.push(heading);
      else rootHeadings.push(heading);
      openHeadings.push(heading);
    }
    return {
      symbols: rootHeadings.map((heading) => this.seal(heading)),
      truncated: false,
    };
  }

  /** No refusal states today: a supported document always gets an answer. */
  structureNotice(_document: StructureDocument): string | null {
    return null;
  }

  // invariant: Construction goes through overridable seams (project.invariants.md)
  protected createParser(): MarkdownParser.Model {
    return new MarkdownParser.Class();
  }

  protected seal(heading: OpenHeading): StructureSymbol {
    return {
      name: heading.name,
      // Sections share the container motif: the '▤' box whose contents you reach into.
      symbolClass: 'module',
      line: heading.line,
      // The whole line IS the heading; the jump lands at its first column.
      column: 0,
      endLine: heading.endLine,
      children: heading.children.map((child) => this.seal(child)),
    };
  }

  dispose(): void {
    this.parser?.dispose();
    this.parser = null;
  }
}

export namespace MarkdownStructureSource {
  export const $Class = Static($MarkdownStructureSource);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
