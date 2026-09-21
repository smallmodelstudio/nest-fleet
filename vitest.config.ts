import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    projects: ['packages/*'],
    include: ['**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
