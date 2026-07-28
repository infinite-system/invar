import type { WrappableDocument } from './EditorWrap';

// invariant: Editor frame work is independent of document length (editor.invariants.md)
class $EditorFrameAttribution {
  protected active = false;
  protected currentDocumentLineReads = 0;
  protected currentFoldProjectionLookups = 0;
  protected currentWrapProjectionLookups = 0;
  protected currentLayoutComputations = 0;
  protected completedFrameCount = 0;
  protected totalDocumentLineReads = 0;
  protected totalFoldProjectionLookups = 0;
  protected totalWrapProjectionLookups = 0;
  protected totalLayoutComputations = 0;
  protected readonly attributedDocumentBySource = new WeakMap<
    WrappableDocument,
    WrappableDocument
  >();
  protected latestFrameValue = this.emptyFrame();

  beginFrame(): void {
    this.active = true;
    this.currentDocumentLineReads = 0;
    this.currentFoldProjectionLookups = 0;
    this.currentWrapProjectionLookups = 0;
    this.currentLayoutComputations = 0;
  }

  completeFrame(): void {
    if (!this.active) return;
    this.active = false;
    this.latestFrameValue = {
      documentLineReads: this.currentDocumentLineReads,
      foldProjectionLookups: this.currentFoldProjectionLookups,
      wrapProjectionLookups: this.currentWrapProjectionLookups,
      layoutComputations: this.currentLayoutComputations,
    };
    this.completedFrameCount++;
    this.totalDocumentLineReads += this.currentDocumentLineReads;
    this.totalFoldProjectionLookups += this.currentFoldProjectionLookups;
    this.totalWrapProjectionLookups += this.currentWrapProjectionLookups;
    this.totalLayoutComputations += this.currentLayoutComputations;
  }

  documentLine(
    document: Pick<WrappableDocument, 'line'>,
    lineIndex: number,
  ): string {
    if (this.active) this.currentDocumentLineReads++;
    return document.line(lineIndex);
  }

  attributedDocument(document: WrappableDocument): WrappableDocument {
    const existingDocument = this.attributedDocumentBySource.get(document);
    if (existingDocument) return existingDocument;
    const attribution = this;
    const attributedDocument: WrappableDocument = {
      get lineCount() {
        return document.lineCount;
      },
      get revision() {
        return document.revision;
      },
      get lastLineChange() {
        return document.lastLineChange;
      },
      line(lineIndex: number): string {
        return attribution.documentLine(document, lineIndex);
      },
    };
    this.attributedDocumentBySource.set(document, attributedDocument);
    return attributedDocument;
  }

  recordFoldProjectionLookup(): void {
    if (this.active) this.currentFoldProjectionLookups++;
  }

  recordWrapProjectionLookup(): void {
    if (this.active) this.currentWrapProjectionLookups++;
  }

  recordLayoutComputation(): void {
    if (this.active) this.currentLayoutComputations++;
  }

  get snapshot(): EditorFrameAttributionSnapshot {
    return {
      latestFrame: { ...this.latestFrameValue },
      totals: {
        completedFrameCount: this.completedFrameCount,
        documentLineReads: this.totalDocumentLineReads,
        foldProjectionLookups: this.totalFoldProjectionLookups,
        wrapProjectionLookups: this.totalWrapProjectionLookups,
        layoutComputations: this.totalLayoutComputations,
      },
    };
  }

  protected emptyFrame(): EditorFrameCounts {
    return {
      documentLineReads: 0,
      foldProjectionLookups: 0,
      wrapProjectionLookups: 0,
      layoutComputations: 0,
    };
  }
}

export namespace EditorFrameAttribution {
  export const $Class = $EditorFrameAttribution;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface EditorFrameCounts {
  readonly documentLineReads: number;
  readonly foldProjectionLookups: number;
  readonly wrapProjectionLookups: number;
  readonly layoutComputations: number;
}

export interface EditorFrameAttributionTotals extends EditorFrameCounts {
  readonly completedFrameCount: number;
}

export interface EditorFrameAttributionSnapshot {
  readonly latestFrame: EditorFrameCounts;
  readonly totals: EditorFrameAttributionTotals;
}
