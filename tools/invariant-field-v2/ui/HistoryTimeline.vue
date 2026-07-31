<script setup lang="ts">
import {
  HistoryTimeline,
  type HistoryTimelineEmits,
  type HistoryTimelineProps,
} from './HistoryTimeline';

const props = defineProps<HistoryTimelineProps>();
const emit = defineEmits<HistoryTimelineEmits>();
const historyTimeline = new HistoryTimeline.Class(props, emit);
</script>

<template>
  <section class="timeline-panel" aria-labelledby="timeline-heading">
    <div>
      <p id="timeline-heading" class="eyebrow">Contract history</p>
      <p class="snapshot-title">{{ historyTimeline.title }}</p>
      <p class="snapshot-subtitle">{{ historyTimeline.subtitle }}</p>
    </div>
    <div class="timeline-control">
      <button
        type="button"
        class="timeline-play-button"
        :aria-label="historyTimeline.playButtonLabel"
        :aria-pressed="historyTimeline.isPlaying"
        @click="historyTimeline.toggleTimeline"
      >
        {{ historyTimeline.playButtonGlyph }}
      </button>
      <button
        type="button"
        aria-label="Previous snapshot"
        :disabled="historyTimeline.isPreviousDisabled"
        @click="historyTimeline.selectPrevious"
      >
        ←
      </button>
      <input
        type="range"
        min="0"
        :max="historyTimeline.maximumSnapshotIndex"
        :value="historyTimeline.snapshotIndex"
        aria-label="Contract history snapshot"
        @input="historyTimeline.selectFromInput"
      />
      <button
        type="button"
        aria-label="Next snapshot"
        :disabled="historyTimeline.isNextDisabled"
        @click="historyTimeline.selectNext"
      >
        →
      </button>
      <span class="snapshot-position">{{
        historyTimeline.snapshotPositionLabel
      }}</span>
    </div>
  </section>
</template>
