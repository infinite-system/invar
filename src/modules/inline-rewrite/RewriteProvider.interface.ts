import type {
  LanguagePosition,
  LanguageRange,
} from '../workspace/LanguageProvider.interface';

/** Provider-neutral intent rewrite surface consumed by the editor. */
export interface RewriteProvider {
  readonly available: boolean;
  rewrite(
    request: RewriteRequest,
    signal: AbortSignal,
  ): Promise<readonly RewriteCandidate[]>;
  dispose(): void;
}

export interface RewriteRequest {
  readonly documentPath: string;
  readonly documentText: string;
  readonly editRegion: LanguageRange;
  readonly cursor: LanguagePosition;
  readonly languageId: string;
}

export interface RewriteCandidate {
  readonly region: LanguageRange;
  readonly replacementText: string;
  readonly rationale: string;
}
