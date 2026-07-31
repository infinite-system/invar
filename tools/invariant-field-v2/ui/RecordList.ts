import { Reactive } from 'ivue';
import type { RankedRecord } from '../types';

// The rail holds NO filter cell. Search, kind, contract, and composition all
// live in InvariantFieldApp so the field and the rail cannot disagree. A
// filter added here would be the second owner.
// invariant: One focus fold serves every surface (tools/invariant-field-v2/invariant-field.invariants.md)
class $RecordList {
  constructor(
    public props: RecordListProps,
    public emit: RecordListEmits,
  ) {}

  // --- derived ---
  get resultCount() {
    return `${this.props.records.length} of ${this.props.totalRecordCount} records`;
  }
  get recordRows() {
    return this.props.records.map((record) => ({
      identifier: record.stableIdentifier,
      elementIdentifier: `record-${record.stableIdentifier}`,
      className:
        record.stableIdentifier === this.props.selectedRecordIdentifier
          ? 'record-row record-row-selected'
          : 'record-row',
      selectedLabel:
        record.stableIdentifier === this.props.selectedRecordIdentifier
          ? 'Selected'
          : '',
      rank: record.rank.toFixed(3),
      name: record.name,
      essence: record.fields.Invariant ?? 'No invariant statement.',
      kindLabel: this.kindLabel(record),
      kindClass: `kind kind-${record.kind}`,
      contractPath: record.contractPath,
    }));
  }
  get instrumentButtonClassName() {
    return this.props.isInstrumentFocused
      ? 'instrument-focus-button instrument-focus-button-active'
      : 'instrument-focus-button';
  }
  get instrumentRecordSummary() {
    if (!this.props.instrumentRecordCount) {
      return 'The instrument carries no record in this snapshot.';
    }
    return `${this.props.instrumentRecordCount} of these dots are the instrument itself.`;
  }

  // --- methods ---
  kindLabel(record: RankedRecord) {
    if (record.kind === 'reality-absolute') return 'Reality · absolute';
    if (record.kind === 'reality-renegotiable') {
      return 'Reality · renegotiable';
    }
    return 'Chosen';
  }

  selectRecord(recordIdentifier: string) {
    this.emit('select-record', recordIdentifier);
  }

  changeSearch(event: Event) {
    this.emit('change-search', this.inputValue(event));
  }

  changeKind(event: Event) {
    this.emit('change-kind', this.inputValue(event));
  }

  changeDomain(event: Event) {
    this.emit('change-domain', this.inputValue(event));
  }

  changeSortOrder(event: Event) {
    this.emit('change-sort-order', this.inputValue(event));
  }

  clearFocusChip(chipKey: string) {
    this.emit('clear-focus-chip', chipKey);
  }

  focusInstrument() {
    this.emit('focus-instrument');
  }

  protected inputValue(event: Event) {
    return (event.currentTarget as EventTarget & { value: string }).value;
  }
}

export namespace RecordList {
  export const $Class = $RecordList;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface RecordListProps {
  records: RankedRecord[];
  totalRecordCount: number;
  contractPaths: string[];
  selectedRecordIdentifier: string | null;
  searchQuery: string;
  selectedKind: string;
  selectedDomain: string;
  sortOrder: string;
  activeFocusChips: Array<{ key: string; label: string }>;
  instrumentFocusLabel: string;
  isInstrumentFocused: boolean;
  instrumentRecordCount: number;
}

export interface RecordListEmits {
  (event: 'select-record', recordIdentifier: string): void;
  (event: 'change-search', query: string): void;
  (event: 'change-kind', kind: string): void;
  (event: 'change-domain', contractPath: string): void;
  (event: 'change-sort-order', sortOrder: string): void;
  (event: 'clear-focus-chip', chipKey: string): void;
  (event: 'focus-instrument'): void;
}
