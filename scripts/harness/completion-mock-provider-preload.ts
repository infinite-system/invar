import { Reactive } from 'ivue';
import { EditorCoordinates } from '../../src/modules/editor/EditorCoordinates';
import {
  LanguageClient,
  type TextDocumentModel,
  type TextPosition,
} from '../../src/modules/lsp/LanguageClient';
import { StatusChannel } from '../../src/modules/system/StatusChannel';
import type {
  LanguageCompletionContext,
  LanguageCompletionItem,
  LanguageCompletionList,
} from '../../src/modules/lsp/LanguageProvider.interface';
import {
  BoundedListPopup,
  type BoundedListPopupItem,
} from '../../src/modules/ui/BoundedListPopup';
import { CompletionPopup } from '../../src/modules/ui/CompletionPopup';

class $MeasuredBoundedListPopup extends BoundedListPopup.$Class {
  protected completionFilterCount = 0;
  protected completionPopupUpdateCount = 0;

  protected override recomputeMatches(): void {
    const startTimestampMilliseconds = performance.now();
    super.recomputeMatches();
    if (this.dependencies.identifier !== 'completion-popup') return;
    this.completionFilterCount++;
    StatusChannel.Class.update({
      completionFilterCount: this.completionFilterCount,
      completionFilterDurationMilliseconds:
        performance.now() - startTimestampMilliseconds,
    });
  }

  override update(): void {
    const startTimestampMilliseconds = performance.now();
    super.update();
    if (this.dependencies.identifier !== 'completion-popup') return;
    this.completionPopupUpdateCount++;
    StatusChannel.Class.update({
      completionPopupUpdateCount: this.completionPopupUpdateCount,
      completionPopupUpdateDurationMilliseconds:
        performance.now() - startTimestampMilliseconds,
    });
  }
}

class $MeasuredCompletionPopup extends CompletionPopup.$Class {
  protected completionSourceFilterCount = 0;

  protected override popupItems(
    prefix: string,
  ): readonly BoundedListPopupItem[] {
    const popupItems = super.popupItems(prefix);
    this.completionSourceFilterCount++;
    StatusChannel.Class.update({
      completionSourceFilterCount: this.completionSourceFilterCount,
    });
    return popupItems;
  }
}

class $MockCompletionLanguageClient extends LanguageClient.$Class {
  protected static get completionItemCount(): number {
    const configuredItemCount = Number(
      process.env.TUI_COMPLETION_ITEM_COUNT ?? 1_502,
    );
    return Number.isFinite(configuredItemCount)
      ? Math.max(2, Math.floor(configuredItemCount))
      : 1_502;
  }

  protected completionRequestCount = 0;

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
    context: LanguageCompletionContext,
  ): Promise<LanguageCompletionList> {
    this.completionRequestCount++;
    StatusChannel.Class.update({
      completionRequestCount: this.completionRequestCount,
    });
    if (!document.path.endsWith('.rs')) {
      return super.completion(document, position, context);
    }
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
        ...Array.from(
          {
            length: $MockCompletionLanguageClient.completionItemCount - 2,
          },
          (_unusedValue, index) =>
            completionItem(
              `property${String(index).padStart(4, '0')}`,
              String(index + 2).padStart(4, '0'),
            ),
        ),
      ],
    };
  }
}

BoundedListPopup.Class = Reactive($MeasuredBoundedListPopup);
CompletionPopup.Class = Reactive($MeasuredCompletionPopup);
LanguageClient.Class = Reactive($MockCompletionLanguageClient);
