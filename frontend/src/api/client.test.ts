import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { login, listCourts } from './client'

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response
}

const originalLocation = window.location

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
  // request() sets window.location.href on a 401 -- jsdom's real navigation isn't
  // implemented and just logs noise, so swap in a plain settable stand-in.
  Object.defineProperty(window, 'location', { writable: true, value: { href: '' } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'location', { writable: true, value: originalLocation })
})

describe('request() -- 401', () => {
  it('clears the stored session and redirects to /login, without resolving', async () => {
    localStorage.setItem('lexflow_token', 'stale-token')
    localStorage.setItem('lexflow_profile', '{"user_id":1}')
    vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { detail: 'Session expired' }))

    let settled = false
    login('x@example.com', 'pw').then(() => { settled = true }, () => { settled = true })
    await new Promise((r) => setTimeout(r, 0))

    expect(localStorage.getItem('lexflow_token')).toBeNull()
    expect(localStorage.getItem('lexflow_profile')).toBeNull()
    expect(window.location.href).toBe('/login')
    expect(settled).toBe(false)
  })
})

describe('request() -- 500', () => {
  it('throws an Error carrying the status and the backend detail message, without retrying a POST', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(500, { detail: 'Database unavailable' }))

    await expect(login('x@example.com', 'pw')).rejects.toMatchObject({
      message: 'Database unavailable',
      status: 500,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries a GET once on a 5xx response (not just a network error), then recovers', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(503, { detail: 'Temporarily unavailable' }))
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 1 }]))

    await expect(listCourts()).resolves.toEqual([{ id: 1 }])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws the second 5xx if a GET retry also fails', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(500, { detail: 'Still down' }))

    await expect(listCourts()).rejects.toMatchObject({ message: 'Still down', status: 500 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('request() -- auth header', () => {
  it('attaches Authorization when a token is stored', async () => {
    localStorage.setItem('lexflow_token', 'my-token')
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, []))

    await listCourts()

    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer my-token')
  })

  it('omits Authorization when there is no token', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, []))

    await listCourts()

    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })
})

describe('request() -- network failure', () => {
  it('throws immediately for a POST, without retrying', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    await expect(login('x@example.com', 'pw')).rejects.toThrow('network down')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries once for a GET, then throws if it fails again', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    await expect(listCourts()).rejects.toThrow('network down')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('recovers for a GET if the retry succeeds', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 1 }]))

    await expect(listCourts()).resolves.toEqual([{ id: 1 }])
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
