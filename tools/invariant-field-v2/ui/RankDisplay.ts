import { Reactive } from 'ivue';
import type { InvariantFieldMetadata, RankedRecord } from '../types';

class $RankDisplay {
  constructor(public props: RankDisplayProps) {}

  // --- derived ---
  get metadata() {
    return this.props.metadata;
  }
  get selectedRecord() {
    return this.props.selectedRecord;
  }
  get formulaSummary() {
    return this.metadata.formula.summary;
  }
  get componentWeights() {
    return Object.entries(this.metadata.formula.weights).map(
      ([componentName, weight]) => ({
        componentName,
        label:
          this.componentExplanations[
            componentName as keyof typeof this.componentExplanations
          ].label,
        weightLabel: `${Math.round(weight * 100)}%`,
      }),
    );
  }
  get axiomMappings() {
    return Object.entries(this.componentExplanations).map(
      ([componentName, explanation]) => ({
        componentName,
        ...explanation,
      }),
    );
  }
  get hasSelectedRecord() {
    return Boolean(this.selectedRecord);
  }
  get selectedRecordName() {
    return this.selectedRecord?.name ?? '';
  }
  get calculationRows() {
    if (!this.selectedRecord) return [];
    return Object.entries(this.selectedRecord.rankComponents)
      .filter(([componentName]) => componentName !== 'rotPenalty')
      .map(([componentName, value]) => {
        const weight =
          this.metadata.formula.weights[
            componentName as keyof typeof this.metadata.formula.weights
          ];
        return {
          componentName,
          label:
            this.componentExplanations[
              componentName as keyof typeof this.componentExplanations
            ].label,
          value: value.toFixed(3),
          weight: weight.toFixed(2),
          contribution: (value * weight).toFixed(3),
        };
      });
  }
  get selectedRotPressure() {
    return this.selectedRecord?.rankComponents.rotPenalty.toFixed(3) ?? '';
  }
  get selectedDepth() {
    return this.selectedRecord?.rank.toFixed(3) ?? '';
  }
  get selectedRadius() {
    return this.selectedRecord?.radius.toFixed(3) ?? '';
  }

  protected get componentExplanations() {
    return {
      kind: {
        label: 'Kind',
        axiom:
          'Scope and Provisionality: reality-set conditions sit closer than agreement-set conditions.',
      },
      falsifiability: {
        label: 'Impossibility',
        axiom:
          'Impossibility Principle: a concrete negative boundary makes the record falsifiable.',
      },
      evidence: {
        label: 'Evidence',
        axiom:
          'Proof and Breaking Principles: cited reality must resolve before the claim earns depth.',
      },
      verification: {
        label: 'Verification',
        axiom:
          'Proof Principle: an executed check is stronger than citation-only support.',
      },
      status: {
        label: 'Status',
        axiom:
          'Provisionality: established records have survived more pressure, but remain short of R.',
      },
      generativity: {
        label: 'Generativity',
        axiom:
          'Generative Principle: a record moves inward when it produces downstream structure.',
      },
      simplicity: {
        label: 'Compression',
        axiom:
          'Simplicity as signature: broad output from a compact non-vacuous rule signals deeper reduction.',
      },
      curvature: {
        label: 'Connections',
        axiom:
          'Invariant Reinforcement: dependence concentrated on a record bends it inward.',
      },
      annotations: {
        label: 'Enforcement',
        axiom:
          'Generative Principle: reverse pointers show the rule operating at real enforcement points.',
      },
      survival: {
        label: 'Survival',
        axiom:
          'Provisionality: stable structure that survives change and audit earns depth.',
      },
    } as const;
  }
}

export namespace RankDisplay {
  export const $Class = $RankDisplay;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface RankDisplayProps {
  metadata: InvariantFieldMetadata;
  selectedRecord: RankedRecord | null;
}
