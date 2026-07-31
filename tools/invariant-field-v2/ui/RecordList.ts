import { Reactive } from 'ivue';
import { ref } from 'vue';
import type { InvariantSnapshot, RankedRecord } from '../types';

class $RecordList {
  constructor(
    public props: RecordListProps,
    public emit: RecordListEmits,
  ) {}

  // --- state ---
  get searchQuery() {
    return ref('');
  }
  get selectedKind() {
    return ref('');
  }
  get selectedDomain() {
    return ref('');
  }
  get sortOrder() {
    return ref('rank-descending');
  }

  // --- derived ---
  get snapshot() {
    return this.props.snapshot;
  }
  get domains() {
    return [
      ...new Set(this.snapshot.records.map((record) => record.contractPath)),
    ].sort();
  }
  get selectedComposition() {
    return this.snapshot.compositions.find(
      (composition) =>
        composition.identifier === this.props.selectedCompositionIdentifier,
    );
  }
  get filteredRecords() {
    const query = this.searchQuery.value.toLowerCase().trim();
    const memberIdentifiers = new Set(
      this.selectedComposition?.memberIdentifiers ?? [],
    );
    const records = this.snapshot.records.filter((record) => {
      if (this.selectedKind.value && record.kind !== this.selectedKind.value) {
        return false;
      }
      if (
        this.selectedDomain.value &&
        record.contractPath !== this.selectedDomain.value
      ) {
        return false;
      }
      if (
        this.selectedComposition &&
        !memberIdentifiers.has(record.stableIdentifier)
      ) {
        return false;
      }
      if (!query) return true;
      return [record.name, record.contractPath, ...Object.values(record.fields)]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
    return records.toSorted((left, right) => this.compareRecords(left, right));
  }
  get resultCount() {
    return `${this.filteredRecords.length} of ${this.snapshot.records.length} records`;
  }
  get recordCards() {
    return this.filteredRecords.map((record) => ({
      identifier: record.stableIdentifier,
      elementIdentifier: `record-${record.stableIdentifier}`,
      rank: record.rank.toFixed(3),
      name: record.name,
      essence: record.fields.Invariant ?? 'No invariant statement.',
      kindLabel: this.kindLabel(record),
      kindClass: `kind kind-${record.kind}`,
      contractPath: record.contractPath,
      fields: this.fieldOrder
        .filter((fieldName) => record.fields[fieldName])
        .map((fieldName) => ({
          fieldName,
          value: record.fields[fieldName]!,
        })),
      compositions: this.compositionsFor(record),
      rankEvidence:
        `${record.annotationCount} annotations · ` +
        `${record.incomingConnections + record.outgoingConnections} connections · ` +
        `${record.evidenceResolution.resolved}/${record.evidenceResolution.referenced} ` +
        `evidence citations resolved · ${record.verificationMode}`,
    }));
  }

  // --- methods ---
  compareRecords(left: RankedRecord, right: RankedRecord) {
    if (this.sortOrder.value === 'rank-ascending') {
      return left.rank - right.rank;
    }
    if (this.sortOrder.value === 'name') {
      return left.name.localeCompare(right.name);
    }
    if (this.sortOrder.value === 'domain') {
      return (
        left.contractPath.localeCompare(right.contractPath) ||
        left.name.localeCompare(right.name)
      );
    }
    return right.rank - left.rank;
  }

  kindLabel(record: RankedRecord) {
    if (record.kind === 'reality-absolute') return 'Reality · absolute';
    if (record.kind === 'reality-renegotiable') {
      return 'Reality · renegotiable';
    }
    return 'Chosen';
  }

  compositionsFor(record: RankedRecord) {
    return this.snapshot.compositions
      .filter((composition) =>
        composition.memberIdentifiers.includes(record.stableIdentifier),
      )
      .map((composition) => ({
        identifier: composition.identifier,
        name: composition.name,
        guarantee: composition.guarantee || 'No guarantee text parsed.',
      }));
  }

  selectRecord(recordIdentifier: string) {
    this.emit('select-record', recordIdentifier);
  }

  protected get fieldOrder() {
    return [
      'Scope',
      'Mechanism',
      'Generates',
      'Impossible if true',
      'Evidence',
      'Verification',
      'Rejected alternatives',
      'Components',
      'Renegotiable at',
      'Open question',
      'Enforcement',
      'Status',
      'Last refined',
    ];
  }
}

export namespace RecordList {
  export const $Class = $RecordList;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface RecordListProps {
  snapshot: InvariantSnapshot;
  selectedCompositionIdentifier: string;
}

export interface RecordListEmits {
  (event: 'select-record', recordIdentifier: string): void;
}
