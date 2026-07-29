import { expect, test } from 'bun:test';
import { ProviderRegistry } from './ProviderRegistry';

test('providers register last-wins and withdraw to the previous answer', () => {
  const registry = new ProviderRegistry.Class();
  const firstProvider = { name: 'first' };
  const secondProvider = { name: 'second' };
  const revisionBefore = registry.revision.value;

  const disposeFirst = registry.register('example', firstProvider);
  const disposeSecond = registry.register('example', secondProvider);
  expect(registry.resolve<typeof secondProvider>('example')).toBe(
    secondProvider,
  );
  expect(registry.revision.value).toBe(revisionBefore + 2);

  disposeSecond();
  expect(registry.resolve<typeof firstProvider>('example')).toBe(firstProvider);
  disposeFirst();
  expect(registry.resolve('example')).toBeNull();
  expect(registry.revision.value).toBe(revisionBefore + 4);

  disposeFirst();
  expect(registry.revision.value).toBe(revisionBefore + 4);
});

test('registry instances isolate workspace provider selections', () => {
  const firstWorkspaceProviders = new ProviderRegistry.Class();
  const secondWorkspaceProviders = new ProviderRegistry.Class();
  const provider = { name: 'workspace-one' };

  firstWorkspaceProviders.register('example', provider);

  expect(firstWorkspaceProviders.resolve<typeof provider>('example')).toBe(
    provider,
  );
  expect(secondWorkspaceProviders.resolve('example')).toBeNull();
});
