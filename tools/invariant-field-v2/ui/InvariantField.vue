<script setup lang="ts">
import FieldView from './FieldView.vue';
import HistoryTimeline from './HistoryTimeline.vue';
import RecordList from './RecordList.vue';
import RecordLens from './RecordLens.vue';
import { InvariantFieldApp } from './InvariantFieldApp';

const invariantFieldApp = new InvariantFieldApp.Class();
const {
  snapshotIndex,
  selectedRecordIdentifier,
  selectedCompositionIdentifier,
  errorMessage,
} = invariantFieldApp;
</script>

<template>
  <header class="app-header">
    <div>
      <p class="eyebrow">Invar developer instrument</p>
      <h1>Invariance Field</h1>
      <p class="lede">
        Every dot is a recorded invariant. Its radius comes from evidence,
        generative power, enforcement, and survival.
      </p>
    </div>
    <dl v-if="invariantFieldApp.isReady" class="header-statistics">
      <div
        v-for="statistic in invariantFieldApp.headerStatistics"
        :key="statistic.label"
      >
        <dt>{{ statistic.label }}</dt>
        <dd>{{ statistic.value }}</dd>
      </div>
    </dl>
  </header>
  <main v-if="invariantFieldApp.isReady">
    <HistoryTimeline
      :metadata="invariantFieldApp.readyMetadata"
      :snapshot-index="snapshotIndex"
      @select-snapshot="invariantFieldApp.loadSnapshot"
    />
    <section class="instrument-grid">
      <FieldView
        :snapshot="invariantFieldApp.readySnapshot"
        :selected-record-identifier="selectedRecordIdentifier"
        :selected-composition-identifier="selectedCompositionIdentifier"
        @select-record="invariantFieldApp.selectRecord"
        @select-composition="invariantFieldApp.selectComposition"
      />
      <RecordLens
        :metadata="invariantFieldApp.readyMetadata"
        :snapshot="invariantFieldApp.readySnapshot"
        :selected-record="invariantFieldApp.selectedRecord"
        @select-record="invariantFieldApp.selectRecord"
        @select-composition="invariantFieldApp.selectComposition"
        @clear-selection="invariantFieldApp.clearSelection"
      />
    </section>
    <RecordList
      :snapshot="invariantFieldApp.readySnapshot"
      :selected-record-identifier="selectedRecordIdentifier"
      :selected-composition-identifier="selectedCompositionIdentifier"
      @select-record="invariantFieldApp.selectRecord"
    />
  </main>
  <main v-else class="loading-panel">
    <p v-if="errorMessage">{{ errorMessage }}</p>
    <p v-else>Loading contract history…</p>
  </main>
</template>
