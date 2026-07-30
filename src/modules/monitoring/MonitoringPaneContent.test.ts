import { describe, expect, test } from 'bun:test';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import { ThemePalettes } from '../theme/ThemePalettes';
import { MonitoringPaneContent } from './MonitoringPaneContent';
import { MonitoringStats } from './MonitoringStats';

function createStats(): MonitoringStats.Model {
  return new MonitoringStats.Class({
    isObserved: () => false,
    requestRender: () => {},
    sampleIntervalSeconds: () => 1,
    workspaceLedgers: () => [
      {
        root: '/workspace',
        rows: [
          {
            path: '/workspace/live.ts',
            hydrated: true,
            active: true,
            dirty: false,
            retainedTextUnits: 130_000,
            retainedLineCount: 2_988,
          },
        ],
      },
    ],
    ownIdentifier: () => 'monitoring',
    logFilePath: () => null,
  });
}

function createPaneContent(
  stats: MonitoringStats.Model,
): MonitoringPaneContent.Model {
  const application = {} as ApplicationContributionContext;
  return new MonitoringPaneContent.Class(application, stats, () => 1);
}

function renderedText(content: MonitoringPaneContent.Model): string {
  const styled = content.render({
    width: 26,
    height: 38,
    palette: ThemePalettes.Class.DARK,
    glyphLevel: 'unicode',
    colorDepth: 'truecolor',
    focused: true,
  }) as unknown as { chunks: { text: string }[] };
  return styled.chunks.map((chunk) => chunk.text).join('');
}

describe('MonitoringPaneContent', () => {
  test('it is a cells citizen: it renders and declares no native surface', () => {
    const content = createPaneContent(createStats());
    expect(content.id).toBe('monitoring');
    expect(content.title).toBe('Monitoring');
    expect(content.activityAction).toBe('view.showMonitoring');
    expect(content.keybindingContext).toBe('monitoring');
    expect(typeof content.render).toBe('function');
    expect('capability' in content).toBe(false);
  });

  test('the paint projects the stats model, not a second copy of the numbers', () => {
    const stats = createStats();
    const content = createPaneContent(stats);
    expect(renderedText(content)).toContain('No sample yet.');
    stats.takeSample();
    const painted = renderedText(content);
    expect(painted).toContain('files 1 open, 1 live');
    expect(painted).toContain('held  0.2 MB');
    expect(painted).toContain('live 0.2 live.ts');
  });

  test('the render revision follows the stats version, so an async sample repaints', () => {
    const stats = createStats();
    const content = createPaneContent(stats);
    const before = content.renderRevision.value;
    stats.takeSample();
    expect(content.renderRevision.value).not.toBe(before);
  });

  test('it consumes no keystroke, so every monitoring action stays a named command', () => {
    const content = createPaneContent(createStats());
    expect(content.handleKey({ name: 'a' } as never)).toBe(false);
  });

  test('a resize is recorded without asking the model for anything', () => {
    const content = createPaneContent(createStats());
    content.onResize(40, 12);
    expect(renderedText(content).length).toBeGreaterThan(0);
  });
});
