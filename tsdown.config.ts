/**
 * Build configuration for both halves of dsh-token-billing.
 *
 * The plugin has two artifacts with nothing in common but their name:
 *
 *  - `lib/index.js` — the HOST half. Plain ESM for Node, loaded by the DSH
 *    loader, with generated `.d.ts`. It imports nothing at runtime, so there is
 *    no dependency to bundle or externalize.
 *
 *  - `lib/client.js` — the CLIENT half. The browser module system does not load
 *    ESM: it registers a CommonJS factory per package
 *    (`window.__ModuleLoader__.load({ id, factory })`), and every specifier the
 *    factory `require`s is answered by the shell's frozen module table. The
 *    bundle is therefore emitted as CJS with those platform specifiers left
 *    external, wrapped in the factory closure by the banner/intro/footer below.
 *
 * @see https://tsdown.dev
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'tsdown'

/** Read from cwd: the config file's own URL is not guaranteed to sit at the package root under every loader. */
const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  name: string
}

/**
 * Specifiers the shell seeds into the frozen browser module table.
 *
 * They must stay `require()` calls in the bundle: a specifier the table cannot
 * answer is a guaranteed throw when the factory materializes. Everything else
 * the client half imports is inlined.
 */
const CLIENT_PLATFORM_MODULES = [
  'react',
  'react-dom',
  '@deepseek-ai/dsh-client-ui-primitives',
]

const isPlatformModule = (specifier: string): boolean =>
  CLIENT_PLATFORM_MODULES.includes(specifier)

export default defineConfig([
  {
    name: pkg.name,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    // Emit `index.js`/`index.d.ts` — what `main`, `types` and `exports` name — instead of tsdown's `.mjs`/`.d.mts` default.
    fixedExtension: false,
    // The host half's exported types are its integration contract.
    dts: true,
    clean: true,
    // Left unminified: this half runs in Node straight off disk, so minifying would only cost stack-trace readability.
    minify: false,
  },
  {
    name: `${pkg.name}/client`,
    entry: { client: 'src/client.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    // A classic script the shell loads into its module table, never a Node module: without an explicit target, tsdown falls back to engines.node and trips its legacy-CJS warning.
    target: 'es2024',
    dts: false,
    sourcemap: true,
    clean: false,
    minify: false,
    deps: {
      neverBundle: CLIENT_PLATFORM_MODULES,
      alwaysBundle: (specifier: string) => !isPlatformModule(specifier),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      // The closure-factory handoff every `dsh.client` package's ./client export must use.
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
