import { Reactive } from 'ivue';
import { EditorCoordinates } from '../../src/modules/editor/EditorCoordinates';
import {
  LanguageClient,
  type TextDocumentModel,
  type TextPosition,
} from '../../src/modules/lsp/LanguageClient';
import type {
  LanguageCompletionContext,
  LanguageCompletionItem,
  LanguageCompletionList,
} from '../../src/modules/lsp/LanguageProvider.interface';

class $MockCompletionLanguageClient extends LanguageClient.$Class {
  override supportsDocument(document: TextDocumentModel): boolean {
    return document.path.endsWith('.rs') || super.supportsDocument(document);
  }

  override openDocument(document: TextDocumentModel): void {
    if (!document.path.endsWith('.rs')) super.openDocument(document);
  }

  override syncDocument(document: TextDocumentModel): void {
    if (!document.path.endsWith('.rs')) super.syncDocument(document);
  }

  override get completionTriggerCharacters(): readonly string[] {
    return ['.'];
  }

  override async completion(
    document: TextDocumentModel,
    position: TextPosition,
    _context: LanguageCompletionContext,
  ): Promise<LanguageCompletionList> {
    const lineText = document.line(position.line);
    const prefixText =
      Array.from(lineText)
        .slice(0, position.column)
        .join('')
        .match(/[\p{L}\p{N}_$]+$/u)?.[0] ?? '';
    const startColumn =
      position.column - EditorCoordinates.Class.graphemeCount(prefixText);
    const completionItem = (
      label: string,
      sortText: string,
    ): LanguageCompletionItem => ({
      label,
      kind: 2,
      insertText: null,
      textEdit: {
        range: {
          start: { line: position.line, column: startColumn },
          end: position,
        },
        newText: label,
      },
      sortText,
      filterText: label,
    });
    return {
      isIncomplete: false,
      items: [
        completionItem('push_str', '0000'),
        completionItem('pop', '0001'),
        ...Array.from({ length: 1_500 }, (_unusedValue, index) =>
          completionItem(
            `property${String(index).padStart(4, '0')}`,
            String(index + 2).padStart(4, '0'),
          ),
        ),
      ],
    };
  }
}

LanguageClient.Class = Reactive($MockCompletionLanguageClient);
