/** One exact document replacement. The expected text makes stale edits detectable at the target. */
export interface TextEdit {
  readonly start: TextEditPosition;
  readonly end: TextEditPosition;
  readonly expectedText: string;
  readonly replacementText: string;
}

export interface TextEditPosition {
  readonly line: number;
  readonly column: number;
}

/** User-facing facts retained with a batch edit through undo and redo. */
export interface TextEditBatchMetadata {
  readonly label: string;
  readonly bulkItemCount: number;
  readonly displayPath: string;
}
