import localFont from 'next/font/local'

/**
 * Geist Mono, declared here with the same file and options as
 * `geist/font/mono` except that it is never preloaded.
 *
 * A font declared in the root layout is preloaded on every route, so every
 * page fetched this 70 KB file at load whether or not it drew a single mono
 * glyph. Without the preload the browser fetches it the first time text set
 * in it is laid out. Mono text is only ever code (in an answer, or in
 * Markdown rendered by components/blog/mdx-content.tsx) and the commit hash
 * on /ask/evals, so the homepage and an empty /ask never ask for it. The
 * trade is that a page which does draw mono text requests the file at first
 * layout rather than from the document head, and `display: swap` (next/font's
 * default) shows the fallback stack until it arrives.
 *
 * `geist/font/mono` cannot take the option, because next/font reads its
 * options at the call site; the path is relative to this file.
 */
export const GeistMono = localFont({
  src: '../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  preload: false,
  adjustFontFallback: false,
  fallback: [
    'ui-monospace',
    'SFMono-Regular',
    'Roboto Mono',
    'Menlo',
    'Monaco',
    'Liberation Mono',
    'DejaVu Sans Mono',
    'Courier New',
    'monospace',
  ],
  weight: '100 900',
})
