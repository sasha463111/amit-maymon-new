import type { Config } from 'tailwindcss';

/* Tehila Bodyshop CRM — palette remapped to the Claude Design system tokens.
   Warm stone neutrals, petrol functional accent, brand-red identity, and the
   6-state semantic status hues. Remapping the default ramps (gray/blue/green/
   amber/orange/red + cool-gray aliases) re-skins the whole app without touching
   the hundreds of existing utility classes. OKLCH for perceptually even steps. */

const stone = {
  50: 'oklch(0.987 0.004 60)',
  100: 'oklch(0.972 0.005 58)',
  150: 'oklch(0.952 0.006 56)',
  200: 'oklch(0.925 0.007 54)',
  300: 'oklch(0.872 0.009 50)',
  400: 'oklch(0.745 0.010 46)',
  500: 'oklch(0.605 0.012 44)',
  600: 'oklch(0.505 0.013 42)',
  700: 'oklch(0.400 0.013 40)',
  800: 'oklch(0.305 0.013 38)',
  900: 'oklch(0.225 0.012 36)',
  950: 'oklch(0.165 0.011 34)',
};

const petrol = {
  50: 'oklch(0.975 0.012 215)',
  100: 'oklch(0.955 0.022 212)',
  200: 'oklch(0.910 0.035 214)',
  300: 'oklch(0.840 0.050 216)',
  400: 'oklch(0.640 0.078 217)',
  500: 'oklch(0.520 0.086 218)',
  600: 'oklch(0.480 0.088 218)',
  700: 'oklch(0.415 0.092 220)',
  800: 'oklch(0.350 0.080 221)',
  900: 'oklch(0.300 0.065 222)',
  950: 'oklch(0.230 0.050 223)',
};

const green = {
  50: 'oklch(0.970 0.020 158)',
  100: 'oklch(0.950 0.040 158)',
  200: 'oklch(0.900 0.065 157)',
  300: 'oklch(0.820 0.090 156)',
  400: 'oklch(0.680 0.110 156)',
  500: 'oklch(0.575 0.120 156)',
  600: 'oklch(0.510 0.115 156)',
  700: 'oklch(0.430 0.105 156)',
  800: 'oklch(0.360 0.090 156)',
  900: 'oklch(0.300 0.075 156)',
  950: 'oklch(0.220 0.055 156)',
};

const amber = {
  50: 'oklch(0.975 0.025 84)',
  100: 'oklch(0.955 0.050 82)',
  200: 'oklch(0.910 0.080 80)',
  300: 'oklch(0.850 0.105 79)',
  400: 'oklch(0.795 0.120 78)',
  500: 'oklch(0.745 0.125 78)',
  600: 'oklch(0.620 0.115 74)',
  700: 'oklch(0.470 0.090 68)',
  800: 'oklch(0.400 0.075 66)',
  900: 'oklch(0.330 0.060 64)',
  950: 'oklch(0.240 0.045 62)',
};

const orange = {
  50: 'oklch(0.970 0.025 60)',
  100: 'oklch(0.955 0.050 56)',
  200: 'oklch(0.915 0.080 54)',
  300: 'oklch(0.850 0.110 52)',
  400: 'oklch(0.730 0.140 51)',
  500: 'oklch(0.640 0.150 50)',
  600: 'oklch(0.560 0.145 49)',
  700: 'oklch(0.475 0.130 47)',
  800: 'oklch(0.400 0.110 46)',
  900: 'oklch(0.340 0.090 45)',
  950: 'oklch(0.250 0.070 44)',
};

const red = {
  50: 'oklch(0.965 0.018 24)',
  100: 'oklch(0.950 0.038 24)',
  200: 'oklch(0.905 0.070 24)',
  300: 'oklch(0.830 0.110 24)',
  400: 'oklch(0.680 0.160 25)',
  500: 'oklch(0.585 0.185 26)',
  600: 'oklch(0.555 0.190 25)',
  700: 'oklch(0.465 0.170 25)',
  800: 'oklch(0.400 0.145 25)',
  900: 'oklch(0.340 0.120 25)',
  950: 'oklch(0.250 0.090 25)',
};

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-heebo)', 'Heebo', 'Assistant', 'Rubik', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        gray: stone,
        slate: stone,
        zinc: stone,
        neutral: stone,
        stone,
        blue: petrol,
        sky: petrol,
        indigo: petrol,
        green,
        emerald: green,
        amber,
        yellow: amber,
        orange,
        red,
        rose: red,
        accent: {
          DEFAULT: 'var(--accent)',
          strong: 'var(--accent-strong)',
          soft: 'var(--accent-soft)',
          text: 'var(--accent-text)',
          on: 'var(--accent-on)',
        },
        status: {
          'done': 'var(--status-done)', 'done-soft': 'var(--status-done-soft)', 'done-text': 'var(--status-done-text)',
          'active': 'var(--status-active)', 'active-soft': 'var(--status-active-soft)', 'active-text': 'var(--status-active-text)',
          'waiting': 'var(--status-waiting)', 'waiting-soft': 'var(--status-waiting-soft)', 'waiting-text': 'var(--status-waiting-text)',
          'skipped': 'var(--status-skipped)', 'skipped-soft': 'var(--status-skipped-soft)', 'skipped-text': 'var(--status-skipped-text)',
          'blocked': 'var(--status-blocked)', 'blocked-soft': 'var(--status-blocked-soft)', 'blocked-text': 'var(--status-blocked-text)',
          'rejected': 'var(--status-rejected)', 'rejected-soft': 'var(--status-rejected-soft)', 'rejected-text': 'var(--status-rejected-text)',
        },
        brand: {
          red: 'var(--brand-red)',
          dark: 'var(--stone-950)',
          'red-light': 'oklch(0.560 0.150 27)',
          'red-dark': 'var(--brand-red-strong)',
          soft: 'var(--brand-red-soft)',
        },
        primary: 'var(--brand-red)',
        'primary-container': 'var(--brand-red-strong)',
        'on-primary': 'var(--brand-red-on)',
        'on-primary-container': 'var(--brand-red-soft)',
        'surface': 'var(--surface-card)',
        'surface-container': 'var(--surface-sunk)',
        'surface-container-low': 'var(--stone-100)',
        'surface-container-lowest': 'var(--surface-raised)',
        'on-surface': 'var(--text-strong)',
        'on-surface-variant': 'var(--text-muted)',
        'outline': 'var(--border-strong)',
        'outline-variant': 'var(--border-hair)',
        'background': 'var(--bg-app)',
        'on-background': 'var(--text-strong)',
        'secondary': 'var(--text-muted)',
        'tertiary': 'var(--accent)',
        'error': 'var(--status-rejected)',
      },
      borderRadius: {
        md: '10px',
        lg: '14px',
        xl: '18px',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
};
export default config;
