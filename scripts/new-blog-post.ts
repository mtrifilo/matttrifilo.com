#!/usr/bin/env bun

/**
 * Interactive script to scaffold a new blog post.
 *
 * Usage: bun run scripts/new-blog-post.ts
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')

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
  const slug = slugify(title)
  const filename = `${today}-${slug}.md`
  const filepath = path.join(BLOG_DIR, filename)

  if (fs.existsSync(filepath)) {
    console.error(`File already exists: ${filepath}`)
    process.exit(1)
  }

  const categoriesYaml =
    categories.length > 0
      ? `categories:\n${categories.map(c => `  - ${c}`).join('\n')}\n`
      : ''

  const descriptionYaml = description ? `description: "${description}"\n` : ''

  const content = `---
title: "${title}"
date: "${today}"
${categoriesYaml}${descriptionYaml}---

Write your post here.
`

  fs.mkdirSync(BLOG_DIR, { recursive: true })
  fs.writeFileSync(filepath, content, 'utf8')

  console.log(`\nCreated: ${filepath}\n`)
}

main().catch(console.error)
