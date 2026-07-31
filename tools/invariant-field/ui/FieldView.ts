import { Reactive } from 'ivue';
import { shallowRef } from 'vue';
import type {
  InvariantSnapshot,
  LatticeComposition,
  RankedRecord,
} from '../types';

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

interface BrowserElement {
  getBoundingClientRect(): {
    width: number;
    left: number;
    top: number;
  };
}

declare const document: {
  querySelector(selector: string): BrowserElement | null;
};

const FIELD_CENTER = 380;
const FIELD_RADIUS = 320;

function polarPoint(radius: number, angle: number) {
  return {
    x: FIELD_CENTER + radius * Math.cos(angle),
    y: FIELD_CENTER + radius * Math.sin(angle),
  };
}

function sectorPath(startAngle: number, endAngle: number) {
  const start = polarPoint(FIELD_RADIUS, startAngle);
  const end = polarPoint(FIELD_RADIUS, endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${FIELD_CENTER} ${FIELD_CENTER}`,
    `L ${start.x} ${start.y}`,
    `A ${FIELD_RADIUS} ${FIELD_RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

function stableFraction(value: string) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

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
  fieldCenter = FIELD_CENTER;
  realityGlowRadius = 30;
  realityRadius = 8;
  rankRings = [0.22, 0.36, 0.52, 0.72, 1].map(
    (normalizedRadius) => normalizedRadius * FIELD_RADIUS,
  );

  // --- derived ---
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
    const sectorWidth = (Math.PI * 2) / Math.max(1, domains.length);
    return domains.map((contractPath, domainIndex) => {
      const startAngle = -Math.PI / 2 + domainIndex * sectorWidth;
      const endAngle = startAngle + sectorWidth;
      const labelAngle = startAngle + sectorWidth / 2;
      const labelPoint = polarPoint(FIELD_RADIUS + 21, labelAngle);
      return {
        contractPath,
        domainIndex,
        path: sectorPath(startAngle, endAngle),
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
    const sectorWidth = (Math.PI * 2) / Math.max(1, domains.length);
    const domainIndexes = new Map(
      domains.map((domain, domainIndex) => [domain, domainIndex]),
    );
    const selectedMemberIdentifiers = new Set(
      this.selectedComposition?.memberIdentifiers ?? [],
    );
    return this.snapshot.records.map((record) => {
      const domainIndex = domainIndexes.get(record.contractPath)!;
      const startAngle = -Math.PI / 2 + domainIndex * sectorWidth;
      const angle =
        startAngle +
        sectorWidth * (0.15 + stableFraction(record.stableIdentifier) * 0.7);
      const point = polarPoint(record.radius * FIELD_RADIUS, angle);
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
    const stage = document.querySelector('.field-stage')!;
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
}

export namespace FieldView {
  export const $Class = $FieldView;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}
