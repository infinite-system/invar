import { test, expect } from 'bun:test';
import { EditorSourceTextViewProviderFactory } from './EditorSourceTextViewProviderFactory';

test('every view a provider makes shares that provider ONE contribution registry', () => {
  const provider = EditorSourceTextViewProviderFactory.Class.create();
  let attachedViewCount = 0;
  provider.contributions.register({
    attached: () => {
      attachedViewCount++;
    },
  });

  const firstView = provider.createView();
  const secondView = provider.createView();

  expect(firstView).not.toBe(secondView);
  expect(attachedViewCount).toBe(2);
  expect(provider.contributions.contributionCount).toBe(1);
});

test('two providers keep separate registries, which is what makes them per workspace', () => {
  const firstProvider = EditorSourceTextViewProviderFactory.Class.create();
  const secondProvider = EditorSourceTextViewProviderFactory.Class.create();
  firstProvider.contributions.register({});

  expect(firstProvider.contributions.contributionCount).toBe(1);
  expect(secondProvider.contributions.contributionCount).toBe(0);
});

test('a fresh view has no document, so the empty state needs no special case', () => {
  const view = EditorSourceTextViewProviderFactory.Class.create().createView();

  expect(view.hasDocument.value).toBe(false);
  expect(view.document.path).toBe('');
});
