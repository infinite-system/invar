<script setup lang="ts">
import RankDisplay from './RankDisplay.vue';
import {
  RecordLens,
  type RecordLensEmits,
  type RecordLensProps,
} from './RecordLens';

const props = defineProps<RecordLensProps>();
const emit = defineEmits<RecordLensEmits>();
const recordLens = new RecordLens.Class(props, emit);
</script>

<template>
  <aside class="record-lens" aria-label="Selected invariant lens">
    <template v-if="recordLens.hasSelectedRecord">
      <header class="record-lens-header">
        <div class="eyebrow">Invariant lens</div>
        <div class="record-lens-title-row">
          <h2>{{ recordLens.selectedRecordName }}</h2>
          <button
            type="button"
            class="record-lens-close"
            aria-label="Close invariant lens"
            @click="recordLens.clearSelection"
          >
            Close
          </button>
        </div>
        <p class="record-lens-path">{{ recordLens.selectedRecordPath }}</p>
      </header>

      <dl class="record-lens-metrics">
        <div>
          <dt>Rank</dt>
          <dd>{{ recordLens.selectedRecordRank }}</dd>
        </div>
        <div>
          <dt>Kind</dt>
          <dd>{{ recordLens.selectedRecordKind }}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{{ recordLens.selectedRecordStatus }}</dd>
        </div>
      </dl>

      <section class="record-lens-section record-lens-essence">
        <p class="eyebrow">Invariant</p>
        <p>{{ recordLens.essence }}</p>
      </section>

      <section class="record-lens-section">
        <p class="eyebrow">Complete record</p>
        <div class="record-field-accordions">
          <details
            v-for="field in recordLens.fieldSections"
            :key="field.fieldName"
            class="record-field-accordion"
          >
            <summary>{{ field.fieldName }}</summary>
            <p>{{ field.value }}</p>
          </details>
        </div>
      </section>

      <section
        v-if="recordLens.hasRelationships"
        class="record-lens-section relationships-section"
      >
        <p class="eyebrow">Relationships</p>
        <div
          v-for="composition in recordLens.compositionRelationships"
          :key="composition.identifier"
          class="relationship-group"
        >
          <button
            type="button"
            class="relationship-heading"
            @click="recordLens.selectComposition(composition.identifier)"
          >
            {{ composition.name }}
          </button>
          <p>{{ composition.guarantee }}</p>
          <div class="relationship-links">
            <button
              v-for="member in composition.members"
              :key="member.identifier"
              type="button"
              @click="recordLens.selectRecord(member.identifier)"
            >
              {{ member.name }}
            </button>
          </div>
        </div>
        <div
          v-for="group in recordLens.dependencyGroups"
          :key="group.label"
          class="relationship-group"
        >
          <h3>{{ group.label }}</h3>
          <div class="relationship-links">
            <button
              v-for="record in group.records"
              :key="record.identifier"
              type="button"
              @click="recordLens.selectRecord(record.identifier)"
            >
              {{ record.name }}
            </button>
          </div>
        </div>
        <div class="relationship-group">
          <h3>Sibling records in this domain</h3>
          <div class="relationship-links relationship-links-scroll">
            <button
              v-for="record in recordLens.siblingRecords"
              :key="record.identifier"
              type="button"
              @click="recordLens.selectRecord(record.identifier)"
            >
              {{ record.name }}
            </button>
          </div>
        </div>
      </section>

      <section
        v-if="recordLens.hasCodeReferences"
        class="record-lens-section code-references-section"
      >
        <p class="eyebrow">Code lenses</p>
        <button
          v-for="reference in recordLens.codeReferences"
          :key="reference.identifier"
          type="button"
          :class="reference.className"
          @click="recordLens.openCodeReference(reference)"
        >
          <span>{{ reference.sourceLabel }}</span>
          <strong>{{ reference.locationLabel }}</strong>
          <small>{{ reference.statusLabel }}</small>
        </button>
      </section>

      <RankDisplay
        :metadata="recordLens.props.metadata"
        :selected-record="recordLens.selectedRecord"
      />
    </template>
    <div v-else class="record-lens-empty">
      <p class="eyebrow">Invariant lens</p>
      <h2>Select a record</h2>
      <p>
        Select a dot or list row to open its full record and implementation.
      </p>
    </div>
  </aside>

  <div
    v-if="recordLens.codeLensIsOpen"
    class="code-lens-scrim"
    role="presentation"
    @click.self="recordLens.closeCodeLens"
  >
    <section
      class="code-lens-popup"
      role="dialog"
      aria-modal="true"
      aria-labelledby="code-lens-title"
    >
      <header>
        <div>
          <p class="eyebrow">Real repository source</p>
          <h2 id="code-lens-title">{{ recordLens.codeLensTitle }}</h2>
        </div>
        <button
          type="button"
          aria-label="Close code lens"
          @click="recordLens.closeCodeLens"
        >
          Close
        </button>
      </header>
      <p v-if="recordLens.codeLensResolved" class="code-lens-range">
        {{ recordLens.codeLensLineRange }}
      </p>
      <div
        v-if="recordLens.codeLensResolved"
        class="highlighted-code"
        v-html="recordLens.highlightedCode"
      ></div>
      <p v-else class="code-lens-error">
        {{ recordLens.codeLensErrorMessage }}
      </p>
    </section>
  </div>
</template>
