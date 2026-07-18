import { useCallback, useEffect, useRef, useState } from 'react'

export const CORE_CREATURES = ['pyre', 'fetch', 'sight', 'lode'] as const

export type CreatureState = 'idle' | 'hunting' | 'found' | 'error'

export type ApiUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  runs: number
  model: string
  pricingAvailable: boolean
}

export type CreatureAlert = {
  id: string
  creature: string
  headline: string
  details: string
  impact: string
  recommendation: string
  sources: string[]
  phase?: string
}

export type CollaborationState = {
  participants: string[]
  coordinator: string
  phase: 'meeting' | 'leaving'
}

type ConnectionState = 'connecting' | 'online' | 'offline'

type ReleaseAllResponse = {
  results: Record<string, { status: 'found' | 'error'; error?: string }>
}

type QuestResponse = {
  results: Record<string, { status: 'found' | 'error'; error?: string }>
}

type CityEvent = {
  type: string
  creature?: string
  state?: CreatureState
  creatures?: string[]
  token?: string
  tool?: string
  phase?: string
  from?: string
  to?: string
  headline?: string
  coordinator?: string
  participants?: string[]
  model?: string
  input_tokens?: number
  cached_input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  estimated_cost_usd?: number
  pricing_available?: boolean
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
  const [collaboration, setCollaboration] = useState<CollaborationState | null>(null)
  const collaborationExitTimer = useRef<number | undefined>(undefined)
  const [usage, setUsage] = useState<ApiUsage>({
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    runs: 0,
    model: '',
    pricingAvailable: true,
  })

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
        .then((health) => {
          setApiKeyConfigured(health.api_key_configured)
          setError(null)
        })
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
        let event: CityEvent
        try {
          event = JSON.parse(String(message.data)) as CityEvent
        } catch {
          setError('Received an invalid event from the backend')
          return
        }

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
        if (event.type === 'tool_call' && event.creature) {
          setThoughts((current) => ({
            ...current,
            [event.creature!]: `Using ${event.tool ?? 'a tool'} to research the quest…`,
          }))
        }
        if (event.type === 'collaboration' && event.to) {
          setThoughts((current) => ({
            ...current,
            [event.to!]: `${event.from ?? 'A teammate'} shared: ${event.headline ?? 'new findings'}`,
          }))
        }
        if (event.type === 'collaboration_start' && event.coordinator) {
          if (collaborationExitTimer.current) window.clearTimeout(collaborationExitTimer.current)
          setCollaboration({
            coordinator: event.coordinator,
            participants: event.participants ?? [],
            phase: 'meeting',
          })
          setThoughts((current) => ({
            ...current,
            [event.coordinator!]: 'Reviewing the party’s specialist reports…',
          }))
        }
        if (event.type === 'collaboration_end' || event.type === 'collaboration_error') {
          setCollaboration((current) => current ? { ...current, phase: 'leaving' } : null)
          if (collaborationExitTimer.current) window.clearTimeout(collaborationExitTimer.current)
          collaborationExitTimer.current = window.setTimeout(() => {
            setCollaboration(null)
            collaborationExitTimer.current = undefined
          }, 900)
        }
        if (event.type === 'usage') {
          setUsage((current) => ({
            inputTokens: current.inputTokens + (event.input_tokens ?? 0),
            cachedInputTokens: current.cachedInputTokens + (event.cached_input_tokens ?? 0),
            outputTokens: current.outputTokens + (event.output_tokens ?? 0),
            totalTokens: current.totalTokens + (event.total_tokens ?? 0),
            estimatedCostUsd: current.estimatedCostUsd + (event.estimated_cost_usd ?? 0),
            runs: current.runs + 1,
            model: event.model ?? current.model,
            pricingAvailable: current.pricingAvailable && (event.pricing_available ?? false),
          }))
        }
        if (event.type === 'alert' && event.creature && event.alert) {
          setAlerts((current) => [
            {
              ...event.alert!,
              id: crypto.randomUUID(),
              creature: event.creature!,
              phase: event.phase,
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
        if (!active) return
        setConnection('offline')
        setCollaboration(null)
        if (collaborationExitTimer.current) {
          window.clearTimeout(collaborationExitTimer.current)
          collaborationExitTimer.current = undefined
        }
        retryTimer = window.setTimeout(connect, 1500)
      })
      socket.addEventListener('error', () => socket?.close())
    }

    connect()
    return () => {
      active = false
      controller.abort()
      if (retryTimer) window.clearTimeout(retryTimer)
      if (collaborationExitTimer.current) window.clearTimeout(collaborationExitTimer.current)
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
      setStates((current) => ({ ...current, [creature]: 'found' }))
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
      const result = await request<ReleaseAllResponse>('/api/creatures/release-all')
      setStates((current) => ({
        ...current,
        ...Object.fromEntries(CORE_CREATURES.map((name) => [
          name,
          result.results[name]?.status === 'found' ? 'found' : 'error',
        ])),
      }))
    } catch (cause) {
      setStates((current) => ({
        ...current,
        ...Object.fromEntries(CORE_CREATURES.map((name) => [name, 'error'])),
      }))
      setError(cause instanceof Error ? cause.message : 'Release all failed')
    }
  }, [request])

  const giveQuest = useCallback(async (quest: string, target: string) => {
    const selected = target === 'all' ? creatures : [target]
    setError(null)
    setStates((current) => ({
      ...current,
      ...Object.fromEntries(selected.map((name) => [name, 'hunting'])),
    }))
    setThoughts((current) => ({
      ...current,
      ...Object.fromEntries(selected.map((name) => [name, ''])),
    }))

    try {
      const result = await request<QuestResponse>('/api/quests', { quest, target })
      setStates((current) => ({
        ...current,
        ...Object.fromEntries(selected.map((name) => [
          name,
          result.results[name]?.status === 'found' ? 'found' : 'error',
        ])),
      }))
    } catch (cause) {
      setStates((current) => ({
        ...current,
        ...Object.fromEntries(selected.map((name) => [name, 'error'])),
      }))
      const message = cause instanceof Error ? cause.message : 'Quest dispatch failed'
      setError(message)
      throw cause
    }
  }, [creatures, request])

  const refine = useCallback(async (creature: string, followUp: string) => {
    const cleanFollowUp = followUp.trim()
    if (!cleanFollowUp) throw new Error('A follow-up prompt is required')

    setError(null)
    setStates((current) => ({ ...current, [creature]: 'hunting' }))
    setThoughts((current) => ({ ...current, [creature]: '' }))
    try {
      await request(`/api/creatures/${encodeURIComponent(creature)}/refine`, {
        follow_up: cleanFollowUp,
      })
      setStates((current) => ({ ...current, [creature]: 'found' }))
    } catch (cause) {
      setStates((current) => ({ ...current, [creature]: 'error' }))
      setError(cause instanceof Error ? cause.message : 'Refine failed')
      throw cause
    }
  }, [request])

  const spawn = useCallback(async (
    name: string,
    instructions: string,
    data: Record<string, unknown> = {},
    runImmediately = false,
  ) => {
    setError(null)
    const result = await request<{ creature: string }>('/api/creatures/spawn', {
      name,
      instructions,
    })
    setCreatures((current) => [...new Set([...current, result.creature])])
    setStates((current) => ({ ...current, [result.creature]: 'idle' }))
    if (runImmediately) await hunt(result.creature, data)
    return result.creature
  }, [hunt, request])

  const dismissAlert = useCallback((id: string) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id))
  }, [])

  return {
    alerts,
    apiKeyConfigured,
    connection,
    collaboration,
    creatures,
    dismissAlert,
    error,
    giveQuest,
    hunt,
    refine,
    releaseAll,
    spawn,
    states,
    thoughts,
    usage,
  }
}
