/**
 * Look at Field v2 with real eyes: take screenshots of the resting field, a
 * selected record, and the 2D view, and print what each surface contains.
 *
 * Run: start `bun tools/invariant-field-v2/server.ts --port=4419`, then
 * `bun .invar/tasks/in-progress/419-field-v2-opus-synthesis/419-look-at-the-field.ts`
 *
 * It writes PNG files under /tmp/419-field-look/ and prints one LOOK line per
 * surface. The counts say how many marks, rows, and controls the surface shows.
 * A count of zero means the surface did not render.
 */
import { mkdirSync } from 'node:fs';
import { driveChromiumPage } from '../../../../tools/invariant-field-v2/BrowserDrive';

const pageUrl = process.argv[2] ?? 'http://localhost:4419/';
const outputDirectory = '/tmp/419-field-look';
mkdirSync(outputDirectory, { recursive: true });

await driveChromiumPage(pageUrl, async (page) => {
  const waitScript = `
    const waitFor = async (predicate, description) => {
      for (let observationCount = 0; observationCount < 900; observationCount++) {
        if (predicate()) return;
        await new Promise((settle) => requestAnimationFrame(settle));
      }
      throw new Error('The browser did not reach: ' + description);
    };
  `;
  const readySummary = await page.evaluate(`(async () => {
    ${waitScript}
    await waitFor(
      () => document.querySelectorAll('.record-row').length > 0,
      'the record rows',
    );
    return {
      title: document.title,
      headerHeading: document.querySelector('.app-header h1')?.textContent ?? '',
      eyebrow: document.querySelector('.app-header .eyebrow')?.textContent ?? '',
      recordRows: document.querySelectorAll('.record-row').length,
      svgMarks: document.querySelectorAll('.record-mark').length,
      threeDimensionalHitTargets:
        document.querySelectorAll('.three-dimensional-hit-target').length,
      canvasCount: document.querySelectorAll('canvas').length,
      domainFilters: document.querySelectorAll('[data-domain-filter]').length,
      searchInputs: document.querySelectorAll('input[type="search"]').length,
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  })()`);
  console.log(`LOOK rest ${JSON.stringify(readySummary)}`);
  await page.screenshot(`${outputDirectory}/01-rest-3d.png`);

  const twoDimensionalSummary = await page.evaluate(`(async () => {
    ${waitScript}
    const twoDimensionalButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === '2D',
    );
    if (!twoDimensionalButton) throw new Error('There is no 2D control.');
    twoDimensionalButton.click();
    await waitFor(
      () => document.querySelectorAll('.record-mark').length > 0,
      'the exact 2D marks',
    );
    return {
      svgMarks: document.querySelectorAll('.record-mark').length,
      rankRings: document.querySelectorAll('.rank-ring').length,
      sectors: document.querySelectorAll('.domain-sector').length,
      sectorLabels: [...document.querySelectorAll('.domain-sector-label')].map(
        (label) => label.textContent.trim(),
      ),
    };
  })()`);
  console.log(`LOOK two-dimensional ${JSON.stringify(twoDimensionalSummary)}`);
  await page.screenshot(`${outputDirectory}/02-rest-2d.png`);

  const selectionSummary = await page.evaluate(`(async () => {
    ${waitScript}
    const row = document.querySelectorAll('.record-row')[0];
    const name = row.querySelector('.record-essence strong').textContent;
    row.click();
    await waitFor(
      () => document.querySelector('.record-lens-title-row h2')?.textContent === name,
      'the record lens',
    );
    return {
      selectedName: name,
      lensSections: document.querySelectorAll('.record-lens section').length,
      selectedMarks: document.querySelectorAll('.record-mark-selected').length,
      lensWidth: Math.round(
        document.querySelector('.record-lens').getBoundingClientRect().width,
      ),
    };
  })()`);
  console.log(`LOOK selection ${JSON.stringify(selectionSummary)}`);
  await page.screenshot(`${outputDirectory}/03-selected-2d.png`);

  await page.evaluate(`(async () => {
    ${waitScript}
    const threeDimensionalButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === '3D',
    );
    threeDimensionalButton.click();
    await waitFor(
      () => document.querySelectorAll('canvas').length > 0,
      'the 3D canvas',
    );
    await new Promise((settle) => setTimeout(settle, 400));
    return true;
  })()`);
  await page.screenshot(`${outputDirectory}/04-selected-3d.png`);
  console.log(`LOOK screenshots ${outputDirectory}`);
});
