<script setup lang="ts">
import { RankDisplay, type RankDisplayProps } from './RankDisplay';

const props = defineProps<RankDisplayProps>();
const rankDisplay = new RankDisplay.Class(props);
</script>

<template>
  <aside class="formula-panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Inspectable algorithm</p>
        <h2>What moves a record</h2>
      </div>
    </div>
    <p class="formula">{{ rankDisplay.formulaSummary }}</p>
    <div class="formula-components">
      <div
        v-for="component in rankDisplay.componentWeights"
        :key="component.componentName"
        class="formula-component"
      >
        <span>{{ component.label }}</span>
        <strong>{{ component.weightLabel }}</strong>
      </div>
    </div>
    <details>
      <summary>Why these components</summary>
      <div class="axiom-map">
        <p
          v-for="mapping in rankDisplay.axiomMappings"
          :key="mapping.componentName"
        >
          <strong>{{ mapping.label }}.</strong>
          {{ mapping.axiom }}
          <span class="component-key">{{ mapping.componentName }}</span>
        </p>
      </div>
    </details>
    <details>
      <summary>Selected record calculation</summary>
      <div class="selected-calculation">
        <template v-if="rankDisplay.hasSelectedRecord">
          <h3>{{ rankDisplay.selectedRecordName }}</h3>
          <table>
            <tbody>
              <tr
                v-for="row in rankDisplay.calculationRows"
                :key="row.componentName"
              >
                <th>{{ row.label }}</th>
                <td>{{ row.value }}</td>
                <td>× {{ row.weight }}</td>
                <td>= {{ row.contribution }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th>Rot pressure</th>
                <td colspan="3">− {{ rankDisplay.selectedRotPressure }}</td>
              </tr>
              <tr>
                <th>Depth</th>
                <td colspan="3">{{ rankDisplay.selectedDepth }}</td>
              </tr>
              <tr>
                <th>Radius</th>
                <td colspan="3">{{ rankDisplay.selectedRadius }}</td>
              </tr>
            </tfoot>
          </table>
        </template>
        <template v-else>Select a dot or open a record.</template>
      </div>
    </details>
  </aside>
</template>
