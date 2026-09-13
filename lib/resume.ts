import fs from 'fs'
import path from 'path'

const RESUME_MD = path.join(process.cwd(), 'content', 'resume.md')

/**
 * The résumé Markdown as published: a redacted copy written by
 * scripts/render-resume.sh from the private source. Emails and known domains
 * become links here (the PDF pipeline does the same in md2html.py), so the
 * repo copy stays plain text that both outputs can share.
 */
export function getResumeMarkdown(): string {
  return linkify(hardBreaks(fs.readFileSync(RESUME_MD, 'utf8')))
}

/**
 * The header block is the run of non-blank lines right after the `# Name`
 * title. It is written as short lines separated by " · "; in Markdown those
 * soft breaks would collapse into one line, while the PDF pipeline keeps
 * them as <br>. Mirror that with Markdown hard breaks, header block only.
 */
export function hardBreaks(markdown: string): string {
  const lines = markdown.split('\n')
  const title = lines.findIndex(l => l.startsWith('# '))
  if (title < 0) return markdown
  let end = title + 1
  while (end < lines.length && lines[end].trim() !== '') end++
  return lines
    .map((line, i) =>
      i > title && i < end - 1 && line.includes(' · ')
        ? line.replace(/\s*$/, '  ')
        : line
    )
    .join('\n')
}

const EMAIL = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,})\b/g

/**
 * Only these hosts are linked when they appear bare in the text. An open TLD
 * match would also link things like `next.config.dev` or `v1.net` to domains
 * the owner does not control.
 */
export const LINKED_HOSTS = [
  'matttrifilo.com',
  'psychichomily.com',
  'github.com',
  'linkedin.com',
] as const
const DOMAIN = new RegExp(
  `(?<![\\w/@["])((?:${LINKED_HOSTS.map(h => h.replace(/\./g, '\\.')).join('|')})(?:\\/[A-Za-z0-9._~/-]*[A-Za-z0-9_/-])?)`,
  'g'
)

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
