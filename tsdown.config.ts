import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineConfig, type TsdownPluginOption } from 'tsdown'

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  name: string
}

const CLIENT_PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@deepseek-ai/dsh-client-ui-primitives',
]

const isPlatformModule = (specifier: string): boolean =>
  CLIENT_PLATFORM_MODULES.includes(specifier)

const CSS_VIRTUAL_PREFIX = '\0dsh-css-text:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

function cssTextPlugin(): TsdownPluginOption {
  return {
    name: 'dsh-css-text',
    resolveId(source, importer) {
      if (!source.endsWith('.css')) return null
      const file = importer === undefined ? source : resolve(dirname(importer), source)
      return CSS_VIRTUAL_PREFIX + file + CSS_VIRTUAL_SUFFIX
    },
    load(id) {
      if (!id.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const file = id.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(file)
      return `export default ${JSON.stringify(readFileSync(file, 'utf8'))}`
    },
  }
}

export default defineConfig([
  {
    name: pkg.name,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: true,
    clean: true,
    minify: false,
  },
  {
    name: `${pkg.name}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    dts: false,
    sourcemap: true,
    clean: false,
    minify: false,
    deps: {
      neverBundle: CLIENT_PLATFORM_MODULES,
      alwaysBundle: (specifier: string) => !isPlatformModule(specifier),
    },
    plugins: [cssTextPlugin()],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
