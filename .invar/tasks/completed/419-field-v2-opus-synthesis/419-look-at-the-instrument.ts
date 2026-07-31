/**
 * Look at the instrument measuring itself.
 *
 * Run: start `bun tools/invariant-field-v2/server.ts --port=4419`, then
 * `bun .invar/tasks/in-progress/419-field-v2-opus-synthesis/419-look-at-the-instrument.ts`
 *
 * It presses `Measure the instrument`, which focuses the instrument's own
 * contract and rewinds to the snapshot where that contract was born, then
 * selects one of the instrument's own records. Screenshots land under
 * /tmp/419-field-look/. The printed counts say how many of the instrument's
 * own records the field then holds; zero would mean the instrument cannot see
 * itself.
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

  const selfSummary = await page.evaluate(`(async () => {
    ${waitScript}
    await waitFor(
      () => document.querySelectorAll('.record-row').length > 0,
      'the record rows',
    );
    const totalRows = document.querySelectorAll('.record-row').length;
    document.querySelector('.instrument-focus-button').click();
    await waitFor(
      () =>
        document.querySelectorAll('.record-row').length > 0 &&
        document.querySelectorAll('.record-row').length < totalRows,
      'the instrument focused on itself',
    );
    const twoDimensionalButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === '2D',
    );
    twoDimensionalButton.click();
    await waitFor(
      () => document.querySelector('.field-two-dimensional'),
      'the exact 2D field',
    );
    document.querySelectorAll('.record-row')[0].click();
    await waitFor(
      () => document.querySelector('.record-lens-title-row h2'),
      'the record lens',
    );
    return {
      totalRows,
      ownRows: document.querySelectorAll('.record-row').length,
      litMarks: [...document.querySelectorAll('.record-mark')].filter(
        (mark) => !mark.classList.contains('record-mark-muted'),
      ).length,
      snapshotTitle: document.querySelector('.snapshot-title').textContent,
      instrumentPresence:
        document.querySelector('.instrument-presence').textContent,
      selectedRecord:
        document.querySelector('.record-lens-title-row h2').textContent,
      focusChips: [...document.querySelectorAll('.focus-chip')].map((chip) =>
        chip.textContent.trim(),
      ),
    };
  })()`);
  console.log(`SELF ${JSON.stringify(selfSummary)}`);
  await page.screenshot(`${outputDirectory}/05-instrument-measures-itself.png`);
});
