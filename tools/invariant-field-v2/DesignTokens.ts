import { Static } from 'ivue/extras';

class $DesignTokens {
  static get VALUES() {
    return Object.freeze({
      'color-background': '#1a1b26',
      'color-background-glow': '#24283b',
      'color-panel': '#16161e',
      'color-panel-raised': '#1e202e',
      'color-panel-active': '#24283b',
      'color-field': '#101014',
      'color-border': '#292e42',
      'color-border-strong': '#3b4261',
      'color-foreground': '#a9b1d6',
      'color-foreground-components': '169 177 214',
      'color-foreground-strong': '#c0caf5',
      'color-muted': '#787c99',
      'color-muted-dark': '#51597d',
      'color-accent': '#7aa2f7',
      'color-accent-components': '122 162 247',
      'color-accent-soft': '#283457',
      'color-reality': '#e0af68',
      'color-reality-components': '224 175 104',
      'color-reality-absolute': '#9ece6a',
      'color-reality-absolute-components': '158 206 106',
      'color-reality-renegotiable': '#7dcfff',
      'color-reality-renegotiable-components': '125 207 255',
      'color-chosen': '#bb9af7',
      'color-chosen-components': '187 154 247',
      'color-danger': '#db4b4b',
      'color-white': '#ffffff',
      'color-panel-components': '22 22 30',
      'color-black-components': '0 0 0',
      'font-family-sans':
        "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      'font-family-monospace': 'ui-monospace, SFMono-Regular, Menlo, monospace',
      'font-size-micro': '0.67rem',
      'font-size-caption': '0.7rem',
      'font-size-label': '0.72rem',
      'font-size-compact': '0.75rem',
      'font-size-detail': '0.76rem',
      'font-size-small': '0.78rem',
      'font-size-supporting': '0.8rem',
      'font-size-caption-body': '0.82rem',
      'font-size-body': '0.84rem',
      'font-size-base': '1rem',
      'font-size-lede': '1.03rem',
      'font-size-heading': '1.25rem',
      'font-size-display': 'clamp(2rem, 4vw, 3.7rem)',
      'font-size-field-label': '7px',
      'font-size-reality-label': '17px',
      'font-weight-medium': '500',
      'font-weight-semibold': '650',
      'font-weight-bold': '700',
      'font-weight-heavy': '800',
      'letter-spacing-display': '-0.045em',
      'letter-spacing-eyebrow': '0.13em',
      'letter-spacing-field-label': '0.06em',
      'line-height-compact': '1.45',
      'line-height-readable': '1.55',
      'line-height-relaxed': '1.6',
      'space-none': '0',
      'space-1-pixel': '1px',
      'space-2-pixels': '2px',
      'space-3-pixels': '3px',
      'space-4-pixels': '4px',
      'space-5-pixels': '5px',
      'space-6-pixels': '6px',
      'space-7-pixels': '7px',
      'space-8-pixels': '8px',
      'space-9-pixels': '9px',
      'space-10-pixels': '10px',
      'space-11-pixels': '11px',
      'space-12-pixels': '12px',
      'space-13-pixels': '13px',
      'space-14-pixels': '14px',
      'space-15-pixels': '15px',
      'space-16-pixels': '16px',
      'space-18-pixels': '18px',
      'space-20-pixels': '20px',
      'space-22-pixels': '22px',
      'space-28-pixels': '28px',
      'space-42-pixels': '42px',
      'space-50-pixels': '50px',
      'space-93-pixels': '93px',
      'space-one-rem': '1rem',
      'space-two-rem': '2rem',
      'radius-small': '4px',
      'radius-badge': '5px',
      'radius-control': '7px',
      'radius-card': '8px',
      'radius-panel': '12px',
    });
  }

  static stylesheet(): string {
    const declarations = Object.entries(this.VALUES)
      .map(([tokenName, tokenValue]) => `  --${tokenName}: ${tokenValue};`)
      .join('\n');
    return `:root {\n  color-scheme: dark;\n${declarations}\n}\n`;
  }
}

export namespace DesignTokens {
  export const $Class = Static($DesignTokens);
  export let Class = $Class;
}
