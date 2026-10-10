import { defineConfig } from 'vitest/config'

// Specs import `src/` directly, except `test/bundle.test.ts`, which loads the
// BUILT `lib/client.js` as text to prove the shipped artifact still honours the
// `window.__ModuleLoader__` contract. Run `pnpm build` before `pnpm test` (or use
// `pnpm check`, which orders the two) so that assertion has an artifact to read.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
