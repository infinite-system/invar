<script setup lang="ts">
import {
  RecordList,
  type RecordListEmits,
  type RecordListProps,
} from './RecordList';

const props = defineProps<RecordListProps>();
const emit = defineEmits<RecordListEmits>();
const recordList = new RecordList.Class(props, emit);
const { searchQuery, selectedKind, selectedDomain, sortOrder } = recordList;
</script>

<template>
  <section class="records-panel" aria-labelledby="records-heading">
    <div class="records-heading">
      <div>
        <p class="eyebrow">Essence first</p>
        <h2 id="records-heading">Invariant records</h2>
      </div>
      <div class="record-controls">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search names and fields"
          aria-label="Search invariant records"
        />
        <select v-model="selectedKind" aria-label="Filter by invariant kind">
          <option value="">All kinds</option>
          <option value="reality-absolute">Reality · absolute</option>
          <option value="reality-renegotiable">Reality · renegotiable</option>
          <option value="chosen">Chosen</option>
        </select>
        <select v-model="selectedDomain" aria-label="Filter by contract file">
          <option value="">All contracts</option>
          <option
            v-for="domain in recordList.domains"
            :key="domain"
            :value="domain"
          >
            {{ domain }}
          </option>
        </select>
        <select v-model="sortOrder" aria-label="Sort invariant records">
          <option value="rank-descending">Closest to R</option>
          <option value="rank-ascending">Farthest from R</option>
          <option value="name">Name</option>
          <option value="domain">Contract</option>
        </select>
      </div>
    </div>
    <p class="result-count">{{ recordList.resultCount }}</p>
    <div class="record-list">
      <details
        v-for="card in recordList.recordCards"
        :id="card.elementIdentifier"
        :key="card.identifier"
        class="record-card"
      >
        <summary @click="recordList.selectRecord(card.identifier)">
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
          <div
            v-for="field in card.fields"
            :key="field.fieldName"
            class="record-field"
          >
            <dt>{{ field.fieldName }}</dt>
            <dd>{{ field.value }}</dd>
          </div>
          <div
            v-for="composition in card.compositions"
            :key="composition.identifier"
            class="record-field"
          >
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
</template>
