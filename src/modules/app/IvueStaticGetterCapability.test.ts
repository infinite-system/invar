import { afterEach, beforeEach, expect, test } from 'bun:test';
import { IvueStaticGetterCapability } from './IvueStaticGetterCapability';

const originalClass = IvueStaticGetterCapability.Class;
const originalSkipValue = process.env.INVAR_SKIP_CAPABILITY_CHECK;

beforeEach(() => {
  delete process.env.INVAR_SKIP_CAPABILITY_CHECK;
});

afterEach(() => {
  IvueStaticGetterCapability.Class = originalClass;
  if (originalSkipValue === undefined) {
    delete process.env.INVAR_SKIP_CAPABILITY_CHECK;
  } else {
    process.env.INVAR_SKIP_CAPABILITY_CHECK = originalSkipValue;
  }
});

test('the installed ivue caches static dollar getters', () => {
  expect(() => originalClass.assertAvailable()).not.toThrow();
});

test('a missing capability reports consequence, remedy, and override', () => {
  class $MissingCapability extends IvueStaticGetterCapability.$Class {
    protected static override cachesStaticGetters(): boolean {
      return false;
    }
  }
  IvueStaticGetterCapability.Class = $MissingCapability;

  expect(() => IvueStaticGetterCapability.Class.assertAvailable()).toThrow(
    'ivue Static() is not caching $-getters. Every cached table in this ' +
      'app would recompute on\nevery read. Your node_modules is out of ' +
      'date with package.json — run: bun install\n' +
      'To bypass this check, set: INVAR_SKIP_CAPABILITY_CHECK=1',
  );
});

test('the stated escape hatch bypasses a missing capability', () => {
  class $MissingCapability extends IvueStaticGetterCapability.$Class {
    protected static override cachesStaticGetters(): boolean {
      return false;
    }
  }
  IvueStaticGetterCapability.Class = $MissingCapability;
  process.env.INVAR_SKIP_CAPABILITY_CHECK = '1';

  expect(() =>
    IvueStaticGetterCapability.Class.assertAvailable(),
  ).not.toThrow();
});
