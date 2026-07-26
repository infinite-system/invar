import { CodexRewriteProvider } from '../../src/modules/lsp/CodexRewriteProvider';
import type {
  RewriteCandidate,
  RewriteRequest,
} from '../../src/modules/lsp/LanguageProvider.interface';
import { StatusChannel } from '../../src/modules/system/StatusChannel';

let requestCount = 0;
let responseCount = 0;

class $InlineRewriteMockProvider extends CodexRewriteProvider.$Class {
  override get available(): boolean {
    return true;
  }

  override async rewrite(
    request: RewriteRequest,
    _signal: AbortSignal,
  ): Promise<readonly RewriteCandidate[]> {
    requestCount += 1;
    StatusChannel.Class.update({
      inlineRewriteMockRequestCount: requestCount,
    });
    StatusChannel.Class.flush();
    const slowRequestNumber = Number(
      process.env.INVAR_INLINE_REWRITE_SLOW_REQUEST_NUMBER ?? -1,
    );
    const delayMilliseconds =
      requestCount >= slowRequestNumber
        ? Number(process.env.INVAR_INLINE_REWRITE_SLOW_DELAY_MS ?? 1600)
        : Number(process.env.INVAR_INLINE_REWRITE_MOCK_DELAY_MS ?? 180);
    StatusChannel.Class.update({
      inlineRewriteMockDelayMilliseconds: delayMilliseconds,
    });
    StatusChannel.Class.flush();
    await Bun.sleep(delayMilliseconds);
    responseCount += 1;
    StatusChannel.Class.update({
      inlineRewriteMockResponseCount: responseCount,
    });
    StatusChannel.Class.flush();
    return [
      {
        region: request.editRegion,
        replacementText: 'const value = calculateValue();',
        rationale: 'make the calculation intent explicit',
      },
      {
        region: request.editRegion,
        replacementText: 'const computedValue = calculateValue();',
        rationale: 'name the computed result',
      },
    ];
  }
}

CodexRewriteProvider.Class = $InlineRewriteMockProvider;
