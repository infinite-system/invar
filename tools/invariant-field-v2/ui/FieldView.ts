import { Reactive } from 'ivue';
import { shallowRef } from 'vue';
import type {
  InvariantSnapshot,
  LatticeComposition,
  RankedRecord,
} from '../types';

class $FieldView {
  constructor(
    public props: FieldViewProps,
    public emit: FieldViewEmits,
  ) {}

  // --- state ---
  get tooltip() {
    return shallowRef<FieldTooltip | null>(null);
  }

  // --- constants ---
  realityGlowRadius = 30;
  realityRadius = 8;

  // --- derived ---
  get fieldCenter() {
    return 380;
  }
  get fieldRadius() {
    return 320;
  }
  get rankRings() {
    return [0.22, 0.36, 0.52, 0.72, 1].map(
      (normalizedRadius) => normalizedRadius * this.fieldRadius,
    );
  }
  get snapshot() {
    return this.props.snapshot;
  }
  get selectedCompositionIdentifier() {
    return this.props.selectedCompositionIdentifier;
  }
  get realityLabelY() {
    return this.fieldCenter - 18;
  }
  get selectedComposition(): LatticeComposition | null {
    return (
      this.snapshot.compositions.find(
        (composition) =>
          composition.identifier === this.props.selectedCompositionIdentifier,
      ) ?? null
    );
  }
  get compositionOptions() {
    return this.snapshot.compositions.map((composition) => ({
      identifier: composition.identifier,
      name: composition.name,
    }));
  }
  get fieldSectors() {
    const domains = [
      ...new Set(this.snapshot.records.map((record) => record.contractPath)),
    ].sort();
    const sectorWidthRadians = (Math.PI * 2) / Math.max(1, domains.length);
    return domains.map((contractPath, domainIndex) => {
      const startAngle = -Math.PI / 2 + domainIndex * sectorWidthRadians;
      const endAngle = startAngle + sectorWidthRadians;
      const labelAngle = startAngle + sectorWidthRadians / 2;
      const labelPoint = this.polarPoint(this.fieldRadius + 21, labelAngle);
      return {
        contractPath,
        domainIndex,
        path: this.sectorPath(startAngle, endAngle),
        className: `domain-sector domain-sector-${domainIndex % 8}`,
        label: this.shortDomainName(contractPath),
        labelX: labelPoint.x,
        labelY: labelPoint.y,
        labelTransform: `rotate(${(labelAngle * 180) / Math.PI + 90} ${labelPoint.x} ${labelPoint.y})`,
      };
    });
  }
  get fieldDots() {
    const domains = this.fieldSectors.map((sector) => sector.contractPath);
    const sectorWidthRadians = (Math.PI * 2) / Math.max(1, domains.length);
    const domainIndexes = new Map(
      domains.map((domain, domainIndex) => [domain, domainIndex]),
    );
    const selectedMemberIdentifiers = new Set(
      this.selectedComposition?.memberIdentifiers ?? [],
    );
    return this.snapshot.records.map((record) => {
      const domainIndex = domainIndexes.get(record.contractPath)!;
      const startAngle = -Math.PI / 2 + domainIndex * sectorWidthRadians;
      const angle =
        startAngle +
        sectorWidthRadians *
          (0.15 + this.stableFraction(record.stableIdentifier) * 0.7);
      const point = this.polarPoint(record.radius * this.fieldRadius, angle);
      const isSelected =
        this.props.selectedRecordIdentifier === record.stableIdentifier;
      const isCompositionMember = selectedMemberIdentifiers.has(
        record.stableIdentifier,
      );
      const hasActiveComposition = Boolean(
        this.props.selectedCompositionIdentifier,
      );
      return {
        identifier: record.stableIdentifier,
        record,
        x: point.x,
        y: point.y,
        radius: isSelected || isCompositionMember ? 6.5 : 4.2,
        accessibilityLabel: `${record.name}, rank ${record.rank.toFixed(3)}`,
        className: [
          'record-dot',
          `record-dot-${record.kind}`,
          isSelected ? 'record-dot-selected' : '',
          hasActiveComposition && !isCompositionMember
            ? 'record-dot-muted'
            : '',
          isCompositionMember ? 'record-dot-composition' : '',
        ]
          .filter(Boolean)
          .join(' '),
      };
    });
  }
  get tooltipStyle() {
    return {
      left: `${this.tooltip.value?.left ?? 0}px`,
      top: `${this.tooltip.value?.top ?? 0}px`,
    };
  }

  // --- methods ---
  shortDomainName(contractPath: string) {
    return contractPath
      .replace(/\.invariants\.md$/, '')
      .split('/')
      .at(-1)!;
  }

  selectCompositionFromEvent(event: Event) {
    const select = event.currentTarget as EventTarget & { value: string };
    this.emit('select-composition', select.value);
  }

  selectRecord(recordIdentifier: string) {
    this.emit('select-record', recordIdentifier);
  }

  showTooltip(event: Event, record: RankedRecord) {
    const stage = this.browserDocument.querySelector('.field-stage')!;
    const stageBounds = stage.getBoundingClientRect();
    const targetBounds = (
      event.currentTarget as EventTarget & BrowserElement
    ).getBoundingClientRect();
    this.tooltip.value = {
      name: record.name,
      contractPath: record.contractPath,
      rankAndRadius: `Rank ${record.rank.toFixed(3)} · radius ${record.radius.toFixed(3)}`,
      left: Math.min(
        stageBounds.width - 280,
        targetBounds.left - stageBounds.left + 14,
      ),
      top: Math.max(8, targetBounds.top - stageBounds.top - 72),
    };
  }

  hideTooltip() {
    this.tooltip.value = null;
  }

  protected get browserDocument(): BrowserDocument {
    return (globalThis as unknown as { document: BrowserDocument }).document;
  }

  protected polarPoint(radius: number, angle: number) {
    return {
      x: this.fieldCenter + radius * Math.cos(angle),
      y: this.fieldCenter + radius * Math.sin(angle),
    };
  }

  protected sectorPath(startAngle: number, endAngle: number) {
    const start = this.polarPoint(this.fieldRadius, startAngle);
    const end = this.polarPoint(this.fieldRadius, endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return [
      `M ${this.fieldCenter} ${this.fieldCenter}`,
      `L ${start.x} ${start.y}`,
      `A ${this.fieldRadius} ${this.fieldRadius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
      'Z',
    ].join(' ');
  }

  protected stableFraction(value: string) {
    let hash = 2_166_136_261;
    for (const character of value) {
      hash ^= character.codePointAt(0)!;
      hash = Math.imul(hash, 16_777_619);
    }
    return (hash >>> 0) / 4_294_967_295;
  }
}

export namespace FieldView {
  export const $Class = $FieldView;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface FieldViewProps {
  snapshot: InvariantSnapshot;
  selectedRecordIdentifier: string | null;
  selectedCompositionIdentifier: string;
}

export interface FieldViewEmits {
  (event: 'select-record', recordIdentifier: string): void;
  (event: 'select-composition', compositionIdentifier: string): void;
}

interface FieldTooltip {
  name: string;
  contractPath: string;
  rankAndRadius: string;
  left: number;
  top: number;
}

interface BrowserDocument {
  querySelector(selector: string): BrowserElement | null;
}

interface BrowserElement {
  getBoundingClientRect(): {
    width: number;
    left: number;
    top: number;
  };
}
