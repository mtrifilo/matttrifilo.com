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
 *
 * The setting makes the rules this config turns on work; it does not make
 * the plugins ESLint 10 compatible. Until they are, before turning on a
 * rule, lint a file it should flag and check the run does not crash. The
 * rules named below are examples, not a complete list:
 * - eslint-plugin-react 7.37.5: rules such as react/jsx-curly-spacing,
 *   jsx-equals-spacing, jsx-tag-spacing, jsx-space-before-closing,
 *   jsx-one-expression-per-line, forward-ref-uses-ref and
 *   jsx-filename-extension crash the run, and a class marked only by a
 *   JSDoc `@extends React.Component` is no longer recognized as a component
 *   (the site has no class components).
 * - eslint-plugin-import 2.32.0: rules that read the source type, such as
 *   import/no-default-export, crash the run.
 * - typescript-eslint 8.55.0, the version this lockfile resolves, declares
 *   ESLint up to 9, and rules such as
 *   @typescript-eslint/consistent-generic-constructors, no-deprecated and
 *   no-magic-numbers crash the run. 8.56.0 and later support ESLint 10.
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
