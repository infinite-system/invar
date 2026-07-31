<script setup lang="ts">
import {
  FieldView,
  type FieldViewEmits,
  type FieldViewProps,
} from './FieldView';

const props = defineProps<FieldViewProps>();
const emit = defineEmits<FieldViewEmits>();
const fieldView = new FieldView.Class(props, emit);
const {
  tooltip,
  reducedMotion,
  threeDimensionalCanvas,
  threeDimensionalHitTargets,
  threeDimensionalOverlayLabels,
} = fieldView;
</script>

<template>
  <article
    :class="fieldView.fieldPanelClassName"
    tabindex="0"
    @keydown="fieldView.handleFieldKeydown"
  >
    <div class="panel-heading field-panel-heading">
      <div>
        <p class="eyebrow">Distance from R</p>
        <h2>The repository at this commit</h2>
      </div>
      <div class="field-controls">
        <div class="field-mode-group" aria-label="Field dimension">
          <button
            type="button"
            :class="fieldView.twoDimensionalButtonClassName"
            :aria-pressed="fieldView.isTwoDimensional"
            @click="fieldView.selectTwoDimensionalMode"
          >
            2D
          </button>
          <button
            type="button"
            :class="fieldView.threeDimensionalButtonClassName"
            :aria-pressed="fieldView.isThreeDimensional"
            :disabled="reducedMotion"
            @click="fieldView.selectThreeDimensionalMode"
          >
            3D
          </button>
        </div>
        <button type="button" @click="fieldView.resetCamera">Reset view</button>
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
    </div>
    <div class="field-stage">
      <div class="field-coordinate-readout">
        <span>RADIUS IS RANK</span>
        <span v-if="fieldView.isThreeDimensional">{{
          fieldView.cameraReadout
        }}</span>
        <span v-else>EXACT 2D</span>
      </div>

      <svg
        v-show="fieldView.isTwoDimensional"
        class="field-two-dimensional"
        viewBox="0 0 760 760"
        role="img"
        aria-label="Exact two-dimensional ranked invariant field"
      >
        <circle
          :cx="fieldView.fieldCenter"
          :cy="fieldView.fieldCenter"
          r="328"
          class="field-background"
        />
        <g v-for="sector in fieldView.fieldSectors" :key="sector.paletteName">
          <path :d="sector.path" :class="sector.className">
            <title>{{ sector.label }}</title>
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

        <g
          v-for="dot in fieldView.fieldDots"
          :key="dot.identifier"
          :class="dot.className"
          :style="dot.style"
          :transform="dot.transform"
          :data-record-identifier="dot.identifier"
          tabindex="0"
          role="button"
          :aria-label="dot.accessibilityLabel"
          @mouseenter="fieldView.showTooltip($event, dot.record)"
          @mouseleave="fieldView.hideTooltip"
          @focus="fieldView.showTooltip($event, dot.record)"
          @blur="fieldView.hideTooltip"
          @click="fieldView.selectRecord(dot.identifier)"
          @keydown="fieldView.handleDotKeydown($event, dot)"
        >
          <g class="record-motion-layer">
            <line
              :class="dot.traceClassName"
              :x1="dot.traceStartX"
              :y1="dot.traceStartY"
              x2="0"
              y2="0"
            />
            <circle class="record-hit-target" r="12" />
            <circle class="record-halo" r="12" />
            <circle class="record-verification-rim" r="7" />
            <rect
              v-if="dot.isRealityAbsolute"
              class="record-core record-core-absolute"
              x="-3"
              y="-3"
              width="6"
              height="6"
            />
            <path
              v-if="dot.isRealityRenegotiable"
              class="record-core record-core-renegotiable"
              d="M 0 -4 L 3.5 -2 L 3.5 2 L 0 4 L -3.5 2 L -3.5 -2 Z"
            />
            <circle
              v-if="dot.isChosen"
              class="record-core record-core-chosen"
              :r="dot.visualRadius"
            />
            <path
              v-if="dot.hasRot"
              class="record-rot-fracture"
              d="M 2 -7 L 0 -2 L 4 1 L 1 7"
            />
            <circle
              v-if="dot.isSelected"
              class="record-selection-bracket"
              r="13"
            />
          </g>
        </g>
        <g v-for="dot in fieldView.fieldDots" :key="dot.labelKey">
          <line
            v-if="dot.isSelected"
            class="record-selection-anchor"
            :x1="fieldView.fieldCenter"
            :y1="fieldView.fieldCenter"
            :x2="dot.x"
            :y2="dot.y"
          />
          <text
            v-if="dot.isSelected"
            class="record-selection-label"
            :x="dot.labelX"
            :y="dot.labelY"
          >
            {{ dot.record.name }}
          </text>
        </g>
      </svg>

      <div
        v-show="fieldView.isThreeDimensional"
        class="field-three-dimensional"
      >
        <canvas
          ref="threeDimensionalCanvas"
          aria-label="Constrained three-dimensional ranked invariant field"
          @pointerdown="fieldView.handleThreeDimensionalPointerDown"
          @pointermove="fieldView.handleThreeDimensionalPointerMove"
          @pointerup="fieldView.handleThreeDimensionalPointerUp"
          @pointercancel="fieldView.handleThreeDimensionalPointerUp"
          @click="fieldView.handleThreeDimensionalClick"
          @mouseleave="fieldView.hideTooltip"
          @contextmenu="fieldView.preventContextMenu"
        ></canvas>
        <button
          v-for="hitTarget in threeDimensionalHitTargets"
          :key="hitTarget.identifier"
          type="button"
          :class="hitTarget.className"
          :style="hitTarget.style"
          :aria-label="hitTarget.accessibilityLabel"
          @focus="
            fieldView.handleThreeDimensionalHitTargetFocus(
              $event,
              hitTarget.record,
            )
          "
          @blur="fieldView.hideTooltip"
          @click="fieldView.selectRecord(hitTarget.identifier)"
        ></button>
        <span
          v-for="overlayLabel in threeDimensionalOverlayLabels"
          :key="overlayLabel.identifier"
          :class="overlayLabel.className"
          :style="overlayLabel.style"
          aria-hidden="true"
          >{{ overlayLabel.text }}</span
        >
      </div>

      <div
        v-if="fieldView.timelineTransition"
        class="timeline-event-readout"
        aria-live="polite"
      >
        <span
          v-for="eventCount in fieldView.transitionSummary"
          :key="eventCount.eventType"
          :class="eventCount.className"
        >
          {{ eventCount.label }} {{ eventCount.count }}
        </span>
      </div>
      <div
        v-if="fieldView.timelineTransition"
        :key="fieldView.timelineTransition.identifier"
        :class="fieldView.transitionSentinelClassName"
        @animationend="fieldView.settleTimelineTransition"
      ></div>
      <div v-if="tooltip" class="field-tooltip" :style="fieldView.tooltipStyle">
        <strong>{{ tooltip.name }}</strong>
        <span>{{ tooltip.contractPath }}</span>
        <span>{{ tooltip.rankAndRadius }}</span>
      </div>
    </div>
    <p class="field-caption">
      Radius is unchanged between views. Drag with the secondary pointer button
      to orbit. Press 2, 3, or 0 to switch or reset.
    </p>
  </article>
</template>
