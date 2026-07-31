<script setup lang="ts">
import {
  RecordList,
  type RecordListEmits,
  type RecordListProps,
} from './RecordList';

const props = defineProps<RecordListProps>();
const emit = defineEmits<RecordListEmits>();
const recordList = new RecordList.Class(props, emit);
</script>

<template>
  <section class="records-panel" aria-labelledby="records-heading">
    <div class="records-heading">
      <p class="eyebrow">Focus</p>
      <h2 id="records-heading">Invariant records</h2>
    </div>
    <div class="record-controls">
      <input
        :value="searchQuery"
        type="search"
        placeholder="Search names and fields"
        aria-label="Search invariant records"
        @input="recordList.changeSearch"
      />
      <select
        :value="selectedKind"
        aria-label="Filter by invariant kind"
        @change="recordList.changeKind"
      >
        <option value="">All kinds</option>
        <option value="reality-absolute">Reality · absolute</option>
        <option value="reality-renegotiable">Reality · renegotiable</option>
        <option value="chosen">Chosen</option>
      </select>
      <select
        :value="selectedDomain"
        aria-label="Filter by contract file"
        @change="recordList.changeDomain"
      >
        <option value="">All contracts</option>
        <option
          v-for="contractPath in contractPaths"
          :key="contractPath"
          :value="contractPath"
        >
          {{ contractPath }}
        </option>
      </select>
      <select
        :value="sortOrder"
        aria-label="Sort invariant records"
        @change="recordList.changeSortOrder"
      >
        <option value="rank-descending">Closest to R</option>
        <option value="rank-ascending">Farthest from R</option>
        <option value="name">Name</option>
        <option value="domain">Contract</option>
      </select>
    </div>
    <button
      type="button"
      :class="recordList.instrumentButtonClassName"
      :aria-pressed="isInstrumentFocused"
      @click="recordList.focusInstrument"
    >
      <span>{{ instrumentFocusLabel }}</span>
      <small>{{ recordList.instrumentRecordSummary }}</small>
    </button>
    <div v-if="activeFocusChips.length" class="focus-chips">
      <button
        v-for="chip in activeFocusChips"
        :key="chip.key"
        type="button"
        class="focus-chip"
        :aria-label="`Clear focus ${chip.label}`"
        @click="recordList.clearFocusChip(chip.key)"
      >
        {{ chip.label }} ✕
      </button>
    </div>
    <p class="result-count">{{ recordList.resultCount }}</p>
    <div class="record-list">
      <button
        v-for="record in recordList.recordRows"
        :id="record.elementIdentifier"
        :key="record.identifier"
        type="button"
        :class="record.className"
        @click="recordList.selectRecord(record.identifier)"
      >
        <span class="rank-badge">{{ record.rank }}</span>
        <span class="record-essence">
          <strong>{{ record.name }}</strong>
          <span>{{ record.essence }}</span>
        </span>
        <span class="record-meta">
          <span class="selected-record-label">{{ record.selectedLabel }}</span>
          <span :class="record.kindClass">{{ record.kindLabel }}</span>
          <span>{{ record.contractPath }}</span>
        </span>
      </button>
    </div>
  </section>
</template>
