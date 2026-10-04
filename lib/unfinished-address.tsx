'use client'

import { createContext, useContext } from 'react'
import remend, { type RemendOptions } from 'remend'
import { Block, parseMarkdownIntoBlocks, type BlockProps } from 'streamdown'

/**
 * While an answer streams, a bare URL or email address in its last word is
 * drawn as text, and becomes a link once the word is finished: whitespace
 * follows it, or the answer ends (Matt, 2026-10-04, MTC-117).
 *
 * Streamdown links a bare address as soon as enough of it has arrived to look
 * like one, so without this "https://github.com/mtrifilo/matttrifilo." is,
 * for a chunk, a live link to https://github.com/mtrifilo/matttrifilo, which
 * is not the repository the answer names. A period or comma at the edge of
 * the stream does not finish the word: it can sit inside an address (".com")
 * as easily as after one, and only what follows tells which. The cost is that
 * an address followed by punctuation becomes a link with the whitespace after
 * the punctuation, usually the next chunk, rather than with the punctuation.
 *
 * Streamdown renders an answer as a list of blocks, each parsed on its own.
 * Only the last of them can hold the unfinished word, so only that block is
 * given the plugin below: an earlier block keeps its links, and keeps
 * Streamdown's memo, however the last one changes. A finished answer gives
 * the plugin to no block, so its render is Streamdown's own.
 */

/**
 * Which of Streamdown's blocks holds the answer's unfinished last word, or -1
 * when none does: the answer has ended, it ends with whitespace, or its last
 * word cannot be an address.
 *
 * The blocks are counted the way Streamdown counts them, from the text after
 * `remend` has completed or removed its unfinished Markdown, with the options
 * the renderer hands Streamdown. `remend` is pinned to the version Streamdown
 * pins (lib/unfinished-address.test.tsx fails when the two drift), because a
 * different count would give the plugin to the wrong block.
 */
export function unfinishedAddressBlock(
  text: string,
  {
    streaming,
    remendOptions,
  }: { streaming: boolean; remendOptions: RemendOptions }
): number {
  if (!streaming || !ADDRESS_MARK.test(lastWord(text))) return -1
  return parseMarkdownIntoBlocks(remend(text, remendOptions)).length - 1
}

/** The index `unfinishedAddressBlock` chose for the answer being rendered. */
export const UnfinishedAddressBlock = createContext(-1)

/**
 * Streamdown's own block, given the plugin when it is the block
 * `UnfinishedAddressBlock` names. Passed to Streamdown as `BlockComponent`.
 */
export function BlockHoldingUnfinishedAddress(props: BlockProps) {
  const held = useContext(UnfinishedAddressBlock)
  if (props.index !== held) return <Block {...props} />
  return (
    <Block {...props} remarkPlugins={withHoldPlugin(props.remarkPlugins)} />
  )
}

type RemarkPlugins = NonNullable<BlockProps['remarkPlugins']>

const NO_PLUGINS: RemarkPlugins = []
const holding = new WeakMap<RemarkPlugins, RemarkPlugins>()

/**
 * The block's plugins with the hold added, the same array for the same
 * plugins: Streamdown's block memo and its processor cache both key on it, so
 * a new array per chunk would re-parse and rebuild for nothing.
 */
function withHoldPlugin(plugins: BlockProps['remarkPlugins']): RemarkPlugins {
  const base = plugins ?? NO_PLUGINS
  let held = holding.get(base)
  if (!held) {
    held = [...base, holdBareLinksInLastWord]
    holding.set(base, held)
  }
  return held
}

/**
 * Every bare link GFM recognizes contains one of these: an email address its
 * `@`, a URL its `://`, a `www.` link its prefix. A word without one cannot
 * have become a link, half written or not.
 */
const ADDRESS_MARK = /@|:\/\/|www\./i

/**
 * The run of non-whitespace characters the text ends with, or the empty
 * string when it ends with whitespace. Scanned from the end, so the cost is
 * the word's length rather than the answer's.
 */
function lastWord(text: string): string {
  let start = text.length
  while (start > 0 && !/\s/.test(text[start - 1])) start -= 1
  return text.slice(start)
}

/** The parts of an mdast node this plugin reads. Structural on purpose. */
interface MarkdownNode {
  type: string
  value?: string
  children?: MarkdownNode[]
  position?: { start: { offset?: number }; end: { offset?: number } }
}

/**
 * Inline content, when it sits in one of `INLINE_PARENTS` or in other inline
 * content. Entering anything else (a paragraph, a list item, an HTML block
 * inside a list item, which mdast also types `html`) starts a new line of the
 * source, so whatever came before it was followed by a line break.
 */
const PHRASING = new Set([
  'break',
  'delete',
  'emphasis',
  'footnoteReference',
  'html',
  'image',
  'imageReference',
  'inlineCode',
  'link',
  'linkReference',
  'strong',
  'text',
])
const INLINE_PARENTS = new Set(['paragraph', 'heading', 'tableCell'])

function isInline(node: MarkdownNode, parent?: MarkdownNode): boolean {
  if (!PHRASING.has(node.type) || !parent) return false
  return INLINE_PARENTS.has(parent.type) || PHRASING.has(parent.type)
}

/**
 * Whether the node's own source holds whitespace. Read from the source where
 * the node has a position, because the decoded value can differ: `&ensp;`
 * decodes to a space but does not end a bare URL, which takes it as text.
 */
function holdsWhitespace(node: MarkdownNode, source: string): boolean {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  const raw =
    start !== undefined && end !== undefined
      ? source.slice(start, end)
      : node.value
  return typeof raw === 'string' && /\s/.test(raw)
}

/**
 * Unwraps every bare link in the block's last word into its own text.
 *
 * A bare link is any link not written as `[text](url)` or `<url>`: GFM makes
 * those from the text itself, some during parsing (with a position) and some
 * in a pass over the parsed text (without one).
 */
function holdBareLinksInLastWord() {
  return (tree: MarkdownNode, file: { value?: unknown }) => {
    const source = String(file.value ?? '')
    const held: { parent: MarkdownNode; link: MarkdownNode }[] = []
    const visit = (node: MarkdownNode, parent?: MarkdownNode) => {
      if (
        !isInline(node, parent) ||
        node.type === 'break' ||
        (node.value !== undefined && holdsWhitespace(node, source))
      ) {
        held.length = 0
      }
      if (node.type === 'link' && parent && isBare(node, source)) {
        held.push({ parent, link: node })
        return
      }
      for (const child of node.children ?? []) visit(child, node)
    }
    visit(tree)

    for (const { parent, link } of held.reverse()) {
      const siblings = parent.children ?? []
      siblings.splice(siblings.indexOf(link), 1, ...(link.children ?? []))
    }
  }
}

function isBare(link: MarkdownNode, source: string): boolean {
  const start = link.position?.start.offset
  if (start === undefined) return true
  return source[start] !== '[' && source[start] !== '<'
}
