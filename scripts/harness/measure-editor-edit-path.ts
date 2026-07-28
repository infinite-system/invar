#!/usr/bin/env bun
// Measures one single-character TextDocument edit through the EditorWrap cumulative-index sync.
// The boundary is internal and deliberately narrower than keypress-to-frame latency: it starts
// immediately before TextDocument.setLine and ends when EditorWrap.totalVisualRows returns.
//
// invariant: Latency measurements name their observation boundary (scripts/harness/harness.invariants.md)
// invariant: Soft duration reports use a machine-wide quiet lock (scripts/harness/harness.invariants.md)
import { loadavg } from 'node:os';
import { join } from 'node:path';
import { Static } from 'ivue/extras';
import { EditorWrap } from '../../src/modules/editor/EditorWrap';
import { TextDocument } from '../../src/modules/editor/TextDocument';
import { QuietLock } from './QuietLock';

class $CountingEditorWrap extends EditorWrap.$Class {
  static rowArrayAllocations = 0;
  static blockArrayAllocations = 0;
  static foldHeaderArrayAllocations = 0;
  static rowWrites = 0;
  static blockWrites = 0;
  static foldHeaderWrites = 0;

  static resetCounts(): void {
    this.rowArrayAllocations = 0;
    this.blockArrayAllocations = 0;
    this.foldHeaderArrayAllocations = 0;
    this.rowWrites = 0;
    this.blockWrites = 0;
    this.foldHeaderWrites = 0;
  }

  static counts(): WrapIndexOperationCounts {
    return {
      blockArrayAllocations: this.blockArrayAllocations,
      blockWrites: this.blockWrites,
      foldHeaderArrayAllocations: this.foldHeaderArrayAllocations,
      foldHeaderWrites: this.foldHeaderWrites,
      rowArrayAllocations: this.rowArrayAllocations,
      rowWrites: this.rowWrites,
    };
  }

  protected static override allocateRowCounts(lineCount: number): Uint32Array {
    this.rowArrayAllocations++;
    return super.allocateRowCounts(lineCount);
  }

  protected static override allocateBlockRowCounts(
    blockCount: number,
  ): Uint32Array {
    this.blockArrayAllocations++;
    return super.allocateBlockRowCounts(blockCount);
  }

  protected static override allocateFoldHeaderByLine(
    lineCount: number,
  ): Uint32Array {
    this.foldHeaderArrayAllocations++;
    return super.allocateFoldHeaderByLine(lineCount);
  }

  protected static override writeRowCount(
    rowCounts: Uint32Array,
    lineIndex: number,
    rowCount: number,
  ): void {
    this.rowWrites++;
    super.writeRowCount(rowCounts, lineIndex, rowCount);
  }

  protected static override writeBlockRowCount(
    blockRowCounts: Uint32Array,
    blockIndex: number,
    rowCount: number,
  ): void {
    this.blockWrites++;
    super.writeBlockRowCount(blockRowCounts, blockIndex, rowCount);
  }

  protected static override writeFoldHeader(
    foldHeaderByLine: Uint32Array,
    lineIndex: number,
    foldHeaderLineIndex: number,
  ): void {
    this.foldHeaderWrites++;
    super.writeFoldHeader(foldHeaderByLine, lineIndex, foldHeaderLineIndex);
  }
}

class $EditorEditPathMeasurement {
  protected static get LINE_COUNTS(): readonly number[] {
    return [2_000, 20_000, 100_000, 500_000];
  }

  protected static get sampleCount(): number {
    return this.positiveIntegerFromEnvironment(
      'EDITOR_EDIT_PATH_SAMPLE_COUNT',
      5,
    );
  }

  protected static get positiveControlSampleCount(): number {
    return this.positiveIntegerFromEnvironment(
      'EDITOR_EDIT_PATH_CONTROL_SAMPLE_COUNT',
      3,
    );
  }

  protected static get POSITIVE_CONTROL_LINE_COUNT(): number {
    return 20_000;
  }

  protected static get WRAP_WIDTH(): number {
    return 80;
  }

  protected static get WARMUP_EDIT_COUNT(): number {
    return 2;
  }

  static get entryPointPath(): string {
    return join(import.meta.dir, 'measure-editor-edit-path.ts');
  }

  static async main(): Promise<void> {
    this.requireQuietLock();
    const measurements: EditSyncCaseMeasurement[] = [];
    for (const lineCount of this.LINE_COUNTS) {
      measurements.push(
        this.measureEditSyncCase(lineCount, 'off', this.sampleCount),
      );
      measurements.push(
        this.measureEditSyncCase(lineCount, 'on', this.sampleCount),
      );
    }

    const positiveControlBaseline = this.measureEditSyncCase(
      this.POSITIVE_CONTROL_LINE_COUNT,
      'on',
      this.positiveControlSampleCount,
    );
    const positiveControlFullRebuild = this.measureEditSyncCase(
      this.POSITIVE_CONTROL_LINE_COUNT,
      'on',
      this.positiveControlSampleCount,
      true,
    );
    const positiveControl = this.verifyPositiveControl(
      positiveControlBaseline,
      positiveControlFullRebuild,
    );
    const maximumWidthRescanPositiveControl =
      this.measureMaximumWidthRescanPositiveControl(measurements);
    const operationalScaleContract = this.measureOperationalScaleContract();
    const visualRowCountHitRate = this.measureVisualRowCountHitRate();
    const hundredThousandLineMeasurements = measurements.filter(
      (measurement) => measurement.lineCount === 100_000,
    );
    const hundredThousandLineSamples = hundredThousandLineMeasurements.flatMap(
      (measurement) => measurement.samples,
    );
    const maximumHundredThousandLineSyncMilliseconds = Math.max(
      ...hundredThousandLineSamples.map((sample) => sample.syncMilliseconds),
    );
    const maximumHundredThousandLineEditToSyncedMilliseconds = Math.max(
      ...hundredThousandLineSamples.map(
        (sample) => sample.editToSyncedMilliseconds,
      ),
    );

    console.log(
      JSON.stringify(
        {
          boundary: {
            start: 'immediately before TextDocument.setLine',
            end: 'EditorWrap.totalVisualRows return',
            excluded:
              'PTY input, Editor undo capture, reactive paint, terminal output',
          },
          fixture:
            'the shared flat scale shape: line NNNNNN content, generated in memory',
          edit: 'successive single-character ASCII insertions at the midpoint line end',
          generatedAt: new Date().toISOString(),
          measurements,
          maximumWidthRescanPositiveControl,
          operationalScaleContract,
          positiveControl,
          quietLock: {
            holderName: process.env.INVAR_QUIET_LOCK_HOLDER_NAME,
            mode: process.env.INVAR_QUIET_LOCK_MODE,
            state: process.env.INVAR_QUIET_LOCK_STATE,
            waitMilliseconds: process.env.INVAR_QUIET_LOCK_WAIT_MILLISECONDS,
          },
          thresholdsMilliseconds: {
            feelsInstantBelow: 16,
            feelsAcceptableBelow: 50,
          },
          visualRowCountHitRate,
          hundredThousandLineVerdict: {
            maximumSyncMilliseconds: maximumHundredThousandLineSyncMilliseconds,
            maximumEditToSyncedMilliseconds:
              maximumHundredThousandLineEditToSyncedMilliseconds,
            allOrderedSyncSamplesBelowInstantThreshold:
              hundredThousandLineSamples.every(
                (sample) => sample.syncMilliseconds < 16,
              ),
            allOrderedCombinedSamplesBelowInstantThreshold:
              hundredThousandLineSamples.every(
                (sample) => sample.editToSyncedMilliseconds < 16,
              ),
            allOrderedCombinedSamplesBelowAcceptableThreshold:
              hundredThousandLineSamples.every(
                (sample) => sample.editToSyncedMilliseconds < 50,
              ),
          },
        },
        null,
        2,
      ),
    );
  }

  protected static measureEditSyncCase(
    lineCount: number,
    wordWrap: WordWrapMode,
    sampleCount: number,
    forceFullRebuild = false,
  ): EditSyncCaseMeasurement {
    const document = new TextDocument.Class();
    const fixtureLines = this.flatFixtureLines(lineCount);
    document.replaceAll(fixtureLines);
    const targetLineIndex = Math.floor(lineCount / 2);
    const originalTargetLine = fixtureLines[targetLineIndex] ?? '';
    const wrapWidth = wordWrap === 'on' ? this.WRAP_WIDTH : null;
    const stableFoldRanges = [] as const;
    let totalVisualRows = EditorWrap.Class.totalVisualRows(
      document,
      wrapWidth,
      stableFoldRanges,
    );

    for (
      let warmupNumber = 1;
      warmupNumber <= this.WARMUP_EDIT_COUNT;
      warmupNumber++
    ) {
      const warmupLine = `${originalTargetLine}${'x'.repeat(warmupNumber)}`;
      document.setLine(targetLineIndex, warmupLine);
      totalVisualRows = EditorWrap.Class.totalVisualRows(
        document,
        wrapWidth,
        forceFullRebuild
          ? this.projectionNeutralFoldRanges(lineCount)
          : stableFoldRanges,
      );
    }

    const samples: EditSyncSample[] = [];
    for (let sampleNumber = 1; sampleNumber <= sampleCount; sampleNumber++) {
      const insertedCharacterCount = this.WARMUP_EDIT_COUNT + sampleNumber;
      const editedLine = `${originalTargetLine}${'x'.repeat(insertedCharacterCount)}`;
      const loadAverage = this.currentLoadAverage();
      const editStartedMilliseconds = performance.now();
      document.setLine(targetLineIndex, editedLine);
      const syncStartedMilliseconds = performance.now();
      const nextTotalVisualRows = EditorWrap.Class.totalVisualRows(
        document,
        wrapWidth,
        forceFullRebuild
          ? this.projectionNeutralFoldRanges(lineCount)
          : stableFoldRanges,
      );
      const syncFinishedMilliseconds = performance.now();
      samples.push({
        sampleNumber,
        insertedCharacterCount,
        loadAverage,
        mutationMilliseconds: syncStartedMilliseconds - editStartedMilliseconds,
        syncMilliseconds: syncFinishedMilliseconds - syncStartedMilliseconds,
        editToSyncedMilliseconds:
          syncFinishedMilliseconds - editStartedMilliseconds,
        visualRowCountChanged: nextTotalVisualRows !== totalVisualRows,
      });
      totalVisualRows = nextTotalVisualRows;
    }

    return {
      forceFullRebuild,
      lineCount,
      samples,
      targetLineIndex,
      wordWrap,
      wrapWidth,
    };
  }

  protected static verifyPositiveControl(
    baseline: EditSyncCaseMeasurement,
    fullRebuild: EditSyncCaseMeasurement,
  ): PositiveControlMeasurement {
    const maximumIncrementalSyncMilliseconds = Math.max(
      ...baseline.samples.map((sample) => sample.syncMilliseconds),
    );
    const minimumFullRebuildSyncMilliseconds = Math.min(
      ...fullRebuild.samples.map((sample) => sample.syncMilliseconds),
    );
    if (
      minimumFullRebuildSyncMilliseconds <= maximumIncrementalSyncMilliseconds
    ) {
      throw new Error(
        'Editor edit-path positive control did not move the reported sync ' +
          `duration: minimum forced full rebuild ` +
          `${minimumFullRebuildSyncMilliseconds} ms <= maximum incremental ` +
          `${maximumIncrementalSyncMilliseconds} ms`,
      );
    }
    return {
      baseline,
      forcedBranch:
        'fresh foldedRanges identity with an out-of-document range on every ' +
        'edit forces the existing syncWrapIndex full-rebuild branch without ' +
        'changing the projection',
      fullRebuild,
      requirement:
        'minimum forced-full-rebuild sync duration exceeds maximum ' +
        'incremental sync duration',
      satisfied: true,
    };
  }

  protected static measureMaximumWidthRescanPositiveControl(
    measurements: readonly EditSyncCaseMeasurement[],
  ): MaximumWidthRescanPositiveControlMeasurement {
    const lineCount = this.POSITIVE_CONTROL_LINE_COUNT;
    const fixtureLines = this.flatFixtureLines(lineCount);
    const targetLineIndex = Math.floor(lineCount / 2);
    const originalTargetLine = fixtureLines[targetLineIndex] ?? '';
    const baselineMutationMilliseconds = measurements
      .filter((measurement) => measurement.lineCount === lineCount)
      .flatMap((measurement) =>
        measurement.samples.map((sample) => sample.mutationMilliseconds),
      );
    const samples: MaximumWidthRescanSample[] = [];
    const document = new TextDocument.Class();
    document.replaceAll(fixtureLines);

    for (
      let sampleNumber = 1;
      sampleNumber <= this.positiveControlSampleCount;
      sampleNumber++
    ) {
      document.setLine(
        targetLineIndex,
        `${originalTargetLine}${'x'.repeat(32 + sampleNumber)}`,
      );
      const loadAverage = this.currentLoadAverage();
      const mutationStartedMilliseconds = performance.now();
      document.setLine(targetLineIndex, originalTargetLine);
      const mutationFinishedMilliseconds = performance.now();
      samples.push({
        loadAverage,
        mutationMilliseconds:
          mutationFinishedMilliseconds - mutationStartedMilliseconds,
        sampleNumber,
      });
    }

    const maximumIncrementalMutationMilliseconds = Math.max(
      ...baselineMutationMilliseconds,
    );
    const minimumForcedRescanMutationMilliseconds = Math.min(
      ...samples.map((sample) => sample.mutationMilliseconds),
    );
    if (
      minimumForcedRescanMutationMilliseconds <=
      maximumIncrementalMutationMilliseconds
    ) {
      throw new Error(
        'Editor edit-path maximum-width positive control did not move the ' +
          `reported mutation duration: minimum forced rescan ` +
          `${minimumForcedRescanMutationMilliseconds} ms <= maximum ` +
          `incremental mutation ${maximumIncrementalMutationMilliseconds} ms`,
      );
    }
    return {
      baseline:
        'all 20k ordered mutation samples, with the edited champion growing',
      forcedBranch:
        'restore the sole widest line to the shared fixture width, forcing ' +
        'the exact maximum-width rescan path',
      lineCount,
      maximumIncrementalMutationMilliseconds,
      minimumForcedRescanMutationMilliseconds,
      requirement:
        'minimum forced-rescan mutation duration exceeds maximum ' +
        'incremental mutation duration',
      samples,
      satisfied: true,
      targetLineIndex,
    };
  }

  protected static measureVisualRowCountHitRate(): VisualRowCountHitRateMeasurement {
    const uniformLineLengthTrials: VisualRowCountTrial[] = [];
    for (let lineLength = 1; lineLength <= this.WRAP_WIDTH * 4; lineLength++) {
      uniformLineLengthTrials.push(
        this.visualRowCountTrial(lineLength, this.WRAP_WIDTH),
      );
    }
    const wrapBoundaryTrials = [1, 2, 3, 4].map((multiple) =>
      this.visualRowCountTrial(this.WRAP_WIDTH * multiple, this.WRAP_WIDTH),
    );
    const midRowTrials = [0, 1, 2, 3].map((multiple) =>
      this.visualRowCountTrial(
        this.WRAP_WIDTH * multiple + Math.floor(this.WRAP_WIDTH / 2),
        this.WRAP_WIDTH,
      ),
    );
    return {
      insertion: 'append one single-column ASCII grapheme to an unbroken line',
      midRow: this.hitRate(midRowTrials),
      uniformLineLengths: this.hitRate(uniformLineLengthTrials),
      wrapBoundary: this.hitRate(wrapBoundaryTrials),
      wrapOff: {
        changedCount: 0,
        hitRate: 0,
        trialCount: uniformLineLengthTrials.length,
      },
      wrapWidth: this.WRAP_WIDTH,
    };
  }

  protected static measureOperationalScaleContract(): OperationalScaleContract {
    const incremental = [2_000, 1_000_000].map((lineCount) => {
      const document = new TextDocument.Class();
      const fixtureLines = this.flatFixtureLines(lineCount);
      document.replaceAll(fixtureLines);
      const targetLineIndex = Math.floor(lineCount / 2);
      $CountingEditorWrap.totalVisualRows(document, this.WRAP_WIDTH);
      $CountingEditorWrap.resetCounts();
      document.setLine(
        targetLineIndex,
        `${fixtureLines[targetLineIndex] ?? ''}x`,
      );
      $CountingEditorWrap.totalVisualRows(document, this.WRAP_WIDTH);
      return {
        counts: $CountingEditorWrap.counts(),
        lineCount,
        targetLineIndex,
      };
    });
    const forcedFullRebuildDocument = new TextDocument.Class();
    const forcedFullRebuildLines = this.flatFixtureLines(
      this.POSITIVE_CONTROL_LINE_COUNT,
    );
    forcedFullRebuildDocument.replaceAll(forcedFullRebuildLines);
    $CountingEditorWrap.totalVisualRows(
      forcedFullRebuildDocument,
      this.WRAP_WIDTH,
    );
    $CountingEditorWrap.resetCounts();
    const targetLineIndex = Math.floor(this.POSITIVE_CONTROL_LINE_COUNT / 2);
    forcedFullRebuildDocument.setLine(
      targetLineIndex,
      `${forcedFullRebuildLines[targetLineIndex] ?? ''}x`,
    );
    $CountingEditorWrap.totalVisualRows(
      forcedFullRebuildDocument,
      this.WRAP_WIDTH,
      this.projectionNeutralFoldRanges(this.POSITIVE_CONTROL_LINE_COUNT),
    );
    const forcedFullRebuild = {
      counts: $CountingEditorWrap.counts(),
      lineCount: this.POSITIVE_CONTROL_LINE_COUNT,
      targetLineIndex,
    };
    const expectedIncrementalCounts: WrapIndexOperationCounts = {
      blockArrayAllocations: 0,
      blockWrites: 0,
      foldHeaderArrayAllocations: 0,
      foldHeaderWrites: 0,
      rowArrayAllocations: 0,
      rowWrites: 1,
    };
    if (
      JSON.stringify(incremental[0]?.counts) !==
        JSON.stringify(expectedIncrementalCounts) ||
      JSON.stringify(incremental[1]?.counts) !==
        JSON.stringify(expectedIncrementalCounts)
    ) {
      throw new Error(
        `Editor wrap-index edit operation count scaled with line count: ${JSON.stringify(incremental)}`,
      );
    }
    if (
      forcedFullRebuild.counts.rowWrites <= expectedIncrementalCounts.rowWrites
    ) {
      throw new Error(
        'Editor wrap-index operation counter positive control did not detect ' +
          `the forced full rebuild: ${JSON.stringify(forcedFullRebuild)}`,
      );
    }
    const levelZeroFoldRange = {
      startLine: 1,
      endLine: 138_622,
      kind: 'delimiter' as const,
    };
    const nestedFixtureEditCases = [554_490, 970_356].flatMap((lineCount) =>
      [false, true].map((collapsed) => {
        const document = new TextDocument.Class();
        const fixtureLines = this.flatFixtureLines(lineCount);
        document.replaceAll(fixtureLines);
        const foldedRanges = collapsed ? [levelZeroFoldRange] : [];
        $CountingEditorWrap.totalVisualRows(
          document,
          this.WRAP_WIDTH,
          foldedRanges,
        );
        $CountingEditorWrap.resetCounts();
        document.setLine(0, `${fixtureLines[0] ?? ''}x`);
        $CountingEditorWrap.totalVisualRows(
          document,
          this.WRAP_WIDTH,
          foldedRanges,
        );
        return {
          collapsed,
          counts: $CountingEditorWrap.counts(),
          lineCount,
          targetLineIndex: 0,
        };
      }),
    );
    for (const measuredCase of nestedFixtureEditCases) {
      if (
        JSON.stringify(measuredCase.counts) !==
        JSON.stringify(expectedIncrementalCounts)
      ) {
        throw new Error(
          'Editor wrap-index edit operation count scaled with the fold or ' +
            `nested-fixture size axis: ${JSON.stringify(nestedFixtureEditCases)}`,
        );
      }
    }

    const foldToggleCases = [554_490, 970_356].map((lineCount) => {
      const document = new TextDocument.Class();
      document.replaceAll(this.flatFixtureLines(lineCount));
      $CountingEditorWrap.totalVisualRows(document, this.WRAP_WIDTH);
      $CountingEditorWrap.resetCounts();
      $CountingEditorWrap.totalVisualRows(document, this.WRAP_WIDTH, [
        levelZeroFoldRange,
      ]);
      const collapseCounts = $CountingEditorWrap.counts();
      $CountingEditorWrap.resetCounts();
      $CountingEditorWrap.totalVisualRows(document, this.WRAP_WIDTH);
      return {
        collapseCounts,
        expandCounts: $CountingEditorWrap.counts(),
        lineCount,
      };
    });
    const expectedCollapseCounts: WrapIndexOperationCounts = {
      blockArrayAllocations: 0,
      blockWrites: 34,
      foldHeaderArrayAllocations: 1,
      foldHeaderWrites: 138_621,
      rowArrayAllocations: 0,
      rowWrites: 138_621,
    };
    const expectedExpandCounts: WrapIndexOperationCounts = {
      blockArrayAllocations: 0,
      blockWrites: 34,
      foldHeaderArrayAllocations: 1,
      foldHeaderWrites: 0,
      rowArrayAllocations: 0,
      rowWrites: 138_621,
    };
    for (const measuredCase of foldToggleCases) {
      if (
        JSON.stringify(measuredCase.collapseCounts) !==
          JSON.stringify(expectedCollapseCounts) ||
        JSON.stringify(measuredCase.expandCounts) !==
          JSON.stringify(expectedExpandCounts)
      ) {
        throw new Error(
          'Fold-toggle operation count scaled with nested-fixture size: ' +
            JSON.stringify(foldToggleCases),
        );
      }
    }
    return {
      expectedCollapseCounts,
      expectedExpandCounts,
      expectedIncrementalCounts,
      foldToggleCases,
      forcedFullRebuild,
      incremental,
      nestedFixtureEditCases,
      requirement:
        'same-line edits are identical across the folded and nested-fixture ' +
        'size axes; fold toggles scale with the 138,622-line span rather ' +
        'than total document size; a forced rebuild must move the counter',
      satisfied: true,
    };
  }

  protected static visualRowCountTrial(
    lineLength: number,
    wrapWidth: number,
  ): VisualRowCountTrial {
    const lineText = 'x'.repeat(lineLength);
    const beforeRowCount = EditorWrap.Class.wrapLine(
      lineText,
      wrapWidth,
    ).length;
    const afterRowCount = EditorWrap.Class.wrapLine(
      `${lineText}x`,
      wrapWidth,
    ).length;
    return {
      afterRowCount,
      beforeRowCount,
      changed: afterRowCount !== beforeRowCount,
      lineLength,
    };
  }

  protected static hitRate(
    trials: readonly VisualRowCountTrial[],
  ): HitRateMeasurement {
    const changedCount = trials.filter((trial) => trial.changed).length;
    return {
      changedCount,
      hitRate: changedCount / trials.length,
      trialCount: trials.length,
    };
  }

  protected static flatFixtureLines(lineCount: number): string[] {
    return Array.from({ length: lineCount }, (_unusedValue, lineIndex) => {
      return `line ${String(lineIndex).padStart(6, '0')} content`;
    });
  }

  protected static currentLoadAverage(): LoadAverageMeasurement {
    const currentLoadAverage = loadavg();
    return {
      oneMinute: currentLoadAverage[0] ?? Number.NaN,
      fiveMinutes: currentLoadAverage[1] ?? Number.NaN,
      fifteenMinutes: currentLoadAverage[2] ?? Number.NaN,
    };
  }

  protected static projectionNeutralFoldRanges(lineCount: number): readonly [
    {
      readonly startLine: number;
      readonly endLine: number;
      readonly kind: 'delimiter';
    },
  ] {
    return [
      {
        startLine: lineCount,
        endLine: lineCount,
        kind: 'delimiter',
      },
    ];
  }

  protected static positiveIntegerFromEnvironment(
    environmentVariableName: string,
    defaultValue: number,
  ): number {
    const value = Number(
      process.env[environmentVariableName] ?? String(defaultValue),
    );
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${environmentVariableName} must be a positive integer`);
    }
    return value;
  }

  protected static requireQuietLock(): void {
    const degradation = QuietLock.Class.degradation(process.env);
    if (degradation !== null) {
      throw new Error(
        'Editor edit-path measurement requires the machine-wide quiet lock; ' +
          `lock degraded: ${JSON.stringify(degradation)}`,
      );
    }
    if (
      process.env.INVAR_QUIET_LOCK_MODE !== 'quiet-exclusive' ||
      process.env.INVAR_QUIET_LOCK_STATE !== 'acquired'
    ) {
      throw new Error(
        'Editor edit-path measurement requires an acquired quiet-exclusive ' +
          'machine-wide lock',
      );
    }
  }
}

export namespace EditorEditPathMeasurement {
  export const $Class = Static($EditorEditPathMeasurement);
  export let Class = $Class;
}

interface EditSyncCaseMeasurement {
  readonly forceFullRebuild: boolean;
  readonly lineCount: number;
  readonly samples: readonly EditSyncSample[];
  readonly targetLineIndex: number;
  readonly wordWrap: WordWrapMode;
  readonly wrapWidth: number | null;
}

interface WrapIndexOperationCounts {
  readonly blockArrayAllocations: number;
  readonly blockWrites: number;
  readonly foldHeaderArrayAllocations: number;
  readonly foldHeaderWrites: number;
  readonly rowArrayAllocations: number;
  readonly rowWrites: number;
}

interface WrapIndexOperationMeasurement {
  readonly counts: WrapIndexOperationCounts;
  readonly lineCount: number;
  readonly targetLineIndex: number;
}

interface OperationalScaleContract {
  readonly expectedCollapseCounts: WrapIndexOperationCounts;
  readonly expectedExpandCounts: WrapIndexOperationCounts;
  readonly expectedIncrementalCounts: WrapIndexOperationCounts;
  readonly foldToggleCases: readonly FoldToggleOperationMeasurement[];
  readonly forcedFullRebuild: WrapIndexOperationMeasurement;
  readonly incremental: readonly WrapIndexOperationMeasurement[];
  readonly nestedFixtureEditCases: readonly FoldedEditOperationMeasurement[];
  readonly requirement: string;
  readonly satisfied: true;
}

interface FoldedEditOperationMeasurement extends WrapIndexOperationMeasurement {
  readonly collapsed: boolean;
}

interface FoldToggleOperationMeasurement {
  readonly collapseCounts: WrapIndexOperationCounts;
  readonly expandCounts: WrapIndexOperationCounts;
  readonly lineCount: number;
}

interface EditSyncSample {
  readonly sampleNumber: number;
  readonly insertedCharacterCount: number;
  readonly loadAverage: LoadAverageMeasurement;
  readonly mutationMilliseconds: number;
  readonly syncMilliseconds: number;
  readonly editToSyncedMilliseconds: number;
  readonly visualRowCountChanged: boolean;
}

interface LoadAverageMeasurement {
  readonly oneMinute: number;
  readonly fiveMinutes: number;
  readonly fifteenMinutes: number;
}

interface MaximumWidthRescanPositiveControlMeasurement {
  readonly baseline: string;
  readonly forcedBranch: string;
  readonly lineCount: number;
  readonly maximumIncrementalMutationMilliseconds: number;
  readonly minimumForcedRescanMutationMilliseconds: number;
  readonly requirement: string;
  readonly samples: readonly MaximumWidthRescanSample[];
  readonly satisfied: true;
  readonly targetLineIndex: number;
}

interface MaximumWidthRescanSample {
  readonly loadAverage: LoadAverageMeasurement;
  readonly mutationMilliseconds: number;
  readonly sampleNumber: number;
}

interface PositiveControlMeasurement {
  readonly baseline: EditSyncCaseMeasurement;
  readonly forcedBranch: string;
  readonly fullRebuild: EditSyncCaseMeasurement;
  readonly requirement: string;
  readonly satisfied: true;
}

interface HitRateMeasurement {
  readonly changedCount: number;
  readonly hitRate: number;
  readonly trialCount: number;
}

interface VisualRowCountHitRateMeasurement {
  readonly insertion: string;
  readonly midRow: HitRateMeasurement;
  readonly uniformLineLengths: HitRateMeasurement;
  readonly wrapBoundary: HitRateMeasurement;
  readonly wrapOff: HitRateMeasurement;
  readonly wrapWidth: number;
}

interface VisualRowCountTrial {
  readonly afterRowCount: number;
  readonly beforeRowCount: number;
  readonly changed: boolean;
  readonly lineLength: number;
}

type WordWrapMode = 'off' | 'on';

const quietLockExitCode = await QuietLock.Class.rerunEntryPointQuietExclusive(
  'editor-edit-path-measurement',
  EditorEditPathMeasurement.Class.entryPointPath,
);
if (quietLockExitCode === null) {
  await EditorEditPathMeasurement.Class.main();
} else {
  process.exitCode = quietLockExitCode;
}
