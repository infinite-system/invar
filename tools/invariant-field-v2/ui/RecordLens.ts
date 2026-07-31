import { Reactive } from 'ivue';
import {
  getCurrentInstance,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
} from 'vue';
import type { CodeLensPayload } from '../CodeLens';
import type {
  CodeReference,
  InvariantFieldMetadata,
  InvariantSnapshot,
  RankedRecord,
} from '../types';

class $RecordLens {
  constructor(
    public props: RecordLensProps,
    public emit: RecordLensEmits,
  ) {
    if (getCurrentInstance()) {
      onMounted(() =>
        this.browserWindow.addEventListener('keydown', this.onKeyDown),
      );
      onUnmounted(() =>
        this.browserWindow.removeEventListener('keydown', this.onKeyDown),
      );
    }
  }

  // --- state ---
  get activeCodeReference() {
    return shallowRef<CodeReference | null>(null);
  }
  get codeLensResponse() {
    return shallowRef<CodeLensPayload | null>(null);
  }
  get codeLensLoading() {
    return ref(false);
  }
  get codeLensRequestIdentifier() {
    return ref(0);
  }

  // --- derived ---
  get selectedRecord() {
    return this.props.selectedRecord;
  }
  get hasSelectedRecord() {
    return Boolean(this.selectedRecord);
  }
  get selectedRecordName() {
    return this.selectedRecord?.name ?? '';
  }
  get selectedRecordPath() {
    return this.selectedRecord?.contractPath ?? '';
  }
  get selectedRecordKind() {
    if (this.selectedRecord?.kind === 'reality-absolute') {
      return 'Reality · absolute';
    }
    if (this.selectedRecord?.kind === 'reality-renegotiable') {
      return 'Reality · renegotiable';
    }
    return 'Chosen';
  }
  get selectedRecordStatus() {
    return this.selectedRecord?.fields.Status ?? 'Unknown';
  }
  get selectedRecordRank() {
    return this.selectedRecord?.rank.toFixed(3) ?? '';
  }
  get essence() {
    return (
      this.selectedRecord?.fields.Invariant ?? 'No invariant statement exists.'
    );
  }
  get fieldSections() {
    if (!this.selectedRecord) return [];
    return this.fieldOrder
      .filter(
        (fieldName) =>
          fieldName !== 'Invariant' && this.selectedRecord?.fields[fieldName],
      )
      .map((fieldName) => ({
        fieldName,
        value: this.selectedRecord!.fields[fieldName]!,
      }));
  }
  get compositionRelationships() {
    if (!this.selectedRecord) return [];
    return this.selectedRecord.latticeMemberships
      .map((compositionIdentifier) =>
        this.props.snapshot.compositions.find(
          (composition) => composition.identifier === compositionIdentifier,
        ),
      )
      .flatMap((composition) =>
        composition
          ? [
              {
                identifier: composition.identifier,
                name: composition.name,
                guarantee:
                  composition.guarantee ||
                  'No emergent guarantee text was parsed.',
                members: composition.memberIdentifiers.flatMap(
                  (recordIdentifier) => {
                    const record = this.recordLink(recordIdentifier);
                    return record ? [record] : [];
                  },
                ),
              },
            ]
          : [],
      );
  }
  get dependencyGroups() {
    if (!this.selectedRecord) return [];
    return [
      {
        label: 'Depends on',
        records: this.selectedRecord.outgoingRecordIdentifiers.flatMap(
          (recordIdentifier) => {
            const record = this.recordLink(recordIdentifier);
            return record ? [record] : [];
          },
        ),
      },
      {
        label: 'Depended on by',
        records: this.selectedRecord.incomingRecordIdentifiers.flatMap(
          (recordIdentifier) => {
            const record = this.recordLink(recordIdentifier);
            return record ? [record] : [];
          },
        ),
      },
    ].filter((group) => group.records.length > 0);
  }
  get siblingRecords() {
    if (!this.selectedRecord) return [];
    return this.selectedRecord.siblingRecordIdentifiers
      .flatMap((recordIdentifier) => {
        const record = this.recordLink(recordIdentifier);
        return record ? [record] : [];
      })
      .toSorted((left, right) => left.name.localeCompare(right.name));
  }
  get codeReferences() {
    return (this.selectedRecord?.codeReferences ?? []).map((reference) => ({
      ...reference,
      sourceLabel: this.codeReferenceSourceLabel(reference),
      locationLabel: `${reference.path}:${reference.line}`,
      statusLabel: reference.resolved ? 'Resolved' : 'Does not resolve',
      className: reference.resolved
        ? 'code-reference'
        : 'code-reference code-reference-unresolved',
    }));
  }
  get hasRelationships() {
    return Boolean(
      this.compositionRelationships.length ||
      this.dependencyGroups.length ||
      this.siblingRecords.length,
    );
  }
  get hasCodeReferences() {
    return this.codeReferences.length > 0;
  }
  get codeLensIsOpen() {
    return Boolean(this.activeCodeReference.value);
  }
  get codeLensTitle() {
    if (!this.activeCodeReference.value) return '';
    return `${this.codeReferenceSourceLabel(this.activeCodeReference.value)} · ${this.activeCodeReference.value.path}:${this.activeCodeReference.value.line}`;
  }
  get codeLensResolved() {
    return this.codeLensResponse.value?.resolved === true;
  }
  get highlightedCode() {
    return this.codeLensResponse.value?.resolved
      ? this.codeLensResponse.value.highlightedHtml
      : '';
  }
  get codeLensErrorMessage() {
    if (this.codeLensLoading.value) return 'Loading the cited source…';
    if (this.codeLensResponse.value?.resolved === false) {
      return this.codeLensResponse.value.message;
    }
    return '';
  }
  get codeLensLineRange() {
    if (!this.codeLensResponse.value?.resolved) return '';
    return `Lines ${this.codeLensResponse.value.startLine}–${this.codeLensResponse.value.endLine}`;
  }

  // --- methods ---
  selectRecord(recordIdentifier: string) {
    this.emit('select-record', recordIdentifier);
  }

  selectComposition(compositionIdentifier: string) {
    this.emit('select-composition', compositionIdentifier);
  }

  clearSelection() {
    this.emit('clear-selection');
  }

  async openCodeReference(reference: CodeReference) {
    this.activeCodeReference.value = reference;
    this.codeLensResponse.value = null;
    this.codeLensLoading.value = true;
    const requestIdentifier = this.codeLensRequestIdentifier.value + 1;
    this.codeLensRequestIdentifier.value = requestIdentifier;
    const query = new URLSearchParams({
      path: reference.path,
      line: String(reference.line),
      commit: this.props.snapshot.commit,
    });
    try {
      const response = await fetch(`/api/code?${query}`);
      const payload = (await response.json()) as CodeLensPayload;
      if (this.codeLensRequestIdentifier.value !== requestIdentifier) return;
      this.codeLensResponse.value = payload;
    } catch (error) {
      if (this.codeLensRequestIdentifier.value !== requestIdentifier) return;
      this.codeLensResponse.value = {
        resolved: false,
        reason: 'not-found',
        message:
          error instanceof Error
            ? error.message
            : 'The cited source request failed.',
        path: reference.path,
        line: reference.line,
      };
    } finally {
      if (this.codeLensRequestIdentifier.value === requestIdentifier) {
        this.codeLensLoading.value = false;
      }
    }
  }

  closeCodeLens() {
    this.codeLensRequestIdentifier.value++;
    this.activeCodeReference.value = null;
    this.codeLensResponse.value = null;
    this.codeLensLoading.value = false;
  }

  onKeyDown(event: RecordLensKeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (this.codeLensIsOpen) {
      this.closeCodeLens();
    } else if (this.hasSelectedRecord) {
      this.clearSelection();
    } else {
      return;
    }
    event.preventDefault();
  }

  protected recordLink(recordIdentifier: string) {
    const record = this.props.snapshot.records.find(
      (candidateRecord) =>
        candidateRecord.stableIdentifier === recordIdentifier,
    );
    if (!record) return null;
    return {
      identifier: record.stableIdentifier,
      name: record.name,
      path: record.contractPath,
    };
  }

  protected codeReferenceSourceLabel(reference: CodeReference) {
    if (reference.source === 'annotation') return 'Enforcement annotation';
    if (reference.source === 'mechanism') return 'Mechanism';
    return 'Evidence';
  }

  protected get fieldOrder() {
    return [
      'Invariant',
      'Scope',
      'Components',
      'Mechanism',
      'Generates',
      'Rejected alternatives',
      'Open question',
      'Evidence',
      'Impossible if true',
      'Verification',
      'Enforcement',
      'Renegotiable at',
      'Status',
      'Last refined',
    ];
  }

  protected get browserWindow(): RecordLensBrowserWindow {
    return globalThis as unknown as RecordLensBrowserWindow;
  }
}

export namespace RecordLens {
  export const $Class = $RecordLens;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface RecordLensProps {
  metadata: InvariantFieldMetadata;
  snapshot: InvariantSnapshot;
  selectedRecord: RankedRecord | null;
}

export interface RecordLensEmits {
  (event: 'select-record', recordIdentifier: string): void;
  (event: 'select-composition', compositionIdentifier: string): void;
  (event: 'clear-selection'): void;
}

interface RecordLensBrowserWindow {
  addEventListener(
    eventName: 'keydown',
    listener: (event: RecordLensKeyboardEvent) => void,
  ): void;
  removeEventListener(
    eventName: 'keydown',
    listener: (event: RecordLensKeyboardEvent) => void,
  ): void;
}

interface RecordLensKeyboardEvent {
  key: string;
  preventDefault(): void;
}
