<script setup lang="ts">
import { Instrument } from '../Instrument';
import FieldView from './FieldView.vue';
import HistoryTimeline from './HistoryTimeline.vue';
import RecordList from './RecordList.vue';
import RecordLens from './RecordLens.vue';
import { InvariantFieldApp } from './InvariantFieldApp';

const invariantFieldApp = new InvariantFieldApp.Class();
const instrument = Instrument.Class;
const {
  snapshotIndex,
  selectedRecordIdentifier,
  selectedCompositionIdentifier,
  searchQuery,
  selectedKind,
  selectedDomain,
  sortOrder,
  errorMessage,
  isTimelinePlaying,
  timelineTransition,
} = invariantFieldApp;
</script>

<template>
  <div class="instrument-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">{{ instrument.EYEBROW }}</p>
        <h1>{{ instrument.NAME }}</h1>
        <p class="lede">{{ instrument.LEDE }}</p>
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
    <main v-if="invariantFieldApp.isReady" class="instrument-body">
      <RecordList
        class="instrument-rail"
        :records="invariantFieldApp.focusedRecords"
        :total-record-count="invariantFieldApp.readySnapshot.records.length"
        :contract-paths="invariantFieldApp.contractPaths"
        :selected-record-identifier="selectedRecordIdentifier"
        :search-query="searchQuery"
        :selected-kind="selectedKind"
        :selected-domain="selectedDomain"
        :sort-order="sortOrder"
        :active-focus-chips="invariantFieldApp.activeFocusChips"
        :instrument-focus-label="invariantFieldApp.instrumentFocusLabel"
        :is-instrument-focused="invariantFieldApp.isInstrumentFocused"
        :instrument-record-count="invariantFieldApp.instrumentRecordCount"
        @select-record="invariantFieldApp.selectRecord"
        @change-search="invariantFieldApp.selectSearchQuery"
        @change-kind="invariantFieldApp.selectKind"
        @change-domain="invariantFieldApp.selectDomain"
        @change-sort-order="invariantFieldApp.selectSortOrder"
        @clear-focus-chip="invariantFieldApp.clearFocusChip"
        @focus-instrument="invariantFieldApp.focusInstrument"
      />
      <FieldView
        :snapshot="invariantFieldApp.readySnapshot"
        :selected-record-identifier="selectedRecordIdentifier"
        :selected-composition-identifier="selectedCompositionIdentifier"
        :focused-record-identifiers="invariantFieldApp.focusedRecordIdentifiers"
        :is-focused="invariantFieldApp.isFocused"
        :timeline-transition="timelineTransition"
        @select-record="invariantFieldApp.selectRecord"
        @select-composition="invariantFieldApp.selectComposition"
        @transition-settled="invariantFieldApp.settleTimelineTransition"
        @cancel-timeline="invariantFieldApp.stopTimeline"
      />
      <RecordLens
        :metadata="invariantFieldApp.readyMetadata"
        :snapshot="invariantFieldApp.readySnapshot"
        :selected-record="invariantFieldApp.selectedRecord"
        @select-record="invariantFieldApp.selectRecord"
        @select-composition="invariantFieldApp.selectComposition"
        @clear-selection="invariantFieldApp.clearSelection"
      />
    </main>
    <main v-else class="loading-panel">
      <p v-if="errorMessage">{{ errorMessage }}</p>
      <p v-else>Loading contract history…</p>
    </main>
    <HistoryTimeline
      v-if="invariantFieldApp.isReady"
      :metadata="invariantFieldApp.readyMetadata"
      :snapshot-index="snapshotIndex"
      :is-playing="isTimelinePlaying"
      :instrument-record-count="invariantFieldApp.instrumentRecordCount"
      :instrument-birth-snapshot-index="
        invariantFieldApp.instrumentBirthSnapshotIndex
      "
      @select-snapshot="invariantFieldApp.selectSnapshot"
      @toggle-timeline="invariantFieldApp.toggleTimeline"
    />
  </div>
</template>
