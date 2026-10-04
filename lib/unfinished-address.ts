import { defaultRemarkPlugins, type StreamdownProps } from 'streamdown'

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
 * A finished answer is rendered with Streamdown's own plugins, untouched, so
 * the final render is the same with or without this.
 */

type RemarkPlugins = NonNullable<StreamdownProps['remarkPlugins']>

/**
 * The remark plugins for an answer: Streamdown's own (`undefined`), unless
 * the answer is still streaming and its last word may be an address still
 * being written.
 *
 * The plugin's options carry that word, so they change with every chunk
 * while it is being written, and Streamdown then re-renders each block of
 * the answer rather than only the last. That is why the default is returned
 * whenever no address can be in play: for most of an answer, nothing changes.
 */
export function remarkPluginsFor(
  text: string,
  { streaming }: { streaming: boolean }
): RemarkPlugins | undefined {
  if (!streaming) return undefined
  const word = lastWord(text)
  if (!ADDRESS_MARK.test(word)) return undefined
  return [
    ...STREAMDOWN_REMARK_PLUGINS,
    [holdBareLinksInLastWord, { lastWord: word }],
  ]
}

const STREAMDOWN_REMARK_PLUGINS = Object.values(defaultRemarkPlugins)

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
  position?: { start: { offset?: number } }
}

/**
 * Inline content: what sits inside one paragraph, heading or table cell.
 * Entering any other node starts a new line of the source, so whatever came
 * before it was followed by a line break.
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

/**
 * Unwraps every bare link in the block's last word into its own text.
 *
 * Streamdown parses an answer one block at a time and runs the same plugins
 * on each, so a block has to establish that it is the one being written:
 * its last word must begin with the answer's (Streamdown may append markers
 * that close an unfinished `**` or backtick). An earlier block that happens
 * to end with the same word is held too, until the next chunk; that errs
 * toward text, never toward a wrong link.
 *
 * A bare link is any link not written as `[text](url)` or `<url>`: GFM makes
 * those from the text itself, some during parsing (with a position) and some
 * in a pass over the parsed text (without one).
 */
function holdBareLinksInLastWord({
  lastWord: answerWord,
}: {
  lastWord: string
}) {
  return (tree: MarkdownNode, file: { value?: unknown }) => {
    const source = String(file.value ?? '')
    if (!lastWord(source).startsWith(answerWord)) return

    const held: { parent: MarkdownNode; link: MarkdownNode }[] = []
    const visit = (node: MarkdownNode, parent?: MarkdownNode) => {
      if (
        !PHRASING.has(node.type) ||
        node.type === 'break' ||
        (typeof node.value === 'string' && /\s/.test(node.value))
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
