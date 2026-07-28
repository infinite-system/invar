import type { TextDocument } from '../editor/TextDocument';
import type { SymbolClass } from '../theme/ThemeIcons';
import type { WorkspaceProvider } from './WorkspaceContributor.interface';

// invariant: Plugin boundaries grant one authority (project.invariants.md)
/** Provider-neutral semantic surface consumed by host editor features. */
export interface LanguageProvider extends WorkspaceProvider {
  readonly identifier: 'language';
  readonly completionTriggerCharacters: readonly string[];
  definition(
    document: LanguageDocument,
    position: LanguagePosition,
  ): Promise<LanguageLocation | null>;
  hover(
    document: LanguageDocument,
    position: LanguagePosition,
  ): Promise<LanguageHover | null>;
  completion(
    document: LanguageDocument,
    position: LanguagePosition,
    context: LanguageCompletionContext,
  ): Promise<LanguageCompletionList>;
  diagnosticsAt(
    document: LanguageDocument,
    position: LanguagePosition,
  ): readonly LanguageHoverDiagnostic[];
  statusNotice(document: LanguageDocument): string | null;
  syncDocument(document: LanguageDocument): void;
}

export type LanguageDocument = InstanceType<typeof TextDocument.Class>;

export interface LanguagePosition {
  line: number;
  column: number;
}

export interface LanguageRange {
  start: LanguagePosition;
  end: LanguagePosition;
}

export interface LanguageLocation {
  uri: string;
  range: LanguageRange;
}

export interface LanguageHover {
  contents: string;
  range: LanguageRange | null;
}

export interface LanguageHoverDiagnostic {
  severity: 1 | 2 | 3 | 4;
  message: string;
}

export interface LanguageCompletionContext {
  triggerKind: 'invoked' | 'triggerCharacter';
  triggerCharacter?: string;
}

export interface LanguageCompletionTextEdit {
  range: LanguageRange;
  newText: string;
}

export interface LanguageCompletionItem {
  label: string;
  symbolClass: SymbolClass;
  insertText: string | null;
  textEdit: LanguageCompletionTextEdit | null;
  sortText: string | null;
  filterText: string | null;
}

export interface LanguageCompletionList {
  items: readonly LanguageCompletionItem[];
  isIncomplete: boolean;
}

export interface LanguageDiagnostic {
  source: string;
  severity: 1 | 2 | 3 | 4;
  message: string;
  code: string | number | null;
  range: LanguageRange;
  version: number;
}
