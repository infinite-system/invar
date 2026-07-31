/**
 * Field v2 design tokens.
 *
 * These values are the shared source for the future application theme.
 * tokens.css exposes the same values to the static proof and browser surfaces.
 */
export const fieldDesignTokens = {
  color: {
    background: {
      abyss: '#06080C',
      canvas: '#090D13',
      panel: '#0D131C',
      panelRaised: '#111A26',
      control: '#162131',
      scrim: 'rgb(2 5 9 / 78%)',
    },
    border: {
      quiet: '#1D2A3A',
      default: '#293A50',
      strong: '#405A78',
    },
    text: {
      primary: '#EAF1FA',
      secondary: '#AEC0D4',
      tertiary: '#7F93AA',
      disabled: '#526276',
      inverse: '#071018',
    },
    signal: {
      focus: '#6DE2FF',
      selection: '#B99CFF',
      reality: '#FFD166',
      success: '#5EE3B1',
      warning: '#FFC76B',
      alarm: '#FF657D',
      rot: '#FF916B',
      orphan: '#FFB45E',
    },
    kind: {
      realityAbsolute: '#F2E9FF',
      realityRenegotiable: '#77E4FF',
      chosen: '#BEA7FF',
    },
    domain: {
      system: '#63D8FF',
      state: '#79A7FF',
      interaction: '#AA91FF',
      language: '#E48EFF',
      data: '#5EE3B1',
      process: '#A8E66B',
      evidence: '#FFD166',
      risk: '#FF916B',
    },
    alpha: {
      fieldGrid: 'rgb(115 177 221 / 13%)',
      fieldAxis: 'rgb(115 204 255 / 25%)',
      fieldFog: 'rgb(7 14 23 / 72%)',
      selectionHalo: 'rgb(185 156 255 / 24%)',
      realityHalo: 'rgb(255 209 102 / 20%)',
      alarmHalo: 'rgb(255 101 125 / 22%)',
    },
  },
  typography: {
    family: {
      interface:
        'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      instrument:
        '"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
    },
    size: {
      micro: '0.625rem',
      label: '0.6875rem',
      metadata: '0.75rem',
      bodySmall: '0.8125rem',
      body: '0.875rem',
      titleSmall: '1rem',
      title: '1.25rem',
      display: '2rem',
    },
    lineHeight: {
      compact: 1.15,
      interface: 1.35,
      reading: 1.6,
    },
    letterSpacing: {
      data: '0.01em',
      label: '0.12em',
      display: '-0.035em',
    },
    weight: {
      regular: 400,
      medium: 520,
      semibold: 640,
      bold: 720,
    },
  },
  space: {
    hairline: '1px',
    compact: '0.25rem',
    control: '0.5rem',
    cluster: '0.75rem',
    content: '1rem',
    section: '1.5rem',
    region: '2rem',
    canvas: '3rem',
  },
  radius: {
    dot: '999px',
    control: '0.375rem',
    card: '0.625rem',
    panel: '0.875rem',
  },
  elevation: {
    base: 'inset 0 1px 0 rgb(255 255 255 / 2%)',
    panel: '0 18px 50px rgb(0 0 0 / 28%), inset 0 1px 0 rgb(255 255 255 / 3%)',
    floating: '0 24px 70px rgb(0 0 0 / 42%), 0 0 0 1px rgb(109 226 255 / 9%)',
    selected:
      '0 0 0 1px rgb(185 156 255 / 65%), 0 0 30px rgb(185 156 255 / 20%)',
  },
  layer: {
    background: 0,
    fieldGrid: 10,
    fieldTrace: 20,
    fieldDot: 30,
    fieldLabel: 40,
    chrome: 100,
    stickyChrome: 150,
    tooltip: 300,
    dialog: 500,
  },
  easing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    enter: 'cubic-bezier(0, 0, 0.2, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
    focusFlight: 'cubic-bezier(0.16, 1, 0.3, 1)',
    confirm: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    linear: 'linear',
  },
  duration: {
    inputFeedback: '70ms',
    hoverFeedback: '90ms',
    selectionConfirm: '140ms',
    chromeTransition: '180ms',
    tooltipEntrance: '160ms',
    focusFlight: '520ms',
    snapshotMorph: '640ms',
    recordBirth: '420ms',
    recordRot: '520ms',
    traceDecay: '900ms',
  },
  component: {
    field: {
      background: '#06080C',
      grid: 'rgb(115 177 221 / 13%)',
      axis: 'rgb(115 204 255 / 25%)',
    },
    recordDot: {
      focus: '#6DE2FF',
      selection: '#B99CFF',
      alarm: '#FF657D',
      rot: '#FF916B',
    },
    recordCard: {
      background: '#0D131C',
      hoverBackground: '#111A26',
      selectedRule: '#B99CFF',
    },
    recordList: {
      background: '#090D13',
      rowHoverBackground: '#111A26',
      selectedRule: '#B99CFF',
    },
    timeline: {
      background: '#080C12',
      track: '#293A50',
      current: '#B99CFF',
      birth: '#5EE3B1',
      rot: '#FF916B',
    },
    lens: {
      background: '#0D131C',
      border: '#293A50',
      selectedRule: '#B99CFF',
    },
  },
  field: {
    minimumDotHitTarget: '24px',
    dotVisualDiameter: '8px',
    selectedDotVisualDiameter: '12px',
    realityVisualDiameter: '18px',
    gridLineWidth: '1px',
    selectedTraceWidth: '1.5px',
    maximumCameraYaw: '24deg',
    maximumCameraPitch: '12deg',
    focusSafeRegion: '62%',
  },
} as const;

export type FieldDesignTokens = typeof fieldDesignTokens;
