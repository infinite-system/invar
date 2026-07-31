import {
  createApp,
  defineComponent,
  type PropType,
} from 'vue/dist/vue.esm-bundler.js';
import {
  FieldView,
  type FieldViewEmits,
  type FieldViewProps,
} from './ui/FieldView';
import {
  HistoryTimeline,
  type HistoryTimelineEmits,
  type HistoryTimelineProps,
} from './ui/HistoryTimeline';
import { InvariantFieldApp } from './ui/InvariantFieldApp';
import { RankDisplay, type RankDisplayProps } from './ui/RankDisplay';
import {
  RecordList,
  type RecordListEmits,
  type RecordListProps,
} from './ui/RecordList';
import type {
  InvariantFieldMetadata,
  InvariantSnapshot,
  RankedRecord,
} from './types';

const HistoryTimelineComponent = defineComponent({
  name: 'HistoryTimeline',
  props: {
    metadata: {
      type: Object as PropType<InvariantFieldMetadata>,
      required: true,
    },
    snapshotIndex: { type: Number, required: true },
  },
  emits: ['select-snapshot'],
  setup(props, { emit }) {
    const timeline = new HistoryTimeline.Class(
      props as HistoryTimelineProps,
      emit as HistoryTimelineEmits,
    );
    return { timeline };
  },
  template: `
    <section class="timeline-panel" aria-labelledby="timeline-heading">
      <div>
        <p class="eyebrow" id="timeline-heading">Contract history</p>
        <p class="snapshot-title">{{ timeline.title }}</p>
        <p class="snapshot-subtitle">{{ timeline.subtitle }}</p>
      </div>
      <div class="timeline-control">
        <button type="button" aria-label="Previous snapshot"
          :disabled="timeline.isPreviousDisabled"
          @click="timeline.selectPrevious">←</button>
        <input type="range" min="0"
          :max="timeline.maximumSnapshotIndex"
          :value="timeline.snapshotIndex"
          aria-label="Contract history snapshot"
          @input="timeline.selectFromInput" />
        <button type="button" aria-label="Next snapshot"
          :disabled="timeline.isNextDisabled"
          @click="timeline.selectNext">→</button>
      </div>
    </section>
  `,
});

const FieldViewComponent = defineComponent({
  name: 'FieldView',
  props: {
    snapshot: {
      type: Object as PropType<InvariantSnapshot>,
      required: true,
    },
    selectedRecordIdentifier: {
      type: String as PropType<string | null>,
      default: null,
    },
    selectedCompositionIdentifier: { type: String, required: true },
  },
  emits: ['select-record', 'select-composition'],
  setup(props, { emit }) {
    const field = new FieldView.Class(
      props as FieldViewProps,
      emit as FieldViewEmits,
    );
    const { tooltip } = field;
    return { field, tooltip };
  },
  template: `
    <article class="field-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Distance from R</p>
          <h2>The repository at this commit</h2>
        </div>
        <label>
          Composition
          <select :value="field.selectedCompositionIdentifier"
            @change="field.selectCompositionFromEvent">
            <option value="">All invariants</option>
            <option v-for="composition in field.compositionOptions"
              :key="composition.identifier"
              :value="composition.identifier">{{ composition.name }}</option>
          </select>
        </label>
      </div>
      <div class="field-stage">
        <svg viewBox="0 0 760 760" role="img"
          aria-label="Ranked invariant field">
          <circle :cx="field.fieldCenter" :cy="field.fieldCenter"
            r="328" class="field-background" />
          <g v-for="sector in field.fieldSectors"
            :key="sector.contractPath">
            <path :d="sector.path" :class="sector.className">
              <title>{{ sector.contractPath }}</title>
            </path>
            <text :x="sector.labelX" :y="sector.labelY"
              class="domain-label" :transform="sector.labelTransform"
              text-anchor="middle">{{ sector.label }}</text>
          </g>
          <circle v-for="ringRadius in field.rankRings"
            :key="ringRadius" :cx="field.fieldCenter"
            :cy="field.fieldCenter" :r="ringRadius" class="rank-ring" />
          <circle :cx="field.fieldCenter" :cy="field.fieldCenter"
            :r="field.realityGlowRadius" class="reality-glow" />
          <circle :cx="field.fieldCenter" :cy="field.fieldCenter"
            :r="field.realityRadius" class="reality" />
          <text :x="field.fieldCenter" :y="field.realityLabelY"
            class="reality-label" text-anchor="middle">R</text>
          <circle v-for="dot in field.fieldDots" :key="dot.identifier"
            :cx="dot.x" :cy="dot.y" :r="dot.radius" tabindex="0"
            role="button" :aria-label="dot.accessibilityLabel"
            :class="dot.className"
            @mouseenter="field.showTooltip($event, dot.record)"
            @mouseleave="field.hideTooltip"
            @focus="field.showTooltip($event, dot.record)"
            @blur="field.hideTooltip"
            @click="field.selectRecord(dot.identifier)" />
        </svg>
        <div v-if="tooltip" class="field-tooltip"
          :style="field.tooltipStyle">
          <strong>{{ tooltip.name }}</strong>
          <span>{{ tooltip.contractPath }}</span>
          <span>{{ tooltip.rankAndRadius }}</span>
        </div>
      </div>
      <p class="field-caption">
        R is asymptotic. No dot can reach the center. Angular sectors are
        contract files. Radius alone carries rank.
      </p>
    </article>
  `,
});

const RankDisplayComponent = defineComponent({
  name: 'RankDisplay',
  props: {
    metadata: {
      type: Object as PropType<InvariantFieldMetadata>,
      required: true,
    },
    selectedRecord: {
      type: Object as PropType<RankedRecord | null>,
      default: null,
    },
  },
  setup(props) {
    const rank = new RankDisplay.Class(props as RankDisplayProps);
    return { rank };
  },
  template: `
    <aside class="formula-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Inspectable algorithm</p>
          <h2>What moves a record</h2>
        </div>
      </div>
      <p class="formula">{{ rank.formulaSummary }}</p>
      <div class="formula-components">
        <div v-for="component in rank.componentWeights"
          :key="component.componentName" class="formula-component">
          <span>{{ component.label }}</span>
          <strong>{{ component.weightLabel }}</strong>
        </div>
      </div>
      <details>
        <summary>Why these components</summary>
        <div class="axiom-map">
          <p v-for="mapping in rank.axiomMappings"
            :key="mapping.componentName">
            <strong>{{ mapping.label }}.</strong>
            {{ mapping.axiom }}
            <span class="component-key">{{ mapping.componentName }}</span>
          </p>
        </div>
      </details>
      <details>
        <summary>Selected record calculation</summary>
        <div class="selected-calculation">
          <template v-if="rank.hasSelectedRecord">
            <h3>{{ rank.selectedRecordName }}</h3>
            <table>
              <tbody>
                <tr v-for="row in rank.calculationRows"
                  :key="row.componentName">
                  <th>{{ row.label }}</th>
                  <td>{{ row.value }}</td>
                  <td>× {{ row.weight }}</td>
                  <td>= {{ row.contribution }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr><th>Rot pressure</th>
                  <td colspan="3">− {{ rank.selectedRotPressure }}</td></tr>
                <tr><th>Depth</th>
                  <td colspan="3">{{ rank.selectedDepth }}</td></tr>
                <tr><th>Radius</th>
                  <td colspan="3">{{ rank.selectedRadius }}</td></tr>
              </tfoot>
            </table>
          </template>
          <template v-else>Select a dot or open a record.</template>
        </div>
      </details>
    </aside>
  `,
});

const RecordListComponent = defineComponent({
  name: 'RecordList',
  props: {
    snapshot: {
      type: Object as PropType<InvariantSnapshot>,
      required: true,
    },
    selectedCompositionIdentifier: { type: String, required: true },
  },
  emits: ['select-record'],
  setup(props, { emit }) {
    const records = new RecordList.Class(
      props as RecordListProps,
      emit as RecordListEmits,
    );
    const { searchQuery, selectedKind, selectedDomain, sortOrder } = records;
    return {
      records,
      searchQuery,
      selectedKind,
      selectedDomain,
      sortOrder,
    };
  },
  template: `
    <section class="records-panel" aria-labelledby="records-heading">
      <div class="records-heading">
        <div>
          <p class="eyebrow">Essence first</p>
          <h2 id="records-heading">Invariant records</h2>
        </div>
        <div class="record-controls">
          <input v-model="searchQuery" type="search"
            placeholder="Search names and fields"
            aria-label="Search invariant records" />
          <select v-model="selectedKind"
            aria-label="Filter by invariant kind">
            <option value="">All kinds</option>
            <option value="reality-absolute">Reality · absolute</option>
            <option value="reality-renegotiable">Reality · renegotiable</option>
            <option value="chosen">Chosen</option>
          </select>
          <select v-model="selectedDomain"
            aria-label="Filter by contract file">
            <option value="">All contracts</option>
            <option v-for="domain in records.domains" :key="domain"
              :value="domain">{{ domain }}</option>
          </select>
          <select v-model="sortOrder" aria-label="Sort invariant records">
            <option value="rank-descending">Closest to R</option>
            <option value="rank-ascending">Farthest from R</option>
            <option value="name">Name</option>
            <option value="domain">Contract</option>
          </select>
        </div>
      </div>
      <p class="result-count">{{ records.resultCount }}</p>
      <div class="record-list">
        <details v-for="card in records.recordCards"
          :id="card.elementIdentifier" :key="card.identifier"
          class="record-card">
          <summary @click="records.selectRecord(card.identifier)">
            <span class="rank-badge">{{ card.rank }}</span>
            <span class="record-essence">
              <strong>{{ card.name }}</strong>
              <span>{{ card.essence }}</span>
            </span>
            <span class="record-meta">
              <span :class="card.kindClass">{{ card.kindLabel }}</span>
              <span>{{ card.contractPath }}</span>
            </span>
          </summary>
          <dl class="record-body">
            <div v-for="field in card.fields" :key="field.fieldName"
              class="record-field">
              <dt>{{ field.fieldName }}</dt>
              <dd>{{ field.value }}</dd>
            </div>
            <div v-for="composition in card.compositions"
              :key="composition.identifier" class="record-field">
              <dt>Lattice composition</dt>
              <dd>
                <strong>{{ composition.name }}</strong>
                <span>{{ composition.guarantee }}</span>
              </dd>
            </div>
            <div class="record-field">
              <dt>Rank evidence</dt>
              <dd>{{ card.rankEvidence }}</dd>
            </div>
          </dl>
        </details>
      </div>
    </section>
  `,
});

const InvarianceFieldComponent = defineComponent({
  name: 'InvarianceField',
  components: {
    FieldView: FieldViewComponent,
    HistoryTimeline: HistoryTimelineComponent,
    RankDisplay: RankDisplayComponent,
    RecordList: RecordListComponent,
  },
  setup() {
    const app = new InvariantFieldApp.Class();
    const {
      metadata,
      snapshot,
      snapshotIndex,
      selectedRecordIdentifier,
      selectedCompositionIdentifier,
      errorMessage,
    } = app;
    return {
      app,
      metadata,
      snapshot,
      snapshotIndex,
      selectedRecordIdentifier,
      selectedCompositionIdentifier,
      errorMessage,
    };
  },
  template: `
    <header class="app-header">
      <div>
        <p class="eyebrow">Invar developer instrument</p>
        <h1>Invariance Field</h1>
        <p class="lede">
          Every dot is a recorded invariant. Its radius comes from evidence,
          generative power, enforcement, and survival.
        </p>
      </div>
      <dl v-if="app.isReady" class="header-statistics">
        <div v-for="statistic in app.headerStatistics"
          :key="statistic.label">
          <dt>{{ statistic.label }}</dt>
          <dd>{{ statistic.value }}</dd>
        </div>
      </dl>
    </header>
    <main v-if="app.isReady">
      <HistoryTimeline :metadata="metadata"
        :snapshot-index="snapshotIndex"
        @select-snapshot="app.loadSnapshot" />
      <section class="instrument-grid">
        <FieldView :snapshot="snapshot"
          :selected-record-identifier="selectedRecordIdentifier"
          :selected-composition-identifier="selectedCompositionIdentifier"
          @select-record="app.selectRecord"
          @select-composition="app.selectComposition" />
        <RankDisplay :metadata="metadata"
          :selected-record="app.selectedRecord" />
      </section>
      <RecordList :snapshot="snapshot"
        :selected-composition-identifier="selectedCompositionIdentifier"
        @select-record="app.selectRecord" />
    </main>
    <main v-else class="loading-panel">
      <p v-if="errorMessage">{{ errorMessage }}</p>
      <p v-else>Loading contract history…</p>
    </main>
  `,
});

createApp(InvarianceFieldComponent).mount('#app');
