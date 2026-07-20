import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'public',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        auth: resolve(__dirname, 'src/frontend/styles/auth.scss'),
        dashboard: resolve(__dirname, 'src/frontend/styles/dashboard.scss'),
        'auth-entry': resolve(__dirname, 'src/frontend/scripts/auth.entry.js'),
        'dashboard-entry': resolve(__dirname, 'src/frontend/scripts/dashboard.entry.js'),
      },
      output: {
        entryFileNames: 'scripts/[name].js',
        chunkFileNames: 'scripts/[name]-[hash].js',
        assetFileNames: (info) => (info.name && info.name.endsWith('.css') ? 'styles/[name].[ext]' : 'assets/[name]-[hash].[ext]'),
      },
    },
  },
});
