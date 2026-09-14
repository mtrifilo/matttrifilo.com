import { describe, expect, test } from 'bun:test'
import { readEnv } from './env'

describe('readEnv', () => {
  test('returns the value when set', () => {
    expect(readEnv('X', { X: 'value' })).toBe('value')
  })
  test('treats missing and empty values the same, naming the variable', () => {
    expect(() => readEnv('GCP_PROJECT_ID', {})).toThrow(
      /GCP_PROJECT_ID is not set/
    )
    expect(() => readEnv('GCP_PROJECT_ID', { GCP_PROJECT_ID: '' })).toThrow(
      /is not set/
    )
  })
})
