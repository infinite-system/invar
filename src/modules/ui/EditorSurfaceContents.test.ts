import { describe, expect, it } from 'bun:test';
import {
  EditorSurfaceContents,
  type EditorSurfaceContent,
  type EditorSurfaceContentProvider,
} from './EditorSurfaceContents';

function createContent(): EditorSurfaceContent {
  return {
    update() {},
    tick: () => false,
    handleKey: () => false,
    findTarget: () => null,
    copySelection: () => null,
    dispose() {},
  };
}

function createProvider(identifier: string, identity: string) {
  const provider = {
    identifier,
    mountIdentity: () => provider.identity,
    create: () => createContent(),
    identity,
    paintSignalReads: 0,
    observePaintSignals() {
      provider.paintSignalReads += 1;
    },
  };
  return provider;
}

describe('EditorSurfaceContents', () => {
  it('reports no claiming provider while every identity is empty', () => {
    const contents = new EditorSurfaceContents.Class();
    contents.register(createProvider('test.idle', ''));
    expect(contents.claimingProvider).toBeNull();
  });

  it('reports the provider whose mount identity is non-empty', () => {
    const contents = new EditorSurfaceContents.Class();
    const provider = createProvider('test.surface', 'root:token:1');
    contents.register(provider);
    expect(contents.claimingProvider?.identifier).toBe('test.surface');
  });

  it('takes the first registered claiming provider as the precedence winner', () => {
    const contents = new EditorSurfaceContents.Class();
    contents.register(createProvider('test.first', 'first:1'));
    contents.register(createProvider('test.second', 'second:1'));
    expect(contents.claimingProvider?.identifier).toBe('test.first');
  });

  it('stops claiming as soon as the provider reports an empty identity', () => {
    const contents = new EditorSurfaceContents.Class();
    const provider = createProvider('test.surface', 'root:token:1');
    contents.register(provider);
    provider.identity = '';
    expect(contents.claimingProvider).toBeNull();
  });

  // The paint effect must observe a signal that can change while the surface is UNMOUNTED (a split
  // ratio persisted from an earlier comparison), so every provider is asked, not just the claimant.
  it('observes the paint signals of every provider, claiming or not', () => {
    const contents = new EditorSurfaceContents.Class();
    const claiming = createProvider('test.claiming', 'claiming:1');
    const idle = createProvider('test.idle', '');
    contents.register(claiming);
    contents.register(idle);
    contents.observePaintSignals();
    expect(claiming.paintSignalReads).toBe(1);
    expect(idle.paintSignalReads).toBe(1);
  });

  it('tolerates a provider that declares no paint signals', () => {
    const contents = new EditorSurfaceContents.Class();
    const bare: EditorSurfaceContentProvider = {
      identifier: 'test.bare',
      mountIdentity: () => '',
      create: () => createContent(),
    };
    contents.register(bare);
    expect(() => contents.observePaintSignals()).not.toThrow();
  });

  it('stops consulting a provider after its unregister handle runs', () => {
    const contents = new EditorSurfaceContents.Class();
    const provider = createProvider('test.surface', 'root:token:1');
    const unregister = contents.register(provider);
    expect(contents.claimingProvider?.identifier).toBe('test.surface');
    unregister();
    expect(contents.claimingProvider).toBeNull();
    contents.observePaintSignals();
    expect(provider.paintSignalReads).toBe(0);
  });
});
