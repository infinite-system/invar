import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Reactive } from 'ivue';

describe('ivue static cache contract', () => {
  test('every discovered static cache preserves object identity', async () => {
    const inspection = await inspectDiscoveredStaticCaches();

    expect(inspection.candidateFileCount).toBeGreaterThan(0);
    expect(inspection.importedFileCount).toBe(inspection.candidateFileCount);
    expect(inspection.importFailures).toEqual([]);
    expect(inspection.inspectedClassCount).toBeGreaterThan(0);
    expect(inspection.inspectedPropertyCount).toBeGreaterThan(0);
    expect(inspection.inspectedPropertyCount).toBe(
      inspection.independentStaticGetterCount,
    );
    expect(inspection.sourceGetterCount).toBe(
      inspection.independentStaticGetterCount,
    );
    expect(inspection.failures).toEqual([]);
  });

  test('raw and Reactive-only classes fail the cache identity contract', () => {
    class $RawPositiveControl {
      protected static createValue(): object {
        return {};
      }

      static get $value(): object {
        return this.createValue();
      }
    }
    class $ReactivePositiveControl {
      protected static createValue(): object {
        return {};
      }

      static get $value(): object {
        return this.createValue();
      }
    }
    const reactivePositiveControl = Reactive($ReactivePositiveControl);

    expect(
      inspectStaticCaches([
        staticCacheSubject('RawPositiveControl', $RawPositiveControl),
      ]).failures,
    ).toEqual([
      'RawPositiveControl.$value did not preserve identity across two reads',
    ]);
    expect(
      inspectStaticCaches([
        staticCacheSubject('ReactivePositiveControl', reactivePositiveControl),
      ]).failures,
    ).toEqual([
      'ReactivePositiveControl.$value did not preserve identity ' +
        'across two reads',
    ]);
  });
});

async function inspectDiscoveredStaticCaches(): Promise<StaticCacheInspection> {
  const sourceScan = scanStaticCacheSources();
  const importFailures: string[] = [];
  const staticCacheSubjects: StaticCacheSubject[] = [];
  let importedFileCount = 0;

  for (const relativePath of sourceScan.candidateFiles) {
    let moduleExports: Record<string, unknown>;
    try {
      moduleExports = (await import(
        join(sourceScan.repositoryRoot, relativePath)
      )) as Record<string, unknown>;
      importedFileCount++;
    } catch (error) {
      importFailures.push(
        `${relativePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }

    for (const [exportName, exportValue] of Object.entries(moduleExports)) {
      if (exportValue === null || typeof exportValue !== 'object') continue;
      const namespace = exportValue as Record<string, unknown>;
      const publishedClass =
        typeof namespace.$Class === 'function'
          ? namespace.$Class
          : namespace.Class;
      if (typeof publishedClass !== 'function') continue;

      const subject = staticCacheSubject(exportName, publishedClass);
      if (subject.propertyNames.length > 0) {
        staticCacheSubjects.push(subject);
      }
    }
  }

  const inspection = inspectStaticCaches(staticCacheSubjects);
  return {
    ...inspection,
    candidateFileCount: sourceScan.candidateFiles.length,
    importedFileCount,
    importFailures,
    independentStaticGetterCount: sourceScan.independentStaticGetterCount,
    sourceGetterCount: sourceScan.sourceGetterCount,
  };
}

function scanStaticCacheSources(): StaticCacheSourceScan {
  const repositoryRoot = process.cwd();
  const candidateFiles: string[] = [];
  let independentStaticGetterCount = 0;
  let sourceGetterCount = 0;

  const sourceFiles = [
    ...new Bun.Glob('src/**/*.ts').scanSync({ cwd: repositoryRoot }),
  ]
    .filter((relativePath) => !relativePath.endsWith('.test.ts'))
    .sort();
  for (const relativePath of sourceFiles) {
    const sourceText = readFileSync(join(repositoryRoot, relativePath), 'utf8');
    const sourceGetterMatches = sourceText.match(/\bget \$/gu) ?? [];
    if (sourceGetterMatches.length > 0) candidateFiles.push(relativePath);
    sourceGetterCount += sourceGetterMatches.length;
    independentStaticGetterCount += (
      sourceText.match(/static[^(]*get \$/gu) ?? []
    ).length;
  }

  return {
    candidateFiles,
    independentStaticGetterCount,
    repositoryRoot,
    sourceGetterCount,
  };
}

function staticCacheSubject(
  name: string,
  publishedClass: Function,
): StaticCacheSubject {
  const descriptors = Object.getOwnPropertyDescriptors(publishedClass);
  return {
    name,
    propertyNames: Object.keys(descriptors).filter((propertyName) => {
      const descriptor = descriptors[propertyName];
      return (
        propertyName.startsWith('$') &&
        typeof descriptor?.get === 'function' &&
        descriptor.set === undefined
      );
    }),
    publishedClass,
  };
}

function inspectStaticCaches(
  subjects: readonly StaticCacheSubject[],
): StaticCacheInspectionCore {
  const failures: string[] = [];
  let inspectedPropertyCount = 0;

  for (const subject of subjects) {
    for (const propertyName of subject.propertyNames) {
      inspectedPropertyCount++;
      let firstValue: unknown;
      let secondValue: unknown;
      try {
        firstValue = Reflect.get(subject.publishedClass, propertyName);
        secondValue = Reflect.get(subject.publishedClass, propertyName);
      } catch (error) {
        failures.push(
          `${subject.name}.${propertyName} threw while reading: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
      if (isPrimitive(firstValue)) {
        failures.push(
          `${subject.name}.${propertyName} returned a primitive value`,
        );
        continue;
      }
      if (!Object.is(firstValue, secondValue)) {
        failures.push(
          `${subject.name}.${propertyName} did not preserve identity ` +
            `across two reads`,
        );
      }
    }
  }

  return {
    failures,
    inspectedClassCount: subjects.length,
    inspectedPropertyCount,
  };
}

function isPrimitive(value: unknown): boolean {
  return (
    value === null || (typeof value !== 'object' && typeof value !== 'function')
  );
}

interface StaticCacheSourceScan {
  readonly candidateFiles: readonly string[];
  readonly independentStaticGetterCount: number;
  readonly repositoryRoot: string;
  readonly sourceGetterCount: number;
}

interface StaticCacheSubject {
  readonly name: string;
  readonly propertyNames: readonly string[];
  readonly publishedClass: Function;
}

interface StaticCacheInspectionCore {
  readonly failures: readonly string[];
  readonly inspectedClassCount: number;
  readonly inspectedPropertyCount: number;
}

interface StaticCacheInspection extends StaticCacheInspectionCore {
  readonly candidateFileCount: number;
  readonly importedFileCount: number;
  readonly importFailures: readonly string[];
  readonly independentStaticGetterCount: number;
  readonly sourceGetterCount: number;
}
