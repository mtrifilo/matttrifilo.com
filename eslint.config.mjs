import { createRequire } from 'node:module'
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const require = createRequire(import.meta.url)

/**
 * eslint-config-next sets eslint-plugin-react's React version to "detect",
 * and the plugin detects it through context.getFilename(), which ESLint 10
 * removed: the first React rule to load throws and the whole run stops.
 * Reading the installed version here gives the plugin the answer detection
 * would have found, without that call. eslint-plugin-react 7.37.5 is the
 * latest release and has no ESLint 10 support
 * (jsx-eslint/eslint-plugin-react#3977); when a release adds it, this
 * setting can go.
 */
const { version: installedReactVersion } = require('react/package.json')

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { settings: { react: { version: installedReactVersion } } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Agent worktrees under .claude/worktrees/ are full checkouts; without this
    // a leftover one is linted as if it were the project.
    '.claude/**',
  ]),
])

export default eslintConfig
