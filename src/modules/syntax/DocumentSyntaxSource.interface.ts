import type { LangId, Span } from './Highlighter';
import type { TextDocument } from '../text/TextDocument';
import type { WorkspaceProvider } from '../workspace/WorkspaceContributor.interface';

/**
 * One document-scoped syntax producer. Sources own file-format knowledge. Consumers ask only
 * for normalized regions, line spans, and the active lexical language.
 */
export interface DocumentSyntaxSource extends WorkspaceProvider {
  readonly identifier: 'document-syntax-source';
  supportsDocument(document: SyntaxDocument): boolean;
  regions(document: SyntaxDocument): readonly SyntaxRegion[];
  spansForLine(document: SyntaxDocument, lineIndex: number): readonly Span[];
  languageAtLine(document: SyntaxDocument, lineIndex: number): LangId;
  statusNotice(document: SyntaxDocument): string | null;
  sourceRevision?(document: SyntaxDocument): number;
}

export type SyntaxDocument = TextDocument.Instance;

export interface SyntaxPosition {
  readonly line: number;
  readonly column: number;
}

export interface SyntaxRegion {
  readonly kind: string;
  readonly language: LangId;
  readonly start: SyntaxPosition;
  readonly end: SyntaxPosition;
}

/** The stable reader shared by rendering, folding, bracket matching, and diff projection. */
export interface DocumentSyntaxReader {
  usesSource(document: SyntaxDocument): boolean;
  regions(document: SyntaxDocument): readonly SyntaxRegion[];
  spansForLine(document: SyntaxDocument, lineIndex: number): readonly Span[];
  languageAtLine(document: SyntaxDocument, lineIndex: number): LangId;
  statusNotice(document: SyntaxDocument): string | null;
  revision(document: SyntaxDocument): SyntaxRevision;
}

export type SyntaxRevision = string | number;
