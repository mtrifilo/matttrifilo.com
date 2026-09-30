import { describe, expect, mock, test } from 'bun:test'
import fs from 'fs'
import path from 'path'

/**
 * next/font's loaders are compiled away at build time and throw if called at
 * run time, so the loader is replaced with one that records what each call
 * site asked for. Every font module is imported only after this is in place.
 */
type FontCall = { from: string; options: Record<string, unknown> }
const calls: FontCall[] = []
let importing = ''
mock.module('next/font/local', () => ({
  default: (options: Record<string, unknown>) => {
    calls.push({ from: importing, options })
    return { className: 'x', variable: 'x', style: {} }
  },
}))

async function declaredBy(label: string, load: () => Promise<unknown>) {
  importing = label
  await load()
  const call = calls.find(c => c.from === label)
  if (!call) throw new Error(`${label} declared no font`)
  return call.options
}

const ROOT = process.cwd()

describe('the mono font (MTC-102)', () => {
  test('is never preloaded, so a page that draws no mono text never fetches it', async () => {
    const ours = await declaredBy('app/fonts', () => import('@/app/fonts'))
    expect(ours.preload).toBe(false)
  })

  test('is otherwise the same declaration as geist/font/mono, file included', async () => {
    const ours = await declaredBy('app/fonts', () => import('@/app/fonts'))
    const geist = await declaredBy(
      'geist/font/mono',
      () => import('geist/font/mono')
    )

    // next/font resolves src relative to the file that calls it.
    const ourFile = path.resolve(ROOT, 'app', String(ours.src))
    const geistFile = path.resolve(
      ROOT,
      'node_modules/geist/dist',
      String(geist.src)
    )
    expect(ourFile).toBe(geistFile)
    expect(fs.existsSync(ourFile)).toBe(true)

    const without = (options: Record<string, unknown>, keys: string[]) =>
      Object.fromEntries(
        Object.entries(options).filter(([key]) => !keys.includes(key))
      )
    expect(without(ours, ['src', 'preload'])).toEqual(without(geist, ['src']))
    // The package's own declaration takes the default, which is to preload.
    expect(geist.preload).toBeUndefined()
  })

  test('nothing imports the preloaded declaration from geist/font/mono', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name))
          if (fs.readFileSync(full, 'utf8').includes("'geist/font/mono'"))
            offenders.push(path.relative(ROOT, full))
      }
    }
    for (const dir of ['app', 'components', 'lib']) walk(path.join(ROOT, dir))
    expect(offenders).toEqual([])
  })

  test('the root layout sets the mono variable from app/fonts', () => {
    const layout = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8')
    expect(layout).toContain("import { GeistMono } from '@/app/fonts'")
    expect(layout).toContain('${GeistMono.variable}')
  })
})
