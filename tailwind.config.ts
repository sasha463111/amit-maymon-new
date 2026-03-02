import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#CC1818',
          dark: '#1C1C1C',
          'red-light': '#E53030',
          'red-dark': '#A01010',
        },
      },
    },
  },
  plugins: [],
};
export default config;
