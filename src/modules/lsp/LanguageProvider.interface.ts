import type { Ref } from 'vue';

// invariant: Plugin boundaries grant one authority (project.invariants.md)
/** Provider-neutral semantic surface consumed by editor features. */
export interface LanguageProvider {
  completion(
    document: LanguageDocument,
    position: LanguagePosition,
    context: LanguageCompletionContext,
  ): Promise<LanguageCompletionList>;
  readonly completionTriggerCharacters: readonly string[];
}

/** Process-launch seam used only by LanguageClient. */
export interface LanguageServerProvider {
  readonly id: string;
  readonly capabilities: LanguageCapabilities;
  supportsPath(path: string): boolean;
  resolve(rootPath: string): Promise<LanguageServerCommand | null>;
}

export interface LanguageServerCommand {
  command: string;
  args: readonly string[];
}

export interface LanguageCapabilities {
  diagnostics: boolean;
  definition: boolean;
  hover: boolean;
  references: boolean;
  completion: boolean;
}

export interface LanguageDocument {
  readonly path: string;
  readonly text: string;
  readonly lineCount: number;
  readonly revision: Ref<number>;
  line(index: number): string;
}

export interface LanguagePosition {
  line: number;
  column: number;
}

export interface LanguageRange {
  start: LanguagePosition;
  end: LanguagePosition;
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
  kind: number | null;
  insertText: string | null;
  textEdit: LanguageCompletionTextEdit | null;
  sortText: string | null;
  filterText: string | null;
}

export interface LanguageCompletionList {
  items: readonly LanguageCompletionItem[];
  isIncomplete: boolean;
}
