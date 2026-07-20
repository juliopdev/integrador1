import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    hookTimeout: 60_000,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/**',
      '**/.agents/**',
      '**/workspace/**',
      '**/.git/**',
    ],
  },
});
