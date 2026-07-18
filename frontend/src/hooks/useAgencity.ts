import { useCallback, useEffect, useState } from 'react'

export const CORE_CREATURES = ['pyre', 'fetch', 'sight', 'lode'] as const

export type CreatureState = 'idle' | 'hunting' | 'found' | 'error'

export type CreatureAlert = {
  id: string
  creature: string
  headline: string
  details: string
  impact: string
  recommendation: string
  sources: string[]
}

type ConnectionState = 'connecting' | 'online' | 'offline'

type CityEvent = {
  type: string
  creature?: string
  state?: CreatureState
  creatures?: string[]
  token?: string
  error?: string
  alert?: Omit<CreatureAlert, 'id' | 'creature'>
}

const initialStates = Object.fromEntries(
  CORE_CREATURES.map((name) => [name, 'idle']),
) as Record<string, CreatureState>

function websocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

async function errorMessage(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as { detail?: unknown } | null
  if (typeof payload?.detail === 'string') return payload.detail
  return `Request failed with status ${response.status}`
}

export function useAgencity() {
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [creatures, setCreatures] = useState<string[]>([...CORE_CREATURES])
  const [states, setStates] = useState<Record<string, CreatureState>>(initialStates)
  const [alerts, setAlerts] = useState<CreatureAlert[]>([])
  const [thoughts, setThoughts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let socket: WebSocket | undefined
    let retryTimer: number | undefined
    let active = true

    const checkHealth = () => {
      fetch('/api/health', { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(await errorMessage(response))
          return response.json() as Promise<{ api_key_configured: boolean }>
        })
        .then((health) => setApiKeyConfigured(health.api_key_configured))
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setError(cause instanceof Error ? cause.message : 'Backend health check failed')
        })
    }

    checkHealth()

    const connect = () => {
      if (!active) return
      setConnection('connecting')
      socket = new WebSocket(websocketUrl())

      socket.addEventListener('open', () => {
        setConnection('online')
        checkHealth()
      })
      socket.addEventListener('message', (message) => {
        const event = JSON.parse(String(message.data)) as CityEvent

        if (event.type === 'connected' && event.creatures) {
          setCreatures(event.creatures)
          setStates((current) => ({
            ...Object.fromEntries(event.creatures!.map((name) => [name, 'idle'])),
            ...current,
          }))
        }
        if (event.type === 'spawned' && event.creature) {
          setCreatures((current) => [...new Set([...current, event.creature!])])
          setStates((current) => ({ ...current, [event.creature!]: 'idle' }))
        }
        if (event.type === 'state' && event.creature && event.state) {
          setStates((current) => ({ ...current, [event.creature!]: event.state! }))
        }
        if (event.type === 'thought' && event.creature && event.token) {
          setThoughts((current) => ({
            ...current,
            [event.creature!]: `${current[event.creature!] ?? ''}${event.token}`.slice(-240),
          }))
        }
        if (event.type === 'alert' && event.creature && event.alert) {
          setAlerts((current) => [
            {
              ...event.alert!,
              id: crypto.randomUUID(),
              creature: event.creature!,
              sources: event.alert!.sources ?? [],
            },
            ...current,
          ])
          setError(null)
        }
        if (event.type === 'error') {
          if (event.creature) {
            setStates((current) => ({ ...current, [event.creature!]: 'error' }))
          }
          setError(event.error ?? 'The backend reported an error')
        }
      })
      socket.addEventListener('close', () => {
        setConnection('offline')
        if (active) retryTimer = window.setTimeout(connect, 1500)
      })
      socket.addEventListener('error', () => socket?.close())
    }

    connect()
    return () => {
      active = false
      controller.abort()
      if (retryTimer) window.clearTimeout(retryTimer)
      socket?.close()
    }
  }, [])

  const request = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(path, {
      method: 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) throw new Error(await errorMessage(response))
    return response.json() as Promise<T>
  }, [])

  const hunt = useCallback(async (creature: string, data?: Record<string, unknown>) => {
    setError(null)
    setStates((current) => ({ ...current, [creature]: 'hunting' }))
    setThoughts((current) => ({ ...current, [creature]: '' }))
    try {
      await request(`/api/creatures/${encodeURIComponent(creature)}/hunt`, data ? { data } : undefined)
    } catch (cause) {
      setStates((current) => ({ ...current, [creature]: 'error' }))
      setError(cause instanceof Error ? cause.message : 'Hunt failed')
    }
  }, [request])

  const releaseAll = useCallback(async () => {
    setError(null)
    setStates((current) => ({
      ...current,
      ...Object.fromEntries(CORE_CREATURES.map((name) => [name, 'hunting'])),
    }))
    try {
      await request('/api/creatures/release-all')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Release all failed')
    }
  }, [request])

  const refine = useCallback(async (creature: string) => {
    setStates((current) => ({ ...current, [creature]: 'hunting' }))
    try {
      await request(`/api/creatures/${encodeURIComponent(creature)}/refine`, {
        follow_up: 'Identify the single highest-impact next action and explain why.',
      })
    } catch (cause) {
      setStates((current) => ({ ...current, [creature]: 'error' }))
      setError(cause instanceof Error ? cause.message : 'Refine failed')
    }
  }, [request])

  const spawn = useCallback(async (
    name: string,
    instructions: string,
    data: Record<string, unknown>,
  ) => {
    setError(null)
    const result = await request<{ creature: string }>('/api/creatures/spawn', {
      name,
      instructions,
    })
    setCreatures((current) => [...new Set([...current, result.creature])])
    await hunt(result.creature, data)
  }, [hunt, request])

  const dismissAlert = useCallback((id: string) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id))
  }, [])

  return {
    alerts,
    apiKeyConfigured,
    connection,
    creatures,
    dismissAlert,
    error,
    hunt,
    refine,
    releaseAll,
    spawn,
    states,
    thoughts,
  }
}
