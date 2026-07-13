import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Map the "@/..." path alias (see tsconfig.json paths) to the project root so
// tests can import modules the same way the app does.
const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: root }],
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'dist/**'],
  },
});
