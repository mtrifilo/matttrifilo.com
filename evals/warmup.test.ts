import { describe, expect, test } from 'bun:test'
import { waitForVertex, pingVertex } from './warmup'

describe('waitForVertex', () => {
  test('returns on the first success', async () => {
    const slept: number[] = []
    await waitForVertex({
      getAccessToken: async () => 'token',
      ping: async () => {},
      sleep: async ms => {
        slept.push(ms)
      },
    })
    expect(slept).toEqual([])
  })

  test('retries a 403 then succeeds', async () => {
    const slept: number[] = []
    let calls = 0
    await waitForVertex({
      getAccessToken: async () => {
        calls += 1
        if (calls < 3) throw new Error('Permission denied')
        return 'token'
      },
      ping: async () => {},
      sleep: async ms => {
        slept.push(ms)
      },
      backoffMs: [10, 20],
    })
    expect(calls).toBe(3)
    expect(slept).toEqual([10, 20])
  })

  test('exhausts attempts and throws the last error', async () => {
    await expect(
      waitForVertex({
        getAccessToken: async () => {
          throw new Error('still denied')
        },
        ping: async () => {},
        sleep: async () => {},
        attempts: 2,
        backoffMs: [1],
      })
    ).rejects.toThrow('still denied')
  })
})

describe('pingVertex', () => {
  test('throws the status when Vertex refuses', async () => {
    await expect(
      pingVertex('token', {
        project: 'p',
        fetchImpl: async () => new Response('nope', { status: 403 }),
      })
    ).rejects.toThrow('Vertex ping 403')
  })

  test('resolves on a 200', async () => {
    await pingVertex('token', {
      project: 'p',
      fetchImpl: async () => new Response('ok'),
    })
  })
})
