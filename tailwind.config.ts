import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-public-sans)', 'Public Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          red: '#CC1818',
          dark: '#1C1C1C',
          'red-light': '#E53030',
          'red-dark': '#A01010',
        },
        // Stitch design system tokens
        primary: '#a30009',
        'primary-container': '#cc1818',
        'on-primary': '#ffffff',
        'on-primary-container': '#ffdfdb',
        'surface': '#f9f9f9',
        'surface-container': '#eeeeee',
        'surface-container-low': '#f3f3f3',
        'surface-container-lowest': '#ffffff',
        'on-surface': '#1a1c1c',
        'on-surface-variant': '#5c403c',
        'outline': '#916f6a',
        'outline-variant': '#e6bdb8',
        'background': '#f9f9f9',
        'on-background': '#1a1c1c',
        'secondary': '#585f6c',
        'tertiary': '#004f98',
        'error': '#ba1a1a',
      },
    },
  },
  plugins: [],
};
export default config;
