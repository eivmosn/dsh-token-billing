import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': fileURLToPath(
        new URL('./test/stubs/ui-primitives.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['preview/**/*.spec.tsx'],
    environment: 'node',
  },
})
