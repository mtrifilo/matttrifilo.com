#!/usr/bin/env bun

/**
 * Interactive script to scaffold a new blog post.
 *
 * Usage: bun run scripts/new-blog-post.ts
 *
 * Writes two files: the post itself, and its twin in
 * content/knowledge/blog so the career assistant can answer from it. The
 * twin is the same body with the post's frontmatter replaced by the
 * knowledge contract's, and lib/knowledge/knowledge.test.ts fails the
 * suite if a post ever has no twin — so the two are written together
 * rather than left to be remembered.
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')
const KNOWLEDGE_BLOG_DIR = path.join(
  process.cwd(),
  'content',
  'knowledge',
  'blog'
)
const SITE_URL = 'https://matttrifilo.com'
/** Mirrors SUMMARY_MAX_LENGTH in lib/knowledge/build.ts. */
const SUMMARY_MAX_LENGTH = 160

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/**
 * The post's slug, which lib/blog.ts reads straight off the file name and
 * the site uses as the URL. The date prefix is part of it.
 */
export function postSlug(title: string, date: string): string {
  return `${date}-${slugify(title)}`
}

/** The body both files start life with; they must never diverge. */
export const STARTER_BODY = 'Write your post here.\n'

export interface PostDraft {
  title: string
  date: string
  categories?: string[]
  description?: string
  body?: string
}

export function buildPostFile(draft: PostDraft): string {
  const categories = draft.categories ?? []
  const categoriesYaml =
    categories.length > 0
      ? `categories:\n${categories.map(c => `  - ${c}`).join('\n')}\n`
      : ''
  const descriptionYaml = draft.description
    ? `description: "${draft.description}"\n`
    : ''
  return `---
title: "${draft.title}"
date: "${draft.date}"
${categoriesYaml}${descriptionYaml}---

${draft.body ?? STARTER_BODY}`
}

/**
 * The frontmatter parser strips one pair of matching outer quotes, so
 * quote with whichever delimiter the value does not already use. A value
 * containing both fails loudly at `bun run knowledge:check` rather than
 * parsing as something else.
 */
function quoted(value: string): string {
  const quote = value.includes("'") ? '"' : "'"
  return `${quote}${value}${quote}`
}

/**
 * The index line the model reads before deciding to fetch this post.
 *
 * The description Matt typed is the closest thing to "what a reader would
 * learn" the scaffold has; the title is the honest fallback when he skips
 * it. Either way it is a placeholder worth rewriting once the post exists
 * — which is why the scaffold says so on the way out.
 */
export function draftSummary(draft: PostDraft): string {
  const summary = draft.description?.trim() || draft.title
  return summary.length > SUMMARY_MAX_LENGTH
    ? `${summary.slice(0, SUMMARY_MAX_LENGTH - 1).trimEnd()}…`
    : summary
}

/**
 * The knowledge twin: the same body under the frontmatter contract in
 * lib/knowledge/build.ts, so a new post is answerable the day it lands.
 *
 * The twin's id is the post slug, so the assistant's copy is published at
 * /knowledge/<slug> and `canonical` points back at the post itself — the
 * URL a reader should be sent to.
 */
export function buildKnowledgeTwin(draft: PostDraft): string {
  const slug = postSlug(draft.title, draft.date)
  const categories = draft.categories ?? []
  const tags = categories.length > 0 ? ['blog', ...categories] : ['blog']
  return `---
id: '${slug}'
title: ${quoted(draft.title)}
summary: ${quoted(draftSummary(draft))}
tags: [${tags.join(', ')}]
source: 'blog'
updated: '${draft.date}'
canonical: '${SITE_URL}/blog/${slug}'
---

${draft.body ?? STARTER_BODY}`
}

async function main() {
  console.log('\n--- New Blog Post ---\n')

  const title = await prompt('Title: ')
  if (!title) {
    console.error('Title is required.')
    process.exit(1)
  }

  const categoriesInput = await prompt('Categories (comma-separated, optional): ')
  const categories = categoriesInput
    ? categoriesInput.split(',').map(c => c.trim()).filter(Boolean)
    : []

  const description = await prompt('Description (optional): ')

  const today = new Date().toISOString().split('T')[0]
  const draft: PostDraft = { title, date: today, categories, description }
  const slug = postSlug(title, today)
  const filepath = path.join(BLOG_DIR, `${slug}.md`)
  const knowledgePath = path.join(KNOWLEDGE_BLOG_DIR, `${slug}.md`)

  for (const existing of [filepath, knowledgePath]) {
    if (fs.existsSync(existing)) {
      console.error(`File already exists: ${existing}`)
      process.exit(1)
    }
  }

  fs.mkdirSync(BLOG_DIR, { recursive: true })
  fs.writeFileSync(filepath, buildPostFile(draft), 'utf8')
  fs.mkdirSync(KNOWLEDGE_BLOG_DIR, { recursive: true })
  fs.writeFileSync(knowledgePath, buildKnowledgeTwin(draft), 'utf8')

  console.log(`\nCreated: ${filepath}`)
  console.log(`Created: ${knowledgePath}`)
  console.log(
    '\nKeep the two bodies identical; `bun run knowledge:check` verifies it.'
  )
  console.log(
    "Then rewrite the twin's `summary` and `tags`: they are the only thing"
  )
  console.log('the assistant reads before deciding to open the post.\n')
}

// Only when run directly, so the builders above can be imported by
// scripts/new-blog-post.test.ts without opening a prompt.
if (import.meta.main) main().catch(console.error)
