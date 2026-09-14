/** Configuration values: process.env in production, a plain object in tests. */
export type EnvSource = Record<string, string | undefined>

/** Read a required variable; an empty value counts as missing. */
export function readEnv(name: string, source: EnvSource = process.env): string {
  const value = source[name]
  if (!value) throw new Error(`${name} is not set; run \`vercel env pull\``)
  return value
}
