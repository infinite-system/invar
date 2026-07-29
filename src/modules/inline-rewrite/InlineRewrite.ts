import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import type { LanguageRange } from '../workspace/LanguageProvider.interface';
import type {
  RewriteCandidate,
  RewriteProvider,
  RewriteRequest,
} from './RewriteProvider.interface';
import { TextCoordinates } from '../text/TextCoordinates';

class $InlineRewrite {
  protected eligibility: (() => boolean) | null = null;
  protected recentRegion: LanguageRange | null = null;
  protected recentRegionFragmented = false;
  protected quietTimer: ReturnType<typeof setTimeout> | null = null;
  protected activeAbortController: AbortController | null = null;
  protected requestGeneration = 0;

  constructor(protected readonly options: InlineRewriteOptions) {}

  protected get quietMilliseconds(): number {
    return this.options.quietMilliseconds ?? 1750;
  }

  get candidates() {
    return shallowRef<readonly RewriteCandidate[]>([]);
  }

  get selectedCandidateIndex() {
    return ref(0);
  }

  get requestInFlight() {
    return ref(false);
  }

  get errorCount() {
    return ref(0);
  }

  get requestCount() {
    return ref(0);
  }

  get visible(): boolean {
    return this.candidates.value.length > 0;
  }

  get selectedCandidate(): RewriteCandidate | null {
    return this.candidates.value[this.selectedCandidateIndex.value] ?? null;
  }

  attachEligibility(eligibility: () => boolean): void {
    this.eligibility = eligibility;
  }

  recordTyping(firstLine: number, lastLine: number): void {
    this.dismissForOrdinaryEdit();
    if (!this.options.provider.available) return;
    const editRegion = this.options.lineRegion(firstLine, lastLine);
    if (this.recentRegion === null) {
      this.recentRegion = editRegion;
      this.recentRegionFragmented = false;
    } else if (this.regionsTouch(this.recentRegion, editRegion)) {
      this.recentRegion = this.unionRegions(this.recentRegion, editRegion);
    } else {
      this.recentRegionFragmented = true;
    }
    this.quietTimer = setTimeout(() => {
      this.quietTimer = null;
      if (this.recentRegionFragmented) {
        this.clearRecentRegion();
        return;
      }
      void this.requestFor(this.recentRegion);
    }, this.quietMilliseconds);
  }

  dismissForOrdinaryEdit(): void {
    this.cancelQuietTimer();
    this.cancelActiveRequest();
    this.clearCandidates();
  }

  dismiss(): void {
    this.dismissForOrdinaryEdit();
    this.clearRecentRegion();
  }

  requestNow(): void {
    this.cancelQuietTimer();
    const region = this.recentRegion ?? this.options.currentLineRegion();
    this.recentRegionFragmented = false;
    void this.requestFor(region);
  }

  cycle(candidateDelta: number): void {
    const candidateCount = this.candidates.value.length;
    if (candidateCount === 0) return;
    this.selectedCandidateIndex.value =
      (((this.selectedCandidateIndex.value + candidateDelta) % candidateCount) +
        candidateCount) %
      candidateCount;
  }

  takeSelectedCandidate(): RewriteCandidate | null {
    const candidate = this.selectedCandidate;
    this.dismiss();
    return candidate;
  }

  projectedLine(
    lineIndex: number,
    lineReader: (lineIndex: number) => string,
  ): string | null {
    const candidate = this.selectedCandidate;
    if (
      !candidate ||
      lineIndex < candidate.region.start.line ||
      lineIndex > candidate.region.end.line
    ) {
      return null;
    }
    const startLineText = lineReader(candidate.region.start.line);
    const endLineText = lineReader(candidate.region.end.line);
    const prefix = startLineText.slice(
      0,
      TextCoordinates.Class.graphemeToU16(
        startLineText,
        candidate.region.start.column,
      ),
    );
    const suffix = endLineText.slice(
      TextCoordinates.Class.graphemeToU16(
        endLineText,
        candidate.region.end.column,
      ),
    );
    const projectedLines = (prefix + candidate.replacementText + suffix).split(
      '\n',
    );
    return projectedLines[lineIndex - candidate.region.start.line] ?? '';
  }

  protected async requestFor(region: LanguageRange | null): Promise<void> {
    if (
      !region ||
      !this.options.provider.available ||
      !(this.eligibility?.() ?? false)
    ) {
      this.clearRecentRegion();
      return;
    }
    const snapshot = this.options.snapshot(region);
    if (!snapshot?.dirty) {
      this.clearRecentRegion();
      return;
    }

    this.cancelActiveRequest();
    this.clearCandidates();
    const requestGeneration = ++this.requestGeneration;
    const abortController = new AbortController();
    this.activeAbortController = abortController;
    this.requestInFlight.value = true;
    this.requestCount.value += 1;
    try {
      const candidates = await this.options.provider.rewrite(
        snapshot.request,
        abortController.signal,
      );
      if (
        requestGeneration !== this.requestGeneration ||
        abortController.signal.aborted
      ) {
        return;
      }
      // invariant: Stale rewrites never land (src/modules/inline-rewrite/inline-rewrite.invariants.md)
      if (
        this.options.currentRevision() !== snapshot.revision ||
        !(this.eligibility?.() ?? false)
      ) {
        return;
      }
      this.candidates.value = [...candidates];
      this.selectedCandidateIndex.value = 0;
    } catch {
      if (
        requestGeneration === this.requestGeneration &&
        !abortController.signal.aborted
      ) {
        this.errorCount.value += 1;
      }
    } finally {
      if (requestGeneration === this.requestGeneration) {
        this.activeAbortController = null;
        this.requestInFlight.value = false;
        this.clearRecentRegion();
      }
    }
  }

  protected regionsTouch(
    firstRegion: LanguageRange,
    secondRegion: LanguageRange,
  ): boolean {
    return !(
      firstRegion.end.line + 1 < secondRegion.start.line ||
      secondRegion.end.line + 1 < firstRegion.start.line
    );
  }

  protected unionRegions(
    firstRegion: LanguageRange,
    secondRegion: LanguageRange,
  ): LanguageRange {
    return this.options.lineRegion(
      Math.min(firstRegion.start.line, secondRegion.start.line),
      Math.max(firstRegion.end.line, secondRegion.end.line),
    );
  }

  protected cancelQuietTimer(): void {
    if (this.quietTimer !== null) clearTimeout(this.quietTimer);
    this.quietTimer = null;
  }

  protected cancelActiveRequest(): void {
    if (!this.activeAbortController) return;
    // invariant: Only one rewrite request runs (src/modules/inline-rewrite/inline-rewrite.invariants.md)
    this.requestGeneration += 1;
    this.activeAbortController.abort();
    this.activeAbortController = null;
    this.requestInFlight.value = false;
  }

  protected clearCandidates(): void {
    this.candidates.value = [];
    this.selectedCandidateIndex.value = 0;
  }

  protected clearRecentRegion(): void {
    this.recentRegion = null;
    this.recentRegionFragmented = false;
  }

  dispose(): void {
    this.dismiss();
    this.options.provider.dispose();
  }
}

export namespace InlineRewrite {
  export const $Class = $InlineRewrite;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface InlineRewriteSnapshot {
  readonly request: RewriteRequest;
  readonly revision: number;
  readonly dirty: boolean;
}

export interface InlineRewriteOptions {
  readonly provider: RewriteProvider;
  readonly snapshot: (region: LanguageRange) => InlineRewriteSnapshot | null;
  readonly currentRevision: () => number;
  readonly currentLineRegion: () => LanguageRange | null;
  readonly lineRegion: (firstLine: number, lastLine: number) => LanguageRange;
  readonly quietMilliseconds?: number;
}
