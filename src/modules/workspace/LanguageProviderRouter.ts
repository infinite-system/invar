import type { ProviderRegistry } from '../plugins/ProviderRegistry';
import type { DocumentLanguageService } from './DocumentLanguageService.interface';
import type {
  LanguageCompletionContext,
  LanguageCompletionList,
  LanguageDocument,
  LanguageHover,
  LanguageHoverDiagnostic,
  LanguageLocation,
  LanguagePosition,
  LanguageProvider,
} from './LanguageProvider.interface';

/** The single host-facing language provider. It delegates each document to one supporting service.
 *  invariant: Language services coexist by document (src/modules/workspace/workspace.invariants.md) */
class $LanguageProviderRouter implements LanguageProvider {
  readonly identifier = 'language' as const;

  constructor(protected readonly providers: ProviderRegistry.Model) {}

  supportsDocument(document: LanguageDocument): boolean {
    return this.serviceFor(document) !== null;
  }

  completionTriggerCharacters(document: LanguageDocument): readonly string[] {
    return (
      this.serviceFor(document)?.completionTriggerCharacters(document) ?? []
    );
  }

  definition(
    document: LanguageDocument,
    position: LanguagePosition,
  ): Promise<LanguageLocation | null> {
    return (
      this.serviceFor(document)?.definition(document, position) ??
      Promise.resolve(null)
    );
  }

  hover(
    document: LanguageDocument,
    position: LanguagePosition,
  ): Promise<LanguageHover | null> {
    return (
      this.serviceFor(document)?.hover(document, position) ??
      Promise.resolve(null)
    );
  }

  completion(
    document: LanguageDocument,
    position: LanguagePosition,
    context: LanguageCompletionContext,
  ): Promise<LanguageCompletionList> {
    return (
      this.serviceFor(document)?.completion(document, position, context) ??
      Promise.resolve({ items: [], isIncomplete: false })
    );
  }

  diagnosticsAt(
    document: LanguageDocument,
    position: LanguagePosition,
  ): readonly LanguageHoverDiagnostic[] {
    return this.serviceFor(document)?.diagnosticsAt(document, position) ?? [];
  }

  statusNotice(document: LanguageDocument): string | null {
    return this.serviceFor(document)?.statusNotice(document) ?? null;
  }

  syncDocument(document: LanguageDocument): void {
    this.serviceFor(document)?.syncDocument(document);
  }

  protected serviceFor(
    document: LanguageDocument,
  ): DocumentLanguageService | null {
    const services = this.providers.resolveAll<DocumentLanguageService>(
      'document-language-service',
    );
    for (
      let serviceIndex = services.length - 1;
      serviceIndex >= 0;
      serviceIndex -= 1
    ) {
      const service = services[serviceIndex];
      if (service?.supportsDocument(document)) return service;
    }
    return null;
  }
}

export namespace LanguageProviderRouter {
  export const $Class = $LanguageProviderRouter;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
