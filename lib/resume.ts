import fs from 'fs'
import path from 'path'

const RESUME_MD = path.join(process.cwd(), 'content', 'resume.md')

/**
 * The résumé Markdown as published: a redacted copy written by
 * scripts/render-resume.sh from the private source. Emails and bare domains
 * become links here (the PDF pipeline does the same in md2html.py), so the
 * repo copy stays plain text that both outputs can share.
 */
export function getResumeMarkdown(): string {
  return linkify(hardBreaks(fs.readFileSync(RESUME_MD, 'utf8')))
}

/**
 * The header block is written as consecutive lines separated by " · ". In
 * Markdown those soft breaks would collapse into one long line; the PDF
 * pipeline keeps them as <br>. Mirror that: a line containing " · " that is
 * followed by another text line gets a Markdown hard break.
 */
export function hardBreaks(markdown: string): string {
  const lines = markdown.split('\n')
  return lines
    .map((line, i) => {
      const next = lines[i + 1] ?? ''
      const inParagraph =
        !line.startsWith('#') && !line.startsWith('- ') && line.trim() !== ''
      return inParagraph &&
        line.includes(' · ') &&
        next.trim() !== '' &&
        !next.startsWith('#')
        ? line.replace(/\s*$/, '  ')
        : line
    })
    .join('\n')
}

const EMAIL = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,})\b/g
// Bare domains like linkedin.com/in/x or matttrifilo.com, not already inside
// a link, an email, or a URL with a scheme.
const DOMAIN =
  /(?<![\w/@["])((?:[a-z0-9-]+\.)+(?:com|io|dev|org|net)(?:\/[A-Za-z0-9._~/-]*[A-Za-z0-9_/-])?)/g

export function linkify(markdown: string): string {
  return markdown
    .split('\n')
    .map(line => {
      if (line.startsWith('#') || line.includes('](')) return line
      return line
        .replace(EMAIL, (m, addr) => `[${addr}](mailto:${addr})`)
        .replace(DOMAIN, (m, host) => `[${host}](https://${host})`)
    })
    .join('\n')
}
