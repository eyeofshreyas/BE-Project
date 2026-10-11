
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { login, listCourts, listJudges, listUsers } from './client'

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

  // Replace jsdom's location to avoid unsupported navigation.
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { href: '' },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  })
})

describe('request() -- 401', () => {
  it('clears the stored session and redirects to /login when refresh fails, without resolving', async () => {
    localStorage.setItem('lexflow_token', 'stale-token')
    localStorage.setItem('lexflow_profile', '{"user_id":1}')
    localStorage.setItem('lexflow_refresh_token', 'stale-refresh-token')

    // The protected request fails, followed by a failed refresh request.
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(401, { detail: 'Session expired' }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { detail: 'Session expired' }),
      )

    let settled = false

    listCourts().then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )

    // Allow the request and refresh handlers to run without awaiting
    // a promise that is expected to remain unresolved.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(localStorage.getItem('lexflow_token')).toBeNull()
    expect(localStorage.getItem('lexflow_profile')).toBeNull()
    expect(localStorage.getItem('lexflow_refresh_token')).toBeNull()
    expect(window.location.href).toBe('/login')
    expect(settled).toBe(false)
  })
})

describe('request() -- 401 with a working refresh', () => {
  it('refreshes the access token once and replays the original request', async () => {
    localStorage.setItem('lexflow_token', 'expired-token')
    localStorage.setItem('lexflow_refresh_token', 'valid-refresh')

    vi.mocked(fetch).mockImplementation(async (url, opts) => {
      const path = String(url)
      if (path.endsWith('/refresh')) {
        return jsonResponse(200, { access_token: 'new-token', refresh_token: 'new-refresh' })
      }
      const headers = new Headers(opts?.headers)
      if (headers.get('Authorization') === 'Bearer new-token') {
        return jsonResponse(200, [{ id: 1 }])
      }
      return jsonResponse(401, { detail: 'expired' })
    })

    await expect(listCourts()).resolves.toEqual([{ id: 1 }])

    expect(localStorage.getItem('lexflow_token')).toBe('new-token')
    expect(localStorage.getItem('lexflow_refresh_token')).toBe('new-refresh')

    const refreshCalls = vi
      .mocked(fetch)
      .mock.calls.filter((c) => String(c[0]).endsWith('/refresh'))
    expect(refreshCalls).toHaveLength(1)
  })

  it('single-flights the refresh across parallel 401s instead of refreshing per request', async () => {
    localStorage.setItem('lexflow_token', 'expired-token')
    localStorage.setItem('lexflow_refresh_token', 'valid-refresh')

    let refreshCallCount = 0

    vi.mocked(fetch).mockImplementation(async (url, opts) => {
      const path = String(url)
      if (path.endsWith('/refresh')) {
        refreshCallCount++
        await new Promise((resolve) => setTimeout(resolve, 10))
        return jsonResponse(200, { access_token: 'new-token', refresh_token: 'new-refresh' })
      }
      const headers = new Headers(opts?.headers)
      if (headers.get('Authorization') === 'Bearer new-token') {
        return jsonResponse(200, [{ id: 1 }])
      }
      return jsonResponse(401, { detail: 'expired' })
    })

    const results = await Promise.all([
      listCourts(),
      listJudges(),
      listUsers(),
      listCourts(),
      listJudges(),
      listUsers(),
    ])

    expect(results.every((r) => Array.isArray(r))).toBe(true)
    expect(refreshCallCount).toBe(1)
  })
})

describe('request() -- 500', () => {
  it('throws an Error carrying the status and backend detail, without retrying a POST', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(500, { detail: 'Database unavailable' }),
    )

    await expect(login('x@example.com', 'pw')).rejects.toMatchObject({
      message: 'Database unavailable',
      status: 500,
    })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries a GET once on a 5xx response, then recovers', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(503, { detail: 'Temporarily unavailable' }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [{ id: 1 }]),
      )

    await expect(listCourts()).resolves.toEqual([{ id: 1 }])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws the second 5xx if a GET retry also fails', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(500, { detail: 'Still down' }),
    )

    await expect(listCourts()).rejects.toMatchObject({
      message: 'Still down',
      status: 500,
    })

    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('request() -- auth header', () => {
  it('attaches Authorization when a token is stored', async () => {
    localStorage.setItem('lexflow_token', 'my-token')
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, []))

    await listCourts()

    const headers = new Headers(
      vi.mocked(fetch).mock.calls[0][1]?.headers,
    )

    expect(headers.get('Authorization')).toBe('Bearer my-token')
  })

  it('omits Authorization when there is no token', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, []))

    await listCourts()

    const headers = new Headers(
      vi.mocked(fetch).mock.calls[0][1]?.headers,
    )

    expect(headers.get('Authorization')).toBeNull()
  })
})

describe('request() -- network failure', () => {
  it('throws immediately for a POST, without retrying', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    await expect(login('x@example.com', 'pw')).rejects.toThrow(
      'network down',
    )

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
      .mockResolvedValueOnce(
        jsonResponse(200, [{ id: 1 }]),
      )

    await expect(listCourts()).resolves.toEqual([{ id: 1 }])
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
