import { Static } from 'ivue/extras';
import { TextArena, type TextArenaSlice } from './TextArena';

// One exact byte replacement inside a multi-document transaction. Offsets are hints. The saved
// subject and both saved context sides are the authority when a file changes between actions.
class $TextPatch {
  static get CONTEXT_BYTE_LENGTH(): number {
    return 64;
  }

  static create(
    arena: TextArena.Instance,
    sourceBytes: Uint8Array,
    options: TextPatchCreateOptions,
  ): TextPatch.Instance {
    if (
      options.baselineByteOffset < 0 ||
      options.baselineByteOffset + options.removedBytes.byteLength >
        sourceBytes.byteLength
    ) {
      throw new Error('Text patch range exceeds its source bytes.');
    }
    for (
      let byteIndex = 0;
      byteIndex < options.removedBytes.byteLength;
      byteIndex++
    ) {
      if (
        sourceBytes[options.baselineByteOffset + byteIndex] !==
        options.removedBytes[byteIndex]
      ) {
        throw new Error(
          'Text patch removed bytes do not match the source range.',
        );
      }
    }
    const textPatchClass = this as typeof $TextPatch;
    const beforeStart = Math.max(
      0,
      options.baselineByteOffset - textPatchClass.CONTEXT_BYTE_LENGTH,
    );
    const removedEnd =
      options.baselineByteOffset + options.removedBytes.byteLength;
    const afterEnd = Math.min(
      sourceBytes.byteLength,
      removedEnd + textPatchClass.CONTEXT_BYTE_LENGTH,
    );
    return this.createWithContext(
      arena,
      options,
      sourceBytes.subarray(beforeStart, options.baselineByteOffset),
      sourceBytes.subarray(removedEnd, afterEnd),
    );
  }

  static createRecorded(
    arena: TextArena.Instance,
    options: TextPatchRecordedOptions,
  ): TextPatch.Instance {
    const textPatchClass = this as typeof $TextPatch;
    if (options.baselineByteOffset < 0) {
      throw new Error('Recorded text patch byte offset cannot be negative.');
    }
    if (options.beforeContextBytes.byteLength > options.baselineByteOffset) {
      throw new Error('Recorded text patch context starts before its file.');
    }
    if (
      options.beforeContextBytes.byteLength >
        textPatchClass.CONTEXT_BYTE_LENGTH ||
      options.afterContextBytes.byteLength > textPatchClass.CONTEXT_BYTE_LENGTH
    ) {
      throw new Error('Recorded text patch context exceeds the shared bound.');
    }
    return this.createWithContext(
      arena,
      options,
      options.beforeContextBytes,
      options.afterContextBytes,
    );
  }

  protected static createWithContext(
    arena: TextArena.Instance,
    options: TextPatchCreateOptions,
    beforeContextBytes: Uint8Array,
    afterContextBytes: Uint8Array,
  ): TextPatch.Instance {
    return new this(
      arena,
      options.path,
      options.searchGeneration,
      options.baselineByteOffset,
      arena.store(options.removedBytes),
      arena.intern(options.insertedBytes),
      arena.store(beforeContextBytes),
      arena.store(afterContextBytes),
    );
  }

  static verifyGroup(
    sourceBytes: Uint8Array,
    patches: readonly TextPatch.Instance[],
    direction: TextPatchDirection,
  ): readonly TextPatchVerification[] {
    const firstPath = patches[0]?.path;
    if (patches.some((patch) => patch.path !== firstPath)) {
      throw new Error('One text patch verification group must name one path.');
    }
    return patches.map((patch) => patch.verify(sourceBytes, direction));
  }

  constructor(
    readonly arena: TextArena.Instance,
    readonly path: string,
    readonly searchGeneration: number,
    readonly baselineByteOffset: number,
    readonly removedTextSlice: TextArenaSlice,
    readonly insertedTextSlice: TextArenaSlice,
    readonly beforeContextSlice: TextArenaSlice,
    readonly afterContextSlice: TextArenaSlice,
  ) {
    this.appliedByteOffset = baselineByteOffset;
  }

  appliedByteOffset: number;
  state: TextPatchState = 'pending';

  verify(
    sourceBytes: Uint8Array,
    direction: TextPatchDirection,
  ): TextPatchVerification {
    const subjectSlice =
      direction === 'undo' ? this.insertedTextSlice : this.removedTextSlice;
    const expectedByteOffset =
      direction === 'undo' ? this.appliedByteOffset : this.baselineByteOffset;
    if (this.matchesAt(sourceBytes, expectedByteOffset, subjectSlice)) {
      return { kind: 'exact', byteOffset: expectedByteOffset };
    }
    const candidates = this.candidateByteOffsets(sourceBytes, subjectSlice);
    if (candidates.length === 1) {
      return { kind: 'relocated', byteOffset: candidates[0]! };
    }
    return { kind: candidates.length === 0 ? 'drifted' : 'ambiguous' };
  }

  accept(
    verification: TextPatchVerification,
    direction: TextPatchDirection,
  ): void {
    if (verification.byteOffset === undefined) {
      throw new Error('A drifted or ambiguous text patch cannot be accepted.');
    }
    this.appliedByteOffset = verification.byteOffset;
    this.state = direction === 'undo' ? 'undone' : 'applied';
  }

  replacementBytes(direction: TextPatchDirection): Uint8Array {
    return this.arena.bytes(
      direction === 'undo' ? this.removedTextSlice : this.insertedTextSlice,
    );
  }

  subjectBytes(direction: TextPatchDirection): Uint8Array {
    return this.arena.bytes(
      direction === 'undo' ? this.insertedTextSlice : this.removedTextSlice,
    );
  }

  protected candidateByteOffsets(
    sourceBytes: Uint8Array,
    subjectSlice: TextArenaSlice,
  ): number[] {
    const subjectByteLength = subjectSlice.byteLength;
    const candidates: number[] = [];
    for (
      let byteOffset = 0;
      byteOffset + subjectByteLength <= sourceBytes.byteLength;
      byteOffset++
    ) {
      if (this.matchesAt(sourceBytes, byteOffset, subjectSlice)) {
        candidates.push(byteOffset);
        if (candidates.length > 1) return candidates;
      }
    }
    return candidates;
  }

  protected matchesAt(
    sourceBytes: Uint8Array,
    subjectByteOffset: number,
    subjectSlice: TextArenaSlice,
  ): boolean {
    const beforeByteOffset =
      subjectByteOffset - this.beforeContextSlice.byteLength;
    const afterByteOffset = subjectByteOffset + subjectSlice.byteLength;
    if (
      beforeByteOffset < 0 ||
      afterByteOffset + this.afterContextSlice.byteLength >
        sourceBytes.byteLength
    ) {
      return false;
    }
    return (
      this.arena.matches(
        this.beforeContextSlice,
        sourceBytes,
        beforeByteOffset,
      ) &&
      this.arena.matches(subjectSlice, sourceBytes, subjectByteOffset) &&
      this.arena.matches(this.afterContextSlice, sourceBytes, afterByteOffset)
    );
  }
}

export namespace TextPatch {
  export const $Class = Static($TextPatch);
  export let Class = $Class;
  export type Instance = InstanceType<typeof $TextPatch>;
}

export type TextPatchDirection = 'apply' | 'undo' | 'redo';

export type TextPatchState = 'pending' | 'applied' | 'undone' | 'failed';

export interface TextPatchCreateOptions {
  readonly path: string;
  readonly searchGeneration: number;
  readonly baselineByteOffset: number;
  readonly removedBytes: Uint8Array;
  readonly insertedBytes: Uint8Array;
}

export interface TextPatchRecordedOptions extends TextPatchCreateOptions {
  readonly beforeContextBytes: Uint8Array;
  readonly afterContextBytes: Uint8Array;
}

export type TextPatchVerification =
  | { readonly kind: 'exact' | 'relocated'; readonly byteOffset: number }
  | { readonly kind: 'drifted' | 'ambiguous'; readonly byteOffset?: never };
