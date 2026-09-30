/**
 * How the knowledge build reads a line of Markdown: which lines are fenced
 * code, which are ATX headings, and what of a line is prose once escapes
 * and code spans are accounted for.
 *
 * The rules are CommonMark's (https://spec.commonmark.org/0.31.2/) for the
 * shapes the corpus can plausibly contain, applied line by line at the top
 * level of a document. A full parser is deliberately not used: the build
 * needs three answers per line, a dependency would put a Markdown library's
 * release cycle between Matt and his corpus, and a small set of rules is
 * one a reader can hold in their head. What that costs is written next to
 * the rule it affects, and every cost but one is chosen to make a check
 * read more of a line as prose, never less; the one is below, and the
 * build refuses the shape that causes it.
 *
 * Nothing here tracks container blocks (list items, block quotes). So a
 * line is read as if it stood at the top level: a fence or heading indented
 * four or more columns is not one here, although CommonMark accepts it
 * inside a list item and MDX, which turns off indented code, accepts it
 * anywhere. And a fence that opens on a list-item or block-quote line
 * ("- ```sh") is not seen as one, so its closer would read as an opener
 * and the prose after it as code: the one place this module alone reads
 * less prose, not more. lib/knowledge/build.ts refuses both shapes
 * (isOverIndentedFence, isFenceAfterContainerMarker) before any check
 * reads the document, so no document that builds contains either.
 */

/** Where the indentation of a line ends, and how many columns it spans. */
function indentation(line: string): { end: number; columns: number } {
  let columns = 0
  let end = 0
  for (; end < line.length; end++) {
    const char = line[end]
    if (char === ' ') columns++
    // CommonMark expands a tab to the next multiple of four columns, so a
    // tab at the start of a line is four columns of indentation on its own.
    else if (char === '\t') columns += 4 - (columns % 4)
    else break
  }
  return { end, columns }
}

/**
 * The most indentation a fence or an ATX heading may have at the top
 * level; four columns makes an indented code block.
 */
const MAX_BLOCK_INDENT = 3

/** A run of three or more backticks or tildes, and what follows it. */
const FENCE_RUN = /^(`{3,}|~{3,})([\s\S]*)$/

interface FenceMarker {
  /** The run of backticks or tildes. */
  run: string
  /** Columns of indentation before the run. */
  indent: number
  /** Everything after the run. */
  info: string
}

/**
 * The fence run a line starts with after its indentation, at any depth,
 * or null. A backtick fence's info string may not contain a backtick:
 * "```a`b" is a paragraph with backticks in it, not a fence, or inline
 * code at the start of a line could never be written.
 */
function fenceMarker(line: string): FenceMarker | null {
  const { end, columns } = indentation(line)
  const match = FENCE_RUN.exec(line.slice(end))
  if (!match) return null
  const [, run, info] = match
  if (run[0] === '`' && info.includes('`')) return null
  return { run, indent: columns, info }
}

/** The run a line opens a fenced code block with, or null. */
function fenceOpener(line: string): string | null {
  const marker = fenceMarker(line)
  return marker && marker.indent <= MAX_BLOCK_INDENT ? marker.run : null
}

/**
 * Whether a line closes the fence `opener` opened: the same character, a
 * run at least as long, and nothing after it but spaces and tabs. So a
 * ``` inside a ~~~ or ```` block is content, and so is "```js". Only
 * spaces and tabs: a no-break space after the run makes the line content,
 * as CommonMark says, where String.prototype.trim would close the fence.
 */
function closesFence(line: string, opener: string): boolean {
  const marker = fenceMarker(line)
  return (
    marker !== null &&
    marker.indent <= MAX_BLOCK_INDENT &&
    marker.run[0] === opener[0] &&
    marker.run.length >= opener.length &&
    /^[ \t]*$/.test(marker.info)
  )
}

/**
 * A fence line indented four or more columns, where CommonMark (indented
 * code at the top level) and MDX (a fence at any indentation) disagree.
 * See the module comment.
 *
 * With no fence open (`openRun` null), any such opener counts. While one
 * is open, only a line MDX would read as closing it: the same character,
 * a run at least as long, nothing after it but spaces and tabs. Any other
 * deep fence line is content to both, such as a nested fence in a sample.
 */
export function isOverIndentedFence(
  line: string,
  openRun: string | null
): boolean {
  const marker = fenceMarker(line)
  if (marker === null || marker.indent <= MAX_BLOCK_INDENT) return false
  if (openRun === null) return true
  return (
    marker.run[0] === openRun[0] &&
    marker.run.length >= openRun.length &&
    /^[ \t]*$/.test(marker.info)
  )
}

/**
 * A list-item or block-quote marker, once or nested, at the start of a
 * line: "- ", "* ", "+ ", "1. ", "1) ", "> ".
 */
const CONTAINER_MARKERS =
  /^(?:[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+|[ \t]*>[ \t]?)+/

/**
 * A fence that opens on the same line as a list item or block quote
 * marker ("- ```sh", "> ```"). CommonMark and MDX both read it as a fence
 * inside the item, but this module reads lines at the top level and sees
 * no fence, so the fence's closer would read as an opener and everything
 * after it as code. The build refuses it rather than read less prose.
 */
export function isFenceAfterContainerMarker(line: string): boolean {
  const markers = CONTAINER_MARKERS.exec(line)
  if (!markers) return false
  const marker = fenceMarker(line.slice(markers[0].length))
  return marker !== null && marker.indent <= MAX_BLOCK_INDENT
}

/**
 * Tracks whether a line is inside a fenced code block. Callers feed the
 * lines of one document in order and read the answer before deciding what
 * a line means.
 *
 * A fence left open runs to the end of the document, as CommonMark says;
 * the build refuses such a document (assertMdxSafe in ./build), so no
 * check ever reads the rest of a document as swallowed code.
 */
export class FenceTracker {
  private opener: string | null = null

  /** True when this line is inside a fence (the fence lines themselves count). */
  consume(line: string): boolean {
    if (this.opener === null) {
      this.opener = fenceOpener(line)
      return this.opener !== null
    }
    if (closesFence(line, this.opener)) this.opener = null
    return true
  }

  get open(): boolean {
    return this.opener !== null
  }

  /** The run the open fence started with, or null when none is open. */
  get openRun(): string | null {
    return this.opener
  }
}

/** An ATX heading: its level and its title. */
export interface AtxHeading {
  level: number
  /**
   * The text after the opening hashes, trimmed, without an optional closing
   * run of hashes. Still Markdown: code spans and escapes are as written.
   */
  title: string
}

/** One to six hashes, then a space, a tab or the end of the line. */
const ATX_OPENER = /^(#{1,6})(?:[ \t]+|$)/

/**
 * A heading's content without its optional closing run of hashes, which
 * counts only when a space or tab stands before it (or it is the whole
 * content): "Title ##" is "Title", while "C#" and "Title \#" keep theirs.
 * By hand rather than by regular expression, which backtracks
 * quadratically over a long run of spaces.
 */
function withoutClosingHashes(content: string): string {
  let end = content.length
  while (end > 0 && (content[end - 1] === ' ' || content[end - 1] === '\t')) {
    end--
  }
  let hashes = end
  while (hashes > 0 && content[hashes - 1] === '#') hashes--
  if (hashes === end) return content
  if (hashes === 0) return ''
  const before = content[hashes - 1]
  return before === ' ' || before === '\t' ? content.slice(0, hashes) : content
}

/**
 * The ATX heading a line is, or null. Up to three columns of indentation,
 * one to six hashes, then a space, a tab or the end of the line: so "##",
 * "   ## Title" and "##\tTitle" are headings, and "##Title" and
 * "####### Title" are not. Setext headings (a line underlined with = or -)
 * are not read: telling one from a paragraph needs the lines around it,
 * and the corpus writes every heading with hashes.
 *
 * The caller decides first whether the line is inside a fence.
 */
export function atxHeading(line: string): AtxHeading | null {
  const { end, columns } = indentation(line)
  if (columns > MAX_BLOCK_INDENT) return null
  const match = ATX_OPENER.exec(line.slice(end))
  if (!match) return null
  const content = line.slice(end + match[0].length)
  return {
    level: match[1].length,
    title: withoutClosingHashes(content).trim(),
  }
}

/**
 * The characters a backslash escapes: CommonMark's ASCII punctuation.
 * Before anything else a backslash is itself, so `\T` is two characters
 * of text.
 */
const ESCAPABLE = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~')

/** A stretch of one line as CommonMark reads it. */
type InlinePiece =
  | { kind: 'text'; value: string }
  | { kind: 'escape'; value: string }
  | { kind: 'code'; value: string }

/** Where the next run of exactly `length` backticks from `from` starts, or -1. */
function findCloser(line: string, from: number, length: number): number {
  let start = line.indexOf('`', from)
  while (start !== -1) {
    let end = start
    while (line[end] === '`') end++
    if (end - start === length) return start
    start = line.indexOf('`', end)
  }
  return -1
}

/**
 * One line split into text, backslash escapes and code spans, left to
 * right as CommonMark reads them.
 *
 * A code span opens at a run of backticks and closes at the next run of
 * exactly the same length; a run with no such closer is literal backticks,
 * so "```TODO (Matt)`" is all text. Inside a span a backslash is only a
 * backslash. An escaped backtick opens nothing, so "\`<b>\`" is text.
 *
 * With `codeSpans` false every backtick is text; LineReader uses that for
 * the rest of a paragraph once a span may have wrapped onto a new line.
 * `unmatchedRun` says whether a run found no closer on this line.
 */
function inlinePieces(
  line: string,
  codeSpans = true
): { pieces: InlinePiece[]; unmatchedRun: boolean } {
  const pieces: InlinePiece[] = []
  let unmatchedRun = false
  let text = ''
  const flush = () => {
    if (text !== '') pieces.push({ kind: 'text', value: text })
    text = ''
  }
  let i = 0
  while (i < line.length) {
    const char = line[i]
    if (char === '\\' && i + 1 < line.length && ESCAPABLE.has(line[i + 1])) {
      flush()
      pieces.push({ kind: 'escape', value: line[i + 1] })
      i += 2
      continue
    }
    if (char !== '`') {
      text += char
      i++
      continue
    }
    let runEnd = i
    while (line[runEnd] === '`') runEnd++
    const length = runEnd - i
    // A failed search reads to the end of the line, but only once per run
    // length: two runs of one length always pair up. So a line of n
    // characters costs at most n times its number of distinct run lengths,
    // which is under the square root of 2n.
    const closer = codeSpans ? findCloser(line, runEnd, length) : -1
    if (closer === -1) {
      unmatchedRun = true
      text += line.slice(i, runEnd)
      i = runEnd
      continue
    }
    flush()
    pieces.push({ kind: 'code', value: line.slice(runEnd, closer) })
    i = closer + length
  }
  flush()
  return { pieces, unmatchedRun }
}

/** Escapes resolved to their character, code spans removed. */
function readerText(pieces: InlinePiece[]): string {
  return pieces
    .filter(piece => piece.kind !== 'code')
    .map(piece => piece.value)
    .join('')
}

/** Text outside code spans, escaped characters removed. */
function mdxText(pieces: InlinePiece[]): string {
  return pieces
    .filter(piece => piece.kind === 'text')
    .map(piece => piece.value)
    .join('')
}

/**
 * A line as a reader sees it outside code: escapes resolved to the
 * character they stand for, code spans removed. This is what the
 * placeholder rule reads, so `TODO \(Matt\)` is the marker, `\TODO (Matt)`
 * still contains it, and `` `TODO (Matt)` `` is code.
 */
export function proseText(line: string): string {
  return readerText(inlinePieces(line).pieces)
}

/**
 * The characters of a line MDX parses as syntax: text outside code spans,
 * with escaped characters removed, because `\<` and `\{` are how MDX wants
 * a literal angle bracket or brace written. This is what the MDX-safety
 * check reads.
 */
export function mdxSyntaxText(line: string): string {
  return mdxText(inlinePieces(line).pieces)
}

/** One line of a document, read in order with the lines before it. */
export interface ReadLine {
  /** Inside a fenced code block, or one of its fence lines. */
  code: boolean
  /** What a reader sees: a heading's title or the line (see proseText). */
  prose: string
  /** What MDX parses as syntax (see mdxSyntaxText). */
  mdxText: string
  /**
   * True when an earlier line of the same paragraph left a backtick run
   * unmatched, so this line's backticks were all read as text.
   */
  afterUnmatchedRun: boolean
}

/** A blank line: nothing but spaces and tabs. It ends a paragraph. */
const BLANK = /^[ \t]*$/

/**
 * Reads the lines of one document, or of one block of it, in order: which
 * are fenced code, and what the rest say.
 *
 * A code span may wrap onto the next line of its paragraph, and pairing
 * backticks one line at a time would then pair the wrong ones and hide
 * prose between them as code. Telling where a paragraph really ends needs
 * the container blocks this module does not track (a list item or a table
 * row ends one too). So once a line leaves a backtick run unmatched, every
 * backtick in the rest of the paragraph, up to a blank line, a heading or
 * a fence, is read as text. That can only show a check more prose: a
 * wrapped code span's own contents are checked as prose, which fails loud,
 * and keeping each code span on one line is the fix.
 */
export class LineReader {
  private readonly fence = new FenceTracker()
  private unmatchedRunInParagraph = false

  read(line: string): ReadLine {
    if (this.fence.consume(line)) {
      this.unmatchedRunInParagraph = false
      return { code: true, prose: '', mdxText: '', afterUnmatchedRun: false }
    }
    const heading = atxHeading(line)
    if (heading || BLANK.test(line)) {
      this.unmatchedRunInParagraph = false
      return {
        code: false,
        prose: heading ? proseText(heading.title) : '',
        mdxText: heading ? mdxSyntaxText(line) : '',
        afterUnmatchedRun: false,
      }
    }
    const afterUnmatchedRun = this.unmatchedRunInParagraph
    const { pieces, unmatchedRun } = inlinePieces(line, !afterUnmatchedRun)
    if (unmatchedRun) this.unmatchedRunInParagraph = true
    // A heading indented four or more columns is indented code or a
    // paragraph line to CommonMark and a heading to MDX. Its prose is read
    // by its title either way, so "    ## TODO" is a placeholder, as the
    // same heading with less indentation is.
    const deepHeading = atxHeading(line.replace(/^[ \t]+/, ''))
    return {
      code: false,
      prose: deepHeading
        ? readerText(inlinePieces(deepHeading.title, !afterUnmatchedRun).pieces)
        : readerText(pieces),
      mdxText: mdxText(pieces),
      afterUnmatchedRun,
    }
  }

  /** True while a fence is open. */
  get fenceOpen(): boolean {
    return this.fence.open
  }

  /** The run the open fence started with, or null when none is open. */
  get openFenceRun(): string | null {
    return this.fence.openRun
  }
}
