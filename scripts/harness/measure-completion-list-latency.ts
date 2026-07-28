#!/usr/bin/env bun
// Measures the real PTY input-write -> completed DEC 2026 frame boundary for completion
// selection and wheel scrolling at each configured item count.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Latency measurements name their observation boundary (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

class CompletionListLatencyMeasurement {
  static get itemCounts(): readonly number[] {
    return (
      process.env.TUI_COMPLETION_MEASUREMENT_ITEM_COUNTS ?? '10,1000,5000'
    )
      .split(',')
      .map((itemCountText) => Number(itemCountText))
      .filter((itemCount) => Number.isInteger(itemCount) && itemCount >= 2);
  }

  static get sampleCount(): number {
    const configuredSampleCount = Number(
      process.env.TUI_COMPLETION_MEASUREMENT_SAMPLE_COUNT ?? 8,
    );
    return Math.max(2, Math.floor(configuredSampleCount));
  }

  static async run(): Promise<void> {
    const measurements: CompletionListScaleMeasurement[] = [];
    for (const itemCount of this.itemCounts) {
      measurements.push(await this.measureScale(itemCount));
    }
    console.log(JSON.stringify(measurements, null, 2));
  }

  protected static async measureScale(
    itemCount: number,
  ): Promise<CompletionListScaleMeasurement> {
    console.error(`measurement scale ${itemCount}: starting`);
    const repositoryRoot = process.cwd();
    const fixtureRoot = mkdtempSync(
      join(tmpdir(), `invar-completion-latency-${itemCount}-`),
    );
    const homeDirectory = mkdtempSync(
      join(tmpdir(), `invar-completion-latency-home-${itemCount}-`),
    );
    const statusPath = join(homeDirectory, 'status.json');
    await Bun.write(join(fixtureRoot, 'main.rs'), 'words.');
    const driver = new PtyTestDriver.Class({
      workspaceRoot: fixtureRoot,
      repositoryRoot,
      columns: 100,
      rows: 12,
      homeDirectory,
      environment: {
        TUI_STATUS_PATH: statusPath,
        TUI_COMPLETION_ITEM_COUNT: String(itemCount),
      },
      command: [
        process.execPath,
        `--preload=${join(
          repositoryRoot,
          'scripts/harness/completion-mock-provider-preload.ts',
        )}`,
        'src/main.ts',
        fixtureRoot,
      ],
    });

    try {
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'completion latency fixture is ready',
        (status) => status.ready === true,
        20_000,
      );
      driver.sendKeys('Down', 'Enter');
      await HarnessSmoke.Class.awaitStatusWithoutFrame(
        driver,
        statusPath,
        'completion latency fixture file is active',
        (status) => String(status.activeBuffer).endsWith('/main.rs'),
      );
      driver.sendKeys('End', 'Control+Space');
      const openStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
        driver,
        statusPath,
        `completion popup contains ${itemCount} items`,
        (status) =>
          status.completionOpen === true &&
          Number(status.completionItemCount) === itemCount,
        20_000,
      );
      await driver.awaitGridCondition(
        'the first completion item is visibly selected',
        (snapshot) =>
          this.markerBackground(snapshot, 'push_str') !== null &&
          this.markerBackground(snapshot, 'push_str') !==
            this.markerBackground(snapshot, this.markerForLabel('pop')),
      );

      const requestCountBeforeInteractions = Number(
        openStatus.completionRequestCount,
      );
      const filterCountBeforeInteractions = Number(
        openStatus.completionFilterCount,
      );
      const keyMeasurements = await this.measureKeys(driver, statusPath);
      console.error(`measurement scale ${itemCount}: keys complete`);
      const wheelMeasurements = await this.measureWheel(
        driver,
        statusPath,
        openStatus,
      );
      console.error(`measurement scale ${itemCount}: wheel complete`);
      const completedStatus = HarnessSmoke.Class.readStatus(statusPath);
      HarnessSmoke.Class.requireCondition(
        Number(completedStatus.completionRequestCount) ===
          requestCountBeforeInteractions,
        `${itemCount} items: movement and wheel issue zero completion requests`,
      );
      HarnessSmoke.Class.requireCondition(
        Number(completedStatus.completionFilterCount) ===
          filterCountBeforeInteractions,
        `${itemCount} items: movement and wheel issue zero refilters`,
      );

      driver.sendKeysWithoutFrameExpectation('Control+q');
      return {
        itemCount,
        key: this.summarize(keyMeasurements),
        wheel: this.summarize(wheelMeasurements),
        completionRequestDelta:
          Number(completedStatus.completionRequestCount) -
          requestCountBeforeInteractions,
        completionFilterDelta:
          Number(completedStatus.completionFilterCount) -
          filterCountBeforeInteractions,
      };
    } finally {
      await driver.dispose();
      await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
      await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
    }
  }

  protected static async measureKeys(
    driver: PtyTestDriver.Model,
    statusPath: string,
  ): Promise<readonly InteractionMeasurement[]> {
    const measurements: InteractionMeasurement[] = [];
    let selectedLabel = 'push_str';
    let previousCompletedObservedByteCount: number | null = null;
    for (
      let sampleNumber = 0;
      sampleNumber < this.sampleCount + 2;
      sampleNumber++
    ) {
      const keyName = selectedLabel === 'push_str' ? 'Down' : 'Up';
      const nextSelectedLabel =
        selectedLabel === 'push_str' ? 'pop' : 'push_str';
      const selectedBackground = this.markerBackground(
        driver.snapshot(),
        this.markerForLabel(selectedLabel),
      );
      if (selectedBackground === null) {
        throw new Error(`Selected marker is not visible: ${selectedLabel}`);
      }
      const updateCountBefore = Number(
        HarnessSmoke.Class.readStatus(statusPath).completionPopupUpdateCount,
      );
      const measurement = await driver.sendKeysAndAwaitGridConditionByteArrival(
        [keyName],
        `${nextSelectedLabel} carries the selected background`,
        (snapshot) =>
          this.markerBackground(
            snapshot,
            this.markerForLabel(nextSelectedLabel),
          ) === selectedBackground &&
          this.markerBackground(
            snapshot,
            this.markerForLabel(selectedLabel),
          ) !== selectedBackground,
      );
      const completedStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
        driver,
        statusPath,
        'the completion popup update counter advances after key movement',
        (status) =>
          Number(status.completionPopupUpdateCount) > updateCountBefore,
      );
      if (sampleNumber >= 2 && previousCompletedObservedByteCount !== null) {
        measurements.push({
          latencyMilliseconds: measurement.inputToFrameByteArrivalMilliseconds,
          completedFramesUntilCondition:
            measurement.completedFramesUntilCondition,
          frameByteCount:
            measurement.completedFrame.observedByteCount -
            previousCompletedObservedByteCount,
          popupUpdateMilliseconds: Number(
            completedStatus.completionPopupUpdateDurationMilliseconds,
          ),
        });
      }
      previousCompletedObservedByteCount =
        measurement.completedFrame.observedByteCount;
      selectedLabel = nextSelectedLabel;
    }
    return measurements;
  }

  protected static async measureWheel(
    driver: PtyTestDriver.Model,
    statusPath: string,
    openStatus: Record<string, unknown>,
  ): Promise<readonly InteractionMeasurement[]> {
    const measurements: InteractionMeasurement[] = [];
    const geometry = openStatus.completionGeometry as {
      listLeft: number;
      listTop: number;
      listColumns: number;
      listRows: number;
    };
    const pointerColumn =
      geometry.listLeft + Math.max(0, Math.floor(geometry.listColumns / 2));
    const pointerRow =
      geometry.listTop + Math.max(0, Math.floor(geometry.listRows / 2));

    for (
      let sampleNumber = 0;
      sampleNumber < this.sampleCount;
      sampleNumber++
    ) {
      await this.restoreTopSelection(driver);
      const updateCountBefore = Number(
        HarnessSmoke.Class.readStatus(statusPath).completionPopupUpdateCount,
      );
      const observedByteCountBeforeInput =
        driver.lastCompletedFrame?.observedByteCount ?? 0;
      let inputWrittenTimestampMilliseconds = 0;
      const completedFrameObservations =
        await driver.collectCompletedFrameObservationsUntil({
          conditionDescription:
            'wheel movement scrolls push_str out of the completion popup',
          condition: (snapshot) => snapshot.findText('push_str') === null,
          performAction: () => {
            inputWrittenTimestampMilliseconds = performance.now();
            driver.sendMouseWithoutFrameExpectation({
              kind: 'wheel',
              column: pointerColumn,
              row: pointerRow,
              direction: 'down',
            });
          },
          timeoutMilliseconds: 10_000,
        });
      const matchingObservationIndex = completedFrameObservations.findIndex(
        (observation) => observation.snapshot.findText('push_str') === null,
      );
      const matchingObservation =
        completedFrameObservations[matchingObservationIndex];
      if (!matchingObservation || matchingObservationIndex < 0) {
        throw new Error('Completion wheel condition has no matching frame');
      }
      const completedStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
        driver,
        statusPath,
        'the completion popup update counter advances after wheel movement',
        (status) =>
          Number(status.completionPopupUpdateCount) > updateCountBefore,
      );
      measurements.push({
        latencyMilliseconds:
          matchingObservation.completedFrame.byteArrivalTimestampMilliseconds -
          inputWrittenTimestampMilliseconds,
        completedFramesUntilCondition: matchingObservationIndex + 1,
        frameByteCount:
          matchingObservation.completedFrame.observedByteCount -
          observedByteCountBeforeInput,
        popupUpdateMilliseconds: Number(
          completedStatus.completionPopupUpdateDurationMilliseconds,
        ),
      });
    }
    return measurements;
  }

  protected static async restoreTopSelection(
    driver: PtyTestDriver.Model,
  ): Promise<void> {
    const currentSnapshot = driver.snapshot();
    const currentPushBackground = this.markerBackground(
      currentSnapshot,
      this.markerForLabel('push_str'),
    );
    const currentPopBackground = this.markerBackground(
      currentSnapshot,
      this.markerForLabel('pop'),
    );
    if (
      currentPushBackground !== null &&
      currentPopBackground !== null &&
      currentPushBackground !== currentPopBackground
    ) {
      return;
    }
    driver.sendKeys('Down', 'Up');
    await driver.awaitGridCondition(
      'wheel measurement reset reveals and selects push_str',
      (snapshot) => {
        const pushBackground = this.markerBackground(
          snapshot,
          this.markerForLabel('push_str'),
        );
        const popBackground = this.markerBackground(
          snapshot,
          this.markerForLabel('pop'),
        );
        return (
          pushBackground !== null &&
          popBackground !== null &&
          pushBackground !== popBackground
        );
      },
    );
  }

  protected static markerBackground(
    snapshot: HarnessSnapshot.Model,
    marker: string,
  ): number | null {
    const markerPosition = snapshot.findText(marker);
    if (!markerPosition) return null;
    return (
      snapshot.cell(markerPosition.row, markerPosition.column)?.background ??
      null
    );
  }

  protected static markerForLabel(label: string): string {
    return label === 'pop' ? ' pop ' : label;
  }

  protected static summarize(
    measurements: readonly InteractionMeasurement[],
  ): InteractionSummary {
    return {
      latencyMilliseconds: {
        median: this.percentile(
          measurements.map((measurement) => measurement.latencyMilliseconds),
          0.5,
        ),
        percentile95: this.percentile(
          measurements.map((measurement) => measurement.latencyMilliseconds),
          0.95,
        ),
      },
      medianCompletedFramesUntilCondition: this.percentile(
        measurements.map(
          (measurement) => measurement.completedFramesUntilCondition,
        ),
        0.5,
      ),
      medianFrameByteCount: this.percentile(
        measurements.map((measurement) => measurement.frameByteCount),
        0.5,
      ),
      medianPopupUpdateMilliseconds: this.percentile(
        measurements.map((measurement) => measurement.popupUpdateMilliseconds),
        0.5,
      ),
    };
  }

  protected static percentile(
    values: readonly number[],
    quantile: number,
  ): number {
    if (values.length === 0) return 0;
    const sortedValues = [...values].sort(
      (firstValue, secondValue) => firstValue - secondValue,
    );
    const percentileIndex = Math.min(
      sortedValues.length - 1,
      Math.max(0, Math.ceil(sortedValues.length * quantile) - 1),
    );
    return sortedValues[percentileIndex] ?? 0;
  }
}

interface InteractionMeasurement {
  latencyMilliseconds: number;
  completedFramesUntilCondition: number;
  frameByteCount: number;
  popupUpdateMilliseconds: number;
}

interface InteractionSummary {
  latencyMilliseconds: {
    median: number;
    percentile95: number;
  };
  medianCompletedFramesUntilCondition: number;
  medianFrameByteCount: number;
  medianPopupUpdateMilliseconds: number;
}

interface CompletionListScaleMeasurement {
  itemCount: number;
  key: InteractionSummary;
  wheel: InteractionSummary;
  completionRequestDelta: number;
  completionFilterDelta: number;
}

await CompletionListLatencyMeasurement.run();
