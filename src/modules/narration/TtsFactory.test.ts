import { afterEach, expect, test } from 'bun:test';
import { MockTtsBackend } from './MockTtsBackend';
import { SystemTtsBackend, type SystemTtsOptions } from './SystemTtsBackend';
import { TtsFactory } from './TtsFactory';

const originalBackendSelection = process.env.INVAR_TTS_BACKEND;

let constructedSystemOptions: SystemTtsOptions | null = null;

class RecordingMockTtsBackend extends MockTtsBackend.$Class {}

class RecordingSystemTtsBackend extends SystemTtsBackend.$Class {
  constructor(options: SystemTtsOptions = {}) {
    super(options);
    constructedSystemOptions = options;
  }
}

class TestTtsFactory extends TtsFactory.$Class {
  protected static override get MockTtsBackend() {
    return RecordingMockTtsBackend;
  }

  protected static override get SystemTtsBackend() {
    return RecordingSystemTtsBackend;
  }
}

afterEach(() => {
  if (originalBackendSelection === undefined) {
    delete process.env.INVAR_TTS_BACKEND;
  } else {
    process.env.INVAR_TTS_BACKEND = originalBackendSelection;
  }
  constructedSystemOptions = null;
});

test('mock selection constructs the backend through the overridable class seam', () => {
  process.env.INVAR_TTS_BACKEND = 'mock';

  expect(TestTtsFactory.createBackend()).toBeInstanceOf(
    RecordingMockTtsBackend,
  );
});

test('system selection forwards fixed and live settings through the overridable class seam', () => {
  delete process.env.INVAR_TTS_BACKEND;
  const voiceProvider = (): string => 'selected-voice';
  const rateProvider = (): number => 1.5;

  expect(
    TestTtsFactory.createBackend({
      voice: 'fixed-voice',
      rate: 0.75,
      voiceProvider,
      rateProvider,
    }),
  ).toBeInstanceOf(RecordingSystemTtsBackend);
  expect(constructedSystemOptions).toEqual({
    voice: 'fixed-voice',
    rate: 0.75,
    voiceProvider,
    rateProvider,
  });
});
