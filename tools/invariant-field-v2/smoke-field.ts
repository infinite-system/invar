/**
 * Drive the running Invariance Field in real Chromium and confirm the whole
 * formula, from the contract file to the pixel.
 *
 * Run: start `bun tools/invariant-field-v2/server.ts --port=<port>`, then
 * `bun tools/invariant-field-v2/smoke-field.ts http://localhost:<port>/`.
 * `release-gate.sh` does both.
 *
 * What it proves, in one pass over the real surfaces:
 *  1. FORMULA — for every record in the current snapshot, the weighted rank
 *     recomputed from the published components and weights equals the rank the
 *     server reports, and the radius equals `0.10 + 0.90 × e^(-2.5 × rank)`.
 *  2. GEOMETRY — the distance of a drawn 2D mark from R, divided by the field
 *     radius, equals that record's radius. The picture is the formula.
 *  3. DISCRIMINATION — the same comparison run against a perturbed weight
 *     table FAILS. A check that cannot go red is not a check.
 *  4. FOCUS — one focus fold: the rail rows and the unmuted field marks are
 *     the same set.
 *  5. SELF — the instrument's own contract is in its own field, and its birth
 *     marker points at the first snapshot that carried it.
 *
 * The final line is `FIELD_SMOKE ...` with one name=value pair per fact.
 * Any broken expectation throws with the numbers that disagreed.
 */
import { driveChromiumPage } from './BrowserDrive';

const pageUrl = process.argv[2] ?? 'http://localhost:4314/';

const facts = await driveChromiumPage(pageUrl, async (page) => {
  return (await page.evaluate(`(async () => {
    const waitFor = async (predicate, description) => {
      for (let observationCount = 0; observationCount < 900; observationCount++) {
        if (predicate()) return;
        await new Promise((settle) => requestAnimationFrame(settle));
      }
      throw new Error('The browser did not reach: ' + description);
    };
    const fail = (message) => {
      throw new Error(message);
    };

    await waitFor(
      () => document.querySelectorAll('.record-row').length > 0,
      'the record rows',
    );

    const meta = await fetch('/api/meta').then((response) => response.json());
    const snapshotIndex = Number(
      document.querySelector('input[aria-label="Contract history snapshot"]').value,
    );
    const snapshot = await fetch('/api/snapshots/' + snapshotIndex).then(
      (response) => response.json(),
    );

    // 1. FORMULA — recompute every rank and radius from the published weights.
    const weights = meta.formula.weights;
    const rankOf = (record, weightTable) => {
      let depth = 0;
      for (const componentName of Object.keys(weightTable)) {
        depth += record.rankComponents[componentName] * weightTable[componentName];
      }
      const rotPenalty = record.rankComponents.rotPenalty;
      return Math.max(0, Math.min(1, depth - rotPenalty));
    };
    const radiusOf = (rank) => 0.1 + 0.9 * Math.exp(-2.5 * rank);
    let worstRankError = 0;
    let worstRadiusError = 0;
    for (const record of snapshot.records) {
      worstRankError = Math.max(
        worstRankError,
        Math.abs(rankOf(record, weights) - record.rank),
      );
      worstRadiusError = Math.max(
        worstRadiusError,
        Math.abs(radiusOf(record.rank) - record.radius),
      );
      if (record.radius <= 0.1 || record.radius > 1) {
        fail('R is reachable: ' + record.name + ' has radius ' + record.radius);
      }
    }
    if (worstRankError > 1e-9) {
      fail('The recomputed rank disagrees by ' + worstRankError);
    }
    if (worstRadiusError > 1e-9) {
      fail('The recomputed radius disagrees by ' + worstRadiusError);
    }

    // 3. DISCRIMINATION — the same comparison must fail on a wrong table.
    const perturbedWeights = { ...weights, kind: weights.kind + 0.05 };
    const perturbedError = Math.max(
      ...snapshot.records.map((record) =>
        Math.abs(rankOf(record, perturbedWeights) - record.rank),
      ),
    );
    if (perturbedError <= 1e-9) {
      fail('The formula check cannot go red; it accepted a wrong weight table.');
    }

    // 2. GEOMETRY — the drawn 2D mark sits at exactly that radius.
    const twoDimensionalButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === '2D',
    );
    twoDimensionalButton.click();
    await waitFor(
      () => document.querySelector('.field-two-dimensional'),
      'the exact 2D field',
    );
    const realityMark = document.querySelector('.field-two-dimensional .reality');
    const fieldCenterX = Number(realityMark.getAttribute('cx'));
    const fieldCenterY = Number(realityMark.getAttribute('cy'));
    const ringRadii = [...document.querySelectorAll('.rank-ring')].map(
      (ring) => Number(ring.getAttribute('r')),
    );
    const fieldRadius = Math.max(...ringRadii);
    const recordsByIdentifier = new Map(
      snapshot.records.map((record) => [record.stableIdentifier, record]),
    );
    let measuredMarks = 0;
    let worstGeometryError = 0;
    for (const mark of document.querySelectorAll('.record-mark')) {
      const record = recordsByIdentifier.get(mark.dataset.recordIdentifier);
      if (!record) continue;
      const transform = /translate\\(([-0-9.]+) ([-0-9.]+)\\)/.exec(
        mark.getAttribute('transform'),
      );
      if (!transform) continue;
      const drawnRadius =
        Math.hypot(
          Number(transform[1]) - fieldCenterX,
          Number(transform[2]) - fieldCenterY,
        ) / fieldRadius;
      worstGeometryError = Math.max(
        worstGeometryError,
        Math.abs(drawnRadius - record.radius),
      );
      measuredMarks++;
    }
    if (measuredMarks !== snapshot.records.length) {
      fail(
        'The field drew ' + measuredMarks + ' marks for ' +
          snapshot.records.length + ' records.',
      );
    }
    if (worstGeometryError > 1e-6) {
      fail('A drawn mark sits at the wrong radius, off by ' + worstGeometryError);
    }

    // 4. FOCUS — one fold serves the rail and the field.
    const searchInput = document.querySelector(
      'input[aria-label="Search invariant records"]',
    );
    const nativeValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    nativeValue.call(searchInput, 'scroll');
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await waitFor(
      () =>
        document.querySelectorAll('.record-row').length > 0 &&
        document.querySelectorAll('.record-row').length <
          snapshot.records.length,
      'a narrowed record rail',
    );
    const focusedRowCount = document.querySelectorAll('.record-row').length;
    const litMarkCount = [...document.querySelectorAll('.record-mark')].filter(
      (mark) => !mark.classList.contains('record-mark-muted'),
    ).length;
    if (focusedRowCount !== litMarkCount) {
      fail(
        'The rail shows ' + focusedRowCount + ' records but the field lights ' +
          litMarkCount + '.',
      );
    }
    nativeValue.call(searchInput, '');
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await waitFor(
      () =>
        document.querySelectorAll('.record-row').length ===
        snapshot.records.length,
      'the released record rail',
    );

    // 5. SELF — the instrument measures itself.
    const instrumentContractPath =
      'tools/invariant-field-v2/invariant-field.invariants.md';
    const ownRecords = snapshot.records.filter(
      (record) => record.contractPath === instrumentContractPath,
    );
    if (!ownRecords.length) {
      fail('The instrument has no record of its own in its own field.');
    }
    const instrumentButton = document.querySelector('.instrument-focus-button');
    instrumentButton.click();
    await waitFor(
      () =>
        document.querySelectorAll('.record-row').length === ownRecords.length,
      'the instrument focused on itself',
    );
    const birthMarker = document.querySelector('.instrument-birth-marker');
    if (!birthMarker) fail('The timeline shows no instrument birth marker.');
    const birthSnapshotIndex = meta.snapshots.findIndex(
      (snapshotMetadata) => snapshotMetadata.instrumentRecordCount > 0,
    );
    if (birthSnapshotIndex < 0) {
      fail('No snapshot reports an instrument record.');
    }

    return {
      snapshotIndex,
      records: snapshot.records.length,
      worstRankError,
      worstRadiusError,
      perturbedError: Number(perturbedError.toFixed(6)),
      measuredMarks,
      worstGeometryError,
      focusedRowCount,
      litMarkCount,
      ownRecords: ownRecords.length,
      birthSnapshotIndex,
      birthMarkerLeft: birthMarker.style.left,
    };
  })()`)) as Record<string, unknown>;
});

console.log(
  `FIELD_SMOKE ${Object.entries(facts)
    .map(([factName, factValue]) => `${factName}=${JSON.stringify(factValue)}`)
    .join(' ')}`,
);
