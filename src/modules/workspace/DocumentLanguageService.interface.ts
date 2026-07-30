import type {
  LanguageCompletionContext,
  LanguageCompletionList,
  LanguageDocument,
  LanguageHover,
  LanguageHoverDiagnostic,
  LanguageLocation,
  LanguagePosition,
} from './LanguageProvider.interface';
import type { WorkspaceProvider } from './WorkspaceContributor.interface';

/** One document-subset language service behind the host language router. */
export interface DocumentLanguageService extends WorkspaceProvider {
  readonly identifier: 'document-language-service';
  supportsDocument(document: LanguageDocument): boolean;
  completionTriggerCharacters(document: LanguageDocument): readonly string[];
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
