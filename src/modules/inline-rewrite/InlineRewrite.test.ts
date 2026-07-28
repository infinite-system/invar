import { expect, test } from 'bun:test';
import type {
  RewriteCandidate,
  RewriteProvider,
  RewriteRequest,
} from './RewriteProvider.interface';
import type { LanguageRange } from '../workspace/LanguageProvider.interface';
import { InlineRewrite } from './InlineRewrite';

class DeferredRewriteProvider implements RewriteProvider {
  readonly available = true;
  readonly requests: RewriteRequest[] = [];
  readonly signals: AbortSignal[] = [];
  readonly resolvers: Array<(candidates: readonly RewriteCandidate[]) => void> =
    [];
  readonly rejecters: Array<(error: Error) => void> = [];

  rewrite(
    request: RewriteRequest,
    signal: AbortSignal,
  ): Promise<readonly RewriteCandidate[]> {
    this.requests.push(request);
    this.signals.push(signal);
    return new Promise((resolve, reject) => {
      this.resolvers.push(resolve);
      this.rejecters.push(reject);
    });
  }

  dispose(): void {}
}

function lineRegion(firstLine: number, lastLine: number): LanguageRange {
  return {
    start: { line: firstLine, column: 0 },
    end: { line: lastLine, column: 10 },
  };
}

function candidate(replacementText = 'rewritten'): RewriteCandidate {
  return {
    region: lineRegion(0, 0),
    replacementText,
    rationale: 'clearer intent',
  };
}

function createController(provider: DeferredRewriteProvider): {
  controller: InlineRewrite.Instance;
  setRevision: (revision: number) => void;
} {
  let revision = 1;
  const controller = new InlineRewrite.Class({
    provider,
    snapshot: (region) => ({
      request: {
        documentPath: '/workspace/file.ts',
        documentText: 'const value = 1;',
        editRegion: region,
        cursor: { line: 0, column: 5 },
        languageId: 'typescript',
      },
      revision,
      dirty: true,
    }),
    currentRevision: () => revision,
    currentLineRegion: () => lineRegion(0, 0),
    lineRegion,
    quietMilliseconds: 0,
  });
  controller.attachEligibility(() => true);
  return {
    controller,
    setRevision: (nextRevision) => {
      revision = nextRevision;
    },
  };
}

test('a newer rewrite request cancels the one already in flight', async () => {
  const provider = new DeferredRewriteProvider();
  const { controller } = createController(provider);

  controller.requestNow();
  await Promise.resolve();
  controller.requestNow();
  await Promise.resolve();

  expect(provider.requests).toHaveLength(2);
  expect(provider.signals[0]?.aborted).toBe(true);
  expect(provider.signals[1]?.aborted).toBe(false);
  provider.resolvers[1]?.([candidate()]);
  await Promise.resolve();
  expect(controller.selectedCandidate?.replacementText).toBe('rewritten');
  controller.dispose();
});

test('a response for an older document revision is discarded', async () => {
  const provider = new DeferredRewriteProvider();
  const { controller, setRevision } = createController(provider);

  controller.requestNow();
  await Promise.resolve();
  setRevision(2);
  provider.resolvers[0]?.([candidate()]);
  await Promise.resolve();

  expect(controller.visible).toBe(false);
  expect(controller.candidates.value).toEqual([]);
  controller.dispose();
});

test('a cancelled response cannot clear a newer typed region', async () => {
  const provider = new DeferredRewriteProvider();
  const { controller } = createController(provider);
  controller.requestNow();
  await Promise.resolve();

  controller.recordTyping(0, 0);
  provider.resolvers[0]?.([candidate('stale')]);
  await Bun.sleep(5);

  expect(provider.requests).toHaveLength(2);
  expect(provider.signals[0]?.aborted).toBe(true);
  expect(provider.signals[1]?.aborted).toBe(false);
  controller.dispose();
});

test('candidate cycling wraps in both directions', () => {
  const provider = new DeferredRewriteProvider();
  const { controller } = createController(provider);
  controller.candidates.value = [candidate('first'), candidate('second')];

  controller.cycle(-1);
  expect(controller.selectedCandidate?.replacementText).toBe('second');
  controller.cycle(1);
  expect(controller.selectedCandidate?.replacementText).toBe('first');
  controller.dispose();
});

test('provider errors increment status without a proposal', async () => {
  const provider = new DeferredRewriteProvider();
  const { controller } = createController(provider);

  controller.requestNow();
  await Promise.resolve();
  provider.rejecters[0]?.(new Error('provider unavailable'));
  await Promise.resolve();

  expect(controller.errorCount.value).toBe(1);
  expect(controller.visible).toBe(false);
  controller.dispose();
});
