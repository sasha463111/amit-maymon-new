import { defineConfig } from 'vitest/config';
import path from 'node:path';

// #42 (16/10): the business-rule tests. They run before every production
// build (package.json "build") — a failing test stops the deploy.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The server runs in UTC (Vercel); so do the tests — that is where the
    // time-zone bugs (#45/#46) showed up.
    env: { TZ: 'UTC' },
  },
});
