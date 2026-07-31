<script setup lang="ts">
import {
  FieldView,
  type FieldViewEmits,
  type FieldViewProps,
} from './FieldView';

const props = defineProps<FieldViewProps>();
const emit = defineEmits<FieldViewEmits>();
const fieldView = new FieldView.Class(props, emit);
const { tooltip } = fieldView;
</script>

<template>
  <article class="field-panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Distance from R</p>
        <h2>The repository at this commit</h2>
      </div>
      <label>
        Composition
        <select
          :value="fieldView.selectedCompositionIdentifier"
          @change="fieldView.selectCompositionFromEvent"
        >
          <option value="">All invariants</option>
          <option
            v-for="composition in fieldView.compositionOptions"
            :key="composition.identifier"
            :value="composition.identifier"
          >
            {{ composition.name }}
          </option>
        </select>
      </label>
    </div>
    <div class="field-stage">
      <svg viewBox="0 0 760 760" role="img" aria-label="Ranked invariant field">
        <circle
          :cx="fieldView.fieldCenter"
          :cy="fieldView.fieldCenter"
          r="328"
          class="field-background"
        />
        <g v-for="sector in fieldView.fieldSectors" :key="sector.contractPath">
          <path :d="sector.path" :class="sector.className">
            <title>{{ sector.contractPath }}</title>
          </path>
          <text
            :x="sector.labelX"
            :y="sector.labelY"
            class="domain-label"
            :transform="sector.labelTransform"
            text-anchor="middle"
          >
            {{ sector.label }}
          </text>
        </g>
        <circle
          v-for="ringRadius in fieldView.rankRings"
          :key="ringRadius"
          :cx="fieldView.fieldCenter"
          :cy="fieldView.fieldCenter"
          :r="ringRadius"
          class="rank-ring"
        />
        <circle
          :cx="fieldView.fieldCenter"
          :cy="fieldView.fieldCenter"
          :r="fieldView.realityGlowRadius"
          class="reality-glow"
        />
        <circle
          :cx="fieldView.fieldCenter"
          :cy="fieldView.fieldCenter"
          :r="fieldView.realityRadius"
          class="reality"
        />
        <text
          :x="fieldView.fieldCenter"
          :y="fieldView.realityLabelY"
          class="reality-label"
          text-anchor="middle"
        >
          R
        </text>
        <circle
          v-for="dot in fieldView.fieldDots"
          :key="dot.identifier"
          :cx="dot.x"
          :cy="dot.y"
          :r="dot.radius"
          tabindex="0"
          role="button"
          :aria-label="dot.accessibilityLabel"
          :class="dot.className"
          @mouseenter="fieldView.showTooltip($event, dot.record)"
          @mouseleave="fieldView.hideTooltip"
          @focus="fieldView.showTooltip($event, dot.record)"
          @blur="fieldView.hideTooltip"
          @click="fieldView.selectRecord(dot.identifier)"
        />
      </svg>
      <div v-if="tooltip" class="field-tooltip" :style="fieldView.tooltipStyle">
        <strong>{{ tooltip.name }}</strong>
        <span>{{ tooltip.contractPath }}</span>
        <span>{{ tooltip.rankAndRadius }}</span>
      </div>
    </div>
    <p class="field-caption">
      R is asymptotic. No dot can reach the center. Angular sectors are contract
      files. Radius alone carries rank.
    </p>
  </article>
</template>
